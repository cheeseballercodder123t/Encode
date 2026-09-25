// ─── Parsons problems (scrambled causal ordering) ───────────────────────────
//
// Parsons, Ericson & Anderson: arranging scrambled blocks into the correct
// order produces learning gains within noise of writing the code from scratch,
// at a fraction of the time and typing fatigue. For a drained day — or a
// mechanism with six interlocking steps — that trade is the whole point: the
// learner spends their attention on STRUCTURE (what must precede what) instead
// of on prose.
//
// The canonical order is the examiners'; the scramble is deterministic from a
// seed so a reload shows the same puzzle; the grade is positional, so the
// feedback can point at the first link that breaks instead of just "wrong".
//
// No dependencies: a tiny seeded PRNG (mulberry32) plus a Fisher-Yates pass.

export interface ParsonsTile {
  id: string;
  text: string;
}

export interface ParsonsGrade {
  correct: boolean;
  /** How many tiles sit in their canonical position. */
  correctPositions: number;
  /** Indices of the submitted order that are wrong (0-based). */
  misplaced: number[];
  /** The first wrong position, or null when the order is right. */
  firstWrongIndex: number | null;
}

/** Deterministic 32-bit hash of a seed string (xfnv1a). */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and stable across engines (no Math.random). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates scramble.
 *
 * Two properties matter for a drill rather than a shuffle:
 *   1. The result is never already in canonical order (that would be a free win).
 *   2. A tile never starts in its own canonical slot when that is avoidable, so
 *      the puzzle cannot be solved by "leave everything alone".
 */
export function scrambleParsons(tiles: ParsonsTile[], seed: string): ParsonsTile[] {
  if (tiles.length <= 1) return [...tiles];
  const rand = mulberry32(hashSeed(seed));
  const out = [...tiles];
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    const identical = out.every((t, i) => t.id === tiles[i].id);
    if (!identical) break;
  }
  // Second pass: pull any tile that landed in its own slot somewhere else.
  for (let i = 0; i < out.length; i++) {
    if (out[i].id !== tiles[i].id) continue;
    const swapWith = (i + 1) % out.length;
    if (out[swapWith].id === tiles[swapWith].id && out.length > 2) continue;
    [out[i], out[swapWith]] = [out[swapWith], out[i]];
  }
  return out;
}

/** Positional grade: which links are right, and where the chain first breaks. */
export function gradeParsons(submittedIds: string[], canonicalIds: string[]): ParsonsGrade {
  const misplaced: number[] = [];
  for (let i = 0; i < canonicalIds.length; i++) {
    if (submittedIds[i] !== canonicalIds[i]) misplaced.push(i);
  }
  return {
    correct: misplaced.length === 0 && submittedIds.length === canonicalIds.length,
    correctPositions: canonicalIds.length - misplaced.length,
    misplaced,
    firstWrongIndex: misplaced.length > 0 ? misplaced[0] : null,
  };
}

/**
 * The one-line rule that fixes the first broken link — the thing worth putting
 * on the card when the chain is wrong. Names the misplaced tile and what must
 * come before it, so the correction is causal rather than "try again".
 */
export function describeParsonsFix(submittedIds: string[], tiles: ParsonsTile[]): string {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const canonicalIds = tiles.map((t) => t.id);
  const grade = gradeParsons(submittedIds, canonicalIds);
  if (grade.correct) return '';
  const at = grade.firstWrongIndex ?? 0;
  const expected = byId.get(canonicalIds[at]);
  const submitted = byId.get(submittedIds[at] || '');
  if (!expected) return '';
  const predecessor = at > 0 ? byId.get(canonicalIds[at - 1]) : null;
  const where = predecessor
    ? `must come after ${predecessor.text}`
    : 'must be the first step, before anything else';
  return submitted && submitted.id !== expected.id
    ? `${submitted.text} is out of place: ${expected.text} ${where}.`
    : `${expected.text} ${where}.`;
}

/** The canonical chain, one line, for the answer field. */
export function formatParsonsChain(tiles: ParsonsTile[]): string {
  return tiles.map((t, i) => `${i + 1}) ${t.text}`).join(' ');
}
