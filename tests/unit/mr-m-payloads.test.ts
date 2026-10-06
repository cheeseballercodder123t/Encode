import { describe, it, expect } from 'vitest';
import {
  MAX_ONTOLOGY,
  MAX_STEPS,
  MAX_VARIABLES,
  mrMOf,
  normalizeAutopsy,
  normalizeMrM,
} from '../../lib/mr-m/payloads';
import { MR_M_DIRECTIVE, MR_M_EVALUATE_DIRECTIVE } from '../../lib/mr-m/directives';

/**
 * Every Mr M block is coerced at the boundary where model output enters the
 * app, and a block that does not survive coercion is DROPPED rather than
 * defaulted. That is the whole premise of the mode: a surface appears only when
 * there is something real to say, so an axiom card reading "[no law stated]"
 * would be exactly the arbitrary noise it exists to remove.
 */

describe('normalizeMrM', () => {
  it('keeps a complete axiom block and fills the zero point from the origin', () => {
    const payload = normalizeMrM({
      axiomFirst: {
        governingLaw: 'Energy is conserved.',
        coordinateOrigin: 'No heat transferred at all.',
        whyThisDefinition: 'Products are the destination, reactants the origin.',
      },
    });
    expect(payload?.axiomFirst?.governingLaw).toBe('Energy is conserved.');
    // The zero point is derivable from the origin, so it is never left blank.
    expect(payload?.axiomFirst?.zeroPoint).toBe('No heat transferred at all.');
  });

  it('drops an axiom block that is missing one of the three load-bearing sentences', () => {
    // Without all three there is no coordinate system to show, only a fragment.
    expect(normalizeMrM({ axiomFirst: { governingLaw: 'x', coordinateOrigin: 'y' } })).toBeUndefined();
    expect(normalizeMrM({ axiomFirst: { governingLaw: '', coordinateOrigin: '', whyThisDefinition: 'z' } })).toBeUndefined();
  });

  it('keeps one card per letter and drops cards with no physical identity', () => {
    const payload = normalizeMrM({
      ontology: [
        { symbol: 'q', physicalIdentity: 'the heat transferred into the system', unit: 'kJ' },
        { symbol: 'Q', physicalIdentity: 'a duplicate of the same letter' },
        { symbol: 'm', physicalIdentity: '   ' },
      ],
    });
    expect(payload?.ontology?.length).toBe(1);
    expect(payload?.ontology?.[0].symbol).toBe('q');
  });

  it('renumbers steps so the returned order is the order', () => {
    const payload = normalizeMrM({
      stateMachine: [
        { stepNumber: 9, action: 'first', holdsInHead: 'a' },
        { stepNumber: 4, action: 'second', holdsInHead: 'b' },
      ],
    });
    expect(payload?.stateMachine?.map((s) => s.stepNumber)).toEqual([1, 2]);
    expect(payload?.stateMachine?.map((s) => s.action)).toEqual(['first', 'second']);
  });

  it('drops steps with no action and yields to no payload when nothing survives', () => {
    expect(normalizeMrM({ stateMachine: [{ stepNumber: 1, holdsInHead: 'a' }] })).toBeUndefined();
  });

  it('drops a step with no rule rather than inventing one to display', () => {
    // "One rule per step" IS the pillar. A step whose rule is missing has
    // nothing to consume, and filling the field with boilerplate would put the
    // arbitrary noise back on the screen that this module exists to remove.
    const payload = normalizeMrM({
      stateMachine: [
        { action: 'convert the volume', holdsInHead: '1 L of water has a mass of 1 kg' },
        { action: 'take the difference', output: 'a number' },
      ],
    });
    expect(payload?.stateMachine?.length).toBe(1);
    expect(payload?.stateMachine?.[0].holdsInHead).toBe('1 L of water has a mass of 1 kg');
  });

  it('drops a perturbation variable whose exponent is zero', () => {
    // An exponent of 0 means the variable provably cannot move the readout, so
    // a slider for it would be a control that does nothing.
    const payload = normalizeMrM({
      perturbation: {
        invariant: 'q = m c ΔT',
        variables: [
          { symbol: 'm', base: 0.25, exponent: 1 },
          { symbol: 'c', base: 4.18, exponent: 0 },
          { symbol: 'x', base: 'not a number', exponent: 1 },
        ],
      },
    });
    expect(payload?.perturbation?.variables.map((v) => v.symbol)).toEqual(['m']);
  });

  it('widens a degenerate slider range so base is never outside its own bounds', () => {
    const payload = normalizeMrM({
      perturbation: {
        invariant: 'q = m c ΔT',
        variables: [{ symbol: 'm', base: 10, min: 40, max: 5, exponent: 1 }],
      },
    });
    const variable = payload?.perturbation?.variables[0];
    expect(variable?.min).toBeLessThanOrEqual(10);
    expect(variable?.max).toBeGreaterThanOrEqual(10);
  });

  it('requires an invariant and at least one usable variable', () => {
    expect(normalizeMrM({ perturbation: { invariant: '', variables: [{ symbol: 'm', base: 1, exponent: 1 }] } })).toBeUndefined();
    expect(normalizeMrM({ perturbation: { invariant: 'x = y', variables: [] } })).toBeUndefined();
  });

  it('returns undefined for the mode being off, a silent model, or garbage', () => {
    expect(normalizeMrM(undefined)).toBeUndefined();
    expect(normalizeMrM({})).toBeUndefined();
    expect(normalizeMrM('not an object')).toBeUndefined();
  });

  it('coerces numeric strings the model returned as text', () => {
    const payload = normalizeMrM({
      perturbation: {
        invariant: 'F = k q1 q2 / r^2',
        variables: [{ symbol: 'r', base: '4', exponent: '-2' }],
      },
    });
    expect(payload?.perturbation?.variables[0].base).toBe(4);
    expect(payload?.perturbation?.variables[0].exponent).toBe(-2);
  });
});

