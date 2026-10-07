import { describe, it, expect } from 'vitest';
import {
  LEDGER_TOLERANCE_PCT,
  describeLedgerFailures,
  evaluateExpression,
  ledgerRepairPrompt,
  parseLedger,
  verifyLedger,
} from '../../lib/escalation/consistency';

/**
 * The generators behind Tier 3 problems have no CAS, so this module is the
 * sandbox the prompt is not: the model declares its quantities and its
 * relations, and every relation is evaluated HERE. What these tests pin is the
 * part that makes the gate worth having — a relation that does not close is
 * caught with the two computed sides named, an empty ledger is UNVERIFIED
 * rather than "fine", and the evaluator is a parser rather than `eval`, so a
 * model-supplied string can never be executed.
 */

/** One energy balance, with the numbers chosen so the closure is exact. */
function exactEnergyLedger() {
  return {
    quantities: [
      { symbol: 'm_water', value: 250, unit: 'g' },
      { symbol: 'c_water', value: 4.184, unit: 'J/gC' },
      { symbol: 'dT', value: 25, unit: 'C' },
      { symbol: 'q', value: 26150, unit: 'J' },
    ],
    relations: [
      { lhs: 'q', rhs: 'm_water * c_water * dT', note: 'energy balance' },
    ],
  };
}

describe('evaluateExpression — a parser, not a sandbox that runs strings', () => {
  it('respects precedence, so `2 + 3 * 4` is 14 and not 20', () => {
    expect(evaluateExpression('2 + 3 * 4', {})).toBe(14);
    expect(evaluateExpression('2 * 3 + 4', {})).toBe(10);
  });

  it('treats `^` as right-associative, so `2^3^2` is 2^9', () => {
    expect(evaluateExpression('2^3^2', {})).toBe(512);
    expect(evaluateExpression('(2^3)^2', {})).toBe(64);
  });

  it('handles unary minus, parentheses and division', () => {
    expect(evaluateExpression('-3 + 5', {})).toBe(2);
    expect(evaluateExpression('2 * -3', {})).toBe(-6);
    expect(evaluateExpression('(2 + 3) * 4', {})).toBe(20);
    expect(evaluateExpression('9 / 3', {})).toBe(3);
  });

  it('substitutes declared symbols and returns a number', () => {
    const value = evaluateExpression('m_water * c_water * dT', {
      m_water: 250,
      c_water: 4.184,
      dT: 25,
    });
    expect(value).toBeCloseTo(26150, 3);
  });

  it('returns null for a symbol the ledger never declared rather than a zero', () => {
    // A zero here would silently make a broken problem look consistent.
    expect(evaluateExpression('q / m_water', { q: 100 })).toBeNull();
  });

  it('returns null on division by zero, literal or declared', () => {
    expect(evaluateExpression('1 / 0', {})).toBeNull();
    expect(evaluateExpression('1 / z', { z: 0 })).toBeNull();
  });

  it('refuses anything outside + - * / ^ ( ) numbers and symbols', () => {
    expect(evaluateExpression('m_water; drop', { m_water: 1 })).toBeNull();
    expect(evaluateExpression('q `unexpected`', { q: 1 })).toBeNull();
    expect(evaluateExpression('process.exit()', {})).toBeNull();
  });

  it('refuses trailing garbage rather than quietly evaluating a prefix', () => {
    expect(evaluateExpression('1 2', {})).toBeNull();
    expect(evaluateExpression('1 +', {})).toBeNull();
    expect(evaluateExpression('(1 + 2', {})).toBeNull();
    expect(evaluateExpression('', {})).toBeNull();
  });
});

