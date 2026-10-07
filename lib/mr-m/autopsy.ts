// ─── Mr M mode: the diagnostic error autopsy (the discrepancy diff) ─────────
//
// The autopsy answers a different question from the trap taxonomy. `classifyTrap`
// answers "which structural rule did this answer break?"; this module answers
// "which line of the mental compiler threw the exception, and what does the
// arithmetic look like when you hold both numbers side by side?"
//
// The plan's requirement is absolute and it is the reason this file exists:
// ARITHMETIC IS NEVER ASKED OF A MODEL. A ratio is a fact. `0.0336 ÷ 0.0168 =
// 2.00` is computed here, in TypeScript, from the learner's own numbers — so
// the figure on screen cannot be wrong, and the narrative half (written by the
// model, in `app/api/autopsy/route.ts`) is shown as the reading rather than as
// the evidence. That split is the same one `TrapAutopsy` already draws between
// its computed reveal and the examiner's sentence.
//
// The diff is deliberately two-layered:
//
//   1. the STRUCTURAL layer, which is `classifyTrap` — the operand order, the
//      dropped subscript, the unit written the wrong way round. These fire on
//      text, and they are the strongest signal, so they are tried first;
//   2. the NUMERIC layer, which is this module's own contribution: pair every
//      quantity in the expected answer against every quantity the learner
//      wrote, fold the ratio so a factor of two reads as 2 from either
//      direction, and name the shape. The vocabulary is arithmetic, not
//      chemistry: a pure sign inversion, a factor of two, any whole factor from
//      three to twelve, a whole power of a small number (an exponent that was
//      dropped), one of the logarithm constants, or three orders of magnitude.
//
// Anything that survives neither layer returns null. An invented diagnosis is
// exactly the arbitrary noise this mode exists to remove, so "no clean signal"
// is a real answer and the panel says nothing. One class of error is left to
// the prose on purpose: an integration constant is not a ratio, so no pair of
// numbers can name it and this layer does not pretend to.

import { atomsOf, classifyTrap, formulaTokens, quantityNumbers } from './diagnostics';
import { describeParsonsFix, gradeParsons, type ParsonsTile } from '../parsons';
import type {
  DiscrepancyKind,
  TrapDiagnosis,
  TrapId,
  TrapInput,
} from './types';

/** One expected/learner pair, with the ratio that connects them. */
export interface QuantityDiff {
  expected: number;
  learner: number;
  /** `expected / learner`, signed and exact. */
  ratio: number;
  /** `|ratio|` folded so a factor of two reads as `2` from either direction. */
  folded: number;
}

/** The deterministic reading of one wrong answer. */
export interface DiscrepancyReading {
  kind: DiscrepancyKind;
  /**
   * The trap taxonomy's id, when one honestly names the same failure.
   *
   * Every kind this diff can name now has a member that claims it —
   * `whole_factor_off`, `power_law_dropped` and `logarithm_dropped` were added
   * to the taxonomy for exactly the shapes that used to resolve to nothing —
   * and the field stays nullable because a future kind without an honest label
   * must be allowed to say so rather than be rounded onto the nearest one: a
   * factor of three called `factor_of_two` sends the learner to fix a 2 that is
   * actually a 3.
   */
  trapId: TrapId | null;
  structuralReason: string;
  /** The arithmetic that exposes it, e.g. `0.0336 ÷ 0.0168 = 2.00`. */
  arithmeticReveal: string;
  whereItBreaks: string;
  /** Every pair the diff considered, best-fitting first. May be empty. */
  terms: QuantityDiff[];
  /** Which layer named it: the structural rules, or the numeric diff. */
  origin: 'structural' | 'numeric';
}

/** The trap taxonomy → the discrepancy vocabulary, where an honest match exists. */
const TRAP_TO_KIND: Partial<Record<TrapId, DiscrepancyKind>> = {
  reversed_order: 'ORDER_INVERSION',
  sign_convention_flip: 'SIGN_FLIP',
  factor_of_two: 'FACTOR_OF_TWO',
  molar_mass_denominator: 'SUBSCRIPT_DROPPED',
  missing_subscript: 'SUBSCRIPT_DROPPED',
  unit_slip: 'DIMENSIONAL_CONVERSION_ERROR',
  whole_factor_off: 'STOICHIOMETRIC_RATIO',
  power_law_dropped: 'POWER_LAW',
  logarithm_dropped: 'LOG_SCALE',
};