describe('the encode directive', () => {
  // The caps are enforced by the coercion above, so the prompt has to quote the
  // same numbers. A model that is not told the limit it will be held to spends
  // tokens on a thirteenth ontology card that is then silently truncated, and a
  // prompt that drifts out of step with the coercion is a prompt that lies.
  it('quotes the exact limits the coercion enforces', () => {
    expect(MR_M_DIRECTIVE).toContain(`At most ${MAX_ONTOLOGY} entries`);
    expect(MR_M_DIRECTIVE).toContain(`3–${MAX_STEPS} steps`);
    expect(MR_M_DIRECTIVE).toContain(`At most\n  ${MAX_VARIABLES} variables`);
  });

  it('does not forbid the quantities the corrected construction is made of', () => {
    // The post-mortem rule bans the model from COMPUTING a quantity to explain
    // the failure. It must not also ban quoting the stage's own numbers, or the
    // corrected construction — a worked sentence — comes back as an instruction
    // to try again, which is the one thing the panel exists to replace.
    expect(MR_M_EVALUATE_DIRECTIVE).toContain('correctedConstruction');
    expect(MR_M_EVALUATE_DIRECTIVE).toContain('quote the quantities the STAGE already');
  });
});

describe('mrMOf', () => {
  it('reads the block off a stage by reference', () => {
    // By reference on purpose: a panel that compares payload identity across
    // renders would re-home on every pass if this copied the payload.
    const mrM = { ontology: [{ symbol: 'q', physicalIdentity: 'heat into the system' }] };
    const activity = { visualData: { mrM } };
    expect(mrMOf(activity)).toBe(mrM);
  });

  it('is safe on a stage with no payload', () => {
    expect(mrMOf(undefined)).toBeUndefined();
    expect(mrMOf({})).toBeUndefined();
    expect(mrMOf({ visualData: {} })).toBeUndefined();
  });
});

describe('normalizeAutopsy', () => {
  it('accepts a real trap id and keeps the narrative', () => {
    const autopsy = normalizeAutopsy({
      trapId: 'missing_subscript',
      structuralReason: 'The formula carries two nitrogens and you used one.',
      correctedConstruction: 'Use the full formula, then take the fraction.',
      whereItBreaks: 'the atom count in the denominator',
    });
    expect(autopsy?.trapId).toBe('missing_subscript');
    expect(autopsy?.correctedConstruction).toContain('full formula');
  });

  it('blanks an invented trap id rather than rendering a heading nobody can explain', () => {
    const autopsy = normalizeAutopsy({
      trapId: 'interdimensional_carry_error',
      structuralReason: 'something structural',
    });
    expect(autopsy?.trapId).toBe('');
    expect(autopsy?.structuralReason).toBe('something structural');
  });

  it('returns undefined when the examiner had nothing to say', () => {
    expect(normalizeAutopsy(undefined)).toBeUndefined();
    expect(normalizeAutopsy({ trapId: 'factor_of_two' })).toBeUndefined();
  });
});