describe('evaluateExpression — the closed function vocabulary', () => {
  // The gate used to know only the four operators, so a correct Arrhenius law,
  // Nernst potential or Henderson–Hasselbalch line read as an UNDECLARED SYMBOL
  // and an honest problem was refused as inconsistent. These pin the vocabulary
  // that fixed it, and its limits.

  it('calls the logarithms the subjects actually write', () => {
    expect(evaluateExpression('ln(e)', {})).toBeCloseTo(1, 10);
    // Base 10, because pH = pKa + log([A-]/[HA]) is base 10.
    expect(evaluateExpression('log(1000)', {})).toBeCloseTo(3, 10);
    expect(evaluateExpression('log10(100)', {})).toBeCloseTo(2, 10);
    expect(evaluateExpression('ln(2)', {})).toBeCloseTo(Math.LN2, 10);
  });

  it('calls exp, sqrt, abs and the trigonometric ratios in radians', () => {
    expect(evaluateExpression('exp(0)', {})).toBe(1);
    expect(evaluateExpression('exp(-1)', {})).toBeCloseTo(Math.exp(-1), 10);
    expect(evaluateExpression('sqrt(16)', {})).toBe(4);
    expect(evaluateExpression('abs(-3) + abs(3)', {})).toBe(6);
    expect(evaluateExpression('sin(0)', {})).toBe(0);
    expect(evaluateExpression('cos(0)', {})).toBe(1);
    expect(evaluateExpression('tan(0)', {})).toBe(0);
  });

  it('knows pi and e without a declaration, and lets a declaration win', () => {
    expect(evaluateExpression('pi', {})).toBeCloseTo(Math.PI, 10);
    expect(evaluateExpression('e', {})).toBeCloseTo(Math.E, 10);
    // A ledger that measured its own `e` means its own number.
    expect(evaluateExpression('e', { e: 2 })).toBe(2);
  });

  it('refuses a name outside the table rather than guessing at it', () => {
    // `foo(2)` is not a multiplication and not a function: unknown, so null.
    expect(evaluateExpression('foo(2)', {})).toBeNull();
    expect(evaluateExpression('ln', {})).toBeNull();
    // A declared quantity is not callable either.
    expect(evaluateExpression('q(2)', { q: 5 })).toBeNull();
  });

  it('refuses a function outside its real domain instead of returning an infinity', () => {
    expect(evaluateExpression('ln(0)', {})).toBeNull();
    expect(evaluateExpression('ln(-1)', {})).toBeNull();
    expect(evaluateExpression('log(0)', {})).toBeNull();
    expect(evaluateExpression('sqrt(-1)', {})).toBeNull();
    expect(evaluateExpression('1 / ln(1)', {})).toBeNull();
  });

  it('keeps ordinary precedence around a call, and grouping inside it', () => {
    expect(evaluateExpression('2 * sqrt(9)', {})).toBe(6);
    expect(evaluateExpression('sqrt(9) ^ 2', {})).toBe(9);
    expect(evaluateExpression('exp(-(1 + 1))', {})).toBeCloseTo(Math.exp(-2), 10);
    // The exponent's grouping is the model's: `e^-1/2` is (e^-1)/2 under the
    // ordinary precedence, which is why the prompt asks for exp(...).
    expect(evaluateExpression('e^-1/2', {})).toBeCloseTo(Math.exp(-1) / 2, 10);
    expect(evaluateExpression('e^(-1/2)', {})).toBeCloseTo(Math.exp(-0.5), 10);
  });

  it('closes an Arrhenius relation that the old evaluator refused', () => {
    // k = A * exp(-Ea / (R * T)), with the numbers chosen so it closes exactly.
    const k = 1e13 * Math.exp(-75000 / (8.314 * 298));
    const verification = verifyLedger(
      [
        { symbol: 'A', value: 1e13, unit: '1/s' },
        { symbol: 'Ea', value: 75000, unit: 'J/mol' },
        { symbol: 'R', value: 8.314, unit: 'J/molK' },
        { symbol: 'T', value: 298, unit: 'K' },
        { symbol: 'k', value: k, unit: '1/s' },
      ],
      [{ lhs: 'k', rhs: 'A * exp(-Ea / (R * T))', note: 'Arrhenius rate law' }]
    );

    expect(verification.ok).toBe(true);
    expect(verification.verified).toBe(true);
    expect(verification.failures).toEqual([]);
  });

  it('closes a pressure times a volume difference, and a coefficient against a group', () => {
    // The two shapes the mutation and crucible routes are handed most often:
    // boundary work `w = P_ext(V2 - V1)` and a coefficient across a bracket.
    const work = verifyLedger(
      [
        { symbol: 'P_ext', value: 101.3, unit: 'kPa' },
        { symbol: 'V1', value: 2, unit: 'L' },
        { symbol: 'V2', value: 5, unit: 'L' },
        { symbol: 'w', value: -101.3 * 3, unit: 'J' },
      ],
      [{ lhs: 'w', rhs: '-P_ext * (V2 - V1)', note: 'boundary work by an expanding gas' }]
    );
    expect(work.failures).toEqual([]);
    expect(work.verified).toBe(true);

    // Doubling, written as `2(x + b)`, against the doubled value.
    const doubled = verifyLedger(
      [
        { symbol: 'x', value: 4, unit: '' },
        { symbol: 'b', value: 1, unit: '' },
        { symbol: 'y', value: 10, unit: '' },
      ],
      [{ lhs: 'y', rhs: '2(x + b)', note: 'twice the sum' }]
    );
    expect(doubled.failures).toEqual([]);
    expect(doubled.verified).toBe(true);
  });

  it('reads scientific notation as one number, not a product with a symbol in it', () => {
    // The generators write measured quantities this way, and reading `1.5e-3`
    // as `1.5 * e - 3` would either refuse an honest relation or, worse, close
    // a different equation than the one the model stated.
    expect(evaluateExpression('1.5e-3', {})).toBe(0.0015);
    expect(evaluateExpression('6.022E23', {})).toBe(6.022e23);
    expect(evaluateExpression('2e5', {})).toBe(200000);
    expect(evaluateExpression('1.5e+2', {})).toBe(150);
    expect(evaluateExpression('2 * 1.5e-3', {})).toBe(0.003);
  });

  it('multiplies a coefficient flush against a symbol, and refuses the spaced form', () => {
    // A number TOUCHING its symbol is a coefficient, which is how every law
    // these generators write carries a stoichiometric factor: `2x` is 2·x.
    expect(evaluateExpression('2x', { x: 3 })).toBe(6);
    expect(evaluateExpression('2Ea', { Ea: 5 })).toBe(10);
    expect(evaluateExpression('1.5e-3*x', { x: 2 })).toBe(0.003);
    // The exponent binds to the symbol, not to the coefficient: 2·(3²) = 18.
    expect(evaluateExpression('2x^2', { x: 3 })).toBe(18);
    // A function call is a symbol too, so `2sin(x)` is a product.
    expect(evaluateExpression('2sin(0)', {})).toBe(0);
    // A SPACE is the other reading — a quantity and its unit — and that one is
    // refused rather than guessed at, because `250 g` closing on 250·g would be
    // an equation the generator never stated.
    expect(evaluateExpression('2 x', { x: 3 })).toBeNull();
    expect(evaluateExpression('250 g', { g: 9.81 })).toBeNull();
    // A bare `2e` is two times Euler's constant — the name is one token, so
    // there is no exponent left to misread — and a declared `e` outranks it.
    expect(evaluateExpression('2e', {})).toBeCloseTo(2 * Math.E, 10);
    expect(evaluateExpression('2 * e', { e: 3 })).toBe(6);
  });

  it('multiplies implicitly against a group, and the exponent binds to the group', () => {
    expect(evaluateExpression('2(3 + 4)', {})).toBe(14);
    expect(evaluateExpression('(2)(3)', {})).toBe(6);
    expect(evaluateExpression('3 * 2(x + 1)', { x: 1 })).toBe(12);
    // Implicit multiplication carries multiplication's own precedence, so this
    // is 2 · 9 = 18 and not (2 · 3)^2 = 36.
    expect(evaluateExpression('2(3)^2', {})).toBe(18);
  });

  it('closes a relation written the way a generator actually writes one', () => {
    const verification = verifyLedger(
      [
        { symbol: 'n', value: 1.5e-3, unit: 'mol' },
        { symbol: 'V', value: 0.25, unit: 'L' },
        { symbol: 'c', value: 6e-3, unit: 'mol/L' },
      ],
      [{ lhs: 'n', rhs: 'c * V', note: 'moles from concentration and volume' }]
    );

    expect(verification.ok).toBe(true);
    expect(verification.verified).toBe(true);
    expect(verification.failures).toEqual([]);
  });

  it('closes a logarithmic relation and still catches the dropped logarithm', () => {
    // First-order decay: ln(a_over_a0) = -k * t.
    const closed = verifyLedger(
      [
        { symbol: 'ln_ratio', value: Math.log(0.25), unit: '' },
        { symbol: 'k', value: 0.0693, unit: '1/s' },
        { symbol: 't', value: 20, unit: 's' },
        { symbol: 'prod', value: -0.0693 * 20, unit: '' },
      ],
      [{ lhs: 'ln_ratio', rhs: 'prod', note: 'first-order decay' }]
    );
    expect(closed.ok).toBe(true);
    expect(closed.verified).toBe(true);

    // The same physics with the logarithm DROPPED still fails the closure — the
    // vocabulary widens what can be evaluated, not what can be got away with.
    const dropped = verifyLedger(
      [
        { symbol: 'ratio', value: 0.25, unit: '' },
        { symbol: 'prod', value: -0.0693 * 20, unit: '' },
      ],
      [{ lhs: 'ratio', rhs: 'prod', note: 'first-order decay, log dropped' }]
    );
    expect(dropped.ok).toBe(false);
    expect(dropped.verified).toBe(false);
  });
});