/** The reverse direction, for a shape the numeric layer found first. */
const KIND_TO_TRAP: Partial<Record<DiscrepancyKind, TrapId>> = {
  SIGN_FLIP: 'sign_convention_flip',
  ORDER_INVERSION: 'reversed_order',
  FACTOR_OF_TWO: 'factor_of_two',
  SUBSCRIPT_DROPPED: 'missing_subscript',
  DIMENSIONAL_CONVERSION_ERROR: 'unit_slip',
  STOICHIOMETRIC_RATIO: 'whole_factor_off',
  POWER_LAW: 'power_law_dropped',
  LOG_SCALE: 'logarithm_dropped',
};

function fmt(n: number): string {
  return String(n);
}

function near(a: number, b: number, tolerance: number): boolean {
  if (b === 0) return Math.abs(a) < tolerance;
  return Math.abs(a - b) / Math.abs(b) <= tolerance;
}

/**
 * Folds a ratio onto its magnitude, so a learner who answered twice the
 * expected value and one who answered half of it are the same fracture seen
 * from two ends. Without the fold, half of every signature here is invisible.
 */
export function foldRatio(ratio: number): number {
  const magnitude = Math.abs(ratio);
  if (magnitude === 0) return 0;
  return magnitude >= 1 ? magnitude : 1 / magnitude;
}

/** How close a folded ratio is to a signature, as an absolute deviation. */
function deviationFromFold(folded: number, target: number): number {
  return Math.abs(folded - target);
}

// ─── The signature set ──────────────────────────────────────────────────────
//
// Everything in this section is arithmetic shape, and the shapes are the point:
// each one has a different structural cause, so naming the shape is what lets
// the narrative half explain it instead of describing it.

/** How far a folded ratio may sit from a whole factor before it is something else. */
const INTEGER_TOLERANCE = 0.03;

/** Above this a "coefficient" is really an outlier, and the layer stays silent. */
const MAX_INTEGER_FACTOR = 12;

/** The whole factors spoken as words, so a refusal reads like a sentence. */
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

export interface PowerSignature {
  base: number;
  exponent: number;
}

/**
 * The whole powers worth naming, smallest base first.
 *
 * 4 = 2², 8 = 2³, 9 = 3², 16 = 2⁴, 25 = 5², 27 = 3³, 32 = 2⁵, 64 = 4³, 81 = 3⁴,
 * 125 = 5³, 243 = 3⁵. Above these the claim stops being diagnostic — a factor
 * of 37 is a coefficient, not an exponent — and the smallest base is tried first
 * because `16 = 2⁴` is how a learner reads it, not `16 = 4²`.
 */
const POWER_SIGNATURES: PowerSignature[] = [
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

interface LogSignature {
  /** The constant, folded onto the magnitude the way every ratio here is. */
  folded: number;
  label: string;
  /** Where the constant comes from, so the refusal is not a bare number. */
  blurb: string;
}

/**
 * The two logarithm constants a wrong answer lands on.
 *
 * Only the folded forms are listed, because every ratio in this module is
 * folded: ln 2 = 0.6931 and 1 / ln 2 = 1.4427 are the same fracture seen from
 * two ends, and the fold has already chosen one of them.
 */
const LOG_SIGNATURES: LogSignature[] = [
  {
    folded: 1.4427,
    label: '1 / ln 2',
    blurb: 'ln 2 = 0.6931 is the constant a half-life or a doubling time carries',
  },
  {
    folded: 2.3026,
    label: 'ln 10',
    blurb: 'ln 10 = 2.3026 is the bridge between a base-10 scale and a natural-exponential law',
  },
];

/** A logarithm, or a scale built on one, is in play in the material. */
const LOG_CONTEXT = /\b(ln|log|log10|half[- ]?life|decay constant|doubling time|pKa?|pH|decibel|dB)\b/i;

/** True when the material names a logarithm or a scale built on one. */
export function hasLogContext(text: string): boolean {
  return LOG_CONTEXT.test(text || '');
}

const SUPERSCRIPT_DIGITS = '²³⁴⁵⁶⁷⁸⁹';

/**
 * Every exponent the material writes ON a symbol: `r²` → 2, `r^4` → 4, `x³` → 3.
 *
 * Only an exponent attached to a symbol counts. A bare superscript is a footnote,
 * and treating it as a power would let any sentence manufacture the evidence that
 * turns a dropped coefficient into a dropped exponent.
 */
export function exponentsIn(text: string): number[] {
  const out: number[] = [];
  const re = /[A-Za-zΔθλρ][A-Za-z0-9_]*(?:\^([0-9]{1,2})|([²³⁴⁵⁶⁷⁸⁹]))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text || '')) !== null) {
    const value = match[2] ? SUPERSCRIPT_DIGITS.indexOf(match[2]) + 2 : Number(match[1]);
    if (Number.isFinite(value) && value >= 2) out.push(value);
  }
  return out;
}

