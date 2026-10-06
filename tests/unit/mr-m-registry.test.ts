import { describe, it, expect } from 'vitest';
import {
  MR_M_COMPONENTS,
  MR_M_INTERVENTIONS,
  getAllInterventions,
  getIntervention,
  registerIntervention,
  resolveInterventions,
} from '../../lib/mr-m/registry';
import type { Activity } from '../../lib/types';

/**
 * The registry is what makes Mr M mode a stack of surfaces rather than a switch
 * statement: the id is the only thing that decides which panel draws, and the
 * resolver is the only thing that decides which ids belong on a stage. These
 * tests pin the two properties the rest of the feature leans on — every
 * registered id resolves to a renderer, and the mode being off resolves to
 * NOTHING, so "off means the app is untouched" is a property of the resolver
 * rather than a promise each panel has to keep on its own.
 */

function stage(overrides: Record<string, unknown> = {}): Activity {
  return {
    id: 'act-1',
    stageNumber: 1,
    title: 'Calorimetry',
    framework: 'first-principles',
    cognitiveGoal: 'Account for every joule',
    contextSnippet: 'A hot solid is dropped into water.',
    keywords: [],
    templateType: 'first_principles',
    prompt: 'Trace the heat into the water.',
    scaffold: {
      field1Label: 'Mechanism',
      field1Placeholder: 'p1',
      field2Label: 'Reasoning',
      field2Placeholder: 'p2',
      exampleAnswer: '0.0336 kJ of heat leaves the water.',
    },
    ...overrides,
  } as unknown as Activity;
}

const FULL_PAYLOAD = {
  mrM: {
    axiomFirst: { governingLaw: 'l', coordinateOrigin: 'o', whyThisDefinition: 'w' },
    ontology: [{ symbol: 'q', physicalIdentity: 'the heat transferred into the system' }],
    stateMachine: [
      { stepNumber: 1, action: 'convert the volume to a mass', holdsInHead: '1 L of water is 1 kg' },
      { stepNumber: 2, action: 'take the difference, not the final value', holdsInHead: 'ΔT = T_f − T_i' },
      { stepNumber: 3, action: 'multiply with the units carried through', holdsInHead: 'q = m c ΔT' },
    ],
    perturbation: { invariant: 'q = m c ΔT', variables: [{ symbol: 'm', base: 0.25, exponent: 1 }] },
  },
};

describe('Mr M intervention registry', () => {
  it('resolves every registered id to a renderer', () => {
    // The sibling of the template-registry guarantee: an id that resolves to
    // nothing would be a surface the resolver returns but the screen cannot draw.
    const missing = MR_M_INTERVENTIONS.filter((i) => !MR_M_COMPONENTS[i.id]).map((i) => i.id);
    expect(missing).toEqual([]);
    for (const intervention of MR_M_INTERVENTIONS) {
      expect(typeof intervention.appliesWhen).toBe('function');
      expect(intervention.component).toBeTruthy();
    }
  });

  it('keeps the ids the app renders against', () => {
    expect(getAllInterventions().map((i) => i.id)).toEqual([
      'paradox_ledger',
      'axiom_first',
      'ontology_cards',
      'state_machine_steps',
      'perturbation_sliders',
      'trap_autopsy',
      'socratic_spar',
    ]);
  });

  it('leads with the open contradictions', () => {
    // An unresolved paradox is the one thing that must be visible before
    // anything else on the stage: registry order IS render order.
    expect(MR_M_INTERVENTIONS[0].id).toBe('paradox_ledger');
    expect(MR_M_INTERVENTIONS[0].pillar).toBe('paradox');
  });
});

