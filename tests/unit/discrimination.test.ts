import { describe, it, expect } from 'vitest';
import {
  DISCRIMINATION_SECONDS,
  buildDiscriminationTrap,
  gateSourceFromActivity,
  remainingMs,
  scoreDiscrimination,
} from '@/lib/discrimination';
import { validateDiscriminationResult } from '@/lib/ai-output-validation';
import { makeActivity } from './fixtures';
import type { DiscriminationCheck, DiscriminationQuestion } from '@/lib/types';

const questions: DiscriminationQuestion[] = [
  { id: 'dq1', vignette: 'Voltage rises fast.', answerIsConcept: true, rationale: 'Na+ leads.' },
  { id: 'dq2', vignette: 'Voltage falls slowly.', answerIsConcept: false, rationale: 'K+ leads.' },
];

const check: DiscriminationCheck = {
  topic: 'Action Potentials',
  conceptLabel: 'Depolarisation',
  lookalikeLabel: 'Repolarisation',
  questions,
  operationalRule: 'Track the sign of dV/dt.',
  cardFront: 'When the voltage falls, which conductance leads?',
  cardBack: 'K+ leads once {{c1::the Na+ gates shut}}.',
};

describe('scoreDiscrimination', () => {
  it('passes a fast, correct run', () => {
    const outcome = scoreDiscrimination(questions, [
      { questionId: 'dq1', choseConcept: true, elapsedMs: 1200 },
      { questionId: 'dq2', choseConcept: false, elapsedMs: 2100 },
    ]);
    expect(outcome.passed).toBe(true);
    expect(outcome.unstable).toBe(false);
    expect(outcome.summary).toBe('2/2 separated');
  });

  it('flags a confident wrong classification as unstable', () => {
    const outcome = scoreDiscrimination(questions, [
      { questionId: 'dq1', choseConcept: false, elapsedMs: 900 },
      { questionId: 'dq2', choseConcept: false, elapsedMs: 1500 },
    ]);
    expect(outcome.passed).toBe(false);
    expect(outcome.unstable).toBe(true);
    expect(outcome.wrong).toBe(1);
    expect(outcome.summary).toBe('1/2 separated · 1 confused');
  });

  it('counts running out of the clock as a timeout, not as a lucky guess', () => {
    const outcome = scoreDiscrimination(questions, [
      { questionId: 'dq1', choseConcept: true, elapsedMs: DISCRIMINATION_SECONDS * 1000 },
      { questionId: 'dq2', choseConcept: false, elapsedMs: 800 },
    ]);
    expect(outcome.correct).toBe(1);
    expect(outcome.wrong).toBe(0);
    expect(outcome.timedOut).toBe(1);
    expect(outcome.unstable).toBe(true);
    expect(outcome.summary).toBe('1/2 separated · 1 past the 10s clock');
  });

  it('treats an unanswered question as a timeout', () => {
    const outcome = scoreDiscrimination(questions, [
      { questionId: 'dq1', choseConcept: true, elapsedMs: 500 },
    ]);
    expect(outcome.timedOut).toBe(1);
    expect(outcome.unstable).toBe(true);
  });

  it('never passes an empty check', () => {
    const outcome = scoreDiscrimination([], []);
    expect(outcome.passed).toBe(false);
    expect(outcome.summary).toBe('No discrimination check available.');
  });

  it('honours a custom clock', () => {
    const outcome = scoreDiscrimination(
      questions,
      [
        { questionId: 'dq1', choseConcept: true, elapsedMs: 4000 },
        { questionId: 'dq2', choseConcept: false, elapsedMs: 4000 },
      ],
      3
    );
    expect(outcome.timedOut).toBe(2);
    expect(outcome.summary).toContain('3s clock');
  });
});

describe('remainingMs', () => {
  it('counts down and clamps at zero', () => {
    expect(remainingMs(1000, 4000)).toBe(7000);
    expect(remainingMs(1000, 99_000)).toBe(0);
  });
});

