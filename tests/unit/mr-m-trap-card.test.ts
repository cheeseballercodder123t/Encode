import { describe, it, expect } from 'vitest';
import { buildAutopsyTrapCard } from '../../lib/mr-m/trap-card';
import type { TrapAutopsy, TrapDiagnosis } from '../../lib/mr-m/types';

/**
 * The autopsy's card is never automatic: a confidenceTier cannot be known by
 * code, so the learner declares it. The builder's contract is that it refuses
 * to manufacture a card from material that would not honestly carry one — no
 * committed answer, no structural read, no real tier.
 */

const diagnosis: TrapDiagnosis = {
  trapId: 'factor_of_two',
  structuralReason: 'You divided by the molar mass once instead of accounting for both nitrogens.',
  arithmeticReveal: '0.0337 ÷ 0.0168 = 2.00',
  whereItBreaks: 'Step 2 — the mole ratio absorbed the second nitrogen.',
};

const autopsy: TrapAutopsy = {
  trapId: 'factor_of_two',
  structuralReason: 'The denominator counted one N where the formula has two.',
  correctedConstruction: 'Use 80.04 g/mol (two nitrogens), so 2.50 g / 80.04 = 0.0312 mol.',
  whereItBreaks: 'The molar mass of NH4NO3.',
};

const base = {
  topic: 'Ammonium Nitrate',
  question: 'How many moles in 2.50 g of NH4NO3?',
  committedAnswer: '0.0624 mol',
  correctAnswer: '0.0312 mol',
  tier: 'bet' as const,
  flawLine: '',
};

describe('buildAutopsyTrapCard', () => {
  it('builds a card with the arithmetic, the flaw and a cloze correction', () => {
    const card = buildAutopsyTrapCard({ ...base, diagnosis, autopsy });
    expect(card).not.toBeNull();
    expect(card!.topic).toBe('Ammonium Nitrate');
    expect(card!.confidenceTier).toBe('bet');
    expect(card!.cardFront).toContain('0.0624 mol');
    expect(card!.cardBack).toContain('0.0337 ÷ 0.0168 = 2.00');
    expect(card!.cardBack).toContain('Correction: {{c1::Use 80.04 g/mol');
  });

  it('falls back to the structural reason when the flaw line is empty', () => {
    const card = buildAutopsyTrapCard({ ...base, diagnosis, autopsy });
    expect(card!.flawExplanation).toBe(diagnosis.structuralReason);
  });

  it('prefers the learner’s own words over the prefill', () => {
    const card = buildAutopsyTrapCard({ ...base, diagnosis, flawLine: '  I forgot the second N.  ' });
    expect(card!.flawExplanation).toBe('I forgot the second N.');
  });

  it('works from the narrative half alone, without a deterministic diagnosis', () => {
    const card = buildAutopsyTrapCard({ ...base, diagnosis: null, autopsy });
    expect(card).not.toBeNull();
    expect(card!.cardBack).toContain(autopsy.structuralReason);
    // No arithmetic exists when the deterministic half never fired.
    expect(card!.cardBack).not.toContain('÷');
  });

  it('clozes the exemplar when the model wrote no corrected construction', () => {
    const card = buildAutopsyTrapCard({
      ...base,
      diagnosis,
      autopsy: null,
      correctAnswer: '0.0312 mol',
    });
    expect(card!.cardBack).toContain('{{c1::0.0312 mol}}');
    expect(card!.correctAnswer).toBe('0.0312 mol');
  });

  it('returns null without a committed answer — a card must name what they answered', () => {
    expect(buildAutopsyTrapCard({ ...base, committedAnswer: '   ', diagnosis })).toBeNull();
  });

  it('returns null without any structural read', () => {
    expect(
      buildAutopsyTrapCard({
        ...base,
        diagnosis: null,
        autopsy: null,
        flawLine: '',
      })
    ).toBeNull();
  });

  it('returns null when the learner states no flaw and none was diagnosed', () => {
    const silent: TrapDiagnosis = { ...diagnosis, structuralReason: '' };
    expect(buildAutopsyTrapCard({ ...base, diagnosis: silent, flawLine: '' })).toBeNull();
  });

  it('refuses a tier outside the three the hypercorrection effect distinguishes', () => {
    expect(
      buildAutopsyTrapCard({ ...base, tier: 'certainty' as unknown as 'bet', diagnosis })
    ).toBeNull();
  });

  it('collapses a multi-line committed answer to one front-worthy line', () => {
    const card = buildAutopsyTrapCard({
      ...base,
      committedAnswer: '0.0624 mol\nbecause 2.50 / 40.02',
      diagnosis,
    });
    expect(card!.cardFront).toBe(
      'Why is “0.0624 mol because 2.50 / 40.02” wrong here — which structural trap did it fall into?'
    );
  });

  it('falls back to the topic for the question and the topic name for storage', () => {
    const card = buildAutopsyTrapCard({ ...base, question: '', topic: '  NH4NO3  ', diagnosis });
    expect(card!.question).toBe('NH4NO3');
    expect(card!.topic).toBe('NH4NO3');
  });
});
