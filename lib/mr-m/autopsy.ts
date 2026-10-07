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
//      direction, and name the shape (2, 3, 1000, or a pure sign inversion).
//
// Anything that survives neither layer returns null. An invented diagnosis is
// exactly the arbitrary noise this mode exists to remove, so "no clean signal"
// is a real answer and the panel says nothing.

import { atomsOf, classifyTrap, formulaTokens, quantityNumbers } from './diagnostics';
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
   * The existing trap taxonomy's id, when one honestly names the same failure.
   * `STOICHIOMETRIC_RATIO` has no member that claims it, so it carries none —
   * rounding it onto `factor_of_two` would send the learner to fix a 2 that is
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
};

/** The reverse direction, for a shape the numeric layer found first. */
const KIND_TO_TRAP: Partial<Record<DiscrepancyKind, TrapId>> = {
  SIGN_FLIP: 'sign_convention_flip',
  ORDER_INVERSION: 'reversed_order',
  FACTOR_OF_TWO: 'factor_of_two',
  SUBSCRIPT_DROPPED: 'missing_subscript',
  DIMENSIONAL_CONVERSION_ERROR: 'unit_slip',
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
 * sign flip and a genuine factor of three tied at zero deviation — and which
 * one won would depend on the order the pairs happened to be crossed in. The
 * tier makes the precedence a property of the taxonomy instead.
 */
export function rankTerms(terms: QuantityDiff[]): QuantityDiff[] {
  const scored = terms
    .map((term) => {
      if (term.ratio < 0 && near(term.folded, 1, 0.02)) {
        return { term, tier: 0, score: 0 };
      }
      if (near(term.folded, 2, 0.03)) {
        return { term, tier: 1, score: deviationFromFold(term.folded, 2) };
      }
      if (near(term.folded, 3, 0.03)) {
        return { term, tier: 1, score: deviationFromFold(term.folded, 3) };
      }
      if (near(term.folded, 1000, 0.05)) {
        return { term, tier: 1, score: deviationFromFold(term.folded, 1000) };
      }
      return null;
    })
    .filter((entry): entry is { term: QuantityDiff; tier: number; score: number } => entry !== null)
    .sort((a, b) => a.tier - b.tier || a.score - b.score);

  return scored.map((entry) => entry.term);
}

/** The signature a ranked pair carries, or null when it carries none. */
export function signatureOf(term: QuantityDiff): DiscrepancyKind | null {
  if (term.ratio < 0 && near(term.folded, 1, 0.02)) return 'SIGN_FLIP';
  if (near(term.folded, 2, 0.03)) return 'FACTOR_OF_TWO';
  if (near(term.folded, 3, 0.03)) return 'STOICHIOMETRIC_RATIO';
  if (near(term.folded, 1000, 0.05)) return 'DIMENSIONAL_CONVERSION_ERROR';
  return null;
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
    case 'STOICHIOMETRIC_RATIO':
      return {
        structuralReason:
          'Your value is off by exactly a factor of three, which is a coefficient, not a calculation. When the balanced equation is not all 1:1 — 3 A + 2 B → products — every mole-to-mole conversion carries the coefficient in front of the species, and a line written as though the ratio were 1:1 lands on exactly this ratio.',
        arithmeticReveal: magnitudeReveal(term),
        whereItBreaks: 'the coefficient in front of the species in the balanced equation',
      };
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

  const terms = rankTerms(crossedTerms(learnerText, expectedText));

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
  const kind = signatureOf(best);
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
    case 'SUBSCRIPT_DROPPED':
      return `${scope} — an atom count was dropped. Read the subscript before computing a molar mass.`;
    case 'DIMENSIONAL_CONVERSION_ERROR':
      return `${scope} — a unit conversion is missing. Convert (mL→L, J→kJ) before the ratio, never after it.`;
    default:
      return `${scope} — a structural fracture was recorded.`;
  }
}
