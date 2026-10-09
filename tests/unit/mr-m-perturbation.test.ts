import { describe, it, expect } from 'vitest';
import { evaluatePerturbation, formatRelative } from '../../lib/mr-m/perturbation';
import type { PerturbationModel } from '../../lib/mr-m/types';

/**
 * The what-if evaluator is pure and local on purpose: dragging a slider must
 * never cost a model call, and the arithmetic has to be exactly reproducible.
 * The readout is a RATIO anchored at the base point, because the encoder ships
 * how each variable enters the invariant and not a formula — claiming an
 * absolute unit would be numerology.
 */

const CALORIMETER: PerturbationModel = {
  invariant: 'q = m c ΔT',
  variables: [
    { symbol: 'm', base: 0.25, min: 0.05, max: 1, unit: 'kg', exponent: 1 },
    { symbol: 'ΔT', base: 32, min: 1, max: 100, unit: 'K', exponent: 1 },
  ],
  limitNotes: [
    { symbol: 'm', note: 'No water means no heat is stored.' },
    { symbol: 'ΔT', note: 'A vanishing temperature difference carries no heat.' },
  ],
};

describe('evaluatePerturbation', () => {
  it('reads exactly 1.00 at every variable home position', () => {
    const readout = evaluatePerturbation(CALORIMETER, {});
    expect(readout.relative).toBe(1);
    expect(readout.label).toBe('×1.00');
    expect(readout.limit).toBeNull();
    // Nothing moved, so there is nothing to narrate.
    expect(readout.note).toBe('');
  });

  it('doubles when a numerator doubles', () => {
    const readout = evaluatePerturbation(CALORIMETER, { m: 0.5 });
    expect(readout.label).toBe('×2.00');
    expect(readout.note).toContain('the result scales with m');
  });

  it('halves when a numerator halves, and never calls it a denominator', () => {
    const readout = evaluatePerturbation(CALORIMETER, { m: 0.125 });
    expect(readout.label).toBe('×0.50');
    // The direction the number moved must not be mistaken for the variable
    // sitting in a denominator — that would invert the lesson.
    expect(readout.note).toContain('the result scales with m');
    expect(readout.note).not.toContain('denominator');
  });

  it('follows the exponent, not the direction: halving an inverse square quadruples', () => {
    const coulomb: PerturbationModel = {
      invariant: 'F = k q₁ q₂ / r²',
      variables: [
        { symbol: 'q₁', base: 2, exponent: 1 },
        { symbol: 'r', base: 4, min: 0, max: 10, unit: 'm', exponent: -2 },
      ],
    };
    // Halving the distance multiplies the force by four.
    expect(evaluatePerturbation(coulomb, { r: 2 }).label).toBe('×4.00');
    // And halving it again: eight times closer than base is 64x.
    expect(evaluatePerturbation(coulomb, { r: 0.5 }).label).toBe('×64.00');
    expect(evaluatePerturbation(coulomb, { r: 2 }).note).toContain('r sits in the denominator');
  });

  it('scales a run-away drag out of two fixed decimals', () => {
    const runaway = evaluatePerturbation(
      { invariant: 'F = k q₁ q₂ / r²', variables: [{ symbol: 'r', base: 1, exponent: -2 }] },
      { r: 0.0001 }
    );
    expect(runaway.label).toBe('×1.00e+8');
  });

  it('reports an unbounded readout instead of throwing when a denominator hits zero', () => {
    // The `→ limit` preset drives an inverse variable to 0 on purpose, so this
    // path has to come back as data — the panel renders whatever it returns.
    const readout = evaluatePerturbation(
      { invariant: 'F = k q₁ q₂ / r²', variables: [{ symbol: 'r', base: 4, min: 0, max: 10, exponent: -2 }] },
      { r: 0 }
    );
    expect(readout.limit).toBe('infinity');
    expect(readout.label).toBe('→ ∞');
    expect(readout.relative).toBe(Infinity);
    expect(readout.note.length).toBeGreaterThan(0);
  });

  it('reports a collapsed readout when a numerator hits zero', () => {
    const readout = evaluatePerturbation(CALORIMETER, { m: 0 });
    expect(readout.limit).toBe('zero');
    expect(readout.label).toBe('→ 0');
    expect(readout.relative).toBe(0);
  });

  it('reports a setting with no value as undefined, never as an infinite limit (defect 54)', () => {
    // `Math.pow(-1, 0.5)` is NaN: a negative ratio under a fractional exponent
    // is outside the invariant's real domain, so the readout does not exist.
    // This used to arrive as `→ ∞` with a note about the variable "approaching
    // zero" while it sat at -1 — a wrong number and a wrong cause.
    const fractional: PerturbationModel = {
      invariant: 'v = sqrt(2 g h)',
      variables: [
        { symbol: 'h', base: 5, min: -2, max: 10, unit: 'm', exponent: 0.5 },
        { symbol: 'g', base: 9.81, exponent: 0.5 },
      ],
    };
    const readout = evaluatePerturbation(fractional, { h: -1 });

    expect(Number.isNaN(readout.relative)).toBe(true);
    expect(readout.limit).toBe('undefined');
    expect(readout.label).toBe('—');
    expect(readout.label).not.toContain('∞');
    expect(readout.note).toContain('h');
    expect(readout.note).toContain('undefined');
  });

  it('calls an infinity cancelled by a zero undefined rather than a limit', () => {
    // The second route to NaN: one variable has already sent the readout to
    // infinity and the next is dragged to zero. `a / b` at 0/0 is indeterminate.
    const readout = evaluatePerturbation(
      {
        invariant: 'x = a / b',
        variables: [
          { symbol: 'b', base: 1, min: 0, max: 4, exponent: -1 },
          { symbol: 'a', base: 1, exponent: 1 },
        ],
      },
      { b: 0, a: 0 }
    );

    expect(Number.isNaN(readout.relative)).toBe(true);
    expect(readout.limit).toBe('undefined');
    expect(readout.label).toBe('—');
    expect(readout.note).toContain('undefined');
  });

  it('uses the encoder\u2019s own sentence for a genuine extreme, and not for an ordinary move', () => {
    // At the extreme the encoder's limit note is the right thing to show ...
    const atLimit = evaluatePerturbation(CALORIMETER, { m: 0 });
    expect(atLimit.note).toContain('No water means no heat is stored');
    // ... but quoting it for a simple doubling would mis-describe the move.
    expect(evaluatePerturbation(CALORIMETER, { m: 0.5 }).note).not.toContain('No water');
  });

  it('skips a variable whose base is zero rather than producing NaN', () => {
    const readout = evaluatePerturbation(
      { invariant: 'x = a b', variables: [{ symbol: 'a', base: 0, exponent: 1 }, { symbol: 'b', base: 2, exponent: 1 }] },
      { a: 5, b: 4 }
    );
    expect(Number.isNaN(readout.relative)).toBe(false);
    expect(readout.label).toBe('×2.00');
  });

  it('is safe on an empty model', () => {
    expect(evaluatePerturbation({ invariant: 'nothing', variables: [] }, {}).label).toBe('×1.00');
  });
});

describe('the readout label', () => {
  // Two decimals are right for the moves a learner makes by hand and absurd for
  // the ones they make by dragging an inverse square toward its limit: a wall of
  // digits hides the point the panel is making.

  it('reads ordinary moves as ordinary numbers', () => {
    expect(formatRelative(2)).toBe('×2.00');
    expect(formatRelative(0.5)).toBe('×0.50');
    expect(formatRelative(64)).toBe('×64.00');
  });

  it('switches to exponent notation only once the number stops meaning anything', () => {
    expect(formatRelative(999_999)).toBe('×999999.00');
    expect(formatRelative(1e8)).toBe('×1.00e+8');
    expect(formatRelative(1e-9)).toBe('×1.00e-9');
  });

  it('keeps the two infinite ends readable', () => {
    expect(formatRelative(Infinity)).toBe('→ ∞');
    expect(formatRelative(-Infinity)).toBe('→ −∞');
    expect(formatRelative(0)).toBe('→ 0');
  });

  it('does not dress a NaN up as a signed infinity', () => {
    // `NaN > 0` is false, so the old branch order reported an undefined readout
    // as `→ −∞` — an infinite magnitude with a sign nobody computed.
    expect(formatRelative(NaN)).toBe('—');
  });
});
