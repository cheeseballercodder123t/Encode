import { describe, it, expect } from 'vitest';
import {
  crossedTerms,
  diagnoseDiscrepancy,
  foldRatio,
  patchStatementFor,
  rankTerms,
  signatureOf,
} from '../../lib/mr-m/autopsy';
import { DISCREPANCY_KINDS } from '../../lib/mr-m/types';

/**
 * The discrepancy diff is the arithmetic half of the error autopsy, and the
 * rule it exists under is absolute: **a model is never asked to do arithmetic**.
 * A ratio is a fact. So every figure this module prints is computed here, and
 * the tests below are what stop a displayed number from being wrong.
 *
 * The other half of the contract is silence. An autopsy that names a fracture it
 * did not measure is worse than no autopsy — it teaches the learner to distrust
 * the one panel in the app that cannot be wrong — so a pair of answers with no
 * clean signature must produce `null` rather than a plausible guess.
 */

describe('foldRatio — the same fracture seen from either end', () => {
  it('folds a half onto a two, and a thousandth onto a thousand', () => {
    expect(foldRatio(2)).toBe(2);
    expect(foldRatio(0.5)).toBe(2);
    expect(foldRatio(-2)).toBe(2);
    expect(foldRatio(-0.5)).toBe(2);
    expect(foldRatio(0.001)).toBe(1000);
  });

  it('leaves a zero at zero rather than inventing an infinity', () => {
    expect(foldRatio(0)).toBe(0);
  });
});

describe('crossedTerms / rankTerms', () => {
  it('excludes subscripts and coefficients, so a formula cannot fake a ratio', () => {
    // `2 H2O` must not manufacture a factor of two out of nothing — this is the
    // exclusion `quantityNumbers` already owns, reused rather than re-derived.
    const terms = crossedTerms('2 H2O', '0.0336');
    expect(terms.map((term) => term.learner)).toEqual([]);
  });

  it('ranks a genuine sign inversion ahead of any magnitude shape', () => {
    const ranked = rankTerms([
      { expected: 3, learner: 1, ratio: 3, folded: 3 },
      { expected: -0.5, learner: 0.5, ratio: -1, folded: 1 },
    ]);
    expect(signatureOf(ranked[0])).toBe('SIGN_FLIP');
  });

  it('names the shapes it claims and nothing else', () => {
    expect(signatureOf({ expected: 4, learner: 2, ratio: 2, folded: 2 })).toBe('FACTOR_OF_TWO');
    expect(signatureOf({ expected: 9, learner: 3, ratio: 3, folded: 3 })).toBe('STOICHIOMETRIC_RATIO');
    expect(signatureOf({ expected: 1000, learner: 1, ratio: 1000, folded: 1000 })).toBe(
      'DIMENSIONAL_CONVERSION_ERROR'
    );
    // 7 is not a fracture this taxonomy knows.
    expect(signatureOf({ expected: 7, learner: 1, ratio: 7, folded: 7 })).toBeNull();
  });
});

