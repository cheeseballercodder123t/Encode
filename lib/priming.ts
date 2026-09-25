// ─── Priming warm-ups (shape · gradient · dimensional · extremum) ───────────
//
// The failure mode these four drills exist to kill is memorizing an equation as
// a jumble of symbols: you know where the variables sit but not why any of them
// is on top rather than underneath. Physics and chemistry education research
// (dual coding, dimensional analysis, prediction-error) all point the same way:
// commit to a qualitative commitment FIRST, and the symbolic form stops being
// arbitrary.
//
//   shape       — sketch the curve before seeing the formula (monotone? saturating?
//                 bell? exponential decay?) so the algebra has a picture to hang on
//   gradient    — locate the electron-density source and the electron-poor sink, so
//                 arrow pushing stops being memorization and becomes inevitable
//   dimensional — assemble the units, which pins whether it is v or v²
//   extremum    — push a variable to 0 or ∞, which pins numerator vs denominator
//
// Every drill is a single committed choice on a 10-second timescale, so it is a
// pre-flight check rather than another workout. Falling for the trap is the point:
// that is the prediction error the card is built from.

export type PrimingKind = 'shape' | 'gradient' | 'dimensional' | 'extremum';

export interface PrimingChoice {
  id: string;
  label: string;
}

export interface PrimingDrill {
  kind: PrimingKind;
  /** What the learner is looking at, e.g. 'Michaelis-Menten rate vs. [S]'. */
  setup: string;
  /** The single question they must commit to. */
  prompt: string;
  choices: PrimingChoice[];
  correctChoiceId: string;
  /** The tempting intuitive answer; '' when there is no clean trap. */
  trapChoiceId: string;
  /** Why the trap feels right — shown only after a wrong commitment. */
  trapExplanation: string;
  /** The first-principles reveal. */
  reveal: string;
  /** The transferable one-line rule that goes on the card. */
  principle: string;
  /** Cloze-ready card captured when the learner falls for the trap. */
  cardFront: string;
  cardBack: string;
}

export const PRIMING_KIND_LABEL: Record<PrimingKind, string> = {
  shape: 'Qualitative shape',
  gradient: 'Source → sink',
  dimensional: 'Unit puzzle',
  extremum: 'Extremal check',
};

const PRIMING_KINDS: readonly PrimingKind[] = ['shape', 'gradient', 'dimensional', 'extremum'];

export function isPrimingKind(value: unknown): value is PrimingKind {
  return typeof value === 'string' && (PRIMING_KINDS as readonly string[]).includes(value);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/**
 * Coerces a model payload into a playable drill.
 *
 * The only things that must survive are two distinct choices and a correct one:
 * a warm-up with an unmatchable `correctChoiceId` would be unanswerable, so the
 * first choice takes over. A trap that duplicates the correct choice is dropped
 * (there is nothing to discriminate against).
 */
export function validatePrimingDrill(raw: unknown): PrimingDrill {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;

  const choices: PrimingChoice[] = (Array.isArray(data.choices) ? data.choices : [])
    .map((c: any, i: number) => ({
      id: asString(c?.id, `c${i + 1}`),
      label: asString(c?.label),
    }))
    .filter((c: PrimingChoice) => c.label.length > 0)
    .slice(0, 5);

  // Deduplicate ids: two options sharing an id make grading ambiguous.
  const seen = new Set<string>();
  const unique = choices.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  const requestedCorrect = asString(data.correctChoiceId);
  const correctChoiceId = unique.some((c) => c.id === requestedCorrect)
    ? requestedCorrect
    : unique[0]?.id ?? '';

  const requestedTrap = asString(data.trapChoiceId);
  const trapChoiceId =
    requestedTrap && requestedTrap !== correctChoiceId && unique.some((c) => c.id === requestedTrap)
      ? requestedTrap
      : '';

  return {
    kind: isPrimingKind(data.kind) ? data.kind : 'extremum',
    setup: asString(data.setup, 'Set the physical stage for this variable.'),
    prompt: asString(data.prompt, 'What must happen at the extremes?'),
    choices: unique,
    correctChoiceId,
    trapChoiceId,
    trapExplanation: asString(data.trapExplanation),
    reveal: asString(data.reveal),
    principle: asString(data.principle),
    cardFront: asString(data.cardFront),
    cardBack: asString(data.cardBack),
  };
}

/** A drill is only playable with at least two distinct, labeled options. */
export function isPlayableDrill(drill: PrimingDrill): boolean {
  return drill.choices.length >= 2 && drill.correctChoiceId.length > 0;
}

export interface PrimingVerdict {
  /** True when the committed choice is the correct one. */
  correct: boolean;
  /** True when the learner walked into the planted misconception. */
  fellForTrap: boolean;
  /** Always shown — the reveal is the teaching moment either way. */
  reveal: string;
  /** The one-line rule worth keeping, regardless of the pick. */
  principle: string;
  /** One-sentence explanation of the trap; '' when the pick was not the trap. */
  trapExplanation: string;
}

/**
 * Grades a committed pick.
 *
 * A wrong pick that was NOT the planted trap still teaches (the reveal runs),
 * but only the trap gets the hazard-red hypercorrection treatment — that is the
 * misconception the drill was actually built to catch.
 */
export function gradePrimingPick(drill: PrimingDrill, choiceId: string): PrimingVerdict {
  const correct = choiceId === drill.correctChoiceId;
  const fellForTrap = !correct && choiceId === drill.trapChoiceId;
  return {
    correct,
    fellForTrap,
    reveal: drill.reveal,
    principle: drill.principle,
    trapExplanation: fellForTrap ? drill.trapExplanation : '',
  };
}