/** The first exponent written on a symbol in the material, exactly as written. */
export function powerLawIn(text: string): string {
  const match = (text || '').match(/[A-Za-zΔθλρ][A-Za-z0-9_]*(?:\^[0-9]{1,2}|[²³⁴⁵⁶⁷⁸⁹])/);
  return match ? match[0].replace(/\s+/g, '') : '';
}

/**
 * Whether the material writes an exponent at all.
 *
 * A power law in the material (`r²`, `r^4`, a squared quantity) is what makes a
 * whole-power ratio an EXPONENT problem; with no law in sight, the same number
 * is read the conservative way, as a dropped coefficient. The check deliberately
 * does not try to match the exponent: a ratio of 4 against a fourth-power law is
 * the third power of the variable, not the fourth, and pretending to know which
 * power went missing from a single ratio is the inference this module refuses to
 * make. So it asks only whether a law is present — and it reads that from an
 * exponent token, never from a bare superscript that could be a footnote.
 */
export function hasPowerLawEvidence(text: string): boolean {
  const body = text || '';
  if (exponentsIn(body).length > 0) return true;
  return /\b(squared|square of|quadratic|cubed|cube of|cubic)\b/i.test(body);
}

/** The whole power a folded ratio sits on, smallest base first. */
function powerSignatureOf(folded: number): PowerSignature | null {
  for (const signature of POWER_SIGNATURES) {
    if (near(folded, Math.pow(signature.base, signature.exponent), 0.02)) return signature;
  }
  return null;
}

/** The logarithm constant a folded ratio sits on. */
function logSignatureOf(folded: number): LogSignature | null {
  for (const signature of LOG_SIGNATURES) {
    if (near(folded, signature.folded, 0.02)) return signature;
  }
  return null;
}

/**
 * The whole factor a folded ratio sits on, when it is one worth naming.
 *
 * Starts at three because two has its own name and its own explanation — an atom
 * count is the commonest cause of exactly two, and calling that a coefficient
 * would send the learner to the wrong line.
 */
export function integerFactorOf(folded: number): number | null {
  const rounded = Math.round(folded);
  if (rounded < 3 || rounded > MAX_INTEGER_FACTOR) return null;
  return near(folded, rounded, INTEGER_TOLERANCE) ? rounded : null;
}

/** What the material tells us about the law an answer came from. */
export interface SignatureContext {
  /** The expected answer plus the stage's source text. */
  text?: string;
}

/** A named shape, with the tier that decides precedence between two candidates. */
export interface ShapeMatch {
  kind: DiscrepancyKind;
  tier: number;
  score: number;
}

/**
 * The one place a folded ratio becomes a named shape.
 *
 * `rankTerms` and `signatureOf` both read from here, so the ranking and the name
 * can never disagree about what a pair is — a table duplicated across two
 * functions is a table that eventually says two different things about one
 * number.
 *
 * The order of the checks is the taxonomy's precedence, and two of them are
 * contextual rather than numeric:
 *
 *   * a whole power WITH exponent evidence is an exponent problem; the same
 *     number without that evidence is read the conservative way, as a dropped
 *     coefficient. `4` is both, and only the material says which;
 *   * a whole power with no evidence at all (16, 32, 243) is still named, but
 *     below the coefficient tier, because a factor nobody wrote down is more
 *     often a coefficient than an exponent.
 */