describe('verifyLedger — closure', () => {
  it('verifies a ledger whose relations close', () => {
    const { quantities, relations } = exactEnergyLedger();
    const verification = verifyLedger(quantities, relations);

    expect(verification.ok).toBe(true);
    expect(verification.verified).toBe(true);
    expect(verification.failures).toEqual([]);
    expect(verification.evaluated).toHaveLength(1);
    expect(verification.evaluated[0].lhs).toBe(26150);
    expect(verification.evaluated[0].rhs).toBeCloseTo(26150, 3);
  });

  it('names both computed sides when a relation does not close', () => {
    const verification = verifyLedger(
      [
        { symbol: 'm_water', value: 250, unit: 'g' },
        { symbol: 'c_water', value: 4.184, unit: 'J/gC' },
        { symbol: 'dT', value: 25, unit: 'C' },
        { symbol: 'q', value: 30000, unit: 'J' }, // the statement's number
      ],
      [{ lhs: 'q', rhs: 'm_water * c_water * dT', note: 'energy balance' }]
    );

    expect(verification.ok).toBe(false);
    // A declared chain that closes imperfectly is still a declaration: the
    // module only calls `verified` when there was real arithmetic AND it held.
    expect(verification.verified).toBe(false);
    expect(verification.failures).toHaveLength(1);
    expect(verification.failures[0].id).toBe('RELATION_1');
    expect(verification.failures[0].label).toBe('energy balance');
    expect(verification.failures[0].detail).toContain('does not close');
    expect(verification.failures[0].detail).toContain('30000');
    expect(verification.failures[0].detail).toContain('26150');
  });

  it('lets a rounding-level deviation through at 1% and refuses a real one', () => {
    expect(LEDGER_TOLERANCE_PCT).toBe(1);

    // 1000 against 1004: 0.4% — the model rounded a computed value.
    const rounded = verifyLedger([{ symbol: 'q', value: 1000 }], [{ lhs: 'q', rhs: '1004' }]);
    expect(rounded.ok).toBe(true);
    expect(rounded.verified).toBe(true);

    // 1000 against 1030: 2.9% — that is a different number, not a rounding.
    const wrong = verifyLedger([{ symbol: 'q', value: 1000 }], [{ lhs: 'q', rhs: '1030' }]);
    expect(wrong.ok).toBe(false);
    expect(wrong.failures[0].detail).toContain('% apart');
  });

  it('marks an empty ledger verified:false while ok stays true', () => {
    // The honest half of the module, and the reason `verified` exists separate
    // from `ok`: nothing failed, and nothing was checked either.
    const empty = verifyLedger([], []);
    expect(empty.ok).toBe(true);
    expect(empty.verified).toBe(false);
    expect(empty.failures).toEqual([]);

    // Quantities with no relation are the same outcome: unverified.
    const noRelations = verifyLedger([{ symbol: 'q', value: 26150 }], []);
    expect(noRelations.ok).toBe(true);
    expect(noRelations.verified).toBe(false);

    // And relations with no quantities cannot close either, but they are a
    // failure rather than silence — an undeclared symbol is the model
    // referring to a number it never stated.
    const noQuantities = verifyLedger([], [{ lhs: 'q', rhs: 'm * c * dT' }]);
    expect(noQuantities.ok).toBe(false);
    expect(noQuantities.verified).toBe(false);
  });

  it('names the undeclared symbol when a relation refers to one', () => {
    const verification = verifyLedger(
      [{ symbol: 'q', value: 26150 }],
      [{ lhs: 'q', rhs: 'm_water * c_water * dT', note: 'energy balance' }]
    );

    expect(verification.ok).toBe(false);
    expect(verification.failures[0].detail).toContain('m_water');
    expect(verification.failures[0].detail).toContain('does not declare');
  });

  it('accepts a tighter tolerance when the caller asks for one', () => {
    const strict = verifyLedger([{ symbol: 'q', value: 1000 }], [{ lhs: 'q', rhs: '1004' }], 0.1);
    expect(strict.ok).toBe(false);
  });
});

