// ─── Mr M mode: autopsy → trap card ─────────────────────────────────────────
//
// The §9 deviation recorded why the autopsy never wrote a card: an
// `InterferenceTrap` demands a `confidenceTier`, and a panel cannot know how
// confident the learner WAS — only the learner knows that, and only they can
// say it honestly. So the card is never automatic. The autopsy offers the
// material, the learner picks the tier they actually held and states the flaw
// in their own words, and only then does the record exist.
//
// Everything here is pure: the panel collects the two learner inputs, the
// workbench supplies the check-time snapshot, and this builder answers with
// the payload `saveInterferenceTrap` stores — or null when there is not
// enough honest material to make a card worth keeping.

import type { ConfidenceTier, InterferenceTrap } from '@/lib/interference-traps';
import type { TrapAutopsy, TrapDiagnosis } from './types';

const TIERS: readonly ConfidenceTier[] = ['guess', 'half', 'bet'];

/** The committed answer travels on the card front, so it must stay a front. */
const MAX_COMMITTED_LENGTH = 200;

export interface AutopsyCardInput {
  /** Topic the trap fired on — becomes the card's `Topic:` tag. */
  topic: string;
  /** The stage's prompt: the question that caught them. */
  question: string;
  /**
   * The answer text as it stood when the check ran — a snapshot, not the live
   * fields, so what the card records is what was actually autopsied.
   */
  committedAnswer: string;
  /** The exemplar / expert completion for the stage, when one exists. */
  correctAnswer: string;
  /** The deterministic half of the autopsy, when it fired. */
  diagnosis?: TrapDiagnosis | null;
  /** The model's narrative half, when it wrote one. */
  autopsy?: TrapAutopsy | null;
  /** The tier the learner says they held at the moment they committed. */
  tier: ConfidenceTier;
  /** The flaw in the learner's words; falls back to the structural reason. */
  flawLine: string;
}

function collapse(text: string | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Builds the card, or null when the material will not carry one: no committed
 * answer to name, no structural read to cite, no flaw to state, or a tier
 * outside the three the hypercorrection effect distinguishes.
 */
export function buildAutopsyTrapCard(
  input: AutopsyCardInput
): Omit<InterferenceTrap, 'id' | 'ts'> | null {
  const committed = collapse(input.committedAnswer).slice(0, MAX_COMMITTED_LENGTH);
  if (!committed) return null;
  if (!TIERS.includes(input.tier)) return null;

  const reason =
    collapse(input.flawLine) ||
    collapse(input.diagnosis?.structuralReason) ||
    collapse(input.autopsy?.structuralReason);
  if (!reason) return null;

  const whereItBreaks = collapse(input.diagnosis?.whereItBreaks || input.autopsy?.whereItBreaks || '');
  const arithmetic = collapse(input.diagnosis?.arithmeticReveal || '');
  const correction =
    collapse(input.autopsy?.correctedConstruction) || collapse(input.correctAnswer);

  const question = collapse(input.question) || collapse(input.topic) || 'This stage';
  const cardFront = `Why is “${committed}” wrong here — which structural trap did it fall into?`;

  const backParts: string[] = [];
  if (arithmetic) backParts.push(arithmetic);
  backParts.push(reason);
  if (whereItBreaks) backParts.push(`The chain breaks at: ${whereItBreaks}.`);
  let cardBack = backParts.join(' ');
  if (correction) cardBack += ` Correction: {{c1::${collapse(correction).slice(0, 400)}}}`;

  return {
    topic: collapse(input.topic) || 'Untitled',
    question,
    committedAnswer: committed,
    correctAnswer: collapse(input.correctAnswer) || correction,
    confidenceTier: input.tier,
    flawExplanation: reason,
    cardFront,
    cardBack,
  };
}
