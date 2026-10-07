import { describe, it, expect } from 'vitest';
import {
  crossedTerms,
  diagnoseDiscrepancy,
  diagnoseSequence,
  exponentsIn,
  foldRatio,
  hasPowerLawEvidence,
  patchStatementFor,
  powerLawIn,
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
    // 1.37 carries no shape: not a whole factor, not a power, not a log
    // constant. This is the case that used to be pinned with `7`, which the
    // widened vocabulary now names as a dropped coefficient.
    expect(signatureOf({ expected: 1.37, learner: 1, ratio: 1.37, folded: 1.37 })).toBeNull();
    expect(signatureOf({ expected: 2.5, learner: 1, ratio: 2.5, folded: 2.5 })).toBeNull();
  });
});

describe('the signatures are arithmetic, not chemistry', () => {
  it('names any whole factor a line can drop, not only a valence of three', () => {
    for (const factor of [3, 4, 7, 12]) {
      expect(signatureOf({ expected: factor, learner: 1, ratio: factor, folded: factor })).toBe(
        'STOICHIOMETRIC_RATIO'
      );
    }
    // The ceiling exists so the label stays diagnostic: past a dozen, a ratio
    // is an outlier rather than a dropped coefficient this layer can name.
    expect(signatureOf({ expected: 37, learner: 1, ratio: 37, folded: 37 })).toBeNull();
  });

  it('reads a whole power as a dropped exponent when the material carries a law', () => {
    const term = { expected: 16, learner: 4, ratio: 4, folded: 4 };
    // 4 is both a coefficient and 2², and only the material says which.
    expect(signatureOf(term)).toBe('STOICHIOMETRIC_RATIO');
    expect(signatureOf(term, { text: 'Flow scales with r⁴.' })).toBe('POWER_LAW');
    expect(signatureOf(term, { text: 'The radius is squared.' })).toBe('POWER_LAW');
    // A factor that is not a whole power stays a factor, law or no law.
    expect(signatureOf({ expected: 5, learner: 1, ratio: 5, folded: 5 }, { text: 'r²' })).toBe(
      'STOICHIOMETRIC_RATIO'
    );
  });

  it('names a whole power above the coefficient ceiling with nothing to tie it to', () => {
    // 16 is past every whole factor this layer calls a coefficient, so a factor
    // nobody wrote down is read as an exponent rather than left silent.
    expect(signatureOf({ expected: 32, learner: 2, ratio: 16, folded: 16 })).toBe('POWER_LAW');
    expect(signatureOf({ expected: 243, learner: 1, ratio: 243, folded: 243 })).toBe('POWER_LAW');
  });

  it('reads the logarithm constants a rate law or a scale leaves behind', () => {
    // ln 2 and 1/ln 2 are the same fracture seen from two ends, and the fold
    // has already chosen the magnitude, so one constant covers both directions.
    expect(signatureOf({ expected: 2.77, learner: 1.92, ratio: 1.4427, folded: 1.4427 })).toBe(
      'LOG_SCALE'
    );
    expect(signatureOf({ expected: 0.6931, learner: 0.3, ratio: 2.31, folded: 2.31 })).toBe(
      'LOG_SCALE'
    );
  });

  it('reads the exponent helpers off the material and nothing else', () => {
    expect(exponentsIn('r² and x^4')).toEqual([2, 4]);
    expect(exponentsIn('a bare ² is a footnote')).toEqual([]);
    expect(powerLawIn('Flow scales with r^4 at a fixed gradient.')).toBe('r^4');
    expect(powerLawIn('No powers here.')).toBe('');
    expect(hasPowerLawEvidence('r³')).toBe(true);
    expect(hasPowerLawEvidence('a cubed quantity')).toBe(true);
    expect(hasPowerLawEvidence('The mass is 5.0 g.')).toBe(false);
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

  it('names a factor of three as its own kind, under its own trap id', () => {
    // The taxonomy used to have no member that honestly names a stoichiometric
    // ratio of three, so this reading carried no trap id at all. It does now,
    // for the same reason the kind exists: rounding it onto `factor_of_two`
    // would send the learner to look for a 2 that is actually a 3.
    const reading = diagnoseDiscrepancy({ learnerText: '0.3', expectedText: '0.9' });
    expect(reading!.kind).toBe('STOICHIOMETRIC_RATIO');
    expect(reading!.trapId).toBe('whole_factor_off');
    expect(reading!.origin).toBe('structural');
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

  it('names a dropped exponent in a kinetics answer, from the law in the material', () => {
    const reading = diagnoseDiscrepancy({
      learnerText: 'v = 4.0 m/s',
      expectedText: 'v = 16.0 m/s',
      sourceText: 'The flow rate scales with v² at a fixed gradient.',
    });
    expect(reading!.kind).toBe('POWER_LAW');
    expect(reading!.trapId).toBe('power_law_dropped');
    // The exponent is read off the material structurally, from its own notation.
    expect(reading!.origin).toBe('structural');
    // The arithmetic is computed here: the factor and the power it is.
    expect(reading!.arithmeticReveal).toContain('16 ÷ 4 = 4.00');
    expect(reading!.arithmeticReveal).toContain('= 2^2');
    expect(reading!.structuralReason).toContain('v²');
  });

  it('names a dropped logarithm in a half-life answer', () => {
    const reading = diagnoseDiscrepancy({
      learnerText: 't½ = 1.92 h',
      expectedText: 't½ = 2.77 h',
      sourceText: 'For a first-order decay, t½ = ln 2 / k.',
    });
    expect(reading!.kind).toBe('LOG_SCALE');
    expect(reading!.trapId).toBe('logarithm_dropped');
    expect(reading!.origin).toBe('structural');
    expect(reading!.structuralReason).toContain('ln 2');
    expect(reading!.arithmeticReveal).toContain('1 / ln 2');
  });

  it('names a coefficient of seven rather than staying silent', () => {
    // The case this vocabulary was widened for: 3 A + 2 B was the only ratio a
    // coefficient error could be, and every other whole number fell through.
    const reading = diagnoseDiscrepancy({ learnerText: '0.13', expectedText: '0.91' });
    expect(reading!.kind).toBe('STOICHIOMETRIC_RATIO');
    expect(reading!.structuralReason).toContain('seven');
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

/**
 * The ordering drills hand this layer both orders, so the fracture is measured
 * rather than inferred — and the two ways it can go wrong (saying nothing about
 * a real inversion, or naming one from a payload that cannot describe one) are
 * both failures worth pinning.
 */
describe('diagnoseSequence — the chain is right but the order is wrong', () => {
  const canonical = ['rest', 'depolarize', 'repolarize'];
  const labels = [
    'the membrane sits at rest',
    'voltage-gated channels open',
    'the channels inactivate',
  ];

  it('says nothing when the chain is in the order the physics forces', () => {
    expect(diagnoseSequence({ submitted: ['rest', 'depolarize', 'repolarize'], canonical, labels })).toBeNull();
  });

  it('names an inversion for one swapped pair, not a missing fact', () => {
    // The last two links are swapped: the misplaced step is named, together
    // with the step it must follow.
    const reading = diagnoseSequence({ submitted: ['rest', 'repolarize', 'depolarize'], canonical, labels });
    expect(reading?.kind).toBe('ORDER_INVERSION');
    expect(reading?.trapId).toBe('reversed_order');
    expect(reading?.origin).toBe('structural');
    // The reveal quotes the two steps the swap moved, which is what makes it a
    // correction rather than "try again".
    expect(reading?.arithmeticReveal).toContain('the channels inactivate');
    expect(reading?.arithmeticReveal).toContain('voltage-gated channels open');
    expect(reading?.arithmeticReveal).toContain('must come after');
    expect(reading?.structuralReason).toMatch(/ordering failure/);
    expect(reading?.whereItBreaks).toBe('the causal order, not any single step');
    // A structural reading carries no numbers and must not pretend to any.
    expect(reading?.terms).toEqual([]);
  });

  it('reads a fully reversed chain as the same fracture', () => {
    const reading = diagnoseSequence({ submitted: ['repolarize', 'depolarize', 'rest'], canonical, labels });
    expect(reading?.kind).toBe('ORDER_INVERSION');
    expect(reading?.arithmeticReveal.length).toBeGreaterThan(0);
  });

  it('refuses to name a fracture from a payload that cannot describe one', () => {
    expect(diagnoseSequence({ submitted: [], canonical, labels })).toBeNull();
    expect(diagnoseSequence({ submitted: ['rest'], canonical, labels })).toBeNull();
    // A length mismatch is a payload problem, not a fracture.
    expect(diagnoseSequence({ submitted: ['rest', 'depolarize'], canonical, labels })).toBeNull();
    expect(diagnoseSequence({ submitted: ['rest', 'depolarize', 'repolarize'], canonical: [], labels: [] })).toBeNull();
  });

  it('still names the inversion when the payload carries no display text', () => {
    const reading = diagnoseSequence({
      submitted: ['depolarize', 'rest', 'repolarize'],
      canonical,
      labels: [],
    });
    expect(reading?.kind).toBe('ORDER_INVERSION');
    expect(reading?.arithmeticReveal.length).toBeGreaterThan(0);
  });
});
