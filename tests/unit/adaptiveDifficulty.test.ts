import { describe, it, expect } from 'vitest';
import {
  getDifficultyLevel,
  computeSuccessRate,
  getDifficultyPromptModifier,
  getDifficultyLabel,
} from '@/lib/services/adaptiveDifficulty';

describe('getDifficultyLevel', () => {
  it('returns easy below 50% success', () => {
    expect(getDifficultyLevel(0.49)).toBe('easy');
    expect(getDifficultyLevel(0)).toBe('easy');
  });

  it('returns medium from 50% up to 80%', () => {
    expect(getDifficultyLevel(0.5)).toBe('medium');
    expect(getDifficultyLevel(0.79)).toBe('medium');
  });

  it('returns hard at 80% and above', () => {
    expect(getDifficultyLevel(0.8)).toBe('hard');
    expect(getDifficultyLevel(1)).toBe('hard');
  });
});

describe('computeSuccessRate', () => {
  it('defaults to 0.6 (medium) with no responses', () => {
    expect(computeSuccessRate({})).toBe(0.6);
  });

  it('defaults to 0.6 when nothing has been graded yet', () => {
    const responses = {
      a: { feynmanReview: undefined },
      b: {},
    };
    expect(computeSuccessRate(responses)).toBe(0.6);
  });

  it('counts mastered and good as successes, needs_elaboration as failure', () => {
    const responses = {
      a: { feynmanReview: { grade: 'mastered' } },
      b: { feynmanReview: { grade: 'good' } },
      c: { feynmanReview: { grade: 'needs_elaboration' } },
    };
    expect(computeSuccessRate(responses as any)).toBeCloseTo(2 / 3);
  });
});

describe('getDifficultyPromptModifier', () => {
  it('has a distinct directive per level', () => {
    const levels = (['easy', 'medium', 'hard'] as const).map(getDifficultyPromptModifier);
    expect(new Set(levels).size).toBe(3);
    expect(levels[0]).toContain('EASY');
    expect(levels[2]).toContain('HARD');
  });
});

describe('getDifficultyLabel', () => {
  it('maps levels to human labels', () => {
    expect(getDifficultyLabel('easy')).toContain('Guided');
    expect(getDifficultyLabel('medium')).toContain('Standard');
    expect(getDifficultyLabel('hard')).toContain('Expert');
  });
});
