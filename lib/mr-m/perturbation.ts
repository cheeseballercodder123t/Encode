// ─── Mr M mode: what-if perturbation ────────────────────────────────────────
//
// This pillar exploits a strength rather than patching a weakness. Proportional
// reasoning is what this learner is good at, so instead of asking them to
// evaluate a formula once, the panel lets them drive one variable to its
// extreme and watch the invariant refuse to move.
//
// The whole evaluation is LOCAL and pure. Dragging a slider must never cost a
// model call: a what-if that lags a second behind the drag teaches nothing.
//
// The readout is deliberately a RATIO, not an absolute value. The encoder does
// not ship a formula evaluator, and inventing one would be exactly the
// numerology this mode exists to remove. What the encoder DOES ship is how each
// variable enters the invariant (`exponent`), so the honest thing to compute is
// "relative to the stage's own numbers, this is ×2.00" — a claim that is true
// of every invariant of that shape, and that never pretends to a unit it does
// not have.

import type { PerturbationModel } from './types';

export interface PerturbationReadout {
  /**
   * The invariant's readout scaled so it is exactly 1 at every variable's
   * `base`. `Infinity` when a denominator has been driven to zero, `NaN` when
   * the setting is one where the invariant has no value at all.
   */
  relative: number;
  /** Ready to display: `×2.00`, `×0.50`, `→ ∞`, `→ 0`, `—`. */
  label: string;
  /**
   * Set when the move pushes the invariant out of its defined range:
   * `'infinity'` / `'zero'` are the two limits, and `'undefined'` is a setting
   * with no value at all — which is NOT the same claim as a limit, and is why
   * it is not folded into either of them.
   */
  limit: 'zero' | 'infinity' | 'undefined' | null;
  /** Plain-language sentence for this setting; '' when there is nothing to say. */
  note: string;
}

/** Matches the value exactly back to its home position. */
const HOME_EPSILON = 0.005;

/** The readout for a setting where the invariant has no value: not a number. */
const UNDEFINED_LABEL = '—';

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Evaluates the invariant at the given variable values.
 *
 * `relative = Π (vᵢ / baseᵢ) ^ exponentᵢ`, which is 1.00 at every base. A
 * variable whose `base` is 0 cannot be scaled proportionally from nothing, so
 * it is skipped rather than producing NaN and silently killing the panel.
 *
 * Never throws: a `→ limit` preset deliberately drives an inverse variable to
 * zero, and that has to come back as `→ ∞` rather than an exception, because
 * the panel renders whatever this returns and has no fallback of its own. A
 * setting where the invariant has no value at all comes back as an `undefined`
 * readout rather than being dressed up as one of the two limits.
 */
export function evaluatePerturbation(
  model: PerturbationModel,
  values: Record<string, number>
): PerturbationReadout {
  const variables = Array.isArray(model?.variables) ? model.variables : [];
  let relative = 1;
  let limit: 'zero' | 'infinity' | null = null;
  /** The variable that moved furthest from home, for the narration. */
  let furthest: { symbol: string; exponent: number; distance: number } | null = null;

  for (const variable of variables) {
    const base = isNum(variable?.base) ? variable.base : 0;
    const exponent = isNum(variable?.exponent) ? variable.exponent : 0;
    const raw = values?.[variable.symbol];
    const value = isNum(raw) ? raw : base;

    if (base === 0) continue; // no proportional relationship from zero

    const ratio = value / base;
    if (isNum(ratio)) {
      const distance = ratio > 0 ? Math.abs(Math.log(ratio)) : Infinity;
      if (!furthest || distance > furthest.distance) {
        furthest = { symbol: variable.symbol, exponent, distance };
      }
    }

    // A zero denominator: the invariant is no longer finite. Sign matters —
    // an even exponent sends r → 0 to +∞, an odd one to ±∞; both read as ∞.
    if (ratio === 0 && exponent < 0) {
      limit = 'infinity';
      relative = Infinity;
      continue;
    }

    // A setting where the invariant has no value is its own outcome, and it is
    // NOT an infinite limit: `Math.pow(-2, 0.5)` is NaN, so a negative ratio
    // under an off-contract fractional exponent makes the invariant undefined
    // rather than unbounded. This used to fall through to the branch below and
    // be reported as `→ ∞` with a note naming a variable that was not even
    // moving toward zero (defect 54) — a wrong number AND a wrong cause.
    const factor = Math.pow(ratio, exponent);
    if (Number.isNaN(factor)) {
      return {
        relative: NaN,
        label: UNDEFINED_LABEL,
        limit: 'undefined',
        note: undefinedNote(variable.symbol),
      };
    }
    if (!Number.isFinite(factor)) {
      limit = factor > 0 ? 'infinity' : limit;
      relative = Number.isFinite(relative) ? relative * factor : relative;
      continue;
    }
    relative *= factor;
  }


  // The second route to undefined: one variable has already sent the readout to
  // infinity while another is dragged to zero, and ∞ × 0 is indeterminate.
  if (Number.isNaN(relative)) {
    return {
      relative: NaN,
      label: UNDEFINED_LABEL,
      limit: 'undefined',
      note: undefinedNote(furthest?.symbol),
    };
  }

  if (!Number.isFinite(relative)) {
    return {
      relative: Infinity,
      label: '→ ∞',
      limit: 'infinity',
      note: limitNoteFor(model, furthest?.symbol, 'infinity'),
    };
  }

  if (relative === 0) {
    return {
      relative: 0,
      label: '→ 0',
      limit: 'zero',
      note: limitNoteFor(model, furthest?.symbol, 'zero'),
    };
  }

  const atHome = Math.abs(relative - 1) < HOME_EPSILON;
  return {
    relative,
    label: formatRelative(relative),
    limit: null,
    note: atHome ? '' : movedNote(furthest?.symbol, furthest?.exponent ?? 1, relative),
  };
}