describe('verifyLedger — plausibility, the rules that need no domain model', () => {
  it('refuses a mass or a volume declared as zero or negative', () => {
    const verification = verifyLedger(
      [
        { symbol: 'm_water', value: -5, unit: 'g' },
        { symbol: 'vol_gas', value: 2, unit: 'L' },
      ],
      [{ lhs: 'vol_gas', rhs: '2' }]
    );

    expect(verification.ok).toBe(false);
    const failure = verification.failures.find((check) => check.id === 'POSITIVE_EXTENSIVE');
    expect(failure?.detail).toContain('m_water');
    expect(failure?.detail).toContain('-5');
  });

  it('refuses water at or past its boiling point with no latent-heat term', () => {
    const withoutLatent = verifyLedger(
      [
        { symbol: 'm_water', value: 250, unit: 'g' },
        { symbol: 'c_water', value: 4.184, unit: 'J/gC' },
        { symbol: 'dT', value: 4, unit: 'C' },
        { symbol: 't_water', value: 104, unit: 'C' },
        { symbol: 'q', value: 4184, unit: 'J' },
      ],
      [{ lhs: 'q', rhs: 'm_water * c_water * dT', note: 'energy balance' }]
    );

    // The closure holds — this is exactly the reported failure mode: coherent
    // prose, coherent algebra, and a plateau the problem never crossed.
    expect(withoutLatent.evaluated[0].deviationPct).toBeLessThanOrEqual(LEDGER_TOLERANCE_PCT);
    const plateau = withoutLatent.failures.find((check) => check.id === 'PHASE_PLATEAU');
    expect(plateau).toBeDefined();
    expect(plateau?.detail).toContain('t_water');
    expect(plateau?.detail).toContain('latent-heat');

    // Add the vaporisation term and the same ledger passes.
    const withLatent = verifyLedger(
      [
        { symbol: 'm_water', value: 250, unit: 'g' },
        { symbol: 'c_water', value: 4.184, unit: 'J/gC' },
        { symbol: 'dT', value: 4, unit: 'C' },
        { symbol: 't_water', value: 104, unit: 'C' },
        { symbol: 'l_v', value: 2260, unit: 'J/g' },
        { symbol: 'q', value: 4184, unit: 'J' },
      ],
      [{ lhs: 'q', rhs: 'm_water * c_water * dT', note: 'energy balance' }]
    );
    expect(withLatent.failures.some((check) => check.id === 'PHASE_PLATEAU')).toBe(false);
    expect(withLatent).toMatchObject({ ok: true, verified: true });
  });

  it('refuses work declared positive while the gas expands', () => {
    const verification = verifyLedger(
      [
        { symbol: 'P', value: 100, unit: 'kPa' },
        { symbol: 'dV', value: 2, unit: 'L' },
        { symbol: 'w', value: 250, unit: 'J' },
        { symbol: 'prod', value: 200 },
      ],
      [{ lhs: 'prod', rhs: 'P * dV', note: 'boundary work magnitude' }]
    );

    // The closure is fine; the SIGN is what is wrong, which is why this is a
    // rule of its own rather than something the relation could have caught.
    expect(verification.failures.some((check) => check.id === 'RELATION_1')).toBe(false);
    const sign = verification.failures.find((check) => check.id === 'WORK_SIGN');
    expect(sign).toBeDefined();
    expect(sign?.detail).toContain('w');
    expect(sign?.detail).toContain('ON the surroundings');
  });

  it('refuses a temperature off the thermodynamic scale', () => {
    const verification = verifyLedger(
      [
        { symbol: 't_boil', value: -300, unit: 'C' },
        { symbol: 't_ok', value: 25, unit: 'C' },
      ],
      [{ lhs: 't_ok', rhs: '25' }]
    );

    const range = verification.failures.find((check) => check.id === 'TEMPERATURE_RANGE');
    expect(range).toBeDefined();
    expect(range?.detail).toContain('t_boil');
  });

  it('reports every rule it ran, so a pass is visible rather than implied', () => {
    const { quantities, relations } = exactEnergyLedger();
    const verification = verifyLedger(quantities, relations);
    const ids = verification.checks.map((check) => check.id);

    expect(ids).toContain('RELATION_1');
    expect(ids).toContain('POSITIVE_EXTENSIVE');
    expect(ids).toContain('TEMPERATURE_RANGE');
    expect(ids).toContain('PHASE_PLATEAU');
    expect(ids).toContain('WORK_SIGN');
  });
});

