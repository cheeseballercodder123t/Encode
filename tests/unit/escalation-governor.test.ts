import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cleanWinStreak,
  clearFrictionHistory,
  ESCALATION_STREAK,
  governorDecision,
  loadFrictionHistory,
  pacingRatio,
  recordAttempt,
} from '../../lib/escalation/governor';
import type { FrictionEntry } from '../../lib/escalation/types';

/**
 * The governor is the piece that notices the learner has stopped being
 * challenged. Its trigger has to be honest — "got it right" is a weak signal,
 * because anything is right after three rungs of scaffolding, so the signal is
 * "right with no scaffolding" — and its decision has to be visible, because a
 * difficulty knob the learner cannot see is indistinguishable from a bug.
 */

const store = new Map<string, string>();

function mockStorage() {
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', { localStorage });
}

const attempt = (over: Partial<FrictionEntry> = {}): FrictionEntry => ({
  id: 'x',
  topic: 'Thermochemistry',
  at: 1,
  secured: true,
  rungsUsed: 0,
  elapsedMs: 0,
  expectedMs: 0,
  ...over,
});

describe('the friction log', () => {
  beforeEach(() => {
    store.clear();
    mockStorage();
  });

  it('records an attempt newest first and reads it back', () => {
    recordAttempt({ topic: 'Optics', secured: false, rungsUsed: 2, elapsedMs: 90_000, expectedMs: 0 }, 1);
    recordAttempt({ topic: 'Optics', secured: true, rungsUsed: 0, elapsedMs: 40_000, expectedMs: 0 }, 2);

    const history = loadFrictionHistory();
    expect(history.length).toBe(2);
    expect(history[0].secured).toBe(true);
    expect(history[0].topic).toBe('Optics');
    expect(history[1].rungsUsed).toBe(2);
  });

  it('reads a negative rung count as zero rather than dropping the attempt', () => {
    // The attempt happened. Losing it would break a streak for the wrong reason.
    recordAttempt({ topic: 'Optics', secured: true, rungsUsed: -3, elapsedMs: 0, expectedMs: 0 });
    expect(loadFrictionHistory()[0].rungsUsed).toBe(0);
  });

  it('refuses to store a time it cannot use as a measurement', () => {
    recordAttempt({ topic: 'Optics', secured: true, rungsUsed: 0, elapsedMs: -5, expectedMs: Number.NaN });
    const entry = loadFrictionHistory()[0];
    expect(entry.elapsedMs).toBe(0);
    expect(entry.expectedMs).toBe(0);
  });

  it('falls back to a scope rather than storing a nameless topic', () => {
    recordAttempt({ topic: '   ', secured: true, rungsUsed: 0, elapsedMs: 0, expectedMs: 0 });
    expect(loadFrictionHistory()[0].topic).toBe('Untitled');
  });

  it('degrades to empty on malformed storage and is safe outside the browser', () => {
    store.set('deepencode_friction_log_v1', '{ not json');
    expect(loadFrictionHistory()).toEqual([]);

    store.set('deepencode_friction_log_v1', JSON.stringify([{ id: 'x' }, null]));
    expect(loadFrictionHistory()).toEqual([]);

    vi.stubGlobal('window', undefined as unknown as Window);
    vi.stubGlobal('localStorage', undefined as unknown as Storage);
    expect(() => recordAttempt({ topic: 'a', secured: true, rungsUsed: 0, elapsedMs: 0, expectedMs: 0 })).not.toThrow();
    expect(loadFrictionHistory()).toEqual([]);
    expect(() => clearFrictionHistory()).not.toThrow();
  });

  it('clears the log', () => {
    recordAttempt({ topic: 'a', secured: true, rungsUsed: 0, elapsedMs: 0, expectedMs: 0 });
    clearFrictionHistory();
    expect(loadFrictionHistory()).toEqual([]);
  });
});

describe('cleanWinStreak — the only signal that says the mechanism is held', () => {
  it('counts consecutive wins that asked for no rung at all', () => {
    expect(cleanWinStreak([attempt(), attempt(), attempt()])).toBe(3);
  });

  it('breaks on a miss, because a failure is direct evidence it is not too easy', () => {
    expect(cleanWinStreak([attempt(), attempt({ secured: false }), attempt()])).toBe(0);
  });

  it('breaks the moment a rung was taken, even though the answer landed', () => {
    expect(cleanWinStreak([attempt(), attempt({ rungsUsed: 1 }), attempt()])).toBe(1);
  });

  it('counts nothing from an empty log', () => {
    expect(cleanWinStreak([])).toBe(0);
  });
});

describe('governorDecision — escalation, stated where the learner can see it', () => {
  it('stays single-topic below the threshold', () => {
    const decision = governorDecision([attempt()]);
    expect(decision.level).toBe('siloed');
    expect(decision.streak).toBe(1);
    expect(decision.reason).toContain('One more');
  });

  it('escalates at two clean wins, and names the topic', () => {
    expect(ESCALATION_STREAK).toBe(2);
    const decision = governorDecision([attempt({ topic: 'Calorimetry' }), attempt({ topic: 'Calorimetry' })]);
    expect(decision.level).toBe('boss');
    expect(decision.streak).toBe(2);
    expect(decision.topic).toBe('Calorimetry');
    expect(decision.reason).toContain('2 clean wins');
    expect(decision.reason).toContain('no clue rung');
  });

  it('de-escalates the moment a miss lands, with no separate reset', () => {
    // Escalation is a one-way read of the log, so this needs no bookkeeping.
    const decision = governorDecision([
      attempt({ secured: false }),
      attempt(),
      attempt(),
    ]);
    expect(decision.level).toBe('siloed');
    expect(decision.streak).toBe(0);
    expect(decision.reason).toContain('No running clean streak');
  });

  it('says nothing reassuring on an empty log', () => {
    const decision = governorDecision([]);
    expect(decision.level).toBe('siloed');
    expect(decision.streak).toBe(0);
    expect(decision.topic).toBe('');
  });
});

describe('pacingRatio — a claim that needs two numbers', () => {
  it('returns the ratio when the stage carries an estimate', () => {
    expect(pacingRatio(attempt({ elapsedMs: 60_000, expectedMs: 30_000 }))).toBe(2);
  });

  it('returns null rather than guessing when either number is missing', () => {
    expect(pacingRatio(attempt({ elapsedMs: 60_000, expectedMs: 0 }))).toBeNull();
    expect(pacingRatio(attempt({ elapsedMs: 0, expectedMs: 30_000 }))).toBeNull();
  });
});