/**
 * The readout, as the learner reads it: `×2.00`, `×0.50`, and `×6.25e+7` once a
 * repeated doubling has left the range where two decimals say anything.
 *
 * `toFixed(2)` alone is fine for the moves a learner makes by hand and absurd
 * for the ones they make by dragging an inverse square toward its limit —
 * `×12345678.00` is a wall of digits that hides the point the panel is making.
 * The threshold is generous on purpose: the switch happens past a million, so
 * every ordinary move still reads as an ordinary number.
 *
 * A NaN is `—` and not `→ −∞`: `NaN > 0` is false, so ordering the infinity
 * branch first rendered an undefined readout as a signed infinity with a sign
 * nobody computed (defect 54).
 */
export function formatRelative(relative: number): string {
  if (Number.isNaN(relative)) return UNDEFINED_LABEL;
  const abs = Math.abs(relative);
  if (!Number.isFinite(relative)) return relative > 0 ? '→ ∞' : '→ −∞';
  if (relative === 0) return '→ 0';
  if (abs >= 1e-4 && abs < 1e6) return `×${relative.toFixed(2)}`;
  return `×${relative.toExponential(2)}`;
}

/** The multiplying factor alone, for use inside a sentence. */
function factorText(relative: number): string {
  const abs = Math.abs(relative);
  return abs >= 1e-4 && abs < 1e6 ? relative.toFixed(2) : relative.toExponential(2);
}

/** The sentence for a setting the invariant has no value at. */
function undefinedNote(symbol: string | undefined): string {
  return symbol
    ? `${symbol} is outside the range where this invariant has a real value, so the readout is undefined rather than unbounded.`
    : 'This setting is outside the range where the invariant has a value, so the readout is undefined rather than unbounded.';
}

/** The encoder's own sentence about this variable's extreme, when it wrote one. */
function limitNoteFor(  model: PerturbationModel,
  symbol: string | undefined,
  which: 'zero' | 'infinity'
): string {
  const explicit = model?.limitNotes?.find((n) => n.symbol === symbol)?.note;
  if (explicit) return explicit;
  return which === 'infinity'
    ? `As ${symbol || 'that variable'} approaches zero the invariant is no longer finite: nothing bounds the readout any more.`
    : `${symbol || 'That variable'} going to zero collapses the invariant.`;
}

/**
 * Narrates an ordinary move.
 *
 * The encoder's `limitNotes` describe EXTREMES, so they are deliberately not
 * used here: quoting "no water means no heat is stored" for a simple doubling
 * would mis-describe what just happened. And whether the readout rises or falls
 * is read from the variable's own `exponent`, never from the direction the
 * number happened to move — otherwise halving a numerator gets described as a
 * denominator, which is the opposite of the lesson.
 */
function movedNote(symbol: string | undefined, exponent: number, relative: number): string {
  if (!symbol) return '';
  const behaviour =
    exponent < 0
      ? `${symbol} sits in the denominator, so moving it bends the result the other way`
      : `the result scales with ${symbol}, so it moves with it`;
  return `Only ${symbol} moved: ${behaviour}. The readout is ${factorText(relative)}× the stage's own numbers.`;
}
