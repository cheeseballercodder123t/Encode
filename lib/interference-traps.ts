// ─── Interference Trap Cards (Hypercorrection Effect) ───────────────────────
// Butterfield & Metcalfe: when a learner is highly confident and wrong, the
// surprise produces an intense prediction error and the correction is retained
// with near-permanent durability. Those are the most valuable cards they will
// ever make — so the trap is captured the moment it fires, and the export
// funnel picks it up as a real, high-priority card.
//
// Kept in localStorage (not IndexedDB) on purpose: this is a short, ordered
// list that must be readable synchronously by the export funnel, which runs
// inside render-time memos.

export type ConfidenceTier = 'guess' | 'half' | 'bet';

export interface InterferenceTrap {
  id: string;
  /** Topic the trap fired on. */
  topic: string;
  /** The question that caught them. */
  question: string;
  /** The intuitive answer they committed to. */
  committedAnswer: string;
  /** The answer that is actually true. */
  correctAnswer: string;
  confidenceTier: ConfidenceTier;
  /** Their one-sentence explanation of the physical flaw. */
  flawExplanation: string;
  /** Cloze-ready card front (question form). */
  cardFront: string;
  /** Cloze-ready card back; may contain {{c1::}} deletions. */
  cardBack: string;
  ts: number;
}

const STORAGE_KEY = 'deepencode_interference_traps_v1';
const MAX_TRAPS = 60;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/** All stored traps, most recent first. Never throws. */
export function loadInterferenceTraps(): InterferenceTrap[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is InterferenceTrap =>
        !!t && typeof t.cardFront === 'string' && typeof t.cardBack === 'string'
    );
  } catch {
    return [];
  }
}

/** Persists one trap, de-duplicating on the card front. Returns it. */
export function saveInterferenceTrap(
  trap: Omit<InterferenceTrap, 'id' | 'ts'>,
  now: number = Date.now()
): InterferenceTrap {
  const entry: InterferenceTrap = {
    ...trap,
    id: `trap-${now}-${Math.random().toString(36).slice(2, 8)}`,
    ts: now,
  };
  if (!canUseStorage()) return entry;
  try {
    const existing = loadInterferenceTraps();
    const deduped = existing.filter(
      (t) => t.cardFront.trim().toLowerCase() !== entry.cardFront.trim().toLowerCase()
    );
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([entry, ...deduped].slice(0, MAX_TRAPS))
    );
  } catch {
    /* best-effort : a full quota must never break the drill */
  }
  return entry;
}

export function clearInterferenceTraps(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}
