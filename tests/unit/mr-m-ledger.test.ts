import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearParadoxes,
  clearPatches,
  hasOpenParadox,
  loadParadoxes,
  loadPatches,
  openParadoxesFor,
  patchesFor,
  patchNumbers,
  preflightWarnings,
  raiseParadox,
  recordPatch,
  REPEAT_HITS,
  resolveParadox,
  resolvedParadoxes,
  updatePatchStatement,
  warningsFrom,
} from '../../lib/mr-m/ledger';
import type { DiscrepancyKind } from '../../lib/mr-m/types';

/**
 * The ledger is the one piece of Mr M state that has to survive a reload. For
 * this learner a live contradiction literally halts everything downstream, so a
 * paradox has to be raisable, held in plain sight across sessions, and
 * explicitly closable — and the store must degrade to "empty" rather than
 * throwing when the stored value is garbage.
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

describe('Mr M paradox ledger', () => {
  beforeEach(() => {
    store.clear();
    mockStorage();
  });

  it('raises a contradiction and reads it back', () => {
    raiseParadox('Calorimetry', 'Why does breaking ATP release energy if breaking bonds is endothermic?');
    const all = loadParadoxes();
    expect(all.length).toBe(1);
    expect(all[0].topic).toBe('Calorimetry');
    expect(all[0].resolvedAt).toBeUndefined();
    expect(all[0].id).toMatch(/^paradox-/);
  });

  it('ignores an empty statement instead of storing a blank entry', () => {
    expect(raiseParadox('Calorimetry', '   ')).toBeNull();
    expect(loadParadoxes()).toEqual([]);
  });

  it('holds duplicates rather than stacking them', () => {
    // A learner who keeps hitting the same paradox should see "still open",
    // not six copies of it.
    const first = raiseParadox('Calorimetry', 'Where is the zero point?');
    const second = raiseParadox('Calorimetry', '  where is the zero point? ');
    expect(second?.id).toBe(first?.id);
    expect(loadParadoxes().length).toBe(1);
  });

  it('tracks contradictions per topic', () => {
    raiseParadox('Calorimetry', 'Where is the zero point?');
    raiseParadox('Thermochemistry', 'Why is work a path function if energy is conserved?');
    expect(openParadoxesFor('calorimetry').length).toBe(1);
    expect(openParadoxesFor('Thermochemistry').length).toBe(1);
    expect(openParadoxesFor('Optics').length).toBe(0);
    expect(hasOpenParadox('CALORIMETRY')).toBe(true);
    expect(hasOpenParadox('Optics')).toBe(false);
  });

  it('closes one with the sentence that resolved it, keeping the record', () => {
    const entry = raiseParadox('Calorimetry', 'Did that problem give one mole or two?')!;
    resolveParadox(entry.id, 'Two: the coefficient in front doubles the atom count.');

    const all = loadParadoxes();
    expect(all.length).toBe(1); // the resolution is evidence, not a deletion
    expect(all[0].resolvedAt).toBeTypeOf('number');
    expect(all[0].resolution).toContain('doubles the atom count');

    // Resolved means it stops gating the topic.
    expect(openParadoxesFor('Calorimetry')).toEqual([]);
    expect(hasOpenParadox('Calorimetry')).toBe(false);
  });

  it('frees the statement to be re-raised after it was resolved', () => {
    const entry = raiseParadox('Calorimetry', 'Where is the zero point?')!;
    resolveParadox(entry.id, 'At the elements in their standard states.');
    const again = raiseParadox('Calorimetry', 'Where is the zero point?');
    expect(again?.id).not.toBe(entry.id);
    expect(hasOpenParadox('Calorimetry')).toBe(true);
  });

  it('keeps only the newest forty contradictions', () => {
    // Forty open paradoxes is not a study plan, so the oldest fall off the list
    // — but they must fall off the OLD end, keeping the ones still on screen.
    for (let i = 0; i < 45; i += 1) {
      raiseParadox('Thermodynamics', `contradiction ${i}`, 1_000 + i);
    }
    const stored = loadParadoxes();
    expect(stored.length).toBe(40);
    expect(stored[0].statement).toBe('contradiction 44');
    expect(stored[stored.length - 1].statement).toBe('contradiction 5');
  });

  it('degrades to empty on malformed storage', () => {
    store.set('deepencode_mr_m_paradox_v1', '{ this is not json');
    expect(loadParadoxes()).toEqual([]);

    store.set('deepencode_mr_m_paradox_v1', JSON.stringify([{ id: 'x' }, null, 'nope']));
    // Entries without a statement and timestamp are dropped, not rendered.
    expect(loadParadoxes()).toEqual([]);

    store.set('deepencode_mr_m_paradox_v1', JSON.stringify({ not: 'an array' }));
    expect(loadParadoxes()).toEqual([]);
  });

  it('does nothing when storage is unavailable', () => {
    vi.stubGlobal('window', undefined as unknown as Window);
    vi.stubGlobal('localStorage', undefined as unknown as Storage);
    expect(() => raiseParadox('Calorimetry', 'anything')).not.toThrow();
    expect(loadParadoxes()).toEqual([]);
    expect(() => clearParadoxes()).not.toThrow();
  });

  it('clears every record', () => {
    raiseParadox('Calorimetry', 'a');
    raiseParadox('Calorimetry', 'b');
    clearParadoxes();
    expect(loadParadoxes()).toEqual([]);
  });

  describe('resolvedParadoxes (what the export funnel reads)', () => {
    it('ships only closed entries that carry the sentence that closed them', () => {
      const kept = raiseParadox('Calorimetry', 'Where is the zero point?');
      const silent = raiseParadox('Calorimetry', 'Why is water the reference?');
      resolveParadox(kept!.id, 'Products minus reactants, standard states.');
      // Closed with no sentence: nothing honest to review, so it does not ship.
      resolveParadox(silent!.id, '   ');

      const resolved = resolvedParadoxes();
      expect(resolved.length).toBe(1);
      expect(resolved[0].statement).toBe('Where is the zero point?');
      expect(resolved[0].resolution).toBe('Products minus reactants, standard states.');
    });

    it('orders by resolution, newest first — the review order the funnel promises', () => {
      const older = raiseParadox('Calorimetry', 'first');
      const newer = raiseParadox('Calorimetry', 'second');
      resolveParadox(older!.id, 'one', 1000);
      resolveParadox(newer!.id, 'two', 2000);

      const resolved = resolvedParadoxes();
      expect(resolved.map((entry) => entry.resolution)).toEqual(['two', 'one']);
    });

    it('never hands an open paradox to the funnel', () => {
      raiseParadox('Calorimetry', 'still live');
      expect(resolvedParadoxes()).toEqual([]);
    });

    it('is safe outside the browser', () => {
      vi.stubGlobal('window', undefined as unknown as Window);
      vi.stubGlobal('localStorage', undefined as unknown as Storage);
      expect(resolvedParadoxes()).toEqual([]);
    });
  });
});

/**
 * The patch registry is the other half of the ledger: paradoxes are what is
 * still OPEN, patches are what has been CLOSED. A fracture that fires once is a
 * slip; the same one firing three times is a standing fault worth a pre-flight
 * warning, so the hit count is the whole point of the record — and the one field
 * that is the learner's own sentence must survive every one of those hits.
 */
