// ─── Mr M mode: trap-aware diagnostics ──────────────────────────────────────
//
// "Incorrect. The answer is C." is worse than useless to a learner who needs
// the structural reason. What makes a correction permanent is the autopsy: the
// exact arithmetic that exposes the failure — 0.0336 ÷ 0.0168 = 2.00, and the
// missing factor of two in H₂O becomes visible in one line.
//
// That is why the arithmetic is computed HERE and not by the model. A ratio is
// a fact; a model that multiplies two numbers is a model that can be wrong
// about arithmetic, and an autopsy with a wrong number in it teaches the wrong
// lesson. So the diagnosis is split:
//
//   * this module — the structural LABEL and the ARITHMETIC (deterministic,
//     pure, unit-tested against the real cases);
//   * `MR_M_EVALUATE_DIRECTIVE` in `directives.ts` — the narrative half: why
//     the mistake is structural and what the corrected construction is.
//
// Deliberately rigorous: this returns `null` when it has no clean signal. An
// invented diagnosis is exactly the arbitrary noise this mode exists to remove,
// so the remaining members of the taxonomy (`limiting_reactant_ignored`,
// `mole_ratio_inverted`, `zero_point_confusion`, `path_vs_state_confusion`) are
// left to the model's narrative rather than guessed at from a keyword.
//
// The vocabulary is ARITHMETIC rather than chemical, and that is a correction.
// The first version of this file searched for a factor of two, three orders of
// magnitude and a sign flip, so an error that was a coefficient of seven, an
// exponent one step off (r against r²), or the `ln 2` of a half-life resolved to
// `null` — a wrong answer with no diagnosis at all, which the panel fills with
// prose. The shapes are the same ones `autopsy.ts` names, they are read in
// TIERS (a sign inversion outranks every magnitude shape; a whole power whose
// law is in the material is an exponent problem, while the same number with no
// law in sight stays a dropped coefficient), and the notation extractor is no
// longer limited to `H2O`-shaped tokens: `f'(x) = 1 / (2√x)` carries no element
// token and is read as what it is.

import type { TrapDiagnosis, TrapId, TrapInput } from './types';

/** Format a quantity the way it appeared, without inventing precision. */
function fmt(n: number): string {
  return String(n);
}

function near(a: number, b: number, tolerance: number): boolean {
  if (b === 0) return Math.abs(a) < tolerance;
  return Math.abs(a - b) / Math.abs(b) <= tolerance;
}

/**
 * Numbers that are measured QUANTITIES, not subscripts or coefficients.
 *
 * Two exclusions do the real work: a digit immediately after a letter is a
 * subscript (`H2O` contributes nothing), and a bare small integer is a
 * stoichiometric coefficient rather than a measurement. Without the second
 * rule, `2` in an expected answer would "match" a `1` in the learner's and
 * manufacture a factor-of-two diagnosis out of nothing.
 */
export function quantityNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:\.\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const prev = start > 0 ? text[start - 1] : '';
    if (/[A-Za-z]/.test(prev)) continue; // subscript, not a quantity
    const value = Number(match[0]);
    if (!Number.isFinite(value)) continue;
    if (Number.isInteger(value) && Math.abs(value) < 10) continue; // coefficient
    out.push(value);
  }
  return out;
}

/**
 * Chemical-formula-looking tokens. A token qualifies when it carries an
 * explicit subscript or at least two element groups, which is what keeps
 * ordinary capitalised words ("Th", "Na") out of the comparison.
 */
export function formulaTokens(text: string): string[] {
  const out: string[] = [];
  const re = /\b[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)*\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const token = match[0];
    if (!/\d/.test(token) && !/^[A-Z][a-z]?[A-Z]/.test(token)) continue;
    out.push(token);
  }
  return out;
}

/** Element → atom count. `NH4NO3` → N:2, H:4, O:3. */
export function atomsOf(token: string): Map<string, number> {
  const map = new Map<string, number>();
  const re = /([A-Z][a-z]?)(\d*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(token)) !== null) {
    if (!match[0]) break;
    const count = match[2] ? Number(match[2]) : 1;
    map.set(match[1], (map.get(match[1]) || 0) + count);
  }
  return map;
}