describe('buildDiscriminationTrap', () => {
  const outcome = scoreDiscrimination(questions, [
    { questionId: 'dq1', choseConcept: false, elapsedMs: 900 },
    { questionId: 'dq2', choseConcept: false, elapsedMs: 900 },
  ]);

  it('prefers the learner rule and falls back to the examiner rule', () => {
    expect(buildDiscriminationTrap(check, outcome, 'Follow the sign of dV/dt.').flawExplanation).toContain(
      'Follow the sign of dV/dt.'
    );
    expect(buildDiscriminationTrap(check, outcome, '   ').correctAnswer).toBe('Track the sign of dV/dt.');
  });

  it('produces a cloze-ready trap card that names both sides', () => {
    const trap = buildDiscriminationTrap(check, outcome, 'Follow the sign of dV/dt.');
    expect(trap.cardFront).toBe(check.cardFront);
    expect(trap.cardBack).toContain('{{c1::Follow the sign of dV/dt.}}');
    expect(trap.cardBack).toContain('Depolarisation vs Repolarisation');
    // A miss on a 10-second clock is a confident wrong answer by construction.
    expect(trap.confidenceTier).toBe('bet');
    expect(trap.topic).toBe('Action Potentials');
  });

  it('does not claim confidence for a mere timeout', () => {
    const timedOut = scoreDiscrimination(questions, [
      { questionId: 'dq1', choseConcept: true, elapsedMs: DISCRIMINATION_SECONDS * 1000 },
      { questionId: 'dq2', choseConcept: false, elapsedMs: 500 },
    ]);
    expect(buildDiscriminationTrap(check, timedOut, 'rule').confidenceTier).toBe('half');
  });
});

describe('gateSourceFromActivity', () => {
  it('reads the concept/lookalike pair from the stage', () => {
    const source = gateSourceFromActivity(
      makeActivity({
        title: 'SN1',
        boundaryContrast: { confusableLookalike: 'SN2', distinguishingRule: 'Rate depends on one species.' },
      } as any),
      'Substitution reactions'
    )!;
    expect(source.conceptLabel).toBe('SN1');
    expect(source.lookalikeLabel).toBe('SN2');
    expect(source.topic).toBe('Substitution reactions');
  });

  it('returns null when the stage has no pair to test', () => {
    expect(gateSourceFromActivity(makeActivity({ id: 'x' } as any), 'Topic')).toBeNull();
    expect(gateSourceFromActivity(undefined, 'Topic')).toBeNull();
    expect(
      gateSourceFromActivity(
        makeActivity({ title: '', boundaryContrast: { confusableLookalike: 'B', distinguishingRule: 'x' } } as any)
      )
    ).toBeNull();
  });
});

describe('validateDiscriminationResult', () => {
  it('accepts a blind pair with one of each side', () => {
    const validated = validateDiscriminationResult({
      topic: 'T',
      conceptLabel: 'A',
      lookalikeLabel: 'B',
      operationalRule: 'rule',
      cardFront: 'front',
      cardBack: 'back',
      questions: [
        { id: 'dq1', vignette: 'one', answerIsConcept: true, rationale: 'r1' },
        { id: 'dq2', vignette: 'two', answerIsConcept: false, rationale: 'r2' },
      ],
    });
    expect(validated.questions).toHaveLength(2);
    expect(validated.conceptLabel).toBe('A');
  });

  it('refuses a check where both vignettes are the same side', () => {
    const validated = validateDiscriminationResult({
      conceptLabel: 'A',
      lookalikeLabel: 'B',
      questions: [
        { id: 'dq1', vignette: 'one', answerIsConcept: true, rationale: 'r1' },
        { id: 'dq2', vignette: 'two', answerIsConcept: true, rationale: 'r2' },
      ],
    });
    // An unplayable pair means the gate is skipped, never rigged.
    expect(validated.questions).toEqual([]);
  });

  it('drops empty vignettes and unusable payloads', () => {
    const validated = validateDiscriminationResult({
      conceptLabel: 'A',
      lookalikeLabel: 'B',
      questions: [
        { id: 'dq1', vignette: '   ', answerIsConcept: true, rationale: 'r1' },
        { id: 'dq2', vignette: 'two', answerIsConcept: false, rationale: 'r2' },
      ],
    });
    expect(validated.questions).toEqual([]);
    expect(validateDiscriminationResult(null).questions).toEqual([]);
  });
});
