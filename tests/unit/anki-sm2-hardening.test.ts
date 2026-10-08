import { describe, it, expect } from 'vitest';
import { calculateSM2, type SM2State } from '@/lib/anki-exporter';

/**
 * `calculateSM2` is the one place a card's schedule is decided, and its input is
 * a record that has round-tripped through IndexedDB, the Firestore mirror and an
 * exported `.apkg`. A single corrupt field used to propagate forever:
 *
 *   - `interval: Infinity` (or a large-but-finite 1e308) survived the success
 *     branch and produced a `nextReviewTimestamp` of Infinity, which
 *     `JSON.stringify` writes as `null` — the card silently lost its due date.
 *   - a stored `easeFactor` BELOW the 1.3 floor was used for the multiplication
 *     before being floored, so a negative ease produced a NEGATIVE interval: a
 *     card due 50 days ago.
 *   - a negative `repetitions` was incremented rather than clamped, so −5 became
 *     −4 and never recovered.
 *
 * The happy path is pinned in `tests/unit/anki-exporter.test.ts`; these tests pin
 * only the corrupt-input behaviour.
 */
describe('calculateSM2 hardening against corrupt stored state', () => {
  const base: SM2State = {
    repetitions: 3,
    interval: 10,
    easeFactor: 2.5,
    nextReviewTimestamp: 0,
  };

  describe('non-finite state never propagates', () => {
    it('reads an Infinity interval as a usable one-day state', () => {
      const s = calculateSM2(5, { ...base, interval: Infinity });
      expect(Number.isFinite(s.interval)).toBe(true);
      expect(Number.isFinite(s.nextReviewTimestamp)).toBe(true);
      expect(s.interval).toBeGreaterThanOrEqual(1);
    });

    it('falls back instead of overflowing on a finite but enormous interval', () => {
      const s = calculateSM2(5, { ...base, interval: 1e308 });
      expect(s.interval).toBe(1);
      expect(Number.isFinite(s.nextReviewTimestamp)).toBe(true);
    });

    it('falls back instead of overflowing on an enormous ease factor', () => {
      const s = calculateSM2(5, { ...base, easeFactor: 1e308 });
      expect(Number.isFinite(s.interval)).toBe(true);
      expect(Number.isFinite(s.easeFactor)).toBe(true);
      expect(Number.isFinite(s.nextReviewTimestamp)).toBe(true);
    });

    it('survives a JSON round-trip with real numbers, not nulls', () => {
      const s = calculateSM2(5, { ...base, interval: Infinity });
      const roundTripped = JSON.parse(JSON.stringify(s));
      expect(roundTripped.interval).toBe(s.interval);
      expect(roundTripped.nextReviewTimestamp).toBe(s.nextReviewTimestamp);
      expect(roundTripped.nextReviewTimestamp).not.toBeNull();
    });
  });

  describe('a below-floor ease can never schedule a card in the past', () => {
    it('never returns a negative interval for a negative stored ease', () => {
      const s = calculateSM2(5, { ...base, easeFactor: -5 });
      expect(s.interval).toBeGreaterThan(0);
      expect(s.interval).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(s.nextReviewTimestamp)).toBe(true);
      expect(s.nextReviewTimestamp).toBeGreaterThan(Date.now());
    });

    it('still floors the returned ease at 1.3', () => {
      const s = calculateSM2(5, { ...base, easeFactor: -5 });
      expect(s.easeFactor).toBeGreaterThanOrEqual(1.3);
    });
  });

  describe('negative repetitions cannot survive', () => {
    it('clamps a negative repetition count to zero before incrementing', () => {
      const s = calculateSM2(5, { ...base, repetitions: -5 });
      expect(s.repetitions).toBe(1);
      expect(s.repetitions).toBeGreaterThanOrEqual(0);
    });

    it('clamps a negative repetition count on the failure path too', () => {
      const s = calculateSM2(1, { ...base, repetitions: -5 });
      expect(s.repetitions).toBe(0);
    });
  });

  describe('the ordinary ladder is unchanged', () => {
    it('schedules 1 day on the first successful rep', () => {
      const s = calculateSM2(5, { repetitions: 0, interval: 0, easeFactor: 0, nextReviewTimestamp: 0 });
      expect(s.repetitions).toBe(1);
      expect(s.interval).toBe(1);
      expect(s.easeFactor).toBeCloseTo(2.6, 2);
    });

    it('schedules 6 days on the second successful rep', () => {
      const s = calculateSM2(5, { repetitions: 1, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 });
      expect(s.repetitions).toBe(2);
      expect(s.interval).toBe(6);
    });

    it('multiplies by the floored ease from the third rep on', () => {
      const s = calculateSM2(5, { ...base });
      expect(s.repetitions).toBe(4);
      expect(s.interval).toBe(Math.round(10 * Math.max(1.3, base.easeFactor)));
    });

    it('resets to one day on a failed grade and keeps the ease floor', () => {
      const s = calculateSM2(2, { ...base, easeFactor: 1.0 });
      expect(s.interval).toBe(1);
      expect(s.repetitions).toBe(0);
      expect(s.easeFactor).toBe(1.3);
    });
  });
});