function sameElementSet(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a.keys()) if (!b.has(key)) return false;
  return true;
}

// ─── Rule 1: the operand order ──────────────────────────────────────────────

const REACTANTS_FIRST = /reactants?\s*[-−–]\s*products?/i;
const FORMED_FIRST = /formed\s*[-−–]\s*broken/i;

function detectReversedOrder(learner: string): TrapDiagnosis | null {
  if (REACTANTS_FIRST.test(learner)) {
    return {
      trapId: 'reversed_order',
      structuralReason:
        'You wrote reactants − products. ΔH° is measured against the elements in their standard states, so the products are the destination and the reactants are the origin — take the origin off the destination and you have the direction of travel.',
      arithmeticReveal: '',
      whereItBreaks: 'the sign of the whole answer, not its magnitude',
    };
  }
  if (FORMED_FIRST.test(learner)) {
    return {
      trapId: 'reversed_order',
      structuralReason:
        'You wrote formed − broken. In a vacuum every bond must first be paid for, so bond enthalpies are broken − formed: what you spend to demolish, minus what you get back when the new bonds form. The reaction enthalpy is what survives that transaction, sign included.',
      arithmeticReveal: '',
      whereItBreaks: 'the sign of the whole answer, not its magnitude',
    };
  }
  return null;
}

// ─── Rule 2: a dropped subscript ────────────────────────────────────────────

function detectSubscript(learner: string, reference: string): TrapDiagnosis | null {
  const referenceTokens = formulaTokens(reference);
  if (referenceTokens.length === 0) return null;

  for (const learnerToken of formulaTokens(learner)) {
    const learnerAtoms = atomsOf(learnerToken);
    for (const referenceToken of referenceTokens) {
      if (learnerToken === referenceToken) continue;
      const referenceAtoms = atomsOf(referenceToken);
      // Same elements, different counts: that is a subscript error and nothing
      // else. A different element set is a different formula, and guessing at
      // that is not this module's job.
      if (!sameElementSet(learnerAtoms, referenceAtoms)) continue;

      const deficit = [...referenceAtoms.entries()].find(([element, count]) => {
        const got = learnerAtoms.get(element) || 0;
        return got >= 1 && got < count;
      });
      if (!deficit) continue;

      const [element, expectedCount] = deficit;
      const gotCount = learnerAtoms.get(element) || 0;
      const factor = expectedCount / gotCount;
      return {
        trapId: 'missing_subscript',
        structuralReason: `You used ${learnerToken} where the material is ${referenceToken}: ${element} appears ${gotCount === 1 ? 'once' : `${gotCount} times`} in your formula and ${expectedCount} times in the real one. Everything derived from that formula — moles, mass, energy — is off by exactly ${fmt(factor)}.`,
        arithmeticReveal: '',
        whereItBreaks: `the ${element} count you divided by`,
      };
    }
  }
  return null;
}

// ─── Rules 3–6: numeric signatures ─────────────────────────────────────────

/**
 * Every power written ON a symbol, as `{ symbol, power }`.
 *
 * A token qualifies only when the exponent is attached to a SYMBOL — `r²`, `x^4`,
 * `√x`. A bare superscript is a footnote and `10^3` is a conversion rather than
 * a law, so neither counts. This is the extractor the chemical formula regex
 * cannot be: a derivative or a rate law carries no element token, and before
 * this the whole notation was invisible to the classifier.
 */
