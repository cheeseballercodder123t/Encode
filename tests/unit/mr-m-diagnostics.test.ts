import { describe, it, expect } from 'vitest';
import {
  atomsOf,
  classifyTrap,
  formulaTokens,
  powerEvidenceIn,
  poweredSymbols,
  quantityNumbers,
} from '../../lib/mr-m/diagnostics';

/**
 * The trap classifier is the deterministic half of the Mr M autopsy: it names
 * the structural failure and computes the arithmetic the learner checks for
 * themselves. These tests pin it against the real cases this learner actually
 * hit — the dropped subscript, the missing factor of two, the atom count lost
 * from a molar-mass denominator — because a diagnosis that fires on the wrong
 * shape would teach the wrong lesson twice over.
 */

describe('quantityNumbers', () => {
  it('ignores subscripts inside a formula', () => {
    // The `2` in H2O is an atom count, not a measurement.
    expect(quantityNumbers('H2O has no measured quantity')).toEqual([]);
    expect(quantityNumbers('NH4NO3 weighs 80 g/mol')).toEqual([80]);
  });

  it('ignores bare small integers, which are stoichiometric coefficients', () => {
    // Without this rule an expected `2` would "match" a learner's `1` and
    // manufacture a factor-of-two diagnosis out of nothing.
    expect(quantityNumbers('multiply by 2')).toEqual([]);
    expect(quantityNumbers('14 mol of nitrogen')).toEqual([14]);
  });

  it('keeps decimals, large integers and negative values', () => {
    expect(quantityNumbers('0.0336 kJ and 250 mL')).toEqual([0.0336, 250]);
    expect(quantityNumbers('-40 kJ/mol')).toEqual([-40]);
  });
});

describe('formulaTokens / atomsOf', () => {
  it('finds formulae and skips ordinary capitalised words', () => {
    const tokens = formulaTokens('The empirical formula came out C2H, not C4H4');
    expect(tokens).toContain('C2H');
    expect(tokens).toContain('C4H4');
    expect(tokens).not.toContain('The');
  });

  it('sums repeated elements across a token', () => {
    // Ammonium nitrate carries TWO nitrogens — the whole trap.
    expect(atomsOf('NH4NO3').get('N')).toBe(2);
    expect(atomsOf('NH4NO3').get('H')).toBe(4);
    expect(atomsOf('NH4NO3').get('O')).toBe(3);
  });
});

describe('classifyTrap — structural signatures', () => {
  it('names the reversed operand order, in either form', () => {
    const enthalpy = classifyTrap({ learnerText: 'dH = reactants - products', expectedText: '' });
    expect(enthalpy?.trapId).toBe('reversed_order');
    expect(enthalpy?.structuralReason).toContain('products are the destination');

    const bonds = classifyTrap({ learnerText: 'bond enthalpy = formed - broken', expectedText: '' });
    expect(bonds?.trapId).toBe('reversed_order');
    expect(bonds?.structuralReason).toContain('broken');
    expect(bonds?.structuralReason).toContain('formed');
  });

  it('names a dropped subscript and quantifies the factor', () => {
    const diagnosis = classifyTrap({
      learnerText: 'I got the empirical formula C2H',
      expectedText: 'The empirical formula is C4H4',
    });
    expect(diagnosis?.trapId).toBe('missing_subscript');
    expect(diagnosis?.structuralReason).toContain('C');
    expect(diagnosis?.structuralReason).toContain('C2H');
    expect(diagnosis?.structuralReason).toContain('C4H4');
  });

  it('finds the atom count missing from the denominator (NH4NO3)', () => {
    // The learner used one nitrogen (14) where the formula has two (28).
    const diagnosis = classifyTrap({
      learnerText: 'The nitrogen fraction is 14 / 80 = 0.175',
      expectedText: 'The nitrogen fraction is 28 / 80 = 0.35',
      sourceText: 'Ammonium nitrate NH4NO3 has a molar mass of 80 g/mol.',
    });
    expect(diagnosis?.trapId).toBe('molar_mass_denominator');
    expect(diagnosis?.structuralReason).toContain('2 N atoms');
    expect(diagnosis?.arithmeticReveal).toBe('28 ÷ 14 = 2.00');
  });

  it('exposes the arithmetic reveal for a bare factor of two', () => {
    const diagnosis = classifyTrap({
      learnerText: 'I get 0.0168 kJ of heat',
      expectedText: '0.0336 kJ of heat leaves the water',
    });
    expect(diagnosis?.trapId).toBe('factor_of_two');
    // The exact line that made it undeniable: the ratio is the reveal.
    expect(diagnosis?.arithmeticReveal).toBe('0.0336 ÷ 0.0168 = 2.00');
    expect(diagnosis?.whereItBreaks).toContain('stoichiometric');
  });

  it('catches a factor of 1000 as a unit slip', () => {
    const diagnosis = classifyTrap({
      learnerText: 'I used 0.25',
      expectedText: 'That is 250',
    });
    expect(diagnosis?.trapId).toBe('unit_slip');
    expect(diagnosis?.structuralReason).toContain('1000 mL');
  });

  it('catches a millilitre answer against a litre reference', () => {
    const diagnosis = classifyTrap({
      learnerText: 'I measured 250 in mL',
      expectedText: 'The conversion into L is the step that matters',
    });
    expect(diagnosis?.trapId).toBe('unit_slip');
  });

  it('catches a flipped sign as a convention error, not an arithmetic one', () => {
    const diagnosis = classifyTrap({ learnerText: '-40 kJ/mol', expectedText: '40 kJ/mol' });
    expect(diagnosis?.trapId).toBe('sign_convention_flip');
    expect(diagnosis?.structuralReason).toContain('sign');
  });
});

