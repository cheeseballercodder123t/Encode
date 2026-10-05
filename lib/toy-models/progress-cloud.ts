import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  TOY_PROGRESS_CLOUD_LIMIT,
  TOY_PROGRESS_LIMIT,
  loadToyProgressStore,
  mergeToyProgressStores,
  saveToyProgressStore,
  toyProgressStoresEqual,
  trimToyProgressStore,
  type ToyProgressStore,
} from './progress';

// ─── Lab snapshots, on the account instead of only on the laptop ─────────────
//
// A lab snapshot is tiny, but there are a lot of them: thirty pasted decks with
// ten interactive labs each is three hundred states, and the device cache is
// deliberately bounded (see `TOY_PROGRESS_LIMIT`) so it cannot grow without
// limit. Bounded cache + unbounded history is only honest if something keeps the
// history, so the account does: `users/{uid}/memory/toylab` holds every snapshot
// keyed by activity id, and the next sign-in on any device restores whatever the
// local cache had evicted.
//
// The local store stays the source of truth for reading — a lab must render its
// snapshot synchronously, never behind a network round trip — and this module
// reconciles the two. The merge is per key by `updatedAt` (see
// `mergeToyProgressStores`), so a device that has been offline for a week cannot
// erase a newer answer from a device that has one, and every failure degrades to
// "it did not sync" rather than losing the local snapshot.

export interface ToyProgressSyncResult {
  ok: boolean;
  /** Snapshots in the merge after reconciling with the account. */
  entries: number;
  /** True when the local cache changed as a result of the merge. */
  changed: boolean;
  /** True when the merged history was written back to Firestore. */
  pushed: boolean;
  error?: string;
}

const EMPTY_RESULT: ToyProgressSyncResult = { ok: false, entries: 0, changed: false, pushed: false };

function toyProgressDocRef(uid: string) {
  return doc(db, 'users', uid, 'memory', 'toylab');
}

function readRemoteStore(data: any): ToyProgressStore {
  const records = data?.records;
  return records && typeof records === 'object' && !Array.isArray(records) ? (records as ToyProgressStore) : {};
}

/**
 * Pulls the account's lab history, unions it with this device's cache, writes the
 * union back to both, and reports what happened. Safe to call when signed out,
 * offline, or when Firestore rules reject the write: the local cache still
 * stands and the caller gets `ok: false`.
 */
export async function syncToyProgressWithCloud(uid: string | null | undefined): Promise<ToyProgressSyncResult> {
  if (!uid || typeof window === 'undefined') return { ...EMPTY_RESULT, error: 'Not signed in.' };

  try {
    const local = loadToyProgressStore();
    const snapshot = await getDoc(toyProgressDocRef(uid));
    const remote = snapshot.exists() ? readRemoteStore(snapshot.data()) : {};
    // The device cache is deliberately the smaller of the two, so trim the
    // merge to the cloud cap for the account and compare against what the
    // device would actually keep — otherwise a 2,000-snapshot account would
    // look "changed" on every single sync and re-report a merge forever.
    const merged = mergeToyProgressStores(local, remote, TOY_PROGRESS_CLOUD_LIMIT);
    const changed = !toyProgressStoresEqual(local, trimToyProgressStore(merged, TOY_PROGRESS_LIMIT));
    const remoteOutdated = !toyProgressStoresEqual(remote, merged);

    if (changed) saveToyProgressStore(merged);

    if (changed || remoteOutdated) {
      await setDoc(
        toyProgressDocRef(uid),
        { records: merged, updatedAt: Date.now(), userId: uid },
        { merge: true }
      );
    }

    return { ok: true, entries: Object.keys(merged).length, changed, pushed: changed || remoteOutdated };
  } catch (error: any) {
    return { ...EMPTY_RESULT, error: error?.message || 'The cloud lab history could not be reached.' };
  }
}

/** One line for a status surface, so the sync is never a silent side effect. */
export function describeToyProgressSync(result: ToyProgressSyncResult | null): string {
  if (!result) return '';
  if (!result.ok) {
    return result.error === 'Not signed in.'
      ? 'Sign in to carry lab snapshots between devices — on this device they are remembered locally.'
      : `Cloud lab history unreachable (${result.error}) — using this device's snapshots.`;
  }
  if (result.changed) return `Merged with your account's lab history (${result.entries} snapshot${result.entries === 1 ? '' : 's'}).`;
  return `Your account's lab history is up to date (${result.entries} snapshot${result.entries === 1 ? '' : 's'}).`;
}
