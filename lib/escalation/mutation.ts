// ─── The constraint-mutation matrix ─────────────────────────────────────────
//
// Homework platforms mutate the NUMBERS: 5.0 g becomes 7.2 g, everything else
// identical. That tests arithmetic, not comprehension — the learner who
// memorised the procedure passes and the learner who understood the mechanism
// gains nothing.
//
// Mutating a BOUNDARY CONDITION is a different operation. Send the reaction to
// completion in a sealed flask and the solution's density stops mattering; give
// the same reaction a frictionless piston and the gas now does work on the
// surroundings; let the exotherm reach the solvent's boiling point and a latent
// heat plateau appears mid-calculation. The algebra is the same; the set of
// moves that gets to the answer is not.
//
// The three tiers are this repo's answer to "how do you make a harder problem
// honestly harder":
//
//   Tier 1  Ideal baseline — 1:1 stoichiometry, one liquid phase, d = 1.00 g/mL
//   Tier 2  Asymmetric — unequal coefficients, non-unit density, the
//           mass-of-solute vs mass-of-solution trap in q = mcΔT
//   Tier 3  Phase hell — a solid plus an aqueous reactant, an insoluble gas
//           doing work against atmospheric pressure, and a latent-heat plateau
//
// The part that is deliberately NOT left to the model is the VERDICT. A mutated
// problem is only worth asking if it actually carries its tier's boundary
// conditions — a "Tier 3" without a latent-heat term is a Tier 1 problem wearing
// a harder label, and the learner would be told they solved something harder
// than they did. So `tierChecks` reads the generated problem back and refuses
// one that does not carry them.
//
// What these checks are, stated honestly: they are textual gates over the
// generated statement, not proofs. A statement that dresses a latent heat term
// in words the vocabulary does not know will be refused even though it is fine
// — and that is the right direction to fail in. A refused variant costs one
// regeneration; a mislabelled one teaches the learner to distrust the label.

import type { MutationTierSpec, MutationTier } from './types';

/** The one place the three tiers are described, so prompt and gate cannot drift. */
export const MUTATION_TIERS: MutationTierSpec[] = [
  {
    tier: 1,
    name: 'Ideal baseline',
    blurb: 'The clean case: 1:1 stoichiometry, a single liquid phase, no boundary effects.',
    mutations: [
      'Perfect 1:1 stoichiometric ratios.',
      'A single liquid phase, with the density assumed to be 1.00 g/mL.',
      'No gas produced, or a gas that stays dissolved and does no work.',
    ],
  },
  {
    tier: 2,
    name: 'Asymmetric & distractor traps',
    blurb:
      'The same physics with the easy assumptions removed: unequal coefficients and a real density.',
    mutations: [
      'Unequal stoichiometric coefficients (3 A + 2 B → products) so no mole-to-mole ratio is 1:1.',
      "A non-unit solution density (d = 1.05 g/mL), which forces the learner to decide whether q = mcΔT takes m_solute or m_solution.",
      'A volumetric dilution step whose volume is not the volume of the solution.',
    ],
  },
  {
    tier: 3,
    name: 'Multi-physics / phase-change hell',
    blurb:
      'Three physical regimes in one problem: a solid, an aqueous solution, and a gas doing work.',
    mutations: [
      'One reactant is a solid pellet and the other is an aqueous solution.',
      'A product is an insoluble gas that expands and does work against atmospheric pressure (w = −PΔV).',
      'The heat released is enough to drive the water to its boiling point, so a latent-heat plateau (q = mcΔT + mL) sits mid-calculation.',
    ],
  },
];

export function isMutationTier(value: unknown): value is MutationTier {
  return value === 1 || value === 2 || value === 3;
}

export function tierSpec(tier: MutationTier): MutationTierSpec {
  return MUTATION_TIERS[tier - 1];
}