describe('describeLedgerFailures — one line for the refusal', () => {
  it('says nothing about a verified ledger', () => {
    const { quantities, relations } = exactEnergyLedger();
    expect(describeLedgerFailures(verifyLedger(quantities, relations))).toBe('');
  });

  it('says the arithmetic was never declared when there was none', () => {
    const message = describeLedgerFailures(verifyLedger([], []));
    expect(message).toContain('no declared arithmetic');
  });

  it('joins the defect report when there are failures', () => {
    // Two independent defects — a relation that does not close and a negative
    // mass — so the separator and both sentences are pinned.
    const verification = verifyLedger(
      [
        { symbol: 'm_water', value: -5, unit: 'g' },
        { symbol: 'q', value: 30000, unit: 'J' },
      ],
      [{ lhs: 'q', rhs: '26150', note: 'energy balance' }]
    );
    const message = describeLedgerFailures(verification);

    expect(verification.failures.length).toBeGreaterThanOrEqual(2);
    expect(message).toContain('does not close');
    expect(message).toContain('·');
    expect(message).toContain('m_water');
  });
});

describe('ledgerRepairPrompt — the defect report, verbatim', () => {
  it('carries every failure and forbids bending the physics to fit', () => {
    const verification = verifyLedger(
      [{ symbol: 'q', value: 30000 }],
      [{ lhs: 'q', rhs: '26150', note: 'energy balance' }]
    );
    const prompt = ledgerRepairPrompt(verification);

    expect(prompt).toContain('REJECTED BY AN ARITHMETIC CHECK');
    for (const failure of verification.failures) {
      expect(prompt).toContain(failure.label);
      expect(prompt).toContain(failure.detail);
    }
    expect(prompt).toContain('Do NOT change the physics to make the arithmetic close');
    expect(prompt).toContain('Every relation you declare must be true of the quantities you declare');
  });
});

