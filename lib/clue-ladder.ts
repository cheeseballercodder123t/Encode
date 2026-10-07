// ─── The Socratic clue ladder ───────────────────────────────────────────────
//
// A single hint is a coin flip: it either gives the answer away or leaves the
// learner stuck, and which one it is depends on how stuck they were. A ladder
// fixes that by ordering the rungs from a nudge to the strongest scaffold the
// stage can offer, and handing them over one at a time — so the learner decides
// when they have enough, and the recall attempt stays theirs.
//
// What the ladder deliberately does NOT have is an answer key. Every rung is a
// scaffold that makes the answer derivable, the last one most of all; there is
// no "reveal" because a revealed answer ends the attempt, and the attempt is
// the thing that encodes.

/** Ordered rungs, weakest first. */
export const MAX_CLUE_RUNGS = 3;

export interface ClueRung {
  /** 1-based position, for the label ("Clue 2 of 3"). */
  index: number;
  text: string;
  /** True for the last rung — the one that should make the answer derivable. */
  isStrongest: boolean;
}

/**
 * Resolves a payload's rungs, whoever wrote it.
 *
 * `clues` is the ladder; `clue` is the single hint every stage encoded before
 * the ladder existed. A stage that carries both is deduped rather than shown
 * the same sentence twice, and a stage that carries neither yields an empty
 * ladder — which is how the UI knows to render no clue control at all rather
 * than a button that does nothing.
 */
export function clueRungs(clue?: string, clues?: string[]): ClueRung[] {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const candidate of [...(Array.isArray(clues) ? clues : []), clue]) {
    const text = (candidate || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    texts.push(text);
  }
  const capped = texts.slice(0, MAX_CLUE_RUNGS);
  return capped.map((text, position) => ({
    index: position + 1,
    text,
    isStrongest: position === capped.length - 1,
  }));
}