describe('classifyTrap — the signature is direction-blind', () => {
  // A factor-of-two error is the same trap whichever way the division falls.
  // Scoring the signature in reciprocal space is what makes the panel speak for
  // an answer that is too BIG as well as one that is too small — and without it
  // the commonest direction of a unit slip reads as "no signal" and the autopsy
  // stays empty.

  it('names a factor of two when the learner overshot', () => {
    const diagnosis = classifyTrap({
      learnerText: 'I get 0.0672 kJ of heat',
      expectedText: '0.0336 kJ of heat leaves the water',
    });
    expect(diagnosis?.trapId).toBe('factor_of_two');
    expect(diagnosis?.arithmeticReveal).toBe('0.0672 ÷ 0.0336 = 2.00');
  });

  it('still reaches the shaped diagnosis from the reciprocal ratio', () => {
    // The learner counted one nitrogen and then inverted the fraction, so the
    // ratio arrives as 0.5 — the same failure as 2, and it has to land on the
    // denominator trap rather than on the generic one.
    const diagnosis = classifyTrap({
      learnerText: 'The nitrogen fraction is 56 / 80 = 0.7',
      expectedText: 'The nitrogen fraction is 28 / 80 = 0.35',
      sourceText: 'Ammonium nitrate NH4NO3 has a molar mass of 80 g/mol.',
    });
    expect(diagnosis?.trapId).toBe('molar_mass_denominator');
  });

  it('catches a litre answer against a millilitre stage', () => {
    // The mirror of the tested direction, and the one that used to resolve to
    // nothing: no numbers on either side, so only the units can carry it.
    const diagnosis = classifyTrap({
      learnerText: 'I carried the volume through in litres',
      expectedText: 'The stage measures this in millilitres',
    });
    expect(diagnosis?.trapId).toBe('unit_slip');
    expect(diagnosis?.structuralReason).toContain('millilitres');
  });

  it('does not call a magnitude error a sign convention', () => {
    // −0.0672 against 0.0336 is a factor of two FIRST. Reporting it as a flipped
    // convention would send the learner to fix the wrong line — and the sign
    // text makes a claim about the magnitude being right, so it has to be true.
    const diagnosis = classifyTrap({
      learnerText: 'So dH = -0.0672 kJ/mol',
      expectedText: 'dH = 0.0336 kJ/mol',
    });
    expect(diagnosis?.trapId).toBe('factor_of_two');
  });
});

