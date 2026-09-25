// ─── Priming warm-ups (shape · gradient · dimensional · extremum) ───────────
//
// The failure mode these four drills exist to kill is memorizing an equation as
// a jumble of symbols: you know where the variables sit but not why any of them
// is on top rather than underneath. Physics and chemistry education research
// (dual coding, dimensional analysis, prediction-error) all point the same way:
// commit to a qualitative commitment FIRST, and the symbolic form stops being
// arbitrary.
//
//   shape       — DRAW the curve before seeing the formula (saturating? bell?
//                 exponential decay?) so the algebra has a picture to hang on.
//                 The hand commits before the symbols arrive; the reveal names
//                 the shape the drawing should have had.
//   gradient    — a TWO-step polarity check: locate the electron-density source,
//                 then the electron-poor sink. Once the electrostatic pressure
//                 gradient is on the table the arrow can only point one way, so
//                 arrow pushing stops being memorization.
//   dimensional — assemble the units, which pins whether it is v or v²
//   extremum    — a THREE-probe sweep: push each variable to 0 or ∞ in turn
//                 (double the radius? viscosity to infinity? length to zero?)
//                 which pins numerator vs denominator for good.
//
// A drill is a short SEQUENCE of committed choices, one on screen at a time, so
// it stays a pre-flight check rather than another workout. Falling for the trap
// is the point: that is the prediction error the card is built from.

export type PrimingKind = 'shape' | 'gradient' | 'dimensional' | 'extremum';

export interface PrimingChoice {
  id: string;
  label: string;
}

/** One commitment inside a drill. */
export interface PrimingStep {
  /** The question this probe asks. */
  prompt: string;
  choices: PrimingChoice[];
  correctChoiceId: string;
  /** The tempting intuitive answer; '' when there is no clean trap. */
  trapChoiceId: string;
  /** Why the trap feels right — shown only after a wrong commitment. */
  trapExplanation: string;
  /** The first-principles reveal for this probe. */
  reveal: string;
}

/** shape-only: the curve the learner draws before the probes. */
export interface PrimingSketch {
  /** What to draw, e.g. 'Sketch rate against [S] before the algebra.' */
  prompt: string;
  /** Axis labeling, e.g. 'x = [S], y = v₀'. */
  axes: string;
  /** The shape the drawing should have had — revealed after the drawing. */
  shapeLabel: string;
  /** Why the relation must take that shape. */
  shapeHint: string;
}

