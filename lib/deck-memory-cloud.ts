import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  DeckMemoryRecord,
  DeckMemorySource,
  deckMemoryStoresEqual,
  loadDeckMemory,
  mergeDeckMemoryStores,
  saveDeckMemoryStore,
} from './deck-memory';

// ─── Deck memory, on the account instead of on the laptop ───────────────────
//
// Deck memory answers one question — "have I already shipped this card?" — and
// answering it only for the device that happens to be holding the browser makes
// it wrong in exactly the case it matters most: the lap machine built the deck,
// the desktop is where it gets exported, and the second export ships the whole
// thing again as if it were new.
//
// So the fingerprints (fronts only, still no backs, no answers, no source
// material) are mirrored to `users/{uid}/memory/decks`. The local store stays
// the source of truth for reading — it is synchronous, and a forge must never
// wait on a network round trip to tell you what is in your deck — and this
// module reconciles the two whenever a forge brings a new deck on screen.
//
// The merge is a union, not a last-write-wins overwrite (see
// `mergeDeckMemoryStores`): a device that has been offline for a week must not
// have its memory quietly erased by a device that has one newer record.
//
// Everything here degrades to "it did not sync", never to "the deck is wrong".

export interface DeckMemorySyncResult {
  ok: boolean;
  /** Topics in the memory after the merge. */
  topics: number;
  /** True when the local store changed as a result of the merge. */
  changed: boolean;
  /** True when the merged memory was written back to Firestore. */
  pushed: boolean;
  error?: string;
}

const EMPTY_RESULT: DeckMemorySyncResult = { ok: false, topics: 0, changed: false, pushed: false };

function memoryDocRef(uid: string) {
  return doc(db, 'users', uid, 'memory', 'decks');
}

/**
 * The account's copy of one topic's source ledger, or `undefined` when it holds
 * nothing usable.
 *
 * Unlike `keys`, a sighting cannot be repaired: `at` is the recency the union
 * ranks by and the value the two devices are compared on, so an entry without a
 * usable `at` is dropped rather than defaulted to `Date.now()` (which would
 * invent a sighting newer than everything on both devices) or to `0` (which
 * would let a stale account copy evict a fresh local one). `key` is the source's
 * own fingerprint and has to be there for the entry to mean anything; the two
 * display fields degrade instead of dropping the entry, so a ledger written by a
 * build that did not store them still reads.
 *
 * `undefined` rather than `[]` on purpose: the merge reads "no ledger here" as
 * "leave this device's ledger alone", while an empty array would be the claim
 * that the account knows about no sources at all.
 */
function readRemoteSources(value: unknown): DeckMemorySource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: DeckMemorySource[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const source = raw as Partial<DeckMemorySource>;
    if (typeof source.key !== 'string' || source.key.length === 0) continue;
    if (typeof source.at !== 'number' || !Number.isFinite(source.at)) continue;
    out.push({
      key: source.key,
      label: typeof source.label === 'string' ? source.label : source.key,
      cards: typeof source.cards === 'number' && Number.isFinite(source.cards) ? source.cards : 0,
      at: source.at,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Reads the account's records into the shape the merge expects. Exported for
 * tests - the wire shape is the whole of this function's job, and it is the one
 * place a document this app did not write (an older build's, another device's,
 * a hand-edited one) enters the memory.
 *
 * `sources` is read back through {@link readRemoteSources}. It always was
 * *written* - the push stores the merged records whole, ledger included - but it
 * was never read, so the ledger union had one side: a lecture forged on the
 * laptop was offered as new material on the desktop, which is the opposite of
 * what the ledger exists for. Reading it back also makes the fingerprint half of
 * the flow honest, since both now describe the same account copy.
 *
 * A record with an unreadable ledger is still read: its fingerprints are what
 * answer "have I shipped this card", and losing them because the optional
 * ledger was malformed would re-offer cards the learner already has.
 */
export function readRemoteRecords(data: any): Record<string, DeckMemoryRecord> {
  const records = data?.records;
  if (!records || typeof records !== 'object') return {};
  const out: Record<string, DeckMemoryRecord> = {};
  for (const [key, value] of Object.entries(records as Record<string, any>)) {
    const record = value as DeckMemoryRecord;
    if (!record || !Array.isArray(record.keys)) continue;
    out[key] = {
      topic: typeof record.topic === 'string' ? record.topic : key,
      keys: record.keys.filter((k) => typeof k === 'string' && k.length > 0),
      updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
      exports: typeof record.exports === 'number' ? record.exports : 0,
      lastSurface: typeof record.lastSurface === 'string' ? record.lastSurface : undefined,
      sources: readRemoteSources(record.sources),
    };
  }
  return out;
}

/**
 * Pulls the account's memory, unions it with this device's, writes the union
 * back, and reports what happened. Called after a forge (so the deck diff is
 * honest across devices) and after an export (so the other device learns about
 * it). Safe to call when signed out, offline, or when Firestore rules reject
 * the write: the local memory still stands and the caller gets `ok: false`.
 */
export async function syncDeckMemoryWithCloud(uid: string | null | undefined): Promise<DeckMemorySyncResult> {
  if (!uid || typeof window === 'undefined') return { ...EMPTY_RESULT, error: 'Not signed in.' };

  try {
    const local = loadDeckMemory();
    const snapshot = await getDoc(memoryDocRef(uid));
    const remote = snapshot.exists() ? readRemoteRecords(snapshot.data()) : {};
    const merged = mergeDeckMemoryStores(local, remote);
    const changed = !deckMemoryStoresEqual(local, merged);

    if (changed) saveDeckMemoryStore(merged);

    await setDoc(
      memoryDocRef(uid),
      { records: merged, updatedAt: Date.now(), userId: uid },
      { merge: true }
    );

    return { ok: true, topics: Object.keys(merged).length, changed, pushed: true };
  } catch (error: any) {
    return { ...EMPTY_RESULT, error: error?.message || 'The cloud memory could not be reached.' };
  }
}

/** One line for the forge panel, so the sync is never a silent side effect. */
export function describeDeckMemorySync(result: DeckMemorySyncResult | null, signingIn: boolean): string {
  if (signingIn) return 'Syncing deck memory with your account…';
  if (!result) return '';
  if (!result.ok) {
    return result.error === 'Not signed in.'
      ? 'Sign in to carry this memory between devices — on this device it is remembered locally.'
      : `Cloud memory unreachable (${result.error}) — using this device's memory.`;
  }
  if (result.changed) return `Merged with your account's deck memory (${result.topics} topic${result.topics === 1 ? '' : 's'}).`;
  return `Your account's deck memory is up to date (${result.topics} topic${result.topics === 1 ? '' : 's'}).`;
}