describe('diagnoseDiscrepancy — the structural layer wins when both fire', () => {
  it('reads a dropped sign as SIGN_FLIP, carrying the signed arithmetic', () => {
    const reading = diagnoseDiscrepancy({
      learnerText: 'q = 0.0336 kJ',
      expectedText: 'q = -0.0336 kJ',
    });
    expect(reading).not.toBeNull();
    expect(reading!.kind).toBe('SIGN_FLIP');
    expect(reading!.trapId).toBe('sign_convention_flip');
    expect(reading!.origin).toBe('structural');
    // Both numbers, signed: the sign IS the finding.
    expect(reading!.arithmeticReveal).toContain('-1.00');
  });

  it('reads a halved answer as FACTOR_OF_TWO and shows the division that proves it', () => {
    const reading = diagnoseDiscrepancy({ learnerText: '0.0168', expectedText: '0.0336' });
    expect(reading!.kind).toBe('FACTOR_OF_TWO');
    expect(reading!.trapId).toBe('factor_of_two');
    expect(reading!.arithmeticReveal).toBe('0.0336 ÷ 0.0168 = 2.00');
  });

  it('reads a dropped subscript as SUBSCRIPT_DROPPED', () => {
    const reading = diagnoseDiscrepancy({ learnerText: 'H2O', expectedText: 'H2O2' });
    expect(reading!.kind).toBe('SUBSCRIPT_DROPPED');
    expect(reading!.trapId).toBe('missing_subscript');
  });

  it('reads three orders of magnitude as a dimensional conversion', () => {
    const reading = diagnoseDiscrepancy({ learnerText: '3400 J', expectedText: '3.4 kJ' });
    expect(reading!.kind).toBe('DIMENSIONAL_CONVERSION_ERROR');
    expect(reading!.trapId).toBe('unit_slip');
    expect(reading!.arithmeticReveal).toContain('1000.00');
  });

  it('names a factor of three as its own kind, and claims no trap id for it', () => {
    // The existing taxonomy has no member that honestly names a stoichiometric
    // ratio of three. Rounding this onto `factor_of_two` would send the learner
    // to look for a 2 that is actually a 3.
    const reading = diagnoseDiscrepancy({ learnerText: '0.3', expectedText: '0.9' });
    expect(reading!.kind).toBe('STOICHIOMETRIC_RATIO');
    expect(reading!.trapId).toBeNull();
    expect(reading!.origin).toBe('numeric');
    expect(reading!.structuralReason).toContain('three');
  });

  it('stays silent when nothing explains the miss', () => {
    expect(diagnoseDiscrepancy({ learnerText: 'no numbers here', expectedText: 'nor here' })).toBeNull();
    expect(diagnoseDiscrepancy({ learnerText: '   ', expectedText: '0.5' })).toBeNull();
  });

  it('reads the fracture out of the check-time answer, not the live fields', () => {
    // The same learner text against a different exemplar must NOT resolve to the
    // same fracture: the diff is a property of the pair, never of the prose.
    const withExemplar = diagnoseDiscrepancy({ learnerText: '0.0168', expectedText: '0.0336' });
    const other = diagnoseDiscrepancy({ learnerText: '0.0168', expectedText: '0.0168' });
    expect(withExemplar!.kind).toBe('FACTOR_OF_TWO');
    expect(other).toBeNull();
  });

  it('keeps every pair it considered, best first, for the diff table', () => {
    const reading = diagnoseDiscrepancy({ learnerText: '0.0168 and 5', expectedText: '0.0336' });
    expect(reading!.terms.length).toBeGreaterThan(0);
    expect(reading!.terms[0].learner).toBe(0.0168);
  });
});

describe('patchStatementFor — a scaffold the learner is meant to edit', () => {
  it('names the topic and the change, per kind', () => {
    const reading = diagnoseDiscrepancy({ learnerText: '0.0168', expectedText: '0.0336' })!;
    const statement = patchStatementFor(reading, 'Thermochemistry');
    expect(statement).toContain('Thermochemistry');
    expect(statement).toContain('factor of two');
  });

  it('falls back to a scope rather than emitting a nameless patch', () => {
    const reading = diagnoseDiscrepancy({ learnerText: '0.3', expectedText: '0.9' })!;
    expect(patchStatementFor(reading, '   ')).toContain('This topic');
  });

  it('covers every kind the diff can produce', () => {
    for (const kind of DISCREPANCY_KINDS) {
      const statement = patchStatementFor(
        {
          kind,
          trapId: null,
          structuralReason: '',
          arithmeticReveal: '',
          whereItBreaks: '',
          terms: [],
          origin: 'numeric',
        },
        'Optics'
      );
      expect(statement.length).toBeGreaterThan(20);
      expect(statement).toContain('Optics');
    }
  });
});