describe('resolveInterventions', () => {
  it('returns nothing at all when the mode is off', () => {
    expect(
      resolveInterventions({ activity: stage({ visualData: FULL_PAYLOAD }), enabled: false })
    ).toEqual([]);
  });

  it('returns every applicable surface, in registry order', () => {
    const resolved = resolveInterventions({
      activity: stage({ visualData: FULL_PAYLOAD }),
      enabled: true,
      hasOpenParadox: true,
      feynmanResult: { secured: false, feedback: '', counterProbe: 'What if ΔT is zero?' },
      trapDiagnosis: {
        trapId: 'factor_of_two',
        structuralReason: 'a factor of two went missing',
        arithmeticReveal: '0.0336 ÷ 0.0168 = 2.00',
        whereItBreaks: 'the stoichiometric factor',
      },
    });
    expect(resolved.map((i) => i.id)).toEqual([
      'paradox_ledger',
      'axiom_first',
      'ontology_cards',
      'state_machine_steps',
      'perturbation_sliders',
      'trap_autopsy',
      'socratic_spar',
    ]);
  });

  it('stays silent on a stage that carries no payload', () => {
    // A stage the model left no Mr M block on renders exactly as it did before
    // the feature existed — no empty cards, no placeholders.
    expect(resolveInterventions({ activity: stage(), enabled: true })).toEqual([]);
  });

  it('requires three steps before a decomposition is worth showing', () => {
    const twoSteps = stage({
      visualData: {
        mrM: {
          stateMachine: [
            { stepNumber: 1, action: 'a', holdsInHead: 'x' },
            { stepNumber: 2, action: 'b', holdsInHead: 'y' },
          ],
        },
      },
    });
    expect(resolveInterventions({ activity: twoSteps, enabled: true })).toEqual([]);

    const threeSteps = stage({ visualData: FULL_PAYLOAD });
    expect(
      resolveInterventions({ activity: threeSteps, enabled: true }).map((i) => i.id)
    ).toContain('state_machine_steps');
  });

  it('opens the autopsy only on a failed check that has something to say', () => {
    const withPayload = stage({ visualData: FULL_PAYLOAD });
    // A secured stage gets no autopsy: there is nothing to dissect.
    expect(
      resolveInterventions({
        activity: withPayload,
        enabled: true,
        feynmanResult: { secured: true, feedback: '' },
        trapDiagnosis: {
          trapId: 'factor_of_two',
          structuralReason: 'x',
          arithmeticReveal: '',
          whereItBreaks: '',
        },
      }).map((i) => i.id)
    ).not.toContain('trap_autopsy');

    // A failed check with no readable signal also gets none — a panel that only
    // restates "that was wrong" is the verdict this pillar replaces.
    expect(
      resolveInterventions({
        activity: withPayload,
        enabled: true,
        feynmanResult: { secured: false, feedback: 'try again' },
      }).map((i) => i.id)
    ).not.toContain('trap_autopsy');

    // A written autopsy alone is enough.
    expect(
      resolveInterventions({
        activity: withPayload,
        enabled: true,
        feynmanResult: { secured: false, feedback: '' },
        autopsy: { trapId: 'missing_subscript', structuralReason: 'the 2 went missing', correctedConstruction: '', whereItBreaks: '' },
      }).map((i) => i.id)
    ).toContain('trap_autopsy');
  });

  it('opens the two-way check only when the examiner left a probe', () => {
    const withPayload = stage({ visualData: FULL_PAYLOAD });
    expect(
      resolveInterventions({
        activity: withPayload,
        enabled: true,
        feynmanResult: { secured: true, feedback: '' },
      }).map((i) => i.id)
    ).not.toContain('socratic_spar');
  });

  it('survives a payload so malformed that a gate throws', () => {
    // A stage that cannot be read must never take the workbench down with it.
    const hostile = stage({ visualData: { mrM: { ontology: 'not an array' } } });
    expect(() => resolveInterventions({ activity: hostile, enabled: true })).not.toThrow();
  });
});

describe('registerIntervention', () => {
  it('adds a runtime intervention and makes it immediately resolvable', () => {
    const Panel = MR_M_COMPONENTS.axiom_first;
    registerIntervention({
      id: 'unit_dimensional_check',
      pillar: 'steps',
      title: 'Dimensional check',
      learnerTask: 'Carry the units through every step.',
      appliesWhen: (ctx) => !!ctx.activity,
      component: Panel,
    });

    expect(getIntervention('unit_dimensional_check')?.title).toBe('Dimensional check');
    expect(MR_M_COMPONENTS.unit_dimensional_check).toBe(Panel);
    // Registered at runtime, and drawable immediately — not "registered but
    // invisible", which is the failure mode this table exists to prevent.
    expect(
      resolveInterventions({ activity: stage(), enabled: true }).map((i) => i.id)
    ).toContain('unit_dimensional_check');
  });

  it('replaces an existing id in place rather than appending a second copy', () => {
    const before = getAllInterventions().length;
    const axiomFirst = getIntervention('axiom_first');
    registerIntervention({ ...axiomFirst!, title: 'Coordinate system first' });
    expect(getAllInterventions().length).toBe(before);
    const matching = getAllInterventions().filter((i) => i.id === 'axiom_first');
    expect(matching.length).toBe(1);
  });
});