describe('classifyTrap — restraint', () => {
  it('returns null rather than inventing a diagnosis', () => {
    // No quantity on the learner's side and no formula: there is no clean
    // signal, and an invented autopsy is the arbitrary noise this mode exists
    // to remove.
    expect(
      classifyTrap({ learnerText: 'I do not know where to start', expectedText: '0.0336 kJ' })
    ).toBeNull();
    expect(classifyTrap({ learnerText: '', expectedText: '0.0336 kJ' })).toBeNull();
  });

  it('does not invent a factor of two out of bare coefficients', () => {
    // `2` and `1` are coefficients, not measurements.
    expect(classifyTrap({ learnerText: 'I got 1 mole', expectedText: 'It should be 2 moles' })).toBeNull();
  });
});

describe('classifyTrap — the vocabulary is arithmetic, not chemistry', () => {
  // The first version of the numeric diff searched for a factor of two, three
  // orders of magnitude and a sign flip, so a coefficient of seven, a dropped
  // exponent and a dropped `ln 2` all resolved to `null` — a wrong answer with
  // no diagnosis at all, which the panel then fills with prose.

  it('names a whole factor beyond two, and says which factor it is', () => {
    const seven = classifyTrap({ learnerText: '0.13', expectedText: '0.91' });
    expect(seven?.trapId).toBe('whole_factor_off');
    expect(seven?.structuralReason).toContain('seven');
    expect(seven?.arithmeticReveal).toBe('0.91 ÷ 0.13 = 7.00');

    // Four is both a whole factor and a whole power, and with no law in the
    // material it is read the conservative way, as a coefficient.
    const four = classifyTrap({ learnerText: '0.13', expectedText: '0.52' });
    expect(four?.trapId).toBe('whole_factor_off');
    expect(four?.structuralReason).toContain('four');
  });

  it('leaves a factor of two on its own label', () => {
    const diagnosis = classifyTrap({
      learnerText: 'I get 0.0168 kJ of heat',
      expectedText: '0.0336 kJ of heat leaves the water',
    });
    expect(diagnosis?.trapId).toBe('factor_of_two');
    expect(diagnosis?.arithmeticReveal).toBe('0.0336 ÷ 0.0168 = 2.00');
  });

  it('stays silent past the coefficient ceiling rather than calling every ratio a factor', () => {
    // 37 is not a coefficient this layer can name, and it is not a power either.
    expect(classifyTrap({ learnerText: '2.7', expectedText: '99.9' })).toBeNull();
  });
});

describe('classifyTrap — a dropped exponent, and a dropped logarithm', () => {
  it('reads a whole power as a dropped exponent, with the arithmetic and the law', () => {
    const diagnosis = classifyTrap({
      learnerText: 'v = 4.0 m/s',
      expectedText: 'v = 16.0 m/s',
      sourceText: 'The flow rate scales with v² at a fixed gradient.',
    });
    expect(diagnosis?.trapId).toBe('power_law_dropped');
    expect(diagnosis?.arithmeticReveal).toContain('16 ÷ 4 = 4.00');
    expect(diagnosis?.arithmeticReveal).toContain('= 2^2');
    expect(diagnosis?.structuralReason).toContain('v²');
  });

  it('reaches the same exponent label when the material names the power in words', () => {
    // The word form is not notation, so this reading arrives through the numeric
    // diff — which is why both quantities here are measured rather than
    // coefficient-sized.
    const diagnosis = classifyTrap({
      learnerText: 'v = 4.5 m/s',
      expectedText: 'v = 18.0 m/s',
      sourceText: 'The radius is squared.',
    });
    expect(diagnosis?.trapId).toBe('power_law_dropped');
    expect(diagnosis?.arithmeticReveal).toContain('18 ÷ 4.5 = 4.00');
    expect(diagnosis?.arithmeticReveal).toContain('= 2^2');
  });

  it('names the logarithm constant a rate law leaves behind', () => {
    const diagnosis = classifyTrap({
      learnerText: 't½ = 1.92 h',
      expectedText: 't½ = 2.77 h',
      sourceText: 'For a first-order decay, t½ = ln 2 / k.',
    });
    expect(diagnosis?.trapId).toBe('logarithm_dropped');
    expect(diagnosis?.arithmeticReveal).toContain('1 / ln 2');
    expect(diagnosis?.structuralReason).toContain('ln 2');
  });

  it('reads ln 10 the same way, because the fold names the constant and not the direction', () => {
    // 0.997 / 0.433 = 2.3025, which is ln 10 folded: the same fracture as its
    // reciprocal, which is what makes one constant cover both directions.
    const diagnosis = classifyTrap({ learnerText: '0.433', expectedText: '0.997' });
    expect(diagnosis?.trapId).toBe('logarithm_dropped');
    expect(diagnosis?.arithmeticReveal).toContain('ln 10');
  });
});

