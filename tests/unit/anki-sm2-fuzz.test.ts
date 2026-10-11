import { describe, it, expect } from 'vitest';
import { calculateSM2, type SM2State } from '@/lib/anki-exporter';

/**
 * Exhaustive invariant sweep over hostile SM-2 state.
 *
 * `calculateSM2` is the one place a card's schedule is decided, and each of its
 * four inputs round-trips through IndexedDB, the Firestore mirror, an exported
 * `.apkg` or a hand-edited record — so every one of them is untrusted. Rather
 * than pin individual cases, this drives a hostile grid (NaN, ±Infinity, ±0,
 * negatives, fractional, 1e308, MAX_SAFE_INTEGER, below-floor ease) through the
 * function and asserts the CONTRACT the rest of the app relies on:
 *
 *   - the returned `repetitions` is a non-negative integer (defect: a fractional
 *     stored count used to survive, and skipped the `reps === 1` six-day rung);
 *   - `interval` is a finite integer of at least one day — a card is never
 *     scheduled in the past;
 *   - `easeFactor` never falls below the 1.3 floor and is always finite;
 *   - `nextReviewTimestamp` is finite and positive, and survives a JSON
 *     round-trip as a real number rather than `null` (Infinity → null was the
 *     original way a card silently lost its due date).
 *
 * Deterministic by construction (no randomness), so it is a stable regression
 * guard alongside the case-by-case tests in `anki-sm2-hardening.test.ts`.
 */
describe('calculateSM2 fuzz — invariants over a hostile input grid', () => {
  const values = [
    NaN, Infinity, -Infinity, 0, -0, -1, 1, 1.3, 2.5, 5, 1e308, -1e308, 1e-308,
    Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.5, -0.5, 3.5, 2.6,
  ];
  const stamps = [0, -1, 1e308];

  it('holds every invariant for every combination', () => {
    const violations: string[] = [];
    for (const repetitions of values) {
      for (const interval of values) {
        for (const easeFactor of values) {
          for (const grade of values) {
            for (const nextReviewTimestamp of stamps) {
              const state: SM2State = { repetitions, interval, easeFactor, nextReviewTimestamp };
              const out = calculateSM2(grade, state);
              const ctx = `grade=${grade} state=${JSON.stringify(state)} out=${JSON.stringify(out)}`;
              if (!Number.isInteger(out.repetitions) || out.repetitions < 0) violations.push(`repetitions ${ctx}`);
              if (!Number.isInteger(out.interval) || out.interval < 1) violations.push(`interval ${ctx}`);
              if (!Number.isFinite(out.easeFactor) || out.easeFactor < 1.3) violations.push(`easeFactor ${ctx}`);
              if (!Number.isFinite(out.nextReviewTimestamp) || out.nextReviewTimestamp <= 0) violations.push(`timestamp ${ctx}`);
              const roundTripped = JSON.parse(JSON.stringify(out));
              if (roundTripped.nextReviewTimestamp === null || roundTripped.interval === null) violations.push(`json ${ctx}`);
            }
          }
        }
      }
    }
    expect(violations.slice(0, 10)).toEqual([]);
  });
});