describe('Mr M engineering patch registry', () => {
  beforeEach(() => {
    store.clear();
    mockStorage();
  });

  const record = (over: Partial<Parameters<typeof recordPatch>[0]> = {}) =>
    recordPatch({
      topic: 'Thermochemistry',
      kind: 'SIGN_FLIP',
      statement: 'Anchor q_rxn = -q_water before the arithmetic.',
      arithmeticReveal: '0.0336 ÷ -0.0336 = -1.00',
      learnerValue: 0.0336,
      expectedValue: -0.0336,
      ...over,
    });

  it('records a fracture with the arithmetic that exposed it', () => {
    const entry = record();
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe('SIGN_FLIP');
    expect(entry!.hits).toBe(1);
    expect(entry!.arithmeticReveal).toBe('0.0336 ÷ -0.0336 = -1.00');
    expect(entry!.learnerValue).toBe(0.0336);
    expect(entry!.expectedValue).toBe(-0.0336);

    const stored = loadPatches();
    expect(stored.length).toBe(1);
    expect(stored[0].topic).toBe('Thermochemistry');
  });

  it('refuses a patch with nothing to do differently', () => {
    expect(record({ statement: '   ' })).toBeNull();
    expect(loadPatches()).toEqual([]);
  });

  it('re-opens the same fracture instead of stacking a near-duplicate', () => {
    record();
    const second = record();
    expect(second!.hits).toBe(2);
    expect(loadPatches().length).toBe(1);
  });

  it('moves the hit count and the arithmetic, never the learner’s own sentence', () => {
    const first = record()!;
    updatePatchStatement(first.id, 'Always check whether the thermometer measures the water or the reaction.');

    const reopened = record({ arithmeticReveal: '0.0672 ÷ -0.0672 = -1.00' })!;
    expect(reopened.hits).toBe(2);
    expect(reopened.arithmeticReveal).toBe('0.0672 ÷ -0.0672 = -1.00');
    // The scaffold must not come back and delete what they wrote.
    expect(reopened.statement).toBe(
      'Always check whether the thermometer measures the water or the reaction.'
    );
  });

  it('keeps a different fracture on the same topic as its own patch', () => {
    record();
    record({ kind: 'FACTOR_OF_TWO', statement: 'Find the 2 in the balanced equation.' });
    expect(loadPatches().length).toBe(2);
  });

  it('scopes patches to their own topic', () => {
    record();
    record({ topic: 'Optics', statement: 'Lens equation: mind the sign convention.' });
    expect(patchesFor('thermochemistry').length).toBe(1);
    expect(patchesFor('Optics').length).toBe(1);
    expect(patchesFor('French Revolution').length).toBe(0);
  });

  it('numbers the armory from the oldest entry, so a number never moves', () => {
    const a = recordPatch({ topic: 'A', kind: 'SIGN_FLIP', statement: 'a' }, 1)!;
    const b = recordPatch({ topic: 'B', kind: 'SIGN_FLIP', statement: 'b' }, 2)!;
    const c = recordPatch({ topic: 'C', kind: 'SIGN_FLIP', statement: 'c' }, 3)!;

    const numbers = patchNumbers();
    expect(numbers[a.id]).toBe(1);
    expect(numbers[b.id]).toBe(2);
    expect(numbers[c.id]).toBe(3);
  });

  it('warns only once a fracture has actually repeated', () => {
    expect(REPEAT_HITS).toBe(2);
    record();
    // One hit is a slip, and a wall of slips reads as noise.
    expect(preflightWarnings('Thermochemistry')).toEqual([]);

    record();
    const warnings = preflightWarnings('Thermochemistry');
    expect(warnings.length).toBe(1);
    expect(warnings[0].headline).toContain('SIGN_FLIP');
    expect(warnings[0].headline).toContain('2 times');
    expect(warnings[0].line).toContain('q_rxn');
  });

  it('draws the same warning from a list it was handed', () => {
    record();
    record();
    expect(warningsFrom(patchesFor('Thermochemistry'))).toEqual(
      preflightWarnings('Thermochemistry')
    );
  });

  it('never warns about another topic’s fault', () => {
    record();
    record();
    expect(preflightWarnings('Optics')).toEqual([]);
  });

  it('updates only the statement when the learner rewrites it', () => {
    const entry = record()!;
    updatePatchStatement(entry.id, '  Read the convention first.  ');
    const stored = loadPatches()[0];
    expect(stored.statement).toBe('Read the convention first.');
    expect(stored.hits).toBe(1);
    expect(stored.arithmeticReveal).toBe(entry.arithmeticReveal);
  });

  it('ignores a blank rewrite instead of erasing the patch line', () => {
    const entry = record()!;
    updatePatchStatement(entry.id, '   ');
    expect(loadPatches()[0].statement).toBe(entry.statement);
  });

  it('keeps only the newest sixty patches', () => {
    for (let i = 0; i < 65; i += 1) {
      recordPatch({ topic: `topic-${i}`, kind: 'SIGN_FLIP', statement: `patch ${i}` }, 1_000 + i);
    }
    const stored = loadPatches();
    expect(stored.length).toBe(60);
    expect(stored[0].statement).toBe('patch 64');
    expect(stored[stored.length - 1].statement).toBe('patch 5');
  });

  it('degrades to empty on malformed storage', () => {
    store.set('deepencode_mr_m_patches_v1', '{ not json');
    expect(loadPatches()).toEqual([]);

    store.set(
      'deepencode_mr_m_patches_v1',
      JSON.stringify([{ id: 'x', kind: 'NOT_A_KIND', statement: 's', lastSeenAt: 1 }])
    );
    // A kind outside the vocabulary is dropped: the panel has no label for it.
    expect(loadPatches()).toEqual([]);
  });

  it('does nothing when storage is unavailable', () => {
    vi.stubGlobal('window', undefined as unknown as Window);
    vi.stubGlobal('localStorage', undefined as unknown as Storage);
    expect(() => record()).not.toThrow();
    expect(loadPatches()).toEqual([]);
    expect(() => clearPatches()).not.toThrow();
  });

  it('clears every record', () => {
    record();
    record({ topic: 'Optics' });
    clearPatches();
    expect(loadPatches()).toEqual([]);
  });
});