/** The directive the STRONG model gets when it is asked for a variant. */
export function mutationDirective(tier: MutationTier): string {
  const spec = tierSpec(tier);
  return `CONSTRAINT-MUTATION TIER ${spec.tier} — ${spec.name.toUpperCase()}.
The learner is a first-principles, friction-seeking problem solver. Do NOT merely change the numbers: change the BOUNDARY CONDITIONS of the system, and keep every physical quantity internally consistent so the problem has exactly one defensible answer.

THIS TIER MUTATES:
${spec.mutations.map((mutation) => `  · ${mutation}`).join('\n')}

REQUIREMENTS:
1. The problem must be solvable with the physics it names, and the numbers must be consistent with each other (a temperature rise that would boil the solvent must be handled as a phase change, not as a larger ΔT).
2. Name every constraint explicitly in "given" — units included. A learner must be able to list the system's demands from "given" alone.
3. "asks" is what is actually being asked for, in the order it must be found. Never ask for a quantity that cannot be derived from what was given.
4. Do not hint at the method and do not reveal any intermediate value. There is no answer key in this payload.
5. ${tier === 3 ? 'The latent-heat and boundary-work terms are REQUIRED, not optional. A Tier 3 problem without them is a Tier 1 problem with a harder label.' : 'The tier\'s mutations above are REQUIRED, not optional.'}`;
}

/** What a generated variant must carry before it is worth asking. */
export interface TierCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  /**
   * False for a check the tier merely PREFERS.
   *
   * Tier 2 is a quorum — two of its three mutations is the tier, and a variant
   * carrying all three is welcome — so its individual moves are reported but not
   * demanded. The quorum check itself is what the tier is held to, which is why
   * "does this carry Tier 2" has exactly one answer.
   */
  required?: boolean;
}

// ─── The deterministic gates ────────────────────────────────────────────────

/** A reaction arrow, so coefficient counting only runs on an actual equation. */
const REACTION = /(?:→|->|⟶|yields)/;