export interface PrimingDrill {
  kind: PrimingKind;
  /** What the learner is looking at, e.g. 'Michaelis-Menten rate vs. [S]'. */
  setup: string;
  /** The commitment sequence; 1–3 probes, played in order. */
  steps: PrimingStep[];
  /** The curve to draw first; only the shape archetype carries one. */
  sketch: PrimingSketch | null;
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

/** One-line description of what the archetype makes you do (selector chips). */
export const PRIMING_KIND_BLURB: Record<PrimingKind, string> = {
  shape: 'Draw the curve before the algebra',
  gradient: 'Find the density source, then the electron-poor sink',
  dimensional: 'Assemble the units to pin v or v²',
  extremum: 'Push each variable to 0 or ∞',
};

/**
 * How many commitments each archetype is built from. The API prompt is derived
 * from this table so the drill the learner gets cannot drift from the drill the
 * selector promised.
 */
export const PRIMING_STEP_TARGET: Record<PrimingKind, number> = {
  shape: 1,
  gradient: 2,
  dimensional: 1,
  extremum: 3,
};

const MAX_STEPS = 3;
const MAX_CHOICES = 5;

const PRIMING_KINDS: readonly PrimingKind[] = ['shape', 'gradient', 'dimensional', 'extremum'];

export function isPrimingKind(value: unknown): value is PrimingKind {
  return typeof value === 'string' && (PRIMING_KINDS as readonly string[]).includes(value);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/**
 * Coerces one probe.
 *
 * The only things that must survive are two distinct choices and a correct one:
 * a probe with an unmatchable `correctChoiceId` would be unanswerable, so the
 * first choice takes over. A trap that duplicates the correct choice is dropped
 * (there is nothing to discriminate against). Returns null when fewer than two
 * usable options survive — an unplayable probe is dropped rather than shown.
 */
function normalizeStep(raw: unknown): PrimingStep | null {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;

  const choices: PrimingChoice[] = (Array.isArray(data.choices) ? data.choices : [])
    .map((c: any, i: number) => ({
      id: asString(c?.id, `c${i + 1}`),
      label: asString(c?.label),
    }))
    .filter((c: PrimingChoice) => c.label.length > 0)
    .slice(0, MAX_CHOICES);

  // Deduplicate ids: two options sharing an id make grading ambiguous.
  const seen = new Set<string>();
  const unique = choices.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  if (unique.length < 2) return null;

  const requestedCorrect = asString(data.correctChoiceId);
  const correctChoiceId = unique.some((c) => c.id === requestedCorrect)
    ? requestedCorrect
    : unique[0].id;

  const requestedTrap = asString(data.trapChoiceId);
  const trapChoiceId =
    requestedTrap && requestedTrap !== correctChoiceId && unique.some((c) => c.id === requestedTrap)
      ? requestedTrap
      : '';

  return {
    prompt: asString(data.prompt, 'What must happen here?'),
    choices: unique,
    correctChoiceId,
    trapChoiceId,
    trapExplanation: asString(data.trapExplanation),
    reveal: asString(data.reveal),
  };
}

/**
 * The curve to draw. Only the shape archetype gets a default: if the examiner
 * forgot the sketch block, shape mode still opens the canvas rather than
 * silently degrading back into a label pick.
 */
function normalizeSketch(raw: unknown, kind: PrimingKind): PrimingSketch | null {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const prompt = asString(data.prompt);

  if (!prompt && kind !== 'shape') return null;

  return {
    prompt: prompt || 'Sketch this relation before you look at the formula.',
    axes: asString(data.axes),
    shapeLabel: asString(data.shapeLabel),
    shapeHint: asString(data.shapeHint),
  };
}

/**
 * Coerces a model payload into a playable drill.
 *
 * A payload with top-level `prompt`/`choices` and no `steps` array is read as a
 * single-probe drill, so older cached responses still play.
 */
export function validatePrimingDrill(raw: unknown): PrimingDrill {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const kind = isPrimingKind(data.kind) ? data.kind : 'extremum';

  const rawSteps: unknown[] =
    Array.isArray(data.steps) && data.steps.length > 0 ? data.steps : [data];

  const steps = rawSteps
    .map(normalizeStep)
    .filter((s): s is PrimingStep => s !== null)
    .slice(0, MAX_STEPS);

  return {
    kind,
    setup: asString(data.setup, 'Set the physical stage for this variable.'),
    steps,
    sketch: normalizeSketch(data.sketch, kind),
    principle: asString(data.principle),
    cardFront: asString(data.cardFront),
    cardBack: asString(data.cardBack),
  };
}

/** A drill is only playable with at least one playable probe. */
export function isPlayableDrill(drill: PrimingDrill): boolean {
  return drill.steps.length > 0;
}

export interface PrimingStepVerdict {
  /** True when the committed choice is the correct one. */
  correct: boolean;
  /** True when the learner walked into this probe's planted misconception. */
  fellForTrap: boolean;
  /** Always shown — the reveal is the teaching moment either way. */
  reveal: string;
  /** One-sentence explanation of the trap; '' when the pick was not the trap. */
  trapExplanation: string;
}

/**
 * Grades one committed pick.
 *
 * A wrong pick that was NOT the planted trap still teaches (the reveal runs),
 * but only the trap gets the hazard-red hypercorrection treatment — that is the
 * misconception the probe was actually built to catch.
 */
export function gradePrimingStep(step: PrimingStep, choiceId: string): PrimingStepVerdict {
  const correct = choiceId === step.correctChoiceId;
  const fellForTrap = !correct && choiceId === step.trapChoiceId;
  return {
    correct,
    fellForTrap,
    reveal: step.reveal,
    trapExplanation: fellForTrap ? step.trapExplanation : '',
  };
}

export interface PrimingVerdict {
  /** True only when every probe was answered from first principles. */
  correct: boolean;
  correctCount: number;
  total: number;
  /** True when any probe caught the learner on the planted misconception. */
  fellForTrap: boolean;
  trapCount: number;
  /** The one-line rule worth keeping, regardless of the picks. */
  principle: string;
  /** e.g. '3/3 forced by the physics' or '2/3 forced by the physics · 1 trap'. */
  summary: string;
  /** Per-probe verdicts, index-aligned with `drill.steps`. */
  steps: PrimingStepVerdict[];
}

/**
 * Aggregates a completed sweep. `picks[i]` answers `drill.steps[i]`; unanswered
 * probes count as wrong rather than throwing, so a half-finished sweep still
 * reports honestly.
 */
export function summarizePriming(drill: PrimingDrill, picks: string[]): PrimingVerdict {
  const steps = drill.steps.map((step, i) => gradePrimingStep(step, picks[i] ?? ''));
  const total = steps.length;
  const correctCount = steps.filter((v) => v.correct).length;
  const trapCount = steps.filter((v) => v.fellForTrap).length;

  let summary = `${correctCount}/${total} forced by the physics`;
  if (trapCount > 0) {
    summary += ` · ${trapCount} trap${trapCount === 1 ? '' : 's'}`;
  }

  return {
    correct: total > 0 && correctCount === total,
    correctCount,
    total,
    fellForTrap: trapCount > 0,
    trapCount,
    principle: drill.principle,
    summary,
    steps,
  };
}