export function poweredSymbols(text: string): { symbol: string; power: string }[] {
  const out: { symbol: string; power: string }[] = [];
  const seen = new Set<string>();
  const re = /([A-Za-z\u0394\u03b8\u03bb\u03c1][A-Za-z0-9_]*)\s*(\^\s*[0-9]{1,2}|[\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079])|\u221a\s*([A-Za-z\u0394\u03b8\u03bb\u03c1][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text || '')) !== null) {
    const symbol = match[1] || match[3] || '';
    const power = match[2] ? match[2].replace(/\s+/g, '') : '\u221a';
    if (!symbol) continue;
    const key = `${symbol}${power}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ symbol, power });
  }
  return out;
}

/** True when the material writes an exponent on a symbol, or names one in words. */
export function powerEvidenceIn(text: string): boolean {
  if (poweredSymbols(text).length > 0) return true;
  return /\b(squared|square of|quadratic|cubed|cube of|cubic)\b/i.test(text || '');
}

/** A whole factor above this is an outlier rather than a coefficient. */
const MAX_INTEGER_FACTOR = 12;

/** The whole factors spoken as words, so the diagnosis reads like a sentence. */
const NUMBER_WORDS: Record<number, string> = {
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
};

/**
 * The whole powers worth naming, smallest base first.
 *
 * 4 = 2\u00b2, 8 = 2\u00b3, 9 = 3\u00b2, 16 = 2\u2074, 25 = 5\u00b2, 27 = 3\u00b3,
 * 32 = 2\u2075, 64 = 4\u00b3, 81 = 3\u2074, 125 = 5\u00b3, 243 = 3\u2075. Past these
 * a factor is a coefficient, not an exponent, and the smallest base is tried
 * first because `16 = 2\u2074` is how a learner reads it.
 */
const POWER_SIGNATURES: { base: number; exponent: number }[] = [
  { base: 2, exponent: 2 },
  { base: 2, exponent: 3 },
  { base: 3, exponent: 2 },
  { base: 2, exponent: 4 },
  { base: 4, exponent: 2 },
  { base: 5, exponent: 2 },
  { base: 3, exponent: 3 },
  { base: 2, exponent: 5 },
  { base: 4, exponent: 3 },
  { base: 8, exponent: 2 },
  { base: 3, exponent: 4 },
  { base: 9, exponent: 2 },
  { base: 5, exponent: 3 },
  { base: 3, exponent: 5 },
];

/**
 * The logarithm constants a wrong answer lands on, folded the way every ratio
 * here is: `ln 2 = 0.6931` and `1 / ln 2 = 1.4427` are one fracture seen from
 * two ends, and `ln 10 = 2.3026` is the bridge between a base-10 scale and a
 * natural-exponential law.
 */
const LOG_SIGNATURES: { folded: number; label: string }[] = [
  { folded: 1.4427, label: '1 / ln 2' },
  { folded: 2.3026, label: 'ln 10' },
];

/** A logarithm, or a scale built on one, is in play in the material. */
const LOG_CONTEXT = /\b(ln|log|log10|half[- ]?life|decay constant|doubling time|pKa?|pH|decibel|dB)\b/i;

/** The whole power a folded ratio sits on, smallest base first. */
function powerSignatureOf(folded: number): { base: number; exponent: number } | null {
  for (const signature of POWER_SIGNATURES) {
    if (near(folded, Math.pow(signature.base, signature.exponent), 0.02)) return signature;
  }
  return null;
}

/** The logarithm constant a folded ratio sits on. */
function logSignatureOf(folded: number): { folded: number; label: string } | null {
  for (const signature of LOG_SIGNATURES) {
    if (near(folded, signature.folded, 0.02)) return signature;
  }
  return null;
}

/**
 * The whole factor a folded ratio sits on, when it is one worth naming.
 *
 * Starts at three, because two has its own name and its own explanation: an atom
 * count is the commonest cause of exactly two, and calling that a coefficient
 * would send the learner to the wrong line.
 */
function integerFactorOf(folded: number): number | null {
  const rounded = Math.round(folded);
  if (rounded < 3 || rounded > MAX_INTEGER_FACTOR) return null;
  return near(folded, rounded, 0.03) ? rounded : null;
}

/** A named shape, with the tier that decides precedence between two candidates. */
interface NumericShape {
  trapId: TrapId;
  tier: number;
  deviation: number;
}

/**
 * The one place a crossed pair becomes a named shape.
 *
 * The tier IS the precedence, for the same reason `autopsy.ts` tiers it there: a
 * pure sign inversion (right magnitude, wrong sign) is a tier above every
 * magnitude shape, because the sign text makes a claim about the magnitude that
 * has to be true. Below it, a factor that is BOTH a whole number and a whole
 * power is a coefficient unless the material writes a law the exponent could
 * have come from — a power claimed with no law in sight is the inference this
 * module refuses to make — and a whole power above the coefficient ceiling is
 * named anyway, one tier down, rather than left silent.
 */
function shapeOfPair(ratio: number, folded: number, reference: string): NumericShape | null {
  if (ratio < 0 && near(folded, 1, 0.02)) {
    return { trapId: 'sign_convention_flip', tier: 0, deviation: Math.abs(folded - 1) };
  }
  if (near(folded, 2, 0.03)) {
    return { trapId: 'factor_of_two', tier: 1, deviation: Math.abs(folded - 2) };
  }
  const log = logSignatureOf(folded);
  if (log) {
    return { trapId: 'logarithm_dropped', tier: 1, deviation: Math.abs(folded - log.folded) };
  }
  if (near(folded, 1000, 0.05)) {
    return { trapId: 'unit_slip', tier: 1, deviation: Math.abs(folded - 1000) };
  }

  const power = powerSignatureOf(folded);
  if (power && powerEvidenceIn(reference)) {
    return {
      trapId: 'power_law_dropped',
      tier: 2,
      deviation: Math.abs(folded - Math.pow(power.base, power.exponent)),
    };
  }

  const integer = integerFactorOf(folded);
  if (integer !== null) {
    return { trapId: 'whole_factor_off', tier: 2, deviation: Math.abs(folded - integer) };
  }

  if (power) {
    return {
      trapId: 'power_law_dropped',
      tier: 3,
      deviation: Math.abs(folded - Math.pow(power.base, power.exponent)),
    };
  }

  return null;
}

/** A repeated element in the reference whose count explains the ratio. */
function repeatedElementMatching(
  reference: string,
  ratio: number
): { element: string; count: number } | null {
  for (const token of formulaTokens(reference)) {
    for (const [element, count] of atomsOf(token)) {
      if (count >= 2 && near(ratio, count, 0.05)) return { element, count };
    }
  }
  return null;
}

function detectNumeric(
  learner: string,
  expected: string,
  reference: string
): TrapDiagnosis | null {
  const referenceNumbers = quantityNumbers(expected);
  const learnerNumbers = quantityNumbers(learner);
  if (referenceNumbers.length === 0 || learnerNumbers.length === 0) return null;

  interface Candidate {
    expectedValue: number;
    learnerValue: number;
    ratio: number;
  }
  const candidates: Candidate[] = [];
  for (const e of referenceNumbers) {
    for (const l of learnerNumbers) {
      if (e === 0 || l === 0) continue;
      candidates.push({ expectedValue: e, learnerValue: l, ratio: e / l });
    }
  }
  if (candidates.length === 0) return null;

  // Prefer the pair whose ratio is a recognised signature, closest to exact.
  //
  // The signature is scored in RECIPROCAL space, because a factor-of-two error
  // is the same trap whichever way the division falls: a learner who answers
  // twice the expected value has made exactly the slip of one who answers half
  // of it. Folding 0.5 onto 2 (and 0.001 onto 1000) is not a convenience —
  // without it half of every signature in this taxonomy is invisible, so the
  // commonest unit slip of all (a volume answered in the wrong direction)
  // resolves to no diagnosis at all and the panel says nothing.
  //
  // `sign_convention_flip` keeps its own literal meaning: it fires only when
  // the magnitude is already right, because that is what its explanation
  // claims. A −2 ratio is a factor of two first and a sign second, and calling
  // it a convention error would send the learner to fix the wrong line.
  const scored = candidates
    .map((c) => {
      const magnitude = Math.abs(c.ratio);
      const folded = magnitude >= 1 ? magnitude : 1 / magnitude;
      const shape = shapeOfPair(c.ratio, folded, reference);
      return shape ? { c, shape, folded } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    // Tier first, deviation second: the tier is the taxonomy's precedence, and
    // a tie between two exact signatures must not depend on the order the pairs
    // happened to be crossed in.
    .sort((a, b) => a.shape.tier - b.shape.tier || a.shape.deviation - b.shape.deviation);

  const best = scored[0];
  if (!best) return null;

  const { expectedValue, learnerValue, ratio } = best.c;
  const larger = Math.max(Math.abs(expectedValue), Math.abs(learnerValue));
  const smaller = Math.min(Math.abs(expectedValue), Math.abs(learnerValue));
  const reveal = `${fmt(larger)} ÷ ${fmt(smaller)} = ${(larger / smaller).toFixed(2)}`;
  // The factor the signature was scored on, carried forward: the atom-count
  // check below asks "does a repeated element explain this factor", and asking
  // it with the un-folded ratio would make the shaped diagnoses unreachable
  // from exactly the direction the fold was added to serve.
  const factor = Math.abs(ratio) >= 1 ? Math.abs(ratio) : 1 / Math.abs(ratio);

  if (best.shape.trapId === 'sign_convention_flip') {
    return {
      trapId: 'sign_convention_flip',
      structuralReason:
        'Your magnitude is right and your sign is wrong, which is never an arithmetic slip — it is the convention being read from the wrong end. The quantity is defined as a change, and the direction of that change is part of the definition.',
      arithmeticReveal: `${reveal}, sign inverted`,
      whereItBreaks: 'the sign convention, not the arithmetic',
    };
  }

  if (best.shape.trapId === 'unit_slip') {
    return {
      trapId: 'unit_slip',
      structuralReason:
        'Your number is three orders of magnitude out, which is a conversion rather than a calculation: 1 L is 1000 mL, so a volume carried through in millilitres lands a factor of 1000 away from the one carried through in litres.',
      arithmeticReveal: reveal,
      whereItBreaks: 'the unit conversion before the ratio was taken',
    };
  }

  if (best.shape.trapId === 'logarithm_dropped') {
    const log = logSignatureOf(factor);
    const inContext = LOG_CONTEXT.test(reference);
    return {
      trapId: 'logarithm_dropped',
      structuralReason: `Your value sits exactly one logarithm-constant away from the expected one: ${fmt(factor)} is ${log?.label || 'a logarithm constant'}. That is the signature of a LOGARITHM dropped or taken in the wrong base rather than of a coefficient or a conversion, so the missing step is not arithmetic and re-reading the numbers cannot find it.${inContext ? ' The material names a log scale, so that constant belongs in this answer.' : ''}`,
      arithmeticReveal: `${reveal} ≈ ${log?.label || 'ln'}`,
      whereItBreaks: 'the logarithm, or the base it is taken in',
    };
  }

  if (best.shape.trapId === 'power_law_dropped') {
    const power = powerSignatureOf(factor);
    if (power) {
      const law = poweredSymbols(reference).find((entry) => entry.power !== '\u221a') || poweredSymbols(reference)[0];
      return {
        trapId: 'power_law_dropped',
        structuralReason: `Your value is off by exactly ${fmt(factor)}, and ${fmt(factor)} is a WHOLE POWER — ${power.base} raised to the ${power.exponent}. That is the signature of an EXPONENT rather than of a coefficient: a quantity that enters a law squared, cubed or to the fourth power produces exactly this factor when its exponent is written a step off, and no amount of re-adding the numbers reconciles it.${law ? ` The material's own notation carries ${law.power === '\u221a' ? `\u221a${law.symbol}` : `${law.symbol}${law.power}`}, so write the law with its exponent before substituting anything.` : ' Write the law with its exponent before substituting anything.'}`,
        arithmeticReveal: `${reveal}, and ${fmt(factor)} = ${power.base}^${power.exponent}`,
        whereItBreaks: 'the exponent on the quantity, not the numbers multiplied together',
      };
    }
  }

  // An atom count in the denominator explains a whole factor, whatever the whole
  // factor happens to be: the check that used to be asked only about two is asked
  // about every factor this table can name.
  const repeated = repeatedElementMatching(reference, factor);
  if (repeated) {
    return {
      trapId: 'molar_mass_denominator',
      structuralReason: `The formula carries ${repeated.count} ${repeated.element} atoms, and your denominator used ${repeated.count === 2 ? 'one' : `fewer than ${repeated.count}`}. An atom count that is dropped from the molar mass propagates into every fraction computed from it — which is why the result is off by exactly ${repeated.count}.`,
      arithmeticReveal: reveal,
      whereItBreaks: `the ${repeated.element} count in the denominator`,
    };
  }

  if (best.shape.trapId === 'whole_factor_off') {
    const whole = Math.round(factor);
    const word = NUMBER_WORDS[whole] || fmt(whole);
    return {
      trapId: 'whole_factor_off',
      structuralReason: `Your value is off by exactly a factor of ${word}, which is a coefficient or a count rather than a slip in the arithmetic. In a reaction that is not all 1:1 every mole-to-mole conversion carries the coefficient in front of its species, and a line written as though the ratio were 1:1 lands on exactly this whole factor. The same shape appears outside chemistry, wherever a whole number belongs in the definition — a valence, a charge, a multiplicity, a count per formula unit — and never made it into the line. Find the ${whole} and it will reconcile.`,
      arithmeticReveal: reveal,
      whereItBreaks: 'the whole-number factor that belongs in the line before the arithmetic',
    };
  }

  return {
    trapId: 'factor_of_two',
    structuralReason:
      'Your value is exactly a factor of two away from the expected one, which is the signature of a stoichiometric factor that was dropped rather than a slip in the arithmetic: a coefficient in front of a species, a subscript, or a factor of two inside a balanced equation. Find the 2 in the reaction and it will reconcile.',
    arithmeticReveal: reveal,
    whereItBreaks: 'the stoichiometric factor in front of the species',
  };
}

// ─── Rule: an exponent dropped from a symbolic line ─────────────────────────

/**
 * A power the material writes on a symbol that the learner's own line does not carry.
 *
 * This is the rule that exists because the extractor is chemistry-shaped. A
 * calculus answer — `f'(x) = 1 / (2√x)` — carries no element token and no
 * measured quantity, so every numeric rule above is silent on it and the panel
 * falls back to prose. The exponent IS the signal, and it is deterministic: a
 * `√x` or an `r²` in the material against a bare symbol in the answer is a
 * dropped exponent, and no pair of numbers can conceal it.
 *
 * Scoped deliberately: it fires only when the learner's line carries no measured
 * quantity at all. With numbers on both sides the numeric diff is the stronger
 * evidence — an arithmetic ratio is not overruled by a symbol match — so this
 * rule stays out of its way.
 */
/**
 * Every number in the text, subscripts excluded but coefficient-sized values kept.
 *
 * `quantityNumbers` deliberately drops a bare small integer, because a `2` in an
 * equation is a coefficient and crossing it against a `1` would manufacture a
 * factor out of nothing. The power rule needs the other half of that: a quantity
 * at 4 and at 16 is exactly the pair that names a dropped exponent, and both are
 * integral, so the measured-quantity filter hides the one case where the
 * arithmetic is unambiguous.
 */
function rawNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:\.\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const prev = match.index > 0 ? text[match.index - 1] : '';
    if (/[A-Za-z]/.test(prev)) continue; // subscript, not a quantity
    const value = Number(match[0]);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

/** `16 ÷ 4 = 4.00, and 4 = 2^2` — the division and the power it is, or ''. */
function powerReveal(learner: string, reference: string): string {
  const expectedNumbers = rawNumbers(reference);
  const learnerNumbers = rawNumbers(learner);
  for (const expected of expectedNumbers) {
    for (const learnerValue of learnerNumbers) {
      if (expected === 0 || learnerValue === 0) continue;
      const larger = Math.max(Math.abs(expected), Math.abs(learnerValue));
      const smaller = Math.min(Math.abs(expected), Math.abs(learnerValue));
      if (smaller === 0) continue;
      const folded = larger / smaller;
      const shape = powerSignatureOf(folded);
      if (!shape) continue;
      return `${fmt(larger)} ÷ ${fmt(smaller)} = ${folded.toFixed(2)}, and ${fmt(
        folded
      )} = ${shape.base}^${shape.exponent}`;
    }
  }
  return '';
}

function detectPowerOmission(learner: string, reference: string): TrapDiagnosis | null {
  if (quantityNumbers(learner).length > 0) return null;
  const powers = poweredSymbols(reference);
  if (powers.length === 0) return null;

  const learnerPowers = poweredSymbols(learner);
  for (const { symbol, power } of powers) {
    // An ASCII name is required for the word-boundary test: a Greek symbol is
    // matched against the learner's text directly.
    const name = symbol.replace(/[^A-Za-z0-9_]/g, '');
    if (!name) continue;
    // A preceding DIGIT is a boundary: in `2x` the coefficient sits flush against
    // the symbol, and a quantity that only ever appears with a coefficient in
    // front of it would otherwise never read as mentioned. Letters are not a
    // boundary in either direction, which is what keeps `H2O` from reading as a
    // mention of `H`.
    const mentioned = new RegExp(`(^|[^A-Za-z_])${name}([^A-Za-z0-9_]|$)`).test(learner);
    if (!mentioned) continue;
    if (learnerPowers.some((entry) => entry.symbol === symbol)) continue;

    const written = power === '\u221a' ? `\u221a${symbol}` : `${symbol}${power}`;
    return {
      trapId: 'power_law_dropped',
      structuralReason: `The material's own line carries ${written} and yours carries ${symbol} bare, so the exponent never made it into the substitution. A quantity that enters a law squared, cubed or under a root changes the answer as a POWER rather than by a coefficient, and re-adding the numbers cannot recover it: the law has to be written with its exponent before anything is substituted.`,
      arithmeticReveal: powerReveal(learner, reference),
      whereItBreaks: `the exponent on ${symbol}, not the numbers multiplied together`,
    };
  }
  return null;
}

// ─── Rule 7: a unit written the wrong way round ─────────────────────────────

/** A volume stated in millilitres, in either the symbol or the word form. */
const MILLILITRES_SOURCED = /\bmL\b|\bmillilit(?:er|re)s?\b/i;
/** A volume stated in litres, likewise. `\bL\b` alone, because `kJ` is not one. */
const LITRES_SOURCED = /\bL\b|\bliters?\b|\blitres?\b/i;

function detectUnitText(learner: string, reference: string): TrapDiagnosis | null {
  const learnerHasMl = MILLILITRES_SOURCED.test(learner);
  const learnerHasLitres = LITRES_SOURCED.test(learner);
  if (!learnerHasMl && !learnerHasLitres) return null;
  const referenceHasMl = MILLILITRES_SOURCED.test(reference);
  const referenceHasLitres = LITRES_SOURCED.test(reference);

  // The stage works in litres and the answer is in millilitres.
  if (learnerHasMl && !learnerHasLitres && referenceHasLitres && !referenceHasMl) {
    return {
      trapId: 'unit_slip',
      structuralReason:
        'The stage works in litres and your answer is in millilitres. The physical identity of `m` in the calorimeter is the mass of the water being heated, and a volume only becomes a mass after the millilitre conversion — so the conversion belongs before the ratio, not after it.',
      arithmeticReveal: '1000 mL ÷ 1 L = 1000',
      whereItBreaks: 'the volume conversion before the ratio was taken',
    };
  }

  // And the mirror: the stage's own numbers are in millilitres and the answer
  // was carried through in litres. The same 1000, taken the other way — and
  // without this half, a learner who divides where they should multiply reads
  // as "no signal" rather than as the conversion error it is.
  if (learnerHasLitres && !learnerHasMl && referenceHasMl && !referenceHasLitres) {
    return {
      trapId: 'unit_slip',
      structuralReason:
        'The stage measures in millilitres and you carried the volume through in litres. 1 L is 1000 mL, so a volume converted the wrong way lands exactly a factor of 1000 away — and the conversion has to happen before the ratio is taken, not after it.',
      arithmeticReveal: '1 L ÷ 1000 mL = 0.001',
      whereItBreaks: 'the volume conversion before the ratio was taken',
    };
  }

  return null;
}

/**
 * Names the structural failure behind a wrong answer, or returns null when
 * there is no clean signal to name.
 */
export function classifyTrap(input: TrapInput): TrapDiagnosis | null {
  const learner = (input?.learnerText || '').trim();
  if (!learner) return null;
  const expected = (input?.expectedText || '').trim();
  const reference = `${expected}\n${input?.sourceText || ''}`;

  return (
    detectReversedOrder(learner) ??
    detectSubscript(learner, reference) ??
    detectNumeric(learner, expected, reference) ??
    // The symbolic line the numeric diff cannot read at all: no measured
    // quantity on the learner's side means there is nothing to cross, and the
    // exponent the material writes is then the only evidence there is.
    detectPowerOmission(learner, reference) ??
    detectUnitText(learner, reference)
  );
}

/** The trap a diagnosis names, for logging and tests. */
export function trapIdOf(diagnosis: TrapDiagnosis | null): TrapId | null {
  return diagnosis ? diagnosis.trapId : null;
}