/** A leading coefficient above 1 in front of a species: `3A`, `2 H2O`. */
const UNEQUAL_COEFFICIENT = /(?:^|[\s+·(])([2-9])\s*[A-Z(]/;

const DENSITY = /([0-9]+(?:\.[0-9]+)?)\s*(?:g\/m?L|g·mL|g per mL|grams? per (?:milli)?lit(?:er|re))/i;

const MASS_OF_SOLUTE = /mass of the (?:solute|solid|salt|sample)|m_solute|m_sol(?!ution)/i;
const MASS_OF_SOLUTION = /mass of the (?:solution|mixture|water|solvent)|m_solution|m_water|m_solv/i;

const LATENT_TERM = new RegExp(
  [
    '\\bm\\s*[·*]?\\s*L[_ ]?[vfb]?\\b',
    '\\bmL\\b',
    'latent heat',
    'heat of vaporiz',
    'heat of fusion',
    'heat of vapori',
    '\\bΔH[_ ]?(?:vap|fus|vapor|sub)\\b',
    '\\bΔH[₀-₉ᵥ]*(?:vap|fus)',
    'enthalpy of vaporiz',
    'enthalpy of fusion',
    'vaporiz(?:es|ed|ation)',
    'vaporiz',
    'condens(?:es|ed|ation)',
    'sublim',
    'melts?\\b',
    'freezes?\\b',
    'boils?\\b',
  ].join('|'),
  'i'
);

const PHASE_BOUNDARY = new RegExp(
  [
    '\\b[0-9]{2,3}(?:\\.[0-9]+)?\\s*°?\\s*C\\b',
    'boiling point',
    'melting point',
    'freezing point',
    'phase (?:change|transition|boundary)',
    'at 100 ?°?C',
    'to its boiling point',
  ].join('|'),
  'i'
);

/** A phase-change word next to a named substance — the boundary itself. */
const PHASE_VERB = /(boil|vaporiz|melts?|freezes?|sublim|condens)/i;
const NAMED_SUBSTANCE = /\b(water|H2O|H₂O|steam|ice|ethanol|methanol|acetone|benzene|ammonia|nitrogen|sulfur|sulphur)\b/i;

const GAS_WORK = new RegExp(
  [
    'P\\s*[·*]?\\s*ΔV',
    'ΔnRT',
    'P_ext',
    'Pext',
    'external pressure',
    'atmospheric pressure',
    'expansion work',
    'does? work (?:on|against)',
    'piston',
    '\\bw\\s*=\\s*-\\s*P',
  ].join('|'),
  'i'
);

const SOLID_PHASE = /\(s\)|solid (?:pellet|piece|block|sample|cube)|pellet/i;
const AQUEOUS_PHASE = /\(aq\)|aqueous|solution|dissolved/i;

/**
 * A unit, as a standalone token.
 *
 * Assembled rather than written out because the naive form is wrong: `\b°C\b`
 * never matches — there is no word boundary between a space and `°` — so a
 * problem whose only units are degrees would read as unitless. Every token is
 * fenced by non-letters on both sides, and the multi-character symbols are tried
 * before the single-letter ones so `kJ/mol` does not read as `J`.
 */
const DIMENSIONAL_UNITS = new RegExp(
  [
    'g\\/mL', 'g\\/m?L', 'g\\/m3', 'mol\\/L', 'kJ\\/mol', 'J\\/mol', 'J\\/g', 'kJ\\/g',
    'cal\\/g', 'kJ\\/kg', 'J\\/kg', 'mm Hg', 'm³', 'cm³', 'ΔT', 'ΔV', 'ΔH', 'ΔE', '°C', '°F',
    'g', 'kg', 'mg', 'mL', 'L', 'mol', 'J', 'kJ', 'cal', 'atm', 'kPa', 'Pa', 'torr', 'K',
  ]
    .map((token) => `(?:^|[^A-Za-z])${token}(?![A-Za-z])`)
    .join('|')
);

/**
 * Reads a generated variant back and reports which of its tier's boundary
 * conditions it actually carries.
 *
 * Pure and total: any input produces a full table of verdicts, so the route can
 * say exactly which requirement failed instead of "the model ignored the
 * directive".
 */
export function tierChecks(tier: MutationTier, text: string): TierCheck[] {
  const body = (text || '').replace(/\s+/g, ' ');
  const checks: TierCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string, required = true) =>
    checks.push(required ? { id, label, ok, detail } : { id, label, ok, detail, required: false });

  if (tier === 1) {
    // The baseline is the absence of mutations, so the only honest gates are
    // that it is solvable from what it states: a named reaction, units, and an
    // explicit ask. A "Tier 1" that is quietly Tier 3 is not a failure, it is a
    // free upgrade — but one with no units in it is not a problem at all.
    const hasReaction = REACTION.test(body) || /react(?:s|ion|ant)/i.test(body);
    add('REACTION', 'A named reaction or process', hasReaction, hasReaction ? '' : 'no reaction or process is named');
    const hasUnits = DIMENSIONAL_UNITS.test(body);
    add('UNITS', 'Quantities carry units', hasUnits, hasUnits ? '' : 'no unit appears anywhere in the problem');
    return checks;
  }

  if (tier === 2) {
    const equation = body;
    // The coefficients have to be ON THE REACTANT SIDE of an actual equation: a
    // `2` that appears anywhere else in the prose is not a stoichiometric
    // coefficient, and counting it would pass a variant that is quietly 1:1.
    const reactantSide = REACTION.test(equation) ? equation.split(REACTION)[0] || '' : '';
    const hasUnequalCoefficients =
      reactantSide !== '' && UNEQUAL_COEFFICIENT.test(reactantSide);
    add(
      'UNEQUAL_COEFFICIENTS',
      'A stoichiometric ratio that is not 1:1',
      hasUnequalCoefficients,
      hasUnequalCoefficients ? '' : 'every coefficient reads as 1, so no mole-to-mole ratio forces work',
      false
    );

    const densityMatch = body.match(DENSITY);
    const density = densityMatch ? Number(densityMatch[1]) : null;
    const nonUnitDensity = density !== null && Math.abs(density - 1) > 0.0001;
    add(
      'NON_UNIT_DENSITY',
      'A density that is not 1.00 g/mL',
      nonUnitDensity,
      density === null
        ? 'no density is stated'
        : nonUnitDensity
          ? ''
          : 'the density is still 1.00 g/mL, so the mass/volume distinction never bites',
      false
    );

    const hasMassDistinction = MASS_OF_SOLUTE.test(body) && MASS_OF_SOLUTION.test(body);
    add(
      'MASS_DISTINCTION',
      'A stated distinction between solute and solution mass',
      hasMassDistinction,
      hasMassDistinction
        ? ''
        : 'nothing forces the learner to choose between the mass of the solute and the mass of the solution',
      false
    );

    // Two of three is the tier: a variant carrying all three is welcome, and a
    // variant carrying none is the numerical mutation this matrix replaces.
    const carried = checks.filter((check) => check.ok).length;
    add(
      'TIER_2_QUORUM',
      'At least two Tier 2 mutations carried',
      carried >= 2,
      carried >= 2 ? `${carried} of 3 carried` : `only ${carried} of 3 carried`
    );
    return checks;
  }

  const latent = LATENT_TERM.test(body);
  add(
    'LATENT_HEAT_TERM',
    'A latent-heat term in the energy balance',
    latent,
    latent ? '' : 'no latent-heat term appears, so the phase change is being treated as a plain ΔT'
  );

  const boundary = PHASE_BOUNDARY.test(body) || (PHASE_VERB.test(body) && NAMED_SUBSTANCE.test(body));
  add(
    'PHASE_BOUNDARY',
    'The phase boundary itself is named',
    boundary,
    boundary
      ? ''
      : 'the problem never names the boiling/melting boundary it depends on, so the plateau has no trigger'
  );

  const work = GAS_WORK.test(body);
  add(
    'GAS_WORK',
    'Boundary work against a stated pressure',
    work,
    work ? '' : 'no gas does work against a stated pressure, so w = −PΔV never applies'
  );

  const twoPhases = SOLID_PHASE.test(body) && AQUEOUS_PHASE.test(body);
  add(
    'SOLID_AND_AQUEOUS',
    'A solid reactant and an aqueous one',
    twoPhases,
    twoPhases ? '' : 'the two phases the tier is built from are not both present'
  );

  return checks;
}

/** True when every REQUIRED check in the table passed. */
export function checksPass(checks: TierCheck[]): boolean {
  return checks.every((check) => check.required === false || check.ok);
}

/** Every failed check, including the ones the tier only preferred. */
export function failedChecks(checks: TierCheck[]): TierCheck[] {
  return checks.filter((check) => !check.ok);
}

/** The failures that actually refuse the variant, for the refusal's wording. */
export function blockingChecks(checks: TierCheck[]): TierCheck[] {
  return failedChecks(checks).filter((check) => check.required !== false);
}

// ─── Coercion ───────────────────────────────────────────────────────────────

export interface MutatedProblem {
  tier: MutationTier;
  title: string;
  /** The problem setup, written out. */
  statement: string;
  /** Every constraint the system imposes, units included. */
  given: string[];
  /** What is being asked for, in the order it must be found. */
  asks: string[];
  /** The tier's own moves, so the label is auditable. */
  requiredMoves: string[];
  /** The false move this tier is built to punish. */
  trap: string;
}

export type MutationValidation =
  | { ok: true; problem: MutatedProblem; checks: TierCheck[] }
  | { ok: false; reason: 'empty' | 'tier-unmet'; checks: TierCheck[]; message: string };

const MAX_GIVEN = 8;
const MAX_ASKS = 3;
const MAX_MOVES = 6;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asStringList(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
    .slice(0, cap);
}

/**
 * Coerces a generated variant into its contract, then holds it to its own
 * tier's gates. A variant that fails them is REFUSED (never relabelled down and
 * never repaired), because the label is the promise the learner is being made:
 * "this is the harder one" is exactly the claim a Tier 3 without a latent-heat
 * term would be lying about.
 */
export function normalizeMutatedProblem(raw: unknown, tier: MutationTier): MutationValidation {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const statement = asString(data.statement);
  const given = asStringList(data.given, MAX_GIVEN);
  const asks = asStringList(data.asks, MAX_ASKS);

  if (!statement && given.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      checks: [],
      message: 'The generator returned no problem, so nothing is shown.',
    };
  }

  const problem: MutatedProblem = {
    tier,
    title: asString(data.title, `${tierSpec(tier).name} variant`),
    statement,
    given,
    asks,
    requiredMoves: asStringList(data.requiredMoves, MAX_MOVES),
    trap: asString(data.trap),
  };

  const text = [problem.title, problem.statement, ...problem.given, ...problem.asks].join(' ');
  const checks = tierChecks(tier, text);
  if (!checksPass(checks)) {
    const missing = blockingChecks(checks)
      .map((check) => check.label)
      .join(', ');
    return {
      ok: false,
      reason: 'tier-unmet',
      checks,
      message: `This variant does not carry Tier ${tier}: ${missing}.`,
    };
  }

  return { ok: true, problem, checks };
}
