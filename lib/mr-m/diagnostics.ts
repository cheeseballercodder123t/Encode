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
      const shape = magnitude >= 1 ? magnitude : 1 / magnitude;
      if (near(shape, 2, 0.03)) return { c, target: 2, deviation: Math.abs(shape - 2) };
      if (near(shape, 1000, 0.05)) return { c, target: 1000, deviation: Math.abs(shape - 1000) };
      if (c.ratio < 0 && near(magnitude, 1, 0.02)) {
        return { c, target: -1, deviation: Math.abs(magnitude - 1) };
      }
      return null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.deviation - b.deviation);

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

  if (best.target === -1) {
    return {
      trapId: 'sign_convention_flip',
      structuralReason:
        'Your magnitude is right and your sign is wrong, which is never an arithmetic slip — it is the convention being read from the wrong end. The quantity is defined as a change, and the direction of that change is part of the definition.',
      arithmeticReveal: `${reveal}, sign inverted`,
      whereItBreaks: 'the sign convention, not the arithmetic',
    };
  }

  if (best.target === 1000) {
    return {
      trapId: 'unit_slip',
      structuralReason:
        'Your number is three orders of magnitude out, which is a conversion rather than a calculation: 1 L is 1000 mL, so a volume carried through in millilitres lands a factor of 1000 away from the one carried through in litres.',
      arithmeticReveal: reveal,
      whereItBreaks: 'the unit conversion before the ratio was taken',
    };
  }

  // Ratio of 2 (or ½). The cause is either an atom count in the denominator or
  // an unaccounted stoichiometric factor — and the reference formula says which.
  const repeated = repeatedElementMatching(reference, factor);
  if (repeated) {
    return {
      trapId: 'molar_mass_denominator',
      structuralReason: `The formula carries ${repeated.count} ${repeated.element} atoms, and your denominator used ${repeated.count === 2 ? 'one' : `fewer than ${repeated.count}`}. An atom count that is dropped from the molar mass propagates into every fraction computed from it — which is why the result is off by exactly ${repeated.count}.`,
      arithmeticReveal: reveal,
      whereItBreaks: `the ${repeated.element} count in the denominator`,
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
    detectUnitText(learner, reference)
  );
}

/** The trap a diagnosis names, for logging and tests. */
export function trapIdOf(diagnosis: TrapDiagnosis | null): TrapId | null {
  return diagnosis ? diagnosis.trapId : null;
}
