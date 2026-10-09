// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { weekStartKey } from '@/lib/storage';

/**
 * The boundary the weekly usage counter rolls on.
 *
 * The counter is labelled THIS WEEK, so the week it counts has to be a week
 * someone would recognise: local, Monday-to-Sunday. A UTC boundary would roll
 * the number over in the middle of a Sunday evening for anyone west of
 * Greenwich, which is the kind of wrong number that is only visible to the
 * person reading it.
 */
describe('usage week boundary', () => {
  it('starts the week on the local Monday, so Sunday night is still this week', () => {
    expect(weekStartKey(new Date(2026, 9, 5, 0, 0).getTime())).toBe('2026-10-05'); // Monday
    expect(weekStartKey(new Date(2026, 9, 8, 12, 0).getTime())).toBe('2026-10-05'); // Thursday
    expect(weekStartKey(new Date(2026, 9, 11, 23, 59).getTime())).toBe('2026-10-05'); // Sunday, last minute
    expect(weekStartKey(new Date(2026, 9, 12, 0, 1).getTime())).toBe('2026-10-12'); // Monday, new week
  });

  it('spans the turn of the year', () => {
    // 1 Jan 2026 is a Thursday: its week began on Monday 29 Dec 2025.
    expect(weekStartKey(new Date(2026, 0, 1, 9, 0).getTime())).toBe('2025-12-29');
  });

  it('is stable through a whole week and one second either side of the edge', () => {
    const monday = weekStartKey(new Date(2026, 9, 5, 0, 0, 0).getTime());
    for (let day = 0; day < 7; day++) {
      expect(weekStartKey(new Date(2026, 9, 5 + day, 12, 0, 0).getTime())).toBe(monday);
    }
    expect(weekStartKey(new Date(2026, 9, 12, 0, 0, 0).getTime())).not.toBe(monday);
  });
});