describe('parseLedger — what survives coercion', () => {
  it('keeps well-formed quantities and relations', () => {
    const { quantities, relations } = parseLedger({
      quantities: [{ symbol: 'm_water', value: 250, unit: 'g' }],
      relations: [{ lhs: 'q', rhs: 'm_water * c * dT', note: 'energy balance' }],
    });

    expect(quantities).toEqual([{ symbol: 'm_water', value: 250, unit: 'g' }]);
    expect(relations).toEqual([{ lhs: 'q', rhs: 'm_water * c * dT', note: 'energy balance' }]);
  });

  it('drops a quantity with no usable symbol or a non-finite value', () => {
    const { quantities } = parseLedger({
      quantities: [
        { value: 250 },
        { symbol: '   ', value: 250 },
        { symbol: '2bad', value: 250 },
        { symbol: 'q', value: 'abc' },
        { symbol: 'keep', value: '42' },
      ],
    });

    expect(quantities.map((quantity) => quantity.symbol)).toEqual(['keep']);
    expect(quantities[0].value).toBe(42);
  });

  it('drops a duplicate symbol, because two values for one symbol is ambiguous', () => {
    const { quantities } = parseLedger({
      quantities: [
        { symbol: 'q', value: 1 },
        { symbol: 'q', value: 2 },
      ],
    });

    expect(quantities).toHaveLength(1);
    expect(quantities[0].value).toBe(1);
  });

  it('normalizes a symbol written with spaces into one the evaluator can use', () => {
    const { quantities } = parseLedger({ quantities: [{ symbol: 'm water', value: 250 }] });
    expect(quantities[0].symbol).toBe('m_water');
  });

  it('drops a relation with an empty side and one that is not a string', () => {
    const { relations } = parseLedger({
      relations: [
        { lhs: '', rhs: 'q' },
        { lhs: 'q', rhs: '   ' },
        { lhs: 'q', rhs: 12 },
        { lhs: 'q', rhs: 'm * c' },
      ],
    });

    expect(relations).toHaveLength(1);
    expect(relations[0].rhs).toBe('m * c');
  });

  it('accepts a missing or malformed ledger without throwing', () => {
    expect(parseLedger(undefined)).toEqual({ quantities: [], relations: [] });
    expect(parseLedger(null)).toEqual({ quantities: [], relations: [] });
    expect(parseLedger({ quantities: 'nope', relations: 7 })).toEqual({
      quantities: [],
      relations: [],
    });
  });

  it('caps an overlong relation expression rather than evaluating a wall of text', () => {
    const { relations } = parseLedger({ relations: [{ lhs: 'q', rhs: 'm'.repeat(400) }] });
    expect(relations[0].rhs.length).toBe(200);
  });
});