export function shapeOf(term: QuantityDiff, context: SignatureContext = {}): ShapeMatch | null {
  if (!term || !Number.isFinite(term.folded) || term.folded <= 0) return null;

  if (term.ratio < 0 && near(term.folded, 1, 0.02)) {
    return { kind: 'SIGN_FLIP', tier: 0, score: 0 };
  }
  if (near(term.folded, 2, INTEGER_TOLERANCE)) {
    return { kind: 'FACTOR_OF_TWO', tier: 1, score: deviationFromFold(term.folded, 2) };
  }
  const log = logSignatureOf(term.folded);
  if (log) {
    return { kind: 'LOG_SCALE', tier: 1, score: deviationFromFold(term.folded, log.folded) };
  }
  if (near(term.folded, 1000, 0.05)) {
    return {
      kind: 'DIMENSIONAL_CONVERSION_ERROR',
      tier: 1,
      score: deviationFromFold(term.folded, 1000),
    };
  }

  const power = powerSignatureOf(term.folded);
  if (power && hasPowerLawEvidence(context.text || '')) {
    return {
      kind: 'POWER_LAW',
      tier: 2,
      score: deviationFromFold(term.folded, Math.pow(power.base, power.exponent)),
    };
  }

  const integer = integerFactorOf(term.folded);
  if (integer !== null) {
    return { kind: 'STOICHIOMETRIC_RATIO', tier: 2, score: deviationFromFold(term.folded, integer) };
  }

  if (power) {
    return {
      kind: 'POWER_LAW',
      tier: 3,
      score: deviationFromFold(term.folded, Math.pow(power.base, power.exponent)),
    };
  }

  return null;
}

/** Every crossed pair of measured quantities. Subscripts and coefficients are
 * excluded upstream by `quantityNumbers`, so `2 H₂O` cannot manufacture a
 * factor of two out of nothing. */
export function crossedTerms(learnerText: string, expectedText: string): QuantityDiff[] {
  const expectedNumbers = quantityNumbers(expectedText);
  const learnerNumbers = quantityNumbers(learnerText);
  if (expectedNumbers.length === 0 || learnerNumbers.length === 0) return [];

  const terms: QuantityDiff[] = [];
  for (const expected of expectedNumbers) {
    for (const learner of learnerNumbers) {
      if (expected === 0 || learner === 0) continue;
      const ratio = expected / learner;
      terms.push({ expected, learner, ratio, folded: foldRatio(ratio) });
    }
  }
  return terms;
}

/**
 * Ranks the pairs so the one that actually explains the failure leads.
 *
 * A pair is scored by how close its folded ratio sits to a real signature; a
 * pair that names nothing is dropped rather than shown, because a diff table of
 * forty unrelated pairs is noise, not an autopsy.
 *
 * A sign inversion (right magnitude, wrong sign) is a TIER above every
 * magnitude shape rather than merely a low score within it. Both are exact
 * matches for their own signature, so a pure score comparison leaves a genuine
 * sign flip and a genuine whole factor tied at zero deviation — and which one
 * won would depend on the order the pairs happened to be crossed in. The tier
 * makes the precedence a property of the taxonomy instead.
 */
export function rankTerms(terms: QuantityDiff[], context: SignatureContext = {}): QuantityDiff[] {
  const scored = terms
    .map((term) => {
      const shape = shapeOf(term, context);
      return shape ? { term, tier: shape.tier, score: shape.score } : null;
    })
    .filter((entry): entry is { term: QuantityDiff; tier: number; score: number } => entry !== null)
    .sort((a, b) => a.tier - b.tier || a.score - b.score);

  return scored.map((entry) => entry.term);
}

/** The signature a ranked pair carries, or null when it carries none. */
export function signatureOf(
  term: QuantityDiff,
  context: SignatureContext = {}
): DiscrepancyKind | null {
  return shapeOf(term, context)?.kind ?? null;
}

/** `6 ÷ 3 = 2.00`, from the learner's own numbers, both directions folded. */
function magnitudeReveal(term: QuantityDiff): string {
  const larger = Math.max(Math.abs(term.expected), Math.abs(term.learner));
  const smaller = Math.min(Math.abs(term.expected), Math.abs(term.learner));
  if (smaller === 0) return '';
  return `${fmt(larger)} ÷ ${fmt(smaller)} = ${(larger / smaller).toFixed(2)}`;
}

/** `0.0336 ÷ -0.0336 = -1.00` — the sign made unmissable, because that IS the finding. */
function signReveal(term: QuantityDiff): string {
  if (term.learner === 0) return '';
  return `${fmt(term.expected)} ÷ ${fmt(term.learner)} = ${(term.ratio).toFixed(2)}`;
}

/** A repeated element in the source whose count would explain a factor of two. */
function repeatedElementIn(text: string): { element: string; count: number } | null {
  for (const token of formulaTokens(text)) {
    for (const [element, count] of Array.from(atomsOf(token).entries())) {
      if (count >= 2) return { element, count };
    }
  }
  return null;
}