/**
 * The registry's doctrine ranks a standing fault above a slip, and the
 * pre-flight is the only surface that acts on it. But `recordPatch` re-opens a
 * repeat IN PLACE, so the stored array is first-seen order — which is also the
 * order `patchNumbers` depends on ("a number a learner has already seen does
 * not move"), so the array cannot simply be re-sorted. Both the warning
 * selection and the cap therefore have to rank explicitly: highest hit count
 * first, then the most recent sighting.
 */
describe('Mr M patch registry — ranked by significance, not by array position', () => {
  beforeEach(() => {
    store.clear();
    mockStorage();
    clearPatches();
  });

  const record = (topic: string, kind: DiscrepancyKind, at: number) =>
    recordPatch({ topic, kind, statement: `${kind} on ${topic}` }, at)!;

  it('warns about the fault that fired most recently, not the stalest one', () => {
    // Four standing faults on one topic, each recorded at its own first sighting.
    const kinds: DiscrepancyKind[] = ['SIGN_FLIP', 'DIMENSIONAL_CONVERSION_ERROR', 'POWER_LAW', 'LOG_SCALE'];
    kinds.forEach((kind, index) => {
      record('Kinetics', kind, 5_000 + index);
      record('Kinetics', kind, 5_000 + index);
    });
    // The FIRST-recorded fault (SIGN_FLIP) fires again, later than every other
    // sighting in the registry. It keeps its array slot, as it must.
    record('Kinetics', 'SIGN_FLIP', 90_000);

    const warnings = preflightWarnings('Kinetics');
    expect(warnings.length).toBe(3); // MAX_PREFLIGHT
    // Most-fired first, then the most recent sighting: SIGN_FLIP has 3 hits.
    expect(warnings[0].patch.kind).toBe('SIGN_FLIP');
    expect(warnings[0].patch.hits).toBe(3);
    expect(warnings[0].headline).toContain('3 times');
    expect(warnings.slice(1).map((w) => w.patch.kind)).toEqual(['LOG_SCALE', 'POWER_LAW']);
    // The stale one is the record that gives up its slot, not the live fault.
    expect(warnings.map((w) => w.patch.kind)).not.toContain('DIMENSIONAL_CONVERSION_ERROR');
  });

  it('keeps a repeated fault when a flush of one-off slips overflows the cap', () => {
    for (let i = 0; i < 5; i += 1) {
      record('Thermochemistry', 'SIGN_FLIP', 1_000 + i); // one fault, five sightings
    }
    for (let i = 0; i < 60; i += 1) {
      record(`Topic ${i}`, 'DIMENSIONAL_CONVERSION_ERROR', 2_000 + i); // sixty slips
    }

    const stored = loadPatches();
    expect(stored.length).toBe(60); // the cap still holds
    expect(stored.find((p) => p.topic === 'Thermochemistry')?.hits).toBe(5); // the fault survived
    expect(stored.filter((p) => p.hits === 1).length).toBe(59); // a slip made room
    // ...so the tripwire can still see the fault it exists for.
    expect(preflightWarnings('Thermochemistry').length).toBe(1);
  });

  it('numbers the armory from first sighting, capped or not', () => {
    const first = record('A', 'SIGN_FLIP', 100);
    record('A', 'SIGN_FLIP', 200); // hits = 2, still the same record
    for (let i = 0; i < 60; i += 1) {
      record(`T${i}`, 'LOG_SCALE', 300 + i);
    }

    const stored = loadPatches();
    expect(stored.length).toBe(60);
    expect(stored[stored.length - 1].id).toBe(first.id); // the oldest entry is still last
    expect(patchNumbers()[first.id]).toBe(1); // so its number never moved
  });

  it('still keeps the newest sixty when every record is a one-off slip', () => {
    for (let i = 0; i < 65; i += 1) {
      record(`t${i}`, 'SIGN_FLIP', 1_000 + i);
    }
    const stored = loadPatches();
    expect(stored.length).toBe(60);
    // No repeated fracture: the policy is exactly what it always was.
    expect(stored.map((p) => p.topic)).toEqual(
      Array.from({ length: 60 }, (_, i) => `t${64 - i}`)
    );
  });

  it('breaks a complete tie deterministically, by first-seen order', () => {
    // Identical hits AND identical lastSeenAt: the stable sort has to fall back
    // to the order the records were first seen in, which is array order.
    for (let i = 0; i < 61; i += 1) {
      record(`tie${i}`, 'SIGN_FLIP', 7_000);
    }
    const stored = loadPatches();
    expect(stored.length).toBe(60);
    expect(stored.map((p) => p.topic)).toEqual(
      Array.from({ length: 60 }, (_, i) => `tie${60 - i}`)
    );
  });

  it('ranks a handed-in list without mutating it', () => {
    const older = record('Kinetics', 'LOG_SCALE', 10);
    record('Kinetics', 'LOG_SCALE', 11);
    const live = record('Kinetics', 'SIGN_FLIP', 20);
    record('Kinetics', 'SIGN_FLIP', 21);
    const handed = patchesFor('Kinetics');
    const before = handed.map((p) => p.id);

    const warnings = warningsFrom(handed);

    expect(warnings.map((w) => w.patch.id)).toEqual([live.id, older.id]);
    expect(handed.map((p) => p.id)).toEqual(before); // the caller's list is untouched
  });
});
