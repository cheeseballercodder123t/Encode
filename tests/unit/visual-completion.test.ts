import { describe, it, expect } from 'vitest';
import { buildCompletion, gradeCompletion, normalizeAnswer } from '@/lib/visual-completion';
import { makeActivity } from './fixtures';

describe('buildCompletion', () => {
  it('blanks the analogy mapping the encoder marked partial', () => {
    const slot = buildCompletion(
      makeActivity({
        templateType: 'analogy_matrix',
        visualData: {
          sourceDomainName: 'a water pipe',
          analogyMappings: [
            { sourceElement: 'pipe width', targetElement: 'axon diameter', explanation: 'both set resistance' },
            { sourceElement: 'pressure', targetElement: 'membrane potential', isPartialTarget: true },
          ],
        },
      } as any)
    )!;
    expect(slot.kind).toBe('analogy_target');
    expect(slot.index).toBe(1);
    expect(slot.answer).toBe('membrane potential');
    expect(slot.prompt).toContain('a water pipe');
    expect(slot.prompt).toContain('pressure');
    expect(slot.hint).toBeUndefined();
  });

  it('falls back to the hardest (last) mapping when nothing is flagged', () => {
    const slot = buildCompletion(
      makeActivity({
        templateType: 'analogy_matrix',
        visualData: {
          analogyMappings: [
            { sourceElement: 'a', targetElement: 'first' },
            { sourceElement: 'b', targetElement: 'second' },
          ],
        },
      } as any)
    )!;
    expect(slot.index).toBe(1);
    expect(slot.answer).toBe('second');
  });

  it('blanks the rate-limiting transition of a cycle', () => {
    const slot = buildCompletion(
      makeActivity({
        templateType: 'state_transition',
        visualData: {
          cycleName: 'Action potential',
          resetCondition: 'K+ efflux restores -70mV.',
          flowSteps: [
            { stepNumber: 1, title: 'Resting', mechanism: 'K+ leak conductance dominates' },
            { stepNumber: 2, title: 'Depolarisation', mechanism: 'Voltage-gated Na+ channels open', isTriggerState: true },
            { stepNumber: 3, title: 'Repolarisation', mechanism: 'Na+ inactivation gates close' },
          ],
        },
      } as any)
    )!;
    expect(slot.kind).toBe('transition_trigger');
    expect(slot.index).toBe(1);
    expect(slot.answer).toBe('Voltage-gated Na+ channels open');
    expect(slot.prompt).toContain('Depolarisation');
    expect(slot.hint).toBe('K+ efflux restores -70mV.');
  });

  it('blanks the mechanism node of a first-principles chain', () => {
    const slot = buildCompletion(
      makeActivity({
        templateType: 'first_principles',
        visualData: {
          nodes: [
            { id: 'n1', label: 'Threshold is crossed', type: 'input' },
            { id: 'n2', label: 'S4 segments swing outward', subtext: 'the charged helices move in the field', type: 'mechanism' },
            { id: 'n3', label: 'The pore opens', type: 'outcome' },
          ],
        },
      } as any)
    )!;
    expect(slot.kind).toBe('causal_node');
    expect(slot.index).toBe(1);
    expect(slot.answer).toBe('S4 segments swing outward');
    expect(slot.prompt).toBe('Fill the blanked node: Threshold is crossed → ? → The pore opens');
  });

  it('returns null when there is nothing to blank', () => {
    expect(buildCompletion(undefined)).toBeNull();
    expect(buildCompletion(makeActivity({ templateType: 'first_principles', visualData: {} } as any))).toBeNull();
    expect(
      buildCompletion(makeActivity({ templateType: 'analogy_matrix', visualData: { analogyMappings: [] } } as any))
    ).toBeNull();
  });
});

describe('gradeCompletion', () => {
  it('accepts the exact answer and case/space variants', () => {
    expect(gradeCompletion('membrane potential', 'Membrane Potential')).toBe(true);
    expect(gradeCompletion('  voltage-gated   Na+ channels open ', 'Voltage-gated Na+ channels open')).toBe(true);
  });

  it('accepts a partial phrase that keeps the content words', () => {
    expect(gradeCompletion('the Na+ channels open', 'Voltage-gated Na+ channels open')).toBe(true);
  });

  it('rejects a shallow or wrong answer', () => {
    expect(gradeCompletion('potassium leaves', 'Voltage-gated Na+ channels open')).toBe(false);
    expect(gradeCompletion('', 'anything')).toBe(false);
    expect(gradeCompletion('something', '')).toBe(false);
  });
});

describe('normalizeAnswer', () => {
  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeAnswer('  S4 segments — swing outward! ')).toBe('s4 segments swing outward');
  });
});