// ─── The numeric layer's sentences ──────────────────────────────────────────

function numericFinding(
  kind: DiscrepancyKind,
  term: QuantityDiff,
  sourceText: string
): { structuralReason: string; arithmeticReveal: string; whereItBreaks: string } | null {
  switch (kind) {
    case 'SIGN_FLIP':
      return {
        structuralReason:
          'Your magnitude is right and your sign is wrong. That is never an arithmetic slip — it is the convention being read from the wrong end, and the quantity is defined as a change, so the direction of the change is part of the definition rather than a detail of the arithmetic.',
        arithmeticReveal: signReveal(term),
        whereItBreaks: 'the sign convention, not the arithmetic',
      };
    case 'FACTOR_OF_TWO': {
      const repeated = repeatedElementIn(sourceText);
      if (repeated) {
        return {
          structuralReason: `The material carries ${repeated.count} ${repeated.element} per formula unit and your line used one. An atom count dropped from a formula propagates into every fraction computed from it, which is why the result is off by exactly ${repeated.count}.`,
          arithmeticReveal: magnitudeReveal(term),
          whereItBreaks: `the ${repeated.element} count in the formula`,
        };
      }
      return {
        structuralReason:
          'Your value is exactly a factor of two from the one that holds, which is the signature of a stoichiometric factor that was dropped rather than a slip in the arithmetic: a coefficient in front of a species, a subscript, or a factor of two inside a balanced equation. Find the 2 and it reconciles.',
        arithmeticReveal: magnitudeReveal(term),
        whereItBreaks: 'the stoichiometric factor in front of the species',
      };
    }
    case 'STOICHIOMETRIC_RATIO': {
      // The factor itself is carried into the sentence, because "a factor of
      // three" is wrong prose for a factor of seven and the learner can check
      // the number against their own line either way.
      const factor = Math.round(term.folded);
      const word = NUMBER_WORDS[factor] ?? fmt(factor);
      return {
        structuralReason: `Your value is off by exactly a factor of ${word}, which is a coefficient or a count rather than a calculation. In a balanced equation that is not all 1:1 — 3 A + 2 B → products — every mole-to-mole conversion carries the coefficient in front of its species, and a line written as though the ratio were 1:1 lands on exactly this whole factor. The same shape appears outside chemistry, wherever a whole number belongs in the definition (a valence, a charge, a multiplicity, a count per formula unit) and never made it into the line.`,
        arithmeticReveal: magnitudeReveal(term),
        whereItBreaks: 'the whole-number factor that belongs in the line before the arithmetic',
      };
    }
    case 'POWER_LAW': {
      const power = powerSignatureOf(term.folded);
      if (!power) return null;
      const law = powerLawIn(sourceText);
      return {
        structuralReason: `Your value is exactly ${fmt(term.folded)} times the other one, and ${fmt(term.folded)} is a WHOLE POWER — ${power.base} raised to the ${power.exponent}. That is the signature of an EXPONENT rather than of a coefficient: a quantity that enters a law squared, cubed or to the fourth power produces exactly this kind of factor when its exponent is written one step off, and no amount of re-adding the numbers reconciles it.${law ? ` The material's own law carries ${law}.` : ''} Read the exponent on every quantity in the law before substituting anything.`,
        arithmeticReveal: `${magnitudeReveal(term)}, and ${fmt(term.folded)} = ${power.base}^${power.exponent}`,
        whereItBreaks: 'the exponent on the quantity, not the numbers multiplied together',
      };
    }
    case 'LOG_SCALE': {
      const log = logSignatureOf(term.folded);
      if (!log) return null;
      const context = hasLogContext(sourceText);
      return {
        structuralReason: `Your value sits exactly one logarithm-constant away from the one that holds: ${fmt(term.folded)} is ${log.label}, and ${log.blurb}. That is the signature of a LOGARITHM dropped or taken in the wrong base — not of a coefficient and not of a conversion — so the missing step is not arithmetic and re-reading the numbers cannot find it.${context ? ' The material names a log scale, so that constant belongs in this answer.' : ''}`,
        arithmeticReveal: `${magnitudeReveal(term)} ≈ ${log.label}`,
        whereItBreaks: 'the logarithm, or the base it is taken in',
      };
    }
    case 'DIMENSIONAL_CONVERSION_ERROR':
      return {
        structuralReason:
          'Your number is three orders of magnitude out, which is a conversion rather than a calculation: 1 L is 1000 mL, and 1 kJ is 1000 J. A quantity carried through in the wrong unit lands a factor of 1000 away from the one carried through in the right one, and the conversion belongs before the ratio.',
        arithmeticReveal: magnitudeReveal(term),
        whereItBreaks: 'the unit conversion before the ratio was taken',
      };
    case 'ORDER_INVERSION':
      return {
        structuralReason:
          'The quantities are right and the order is reversed — you subtracted the destination from the origin. Every definition of a change has an order, and reversing it inverts the sign of the whole answer while leaving the magnitude intact.',
        arithmeticReveal: signReveal(term),
        whereItBreaks: 'the order of the two terms, not the arithmetic',
      };
    case 'SUBSCRIPT_DROPPED':
      return null;
    default:
      return null;
  }
}

