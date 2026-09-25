import { describe, it, expect } from 'vitest';
import {
  ParsonsTile,
  scrambleParsons,
  gradeParsons,
  describeParsonsFix,
  formatParsonsChain,
} from '@/lib/parsons';

const chain: ParsonsTile[] = [
  { id: 's1', text: 'The membrane crosses -55 mV.' },
  { id: 's2', text: 'Voltage-gated Na+ channels open.' },
  { id: 's3', text: 'Sodium floods inward and depolarises the cell.' },
  { id: 's4', text: 'K+ efflux restores the resting charge.' },
];

describe('scrambleParsons', () => {
  it('is deterministic for a given seed', () => {
    const a = scrambleParsons(chain, 'Action Potentials');
    const b = scrambleParsons(chain, 'Action Potentials');
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
  });

  it('never returns the canonical order for a chain it can reorder', () => {
    for (const seed of ['a', 'b', 'c', 'Action Potentials', 'Krebs', 'TCP']) {
      const shuffled = scrambleParsons(chain, seed);
      expect(shuffled.map((t) => t.id)).not.toEqual(chain.map((t) => t.id));
      expect(new Set(shuffled.map((t) => t.id)).size).toBe(chain.length);
    }
  });

  it('leaves a one-tile or empty chain alone', () => {
    expect(scrambleParsons([chain[0]], 'x')).toEqual([chain[0]]);
    expect(scrambleParsons([], 'x')).toEqual([]);
  });
});

describe('gradeParsons', () => {
  const canonical = chain.map((t) => t.id);

  it('accepts the canonical order', () => {
    const grade = gradeParsons(canonical, canonical);
    expect(grade.correct).toBe(true);
    expect(grade.correctPositions).toBe(4);
    expect(grade.misplaced).toEqual([]);
    expect(grade.firstWrongIndex).toBeNull();
  });

  it('counts positions and points at the first break', () => {
    const grade = gradeParsons(['s1', 's3', 's2', 's4'], canonical);
    expect(grade.correct).toBe(false);
    expect(grade.correctPositions).toBe(2);
    expect(grade.misplaced).toEqual([1, 2]);
    expect(grade.firstWrongIndex).toBe(1);
  });

  it('treats a short submission as incomplete rather than correct', () => {
    const grade = gradeParsons(['s1', 's2'], canonical);
    expect(grade.correct).toBe(false);
    expect(grade.firstWrongIndex).toBe(2);
  });
});

describe('describeParsonsFix', () => {
  it('names the misplaced tile and what must precede it', () => {
    // s3 sits where s2 belongs, so the fix is about s2 following s1.
    const fix = describeParsonsFix(['s1', 's3', 's2', 's4'], chain);
    expect(fix).toContain('Voltage-gated Na+ channels open. must come after The membrane crosses -55 mV.');
    expect(fix).toContain('Sodium floods inward and depolarises the cell. is out of place');
  });

  it('says a tile must lead when it belongs first', () => {
    const leading = describeParsonsFix(['s2', 's1', 's3', 's4'], chain);
    expect(leading).toContain('The membrane crosses -55 mV. must be the first step');
    expect(leading).toContain('Voltage-gated Na+ channels open. is out of place');
  });

  it('returns nothing when the chain is already correct', () => {
    expect(describeParsonsFix(chain.map((t) => t.id), chain)).toBe('');
  });
});

describe('formatParsonsChain', () => {
  it('renders the chain as a numbered one-liner for the card', () => {
    expect(formatParsonsChain(chain)).toBe(
      '1) The membrane crosses -55 mV. 2) Voltage-gated Na+ channels open. ' +
        '3) Sodium floods inward and depolarises the cell. 4) K+ efflux restores the resting charge.'
    );
  });
});
