import { describe, it, expect } from 'vitest';
import { gradeCompletion } from '../../lib/visual-completion';
import { remainingMs, DISCRIMINATION_SECONDS } from '../../lib/discrimination';

/**
 * Loose grading is the point of the diagram-completion drill — the learner is
 * producing a mechanism, not matching a string — but loose has a floor. Two
 * readings here were below it, and both are user-visible: the drill's verdict
 * also decides what gets written into the mechanism field the exporter ships.
 */

describe('gradeCompletion — loose must not mean empty', () => {
  const answer = 'S4 segments swing outward';

  it('rejects a typed answer that carries none of the answer\'s content', () => {
    // The containment shortcut used to accept any substring of the answer, so
    // `"t"` — one letter, present in almost every sentence — was graded as the
    // mechanism and written into the card the exporter ships.
    for (const typed of ['t', 'a', 'the', 'an', 'is', 's4', 'to', 'of', ' ']) {
      expect(
        gradeCompletion(typed, answer),
        `"${typed}" carries none of the answer's content words`
      ).toBe(false);
    }
  });

  it('still accepts a single content word of the answer, as the round always has', () => {
    // Not a bug and not tightened here: "loose grading" is this drill's premise,
    // so the fix above is scoped to answers carrying NO content of the answer.
    expect(gradeCompletion('swing', answer)).toBe(true);
    expect(gradeCompletion('outward', answer)).toBe(true);
  });

  it('rejects an unrelated answer, as before', () => {
    expect(gradeCompletion('nothing much happens', answer)).toBe(false);
  });

  it('still accepts the mechanism itself, however it is dressed', () => {
    for (const typed of [
      'S4 segments swing outward',
      'the S4 segments swing outward',
      'S4 segments swing outward, in the membrane',
      '  S4  segments, swing outward!  ',
    ]) {
      expect(gradeCompletion(typed, answer), `"${typed}" is the mechanism`).toBe(true);
    }
  });

  it('still tolerates an inflected form of the answer', () => {
    const full = 'depolarisation of the membrane';
    expect(gradeCompletion('depolarisation', full)).toBe(true);
    // The containment shortcut used to cover this case: the learner's word sits
    // inside the answer's. Now the content-word matcher has to see it from
    // either direction, or a correct answer with a plural typed would be marked
    // wrong where it used to pass.
    expect(gradeCompletion('depolarisations of the membrane', full)).toBe(true);
  });

  it('never grades an empty answer as a hit, in either direction', () => {
    expect(gradeCompletion('S4 segments', '')).toBe(false);
    expect(gradeCompletion('', answer)).toBe(false);
  });
});

describe('remainingMs — a clock face cannot report more time than the clock holds', () => {
  it('counts down from the full clock', () => {
    expect(remainingMs(1_000, 4_000, 10)).toBe(7_000);
  });

  it('clamps a backwards reading to the clock instead of inventing time', () => {
    // A `startedAt` in the future (clock skew, a persisted timestamp) used to
    // return 19 000 ms on a 10-second gate — a countdown that gains time.
    const reading = remainingMs(10_000, 1_000, 10);
    expect(reading).toBe(DISCRIMINATION_SECONDS * 1000);
    expect(reading).toBeLessThanOrEqual(DISCRIMINATION_SECONDS * 1000);
  });

  it('never goes negative once the clock has run out', () => {
    expect(remainingMs(0, 60_000, 10)).toBe(0);
  });

  it('reports a finite reading when the clock is not a number', () => {
    expect(remainingMs(NaN, 1_000, 10)).toBe(0);
    expect(Number.isFinite(remainingMs(Number.NEGATIVE_INFINITY, 0, 10))).toBe(true);
  });
});