/** The best pair that is a pure sign inversion: right magnitude, wrong sign. */
export function signTermOf(terms: QuantityDiff[]): QuantityDiff | null {
  return terms.find((term) => term.ratio < 0 && near(term.folded, 1, 0.02)) ?? null;
}

// ─── The entry point ────────────────────────────────────────────────────────

/**
 * Names the micro-fracture behind one wrong answer, or returns null when there
 * is no clean structural or numeric signal to name.
 *
 * Structural first, numeric second, and the structural reading always wins when
 * both fire: the operand-order text (`reactants − products`) is a statement the
 * learner wrote on purpose, while a numeric ratio is an inference from the
 * numbers, and the deliberate statement is the stronger evidence.
 */
export function diagnoseDiscrepancy(input: TrapInput): DiscrepancyReading | null {
  const learnerText = (input?.learnerText || '').trim();
  if (!learnerText) return null;
  const expectedText = (input?.expectedText || '').trim();
  const sourceText = `${expectedText}\n${input?.sourceText || ''}`;

  // The material travels with the terms: whether a factor of four is a dropped
  // coefficient or a dropped exponent is decided by the law the answer came
  // from, and by nothing in the pair of numbers.
  const terms = rankTerms(crossedTerms(learnerText, expectedText), { text: sourceText });

  const structural: TrapDiagnosis | null = classifyTrap(input);
  if (structural) {
    const kind = TRAP_TO_KIND[structural.trapId];
    if (kind) {
      const signTerm = kind === 'SIGN_FLIP' ? signTermOf(terms) : null;
      return {
        kind,
        trapId: structural.trapId,
        structuralReason: structural.structuralReason,
        // The taxonomy's own reveal for a sign flip is written from MAGNITUDES
        // (`0.0336 ÷ 0.0336 = 1.00, sign inverted`), which is correct for the
        // trap label and wrong for a sign autopsy: the finding IS the sign, and
        // an arithmetic line that shows `1.00` invites the learner to check a
        // number that agrees with them. When this module's own diff found the
        // signed pair, the signed division is what gets shown.
        arithmeticReveal: signTerm ? signReveal(signTerm) : structural.arithmeticReveal,
        whereItBreaks: structural.whereItBreaks,
        terms,
        origin: 'structural',
      };
    }
  }

  const best = terms[0];
  if (!best) return null;
  const kind = signatureOf(best, { text: sourceText });
  if (!kind) return null;

  const finding = numericFinding(kind, best, sourceText);
  if (!finding) return null;

  return {
    kind,
    trapId: KIND_TO_TRAP[kind] ?? null,
    structuralReason: finding.structuralReason,
    arithmeticReveal: finding.arithmeticReveal,
    whereItBreaks: finding.whereItBreaks,
    terms,
    origin: 'numeric',
  };
}

/**
 * The structural reading of an ORDERING drill — the Parsons chain, and any
 * other template whose canonical order the app knows.
 *
 * The numeric diff cannot reach this one, and that is by design rather than by
 * omission: a scrambled chain carries no arithmetic, so `diagnoseDiscrepancy`
 * finds no pair of numbers and says nothing. That silence is right for a diff
 * and wrong for a learner who has just put every step of the mechanism on the
 * page in the wrong order.
 *
 * Here nothing has to be inferred. Both orders are in hand — the canonical one
 * came from the examiner, the learner's one is what they placed — so the
 * fracture is MEASURED, and it is always the same fracture: every step is
 * present and only the order the material physically forces is wrong. That is
 * `ORDER_INVERSION` and nothing else. Learning gains from a Parsons problem come
 * from the structure, so the record worth keeping is the structural one.
 *
 * Returns null when the order is right, when either side is empty, and when the
 * two describe different chains (a length mismatch is a payload problem, not a
 * fracture — naming one from it would be exactly the invented diagnosis this
 * layer exists to refuse).
 */