describe('poweredSymbols / powerEvidenceIn — the extractor reads notation, not only formulae', () => {
  it('reads a radical on a symbol, which no element regex can', () => {
    expect(poweredSymbols("f'(x) = 1 / (2√x)")).toEqual([{ symbol: 'x', power: '√' }]);
  });

  it('reads a superscript and a caret exponent alike', () => {
    const powers = poweredSymbols('r² and x^4');
    expect(powers).toContainEqual({ symbol: 'r', power: '²' });
    expect(powers).toContainEqual({ symbol: 'x', power: '^4' });
    expect(powers).toHaveLength(2);
  });

  it('ignores a superscript outside the extracted set, and an exponent on a number', () => {
    // ¹ is a footnote marker, and 10^3 is a conversion rather than a law.
    expect(poweredSymbols('a footnote¹ here')).toEqual([]);
    expect(poweredSymbols('10^3 mL')).toEqual([]);
  });

  it('counts a power named in words as evidence, and a plain quantity as none', () => {
    expect(powerEvidenceIn('a cubed quantity')).toBe(true);
    expect(powerEvidenceIn('The mass is 5.0 g.')).toBe(false);
  });
});

describe('classifyTrap — the symbolic line the formula regex could never read', () => {
  it('reads a dropped exponent when the answer carries no measured quantity at all', () => {
    // A derivative has no element token, no subscript and no measured quantity,
    // so every other rule here is silent on it and the exponent is the only
    // evidence there is.
    const diagnosis = classifyTrap({
      learnerText: 'the slope is x',
      expectedText: "f'(x) = 1 / (2√x)",
    });
    expect(diagnosis?.trapId).toBe('power_law_dropped');
    expect(diagnosis?.structuralReason).toContain('√x');
    // No pair of numbers exists to divide, and no arithmetic is invented.
    expect(diagnosis?.arithmeticReveal).toBe('');
  });

  it('is silent when the learner already wrote the exponent', () => {
    expect(
      classifyTrap({ learnerText: '1/(2√x)', expectedText: "f'(x) = 1 / (2√x)" })
    ).toBeNull();
  });

  // A GAP, pinned so it stays visible rather than guessed at: the mention test
  // requires a non-alphanumeric boundary before the symbol, and here the
  // coefficient sits flush against it (`2x`), so the derivative case the
  // limitation names still comes back with nothing. The fix belongs in the
  // module's mention test; this expectation moves with it.
  it("reads the limitation's own derivative case: 1/(2x) against 1/(2√x)", () => {
    // The coefficient sits flush against the symbol here. A digit is a boundary
    // because a quantity that only ever appears with a coefficient in front of it
    // would otherwise never read as mentioned, and the dropped root is exactly
    // the case this rule exists for.
    const diagnosis = classifyTrap({
      learnerText: 'the derivative is 1/(2x)',
      expectedText: "f'(x) = 1 / (2√x)",
    });
    expect(diagnosis?.trapId).toBe('power_law_dropped');
    expect(diagnosis?.structuralReason).toContain('√x');
  });

  it("does not read a formula's own subscript neighbour as a mention", () => {
    // The counterweight to the digit boundary above: in NH4NO3 the H is followed
    // by a digit, so a bare `H` in an answer is not a mention of it and no
    // exponent is claimed from a subscript.
    expect(
      classifyTrap({ learnerText: 'I wrote H', expectedText: 'Ammonium nitrate is NH4NO3' })
    ).toBeNull();
  });
});
