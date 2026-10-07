import { describe, it, expect } from 'vitest';
import {
  checksPass,
  failedChecks,
  isMutationTier,
  MUTATION_TIERS,
  mutationDirective,
  normalizeMutatedProblem,
  tierChecks,
  tierSpec,
} from '../../lib/escalation/mutation';

/**
 * A tier label is a promise: "this is the harder one" is exactly what a Tier 3
 * problem with no phase change would be lying about. So the tier is not a string
 * the generator attaches — it is a set of boundary conditions the generated
 * problem must actually carry, and a variant that fails its own gates is refused
 * rather than relabelled down.
 *
 * These checks are textual gates over the generated statement, not proofs, and
 * that is stated plainly in the module. What the tests pin is the direction they
 * fail in: a variant that is fine but phrases the physics in words the
 * vocabulary does not know is refused, which costs one regeneration — a
 * mislabelled variant costs the learner their trust in the label.
 */

const TIER_2_FULL = `3 A + 2 B → products in aqueous solution. The solution density is 1.05 g/mL.`;
const TIER_3_FULL = [
  'A solid pellet of zinc (s) is dropped into an aqueous solution of HCl (aq) inside a cylinder sealed by a piston.',
  'The gas expands against atmospheric pressure, doing boundary work w = −PΔV.',
  'The heat released drives the water to its boiling point, so the energy balance includes the latent heat of vaporisation: q = mcΔT + mL_v.',
].join(' ');

describe('the tier table', () => {
  it('describes three tiers, in order, each with its own mutations', () => {
    expect(MUTATION_TIERS.map((spec) => spec.tier)).toEqual([1, 2, 3]);
    for (const spec of MUTATION_TIERS) {
      expect(spec.name.length).toBeGreaterThan(0);
      expect(spec.mutations.length).toBeGreaterThan(0);
    }
    expect(tierSpec(3).mutations.join(' ')).toContain('latent-heat');
  });

  it('accepts only the three real tiers', () => {
    expect(isMutationTier(1)).toBe(true);
    expect(isMutationTier(3)).toBe(true);
    expect(isMutationTier(0)).toBe(false);
    expect(isMutationTier('2')).toBe(false);
    expect(isMutationTier(null)).toBe(false);
  });
});

describe('mutationDirective — the prompt cannot drift from the gate', () => {
  it('quotes the tier it is asking for', () => {
    const directive = mutationDirective(2);
    expect(directive).toContain('CONSTRAINT-MUTATION TIER 2');
    for (const mutation of tierSpec(2).mutations) expect(directive).toContain(mutation);
  });

  it('tells a Tier 3 prompt that the phase terms are required, not optional', () => {
    expect(mutationDirective(3)).toContain('REQUIRED, not optional');
  });

  it('keeps the no-hint rule at every tier', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(mutationDirective(tier)).toContain('do not reveal any intermediate value');
    }
  });
});

describe('tierChecks — the deterministic gates', () => {
  it('Tier 1 asks only that the problem is a problem', () => {
    const checks = tierChecks(1, 'Zinc reacts with HCl. The mass is 5.0 g and the temperature rises 3.0 °C.');
    expect(checksPass(checks)).toBe(true);

    const withoutUnits = tierChecks(1, 'Zinc reacts with HCl and something happens.');
    expect(checksPass(withoutUnits)).toBe(false);
  });

  it('Tier 2 carries its mutations or is refused', () => {
    const checks = tierChecks(2, TIER_2_FULL);
    expect(checksPass(checks)).toBe(true);
    expect(checks.find((check) => check.id === 'NON_UNIT_DENSITY')?.ok).toBe(true);
  });

  it('Tier 2 refuses a variant that is only a numerical mutation', () => {
    // Everything is 1:1, the density is 1.00, and nothing forces the learner to
    // choose between the solute and the solution — so it is a Tier 1 problem.
    const checks = tierChecks(2, 'The acid reacts with the base. The solution density is 1.00 g/mL.');
    expect(checksPass(checks)).toBe(false);
    expect(failedChecks(checks).map((check) => check.id)).toContain('TIER_2_QUORUM');
  });

  it('Tier 3 demands the latent-heat term, the phase boundary, the work and both phases', () => {
    const checks = tierChecks(3, TIER_3_FULL);
    expect(checksPass(checks)).toBe(true);
    expect(checks.map((check) => check.id)).toEqual([
      'LATENT_HEAT_TERM',
      'PHASE_BOUNDARY',
      'GAS_WORK',
      'SOLID_AND_AQUEOUS',
    ]);
  });

  it('Tier 3 refuses a phase change that is being treated as a plain ΔT', () => {
    const checks = tierChecks(
      3,
      'A solid pellet (s) dissolves in an aqueous solution (aq) inside a piston at atmospheric pressure.'
    );
    expect(checksPass(checks)).toBe(false);
    const failed = failedChecks(checks).map((check) => check.id);
    expect(failed).toContain('LATENT_HEAT_TERM');
    expect(failed).toContain('PHASE_BOUNDARY');
  });

  it('names what is missing rather than saying the model ignored the directive', () => {
    const checks = tierChecks(3, 'nothing relevant here');
    for (const check of failedChecks(checks)) {
      expect(check.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('normalizeMutatedProblem — refused, never relabelled', () => {
  it('accepts a Tier 3 variant that carries every boundary condition', () => {
    const result = normalizeMutatedProblem(
      {
        title: 'Pellet in acid',
        statement: TIER_3_FULL,
        given: ['1.00 mol of Zn', 'the piston is frictionless'],
        asks: ['What is ΔE?'],
        requiredMoves: ['Find the limiting reactant', 'Add the latent-heat term'],
        trap: 'Treating the plateau as a larger ΔT',
      },
      3
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.problem.tier).toBe(3);
      expect(result.problem.given.length).toBe(2);
      expect(checksPass(result.checks)).toBe(true);
    }
  });

  it('refuses a Tier 3 wearing a Tier 1 body, and says which requirement failed', () => {
    const result = normalizeMutatedProblem(
      { statement: 'Zinc reacts with HCl. The mass is 5.0 g.', given: ['5.0 g of Zn'], asks: ['ΔH?'] },
      3
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('tier-unmet');
      expect(result.message).toContain('does not carry Tier 3');
      expect(result.message).toContain('latent-heat');
    }
  });

  it('refuses an empty payload rather than showing an empty problem', () => {
    const result = normalizeMutatedProblem({}, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('caps the constraint list and the asks so the panel stays readable', () => {
    const result = normalizeMutatedProblem(
      {
        statement: TIER_2_FULL,
        given: Array.from({ length: 12 }, (_, i) => `given ${i}`),
        asks: ['a', 'b', 'c', 'd', 'e'],
      },
      2
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.problem.given.length).toBe(8);
      expect(result.problem.asks.length).toBe(3);
    }
  });

  it('drops non-string entries instead of rendering them', () => {
    const result = normalizeMutatedProblem(
      { statement: TIER_2_FULL, given: ['ok', 42, null, '  '], asks: [] },
      2
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.problem.given).toEqual(['ok']);
  });
});