export function diagnoseSequence(input: {
  /** The learner's own order, as ids into `canonical`. */
  submitted: string[];
  /** The canonical order, in the order the material forces. */
  canonical: string[];
  /** Display text per CANONICAL index, for the reveal line. */
  labels: string[];
}): DiscrepancyReading | null {
  const submitted = Array.isArray(input?.submitted) ? input.submitted : [];
  const canonical = Array.isArray(input?.canonical) ? input.canonical : [];
  if (submitted.length === 0 || canonical.length === 0) return null;
  if (submitted.length !== canonical.length) return null;

  // Positional grading is the drill's own, reused rather than re-derived: two
  // implementations of "which link is wrong" would eventually point at
  // different links, and the learner would be told to fix a step the drill had
  // already accepted.
  const grade = gradeParsons(submitted, canonical);
  if (grade.correct) return null;

  const labels = Array.isArray(input?.labels) ? input.labels : [];
  const tiles: ParsonsTile[] = canonical.map((id, index) => ({
    id,
    text: labels[index] || id,
  }));
  // The library's own sentence names the misplaced step and what must precede
  // it, so the reveal stays causal instead of "try again".
  const moved = describeParsonsFix(submitted, tiles);
  const firstWrong = grade.firstWrongIndex ?? 0;

  return {
    kind: 'ORDER_INVERSION',
    trapId: 'reversed_order',
    structuralReason:
      'Every step of the mechanism is on the page and the order is wrong, which is an ordering failure rather than a missing fact: there is no number to re-add and no definition to look up, because the links are all present and the sequence the physics forces is the thing that broke. Read the chain as a chain — what must be true before each step can happen — and the misplaced link is the one whose precondition is not yet met.',
    arithmeticReveal: moved || `step ${firstWrong + 1} is not in the position the chain forces`,
    whereItBreaks: 'the causal order, not any single step',
    // Empty on purpose: this reading is structural, and there is no pair of
    // numbers here to pretend to a ratio about.
    terms: [],
    origin: 'structural',
  };
}

/**
 * The one-line engineering patch a fracture becomes, in the shape the plan
 * asks for: what to do differently next time, on this topic.
 *
 * Deliberately a scaffold and not a lesson — it is written to be EDITED. The
 * learner's own wording is what gets stored, because a patch in someone else's
 * words is a rule to memorise and a patch in their own is a change to make.
 */
export function patchStatementFor(reading: DiscrepancyReading, topic: string): string {
  const scope = (topic || '').trim() || 'This topic';
  switch (reading.kind) {
    case 'SIGN_FLIP':
      return `${scope} — the sign was read from the wrong end. Anchor the convention before the arithmetic${
        reading.arithmeticReveal ? ` (${reading.arithmeticReveal})` : ''
      }.`;
    case 'ORDER_INVERSION':
      return `${scope} — the order was reversed. Write the definition in its defined order first, then substitute.`;
    case 'FACTOR_OF_TWO':
      return `${scope} — a factor of two was dropped. Find the 2 (coefficient or subscript) in the equation before converting moles.`;
    case 'STOICHIOMETRIC_RATIO':
      return `${scope} — the coefficients are not all 1:1. Carry each species' own coefficient through every mole-to-mole conversion.`;
    case 'POWER_LAW':
      return `${scope} — an exponent was dropped or added. Write the law with its powers (squared, cubed, to the fourth) before substituting any number.`;
    case 'LOG_SCALE':
      return `${scope} — a logarithm is missing or in the wrong base. Name the constant (ln 2, ln 10) and the scale it belongs to before the arithmetic.`;
    case 'SUBSCRIPT_DROPPED':
      return `${scope} — an atom count was dropped. Read the subscript before computing a molar mass.`;
    case 'DIMENSIONAL_CONVERSION_ERROR':
      return `${scope} — a unit conversion is missing. Convert (mL→L, J→kJ) before the ratio, never after it.`;
    default:
      return `${scope} — a structural fracture was recorded.`;
  }
}
