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
