import {
  AnkiInvokeOptions,
  describePushError,
  findAnkiNotes,
  listAnkiDecks,
  noteFrontText,
  readAnkiNotes,
} from './anki-connect';
import { adoptDeckKeys, cardKey, knownKeysForTopic } from './deck-memory';

// ─── Anki-authoritative deck memory ─────────────────────────────────────────
//
// The forge's deck memory used to know only what THIS app had pushed. That
// leaves two honest gaps, and both show up as duplicate cards in review:
//
//   - a deck built before the feature existed (or imported by hand from an
//     .apkg) is invisible, so a re-forge hands the whole thing back;
//   - a card edited in Anki still counts as new here, because the app's copy of
//     the fingerprint is stale.
//
// AnkiConnect already knows the truth: `findNotes` + `notesInfo` read the real
// collection. So the memory asks Anki first and merges what it finds. The local
// store stays the fallback — with Anki closed, the diff is exactly what it was
// before, and the panel says so instead of pretending it checked.
//
// Two deliberate constraints:
//   - only `DeepEncode::*` decks are read, so this never scans (or fingerprints)
//     the learner's other collections;
//   - the read is advisory. It never blocks a forge, an export, or a download.

/** Deck family this app writes to: `DeepEncode::{Topic}`. */
export const DEEP_ENCODE_DECK_ROOT = 'DeepEncode';

/**
 * Decks under `DeepEncode::` that belong to this topic.
 *
 * Matching is segment-wise on the normalized text, which is what makes it
 * survive the two spellings the app itself has written over time
 * (`DeepEncode::Renal_Physiology` from the export modal,
 * `DeepEncode::Renal Physiology` from the deck-name builder) and subdecks like
 * `DeepEncode::Renal Physiology::Loop`. It is intentionally conservative: an
 * unmatched deck makes a card look new, which costs one duplicate, while an
 * over-eager match would silently hold a card back.
 */
export function matchingAnkiDecks(topic: string, decks: string[]): string[] {
  const topicKey = cardKey(topic);
  if (!topicKey) return [];
  return (decks || []).filter((deck) => {
    const segments = String(deck || '').split('::');
    if (cardKey(segments[0]) !== cardKey(DEEP_ENCODE_DECK_ROOT)) return false;
    return segments.slice(1).some((segment) => cardKey(segment) === topicKey);
  });
}

export interface AnkiDeckRead {
  /** True when every matched deck answered. */
  ok: boolean;
  /** Decks that belong to this topic and were read. */
  decks: string[];
  /** Notes read out of those decks. */
  notes: number;
  /** Fingerprints of the note fronts that were found. */
  keys: string[];
  /** Actionable text when the read could not complete. */
  error?: string;
}

/**
 * Reads the topic's real deck out of Anki and returns its card fingerprints.
 *
 * Never throws: an unreachable AnkiConnect is a normal state (the app is
 * offline-first and Anki is optional), so the failure comes back as `ok: false`
 * with the actionable message AnkiConnect's own client produces.
 */
export async function readAnkiDeckKeys(topic: string, opts: AnkiInvokeOptions = {}): Promise<AnkiDeckRead> {
  let decks: string[];
  try {
    decks = await listAnkiDecks(opts);
  } catch (err) {
    return { ok: false, decks: [], notes: 0, keys: [], error: describePushError(err) };
  }

  const matched = matchingAnkiDecks(topic, decks);
  if (matched.length === 0) return { ok: true, decks: [], notes: 0, keys: [] };

  const keys = new Set<string>();
  let notes = 0;
  let error: string | undefined;
  for (const deck of matched) {
    try {
      const ids = await findAnkiNotes(`deck:"${deck.replace(/"/g, '')}"`, opts);
      const infos = await readAnkiNotes(ids, opts);
      for (const note of infos) {
        const key = cardKey(noteFrontText(note));
        if (key) keys.add(key);
      }
      notes += infos.length;
    } catch (err) {
      // One unreadable deck must not invalidate the decks that answered.
      error = describePushError(err);
    }
  }

  return { ok: !error, decks: matched, notes, keys: [...keys], error };
}

export interface AnkiMemorySync extends AnkiDeckRead {
  /** Fingerprints the app had not seen before this read. */
  adopted: number;
  /** How many fingerprints the topic's memory holds now. */
  known: number;
}

/**
 * Reads the real deck and merges it into this app's memory, so the next diff
 * counts a hand-imported or externally edited card as already yours.
 */
export async function syncDeckMemoryFromAnki(
  topic: string,
  opts: AnkiInvokeOptions = {}
): Promise<AnkiMemorySync> {
  const read = await readAnkiDeckKeys(topic, opts);
  const adopted = read.keys.length > 0 ? adoptDeckKeys({ topic, keys: read.keys }) : 0;
  return { ...read, adopted, known: knownKeysForTopic(topic).size };
}

/**
 * One line of provenance for the memory panel — never a stack trace.
 *
 * The long actionable text (which add-on, which CORS key) stays on
 * {@link AnkiDeckRead.error} for the UI to expose on hover, so the panel reads
 * as a receipt instead of an error dump.
 */
export function describeAnkiRead(read: AnkiDeckRead): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (!read.ok) {
    if (read.notes > 0) {
      return `AnkiConnect dropped out halfway — ${plural(read.notes, 'note', 'notes')} read before it did.`;
    }
    return "AnkiConnect is unreachable, so this is this app's own memory only.";
  }
  if (read.decks.length === 0) {
    return 'AnkiConnect is open — no DeepEncode deck exists for this topic yet.';
  }
  return `Checked your Anki deck: ${plural(read.notes, 'note', 'notes')} in ${plural(
    read.decks.length,
    'deck',
    'decks'
  )}.`;
}
