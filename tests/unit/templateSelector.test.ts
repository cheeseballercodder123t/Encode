import { describe, it, expect } from 'vitest';
import { selectOptimalTemplates, TEMPLATE_CATALOG } from '@/lib/services/templateSelector';

describe('selectOptimalTemplates', () => {
  it('filters strictly by mode', () => {
    const conceptual = selectOptimalTemplates('anything', 'conceptual', 20);
    conceptual.forEach(t => expect(t.mode).toBe('conceptual'));

    const memorization = selectOptimalTemplates('anything', 'memorization', 20);
    memorization.forEach(t => expect(t.mode).toBe('memorization'));
  });

  it('boosts templates whose triggers match the text', () => {
    const text = 'During repolarization the membrane potential returns to rest.';
    const selected = selectOptimalTemplates(text, 'conceptual', 5);
    expect(selected[0].type).toBe('state_transition');
  });

  it('caps results at the requested count and never duplicates types', () => {
    const selected = selectOptimalTemplates('neurons, voltage, hierarchy, cycles', 'conceptual', 3);
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map(t => t.type)).size).toBe(3);
  });

  it('returns fewer when the pool is smaller than requested', () => {
    const poolSize = TEMPLATE_CATALOG.filter(t => t.mode === 'memorization').length;
    const selected = selectOptimalTemplates('', 'memorization', 99);
    expect(selected).toHaveLength(poolSize);
  });

  it('still fills the quota from weights alone when nothing matches', () => {
    const selected = selectOptimalTemplates('zzz qqq vvv', 'conceptual', 5);
    expect(selected).toHaveLength(5);
  });
});
