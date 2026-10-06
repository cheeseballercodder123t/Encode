import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearParadoxes,
  hasOpenParadox,
  loadParadoxes,
  openParadoxesFor,
  raiseParadox,
  resolveParadox,
} from '../../lib/mr-m/ledger';

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
});
