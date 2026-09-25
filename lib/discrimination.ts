// ─── The 10-Second Discrimination Gate ──────────────────────────────────────
//
// Cards do not fail in spaced repetition because the fact was never learned;
// they fail because a NEIGHBOUR is answering for them. SN1 for SN2. Atropine for
// epinephrine. Type I for Type II error. That is retroactive interference, and
// it is invisible to a self-graded review: the card "felt" right.
//
// The gate is the cheapest possible inoculation: two blind vignettes, one of the
// concept and one of its lookalike, each classified against a 10-second clock.
// Ten seconds is the whole mechanism — a discrimination you actually hold is
// immediate, while interference forces deliberation, and the hesitation is the
// signal. Hesitation and misses are reported honestly as `unstable`, never as a
// silent pass, and the learner's own operational rule is captured as a trap card
// that leads the deck (the hypercorrection effect: the correction for a mistake
// you can feel is the most durable card you will ever own).
//
// Pure logic: no timers, no DOM. The component supplies elapsed times and this
// module decides what they mean, so the rule for "unstable" is unit-testable.

import type { Activity } from './types';

/** Per-question clock. Deliberation past this counts as interference, not thought. */
export const DISCRIMINATION_SECONDS = 10;

export interface DiscriminationQuestion {
  id: string;
  /** The edge-case vignette, with no give-away vocabulary. */
  vignette: string;
  /** True when the vignette IS the stage's concept; false when it is the lookalike. */
  answerIsConcept: boolean;
  /** One line on the tell that settles it (shown only after answering). */
  rationale: string;
}

export interface DiscriminationCheck {
  topic: string;
  /** The stage's concept, e.g. "SN1". */
  conceptLabel: string;
  /** The concept it is most often confused with, e.g. "SN2". */
  lookalikeLabel: string;
  questions: DiscriminationQuestion[];
  /** The single operational rule that separates the pair. */
  operationalRule: string;
  /** Cloze-ready card captured when the gate fires. */
  cardFront: string;
  cardBack: string;
}

export interface DiscriminationAnswer {
  questionId: string;
  /** What the learner classified the vignette as. */
  choseConcept: boolean;
  /** How long they took, in ms (>= the clock means they ran out). */
  elapsedMs: number;
}

export interface DiscriminationOutcome {
  correct: number;
  wrong: number;
  timedOut: number;
  /** Any miss or any timeout: the pair is not safely separated yet. */
  unstable: boolean;
  /** Every question answered, on time and right. */
  passed: boolean;
  /** Miller-style one-liner for the UI and for the deck's tag. */
  summary: string;
}

/** Grades a completed run. Times are supplied by the caller (no clock in here). */
export function scoreDiscrimination(
  questions: DiscriminationQuestion[],
  answers: DiscriminationAnswer[],
  seconds: number = DISCRIMINATION_SECONDS
): DiscriminationOutcome {
  const limit = seconds * 1000;
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  let correct = 0;
  let wrong = 0;
  let timedOut = 0;

  for (const q of questions) {
    const answer = byId.get(q.id);
    if (!answer) {
      timedOut += 1;
      continue;
    }
    if (answer.elapsedMs >= limit) {
      timedOut += 1;
      continue;
    }
    if (answer.choseConcept === q.answerIsConcept) correct += 1;
    else wrong += 1;
  }

  const unstable = wrong > 0 || timedOut > 0;
  const parts: string[] = [`${correct}/${questions.length} separated`];
  if (wrong > 0) parts.push(`${wrong} confused`);
  if (timedOut > 0) parts.push(`${timedOut} past the ${seconds}s clock`);

  return {
    correct,
    wrong,
    timedOut,
    unstable,
    passed: !unstable && questions.length > 0,
    summary: questions.length === 0 ? 'No discrimination check available.' : parts.join(' · '),
  };
}

/** Milliseconds left on the clock (never negative). */
export function remainingMs(startedAt: number, now: number, seconds: number = DISCRIMINATION_SECONDS): number {
  return Math.max(0, seconds * 1000 - (now - startedAt));
}

/**
 * The trap card the gate produces.
 *
 * The learner's own rule is preferred over the examiner's: wording it is the
 * step that actually tests the discrimination, and the back falls back to the
 * examiner's rule so the card is never empty.
 */
export function buildDiscriminationTrap(
  check: DiscriminationCheck,
  outcome: DiscriminationOutcome,
  learnerRule: string
): {
  topic: string;
  question: string;
  committedAnswer: string;
  correctAnswer: string;
  confidenceTier: 'guess' | 'half' | 'bet';
  flawExplanation: string;
  cardFront: string;
  cardBack: string;
} {
  const rule = learnerRule.trim() || check.operationalRule.trim();
  return {
    topic: check.topic,
    question: check.cardFront || `How do you tell ${check.conceptLabel} from ${check.lookalikeLabel}?`,
    committedAnswer: outcome.unstable ? 'Confused the pair under time pressure' : 'Separated the pair',
    correctAnswer: rule,
    // A miss on a 10-second clock is a confident wrong answer by construction:
    // the learner did not hesitate, they simply had the neighbour's rule loaded.
    confidenceTier: outcome.wrong > 0 ? 'bet' : 'half',
    flawExplanation: `${outcome.summary}. ${rule}`,
    cardFront:
      check.cardFront ||
      `What single rule separates ${check.conceptLabel} from ${check.lookalikeLabel}?`,
    cardBack: `{{c1::${rule}}} (${check.conceptLabel} vs ${check.lookalikeLabel})`,
  };
}

/**
 * The fallback check for a stage whose payload has no boundary contrast to test
 * against: it still gates, using the stage's own concept and the closest thing
 * the material offers, so export never quietly skips the gate.
 */
export interface GateSource {
  topic: string;
  conceptLabel: string;
  lookalikeLabel: string;
  distinguishingRule: string;
}

export function gateSourceFromActivity(
  activity: Activity | undefined,
  topicSummary?: string
): GateSource | null {
  if (!activity) return null;
  const contrast = activity.boundaryContrast;
  const concept = (activity.title || '').trim();
  const lookalike = (contrast?.confusableLookalike || '').trim();
  if (!concept || !lookalike) return null;
  return {
    topic: (topicSummary || concept).trim(),
    conceptLabel: concept,
    lookalikeLabel: lookalike,
    distinguishingRule: (contrast?.distinguishingRule || '').trim(),
  };
}
