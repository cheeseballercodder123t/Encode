import { describe, expect, it } from 'vitest';
import { TOY_EXAMPLES, activityForToyExample, findGroundedToyExample } from '@/lib/toy-models/examples';
import { buildToyChallenge, computeArchetypeOutput, computeCounterModelOutput, cyclePosition, initialInputs, modelFingerprint, reactionEnergy, restoreToyProgress } from '@/lib/toy-models/engine';
import { validateToyModelConfig } from '@/lib/toy-models/validation';
import { toyBoundaryCard } from '@/lib/toy-models/progress';
import { extractAnkiCardsFromSchema, extractStageAnkiCards, sanitizeExtracted } from '@/lib/anki-exporter';
import { generateRemnoteHierarchy } from '@/lib/remnote';
import { validateEncodedSchema } from '@/lib/ai-output-validation';
import { generateOfflineWorkout } from '@/lib/services/offlineGenerator';
import type { ToyModelConfig, ToyModelProgress } from '@/lib/toy-models/types';

const [ratio, saturation, equilibrium, cycle, threshold] = TOY_EXAMPLES.map((example) => example.config);
const copy = <T,>(value: T): T => structuredClone(value);
function value(config: ToyModelConfig, inputs: Record<string, number>) { return computeArchetypeOutput(config, { ...initialInputs(config), ...inputs }).value; }
function solved(config: ToyModelConfig): ToyModelProgress {
  const challenge = buildToyChallenge(config);
  return { version: 1, modelKey: modelFingerprint(config), predictionId: challenge.correctId, inputs: challenge.targetInputs, explored: true, revealed: true, updatedAt: 123 };
}
describe('five deterministic engines', () => {
  it.each(TOY_EXAMPLES)('$label validates against exact source, without mutating', (example) => {
    const original = JSON.stringify(example.config);
    const result = validateToyModelConfig(example.config, example.notes);
    expect(result).toMatchObject({ valid: true, issues: [] });
    expect(JSON.stringify(example.config)).toBe(original);
  });
  it('Ohm law returns 3 A, halves under double R, and responds to both perturbed inputs', () => {
    expect(value(ratio, {})).toBe(3);
    expect(value(ratio, { resistance: 8 })).toBe(1.5);
    expect(value(ratio, { voltage: 6, resistance: 8 })).toBe(0.75);
    expect(value(ratio, { voltage: 0 })).toBe(0);
  });
  it('inverse powers support products such as F=m*a', () => {
    expect(ratio.type).toBe('ratio_scaling');
    if (ratio.type !== 'ratio_scaling') throw Error('fixture');
    const product = { ...ratio, denominatorExponent: -1 };
    expect(value(product, { voltage: 12, resistance: 4 })).toBe(48);
  });
  it('Michaelis-Menten half saturation is exact, n changes shape but not half saturation', () => {
    expect(value(saturation, { substrate: 2 })).toBe(50);
    expect(value(saturation, { substrate: 2, hill: 4 })).toBe(50);
    expect(value(saturation, { substrate: 0 })).toBe(0);
    expect(value(saturation, { substrate: 20 })).toBeLessThan(100);
    expect(computeCounterModelOutput(saturation, { substrate: 20, hill: 1 })).toBe(500);
  });
  it('saturation never overflows by evaluating powers at extreme scale', () => {
    if (saturation.type !== 'saturation_sigmoid') throw Error('fixture');
    const huge = { ...saturation, primaryVar: { ...saturation.primaryVar, max: 1e9 }, hillCoefficient: { ...saturation.hillCoefficient, max: 8 } };
    expect(Number.isFinite(value(huge, { substrate: 1e9, hill: 8 }))).toBe(true);
    expect(value(huge, { substrate: 1e9, hill: 8 })).toBe(100);
  });
  it('equilibrium conserves material, gets direction right, and has ΔG=0 at Q=K', () => {
    const balanced = computeArchetypeOutput(equilibrium, { fraction: 0.75, temperature: 298 });
    expect(balanced.value).toBeCloseTo(0);
    expect(balanced.q).toBeCloseTo(3);
    expect(balanced.fractionA! + balanced.fractionB!).toBe(1);
    expect(computeArchetypeOutput(equilibrium, { fraction: 0.5, temperature: 298 }).status).toBe('A → B');
    expect(computeArchetypeOutput(equilibrium, { fraction: 0.9, temperature: 298 }).status).toBe('B → A');
    expect(value(equilibrium, { fraction: 0.9, temperature: 300 }) / value(equilibrium, { fraction: 0.9, temperature: 250 })).toBeCloseTo(1.2);
  });
  it('cycle uses weighted dwell intervals and continuous Bézier energy at each boundary', () => {
    if (cycle.type !== 'cyclic_state_machine') throw Error('fixture');
    expect(cyclePosition(cycle, 0).index).toBe(0);
    expect(cyclePosition(cycle, 20).index).toBe(1);
    expect(cyclePosition(cycle, 75).index).toBe(3);
    expect(cyclePosition(cycle, 100)).toMatchObject({ index: 3, local: 1 });
    cycle.states.forEach((state, index) => {
      expect(reactionEnergy(cycle, index, 0)).toBe(state.energy);
      expect(reactionEnergy(cycle, index, 1)).toBe(cycle.states[(index + 1) % cycle.states.length].energy);
      expect(reactionEnergy(cycle, index, 0.5)).toBe(Math.max(state.energy, cycle.states[(index + 1) % cycle.states.length].energy) + state.activationBarrier);
    });
    expect(value(cycle, { progress: 0 })).toBe(value(cycle, { progress: 100 }));
  });
  it('collapse peaks, declines, and hits zero exactly at the supplied threshold', () => {
    expect(value(threshold, { temperature: 37 })).toBe(100);
    expect(value(threshold, { temperature: 41 })).toBe(50);
    expect(value(threshold, { temperature: 45 })).toBe(0);
    expect(value(threshold, { temperature: 60 })).toBe(0);
    expect(computeArchetypeOutput(threshold, { temperature: 45 }).critical).toBe(true);
  });
  it('activation supports negative voltage thresholds', () => {
    if (threshold.type !== 'critical_threshold') throw Error('fixture');
    const activation = { ...threshold, response: 'activate' as const, primaryVar: { ...threshold.primaryVar, min: -90, max: 30, initial: -70 }, threshold: -55 };
    expect(value(activation, { temperature: -56 })).toBe(0);
    expect(value(activation, { temperature: -55 })).toBe(100);
  });
  it('affine thermodynamic sign-change models are represented honestly, not as a fake ratio', () => {
    if (threshold.type !== 'critical_threshold') throw Error('fixture');
    const affine = { ...threshold, counterModel: undefined, response: 'sign_change' as const, primaryVar: { ...threshold.primaryVar, min: 200, max: 400, initial: 250 }, threshold: 300, intercept: 30, slope: -0.1, prediction: { ...threshold.prediction, target: 350 } };
    expect(validateToyModelConfig(affine).valid).toBe(true);
    expect(value(affine, { temperature: 250 })).toBe(5);
    expect(value(affine, { temperature: 300 })).toBe(0);
    expect(value(affine, { temperature: 350 })).toBe(-5);
    expect(computeArchetypeOutput(affine, { temperature: 300 }).equilibrium).toBe(true);
  });
  it.each(TOY_EXAMPLES)('$label produces finite endpoint and interior values', ({ config }) => {
    for (let i = 0; i <= 50; i++) {
      const x = config.primaryVar.min + (config.primaryVar.max - config.primaryVar.min) * i / 50;
      const output = computeArchetypeOutput(config, x);
      expect(Number.isFinite(output.value)).toBe(true);
      expect(output.normalized).toBeGreaterThanOrEqual(0);
      expect(output.normalized).toBeLessThanOrEqual(1);
    }
  });
});
describe('preflight verification rejects invalid science/runtime shapes', () => {
  it('repairs a nonpositive denominator without mutating the original', () => {
    if (ratio.type !== 'ratio_scaling') throw Error('fixture');
    const raw = { ...copy(ratio), denominator: { ...ratio.denominator, min: 0, initial: 0 } };
    const result = validateToyModelConfig(raw);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(3);
    expect(result.issues.join(' ')).toContain('preserves reachable targets');
    expect(result.sanitizedConfig?.type).toBe('ratio_scaling');
    expect(raw.denominator.min).toBe(0);
  });
  it.each([NaN, Infinity, -Infinity, '3', null])('rejects a nonnumeric coefficient: %s', (coefficient) => {
    expect(validateToyModelConfig({ ...ratio, coefficient }).valid).toBe(false);
  });
  it('rejects unsupported type and oversized arrays', () => {
    expect(validateToyModelConfig({ ...ratio, type: 'javascript', formula: 'process.exit()' }).valid).toBe(false);
    expect(validateToyModelConfig({ ...cycle, states: Array(10000).fill({}) }).valid).toBe(false);
  });
  it('rejects invented quotes and generic names', () => {
    expect(validateToyModelConfig(ratio, 'Nothing about electricity.').valid).toBe(false);
    expect(validateToyModelConfig({ ...ratio, primaryVar: { ...ratio.primaryVar, label: 'Variable A' } }).valid).toBe(false);
  });
  it('rejects unknown prediction variable, unchanged target, and out-of-range targets', () => {
    for (const prediction of [{ ...ratio.prediction, variableKey: 'missing' }, { ...ratio.prediction, target: 4 }, { ...ratio.prediction, target: 1000 }]) expect(validateToyModelConfig({ ...ratio, prediction }).valid).toBe(false);
  });
  it('rejects collapsed range, missing units and impossible steps', () => {
    for (const variable of [{ ...ratio.primaryVar, max: 0 }, { ...ratio.primaryVar, step: 100 }, { ...ratio.primaryVar, unit: '' }]) expect(validateToyModelConfig({ ...ratio, primaryVar: variable }).valid).toBe(false);
  });
  it('rejects fractional negative domains and zero under negative powers', () => {
    expect(validateToyModelConfig({ ...ratio, numeratorExponent: 0.5, requiresPositiveOnly: false, primaryVar: { ...ratio.primaryVar, min: -1 } }).valid).toBe(false);
    expect(validateToyModelConfig({ ...ratio, numeratorExponent: -1 }).valid).toBe(false);
  });
  it('checks off-diagonal extremes of two independent sliders', () => {
    if (ratio.type !== 'ratio_scaling') throw Error('fixture');
    const huge = { ...ratio, numeratorExponent: 4, denominatorExponent: 4, coefficient: 1e9, primaryVar: { ...ratio.primaryVar, max: 1e9 }, denominator: { ...ratio.denominator, min: 0.01 } };
    expect(validateToyModelConfig(huge).valid).toBe(false);
  });
  it('rejects unsafe equilibrium fractions and wrong temperature units', () => {
    if (equilibrium.type !== 'two_state_equilibrium') throw Error('fixture');
    expect(validateToyModelConfig({ ...equilibrium, primaryVar: { ...equilibrium.primaryVar, max: 1 } }).valid).toBe(false);
    expect(validateToyModelConfig({ ...equilibrium, temperature: { ...equilibrium.temperature, unit: '°C' } }).valid).toBe(false);
  });
  it('rejects missing cycle states, repeated IDs and no reaction interval', () => {
    if (cycle.type !== 'cyclic_state_machine') throw Error('fixture');
    expect(validateToyModelConfig({ ...cycle, states: cycle.states.slice(0, 2) }).valid).toBe(false);
    expect(validateToyModelConfig({ ...cycle, states: [cycle.states[0], cycle.states[0], cycle.states[1]] }).valid).toBe(false);
    expect(validateToyModelConfig({ ...cycle, primaryVar: { ...cycle.primaryVar, max: 99 } }).valid).toBe(false);
  });
  it('rejects mismatched zero-crossing and out-of-range thresholds', () => {
    if (threshold.type !== 'critical_threshold') throw Error('fixture');
    expect(validateToyModelConfig({ ...threshold, threshold: 60 }).valid).toBe(false);
    expect(validateToyModelConfig({ ...threshold, peak: 45 }).valid).toBe(false);
    expect(validateToyModelConfig({ ...threshold, counterModel: undefined, response: 'sign_change', slope: -1, intercept: 30 }).valid).toBe(false);
  });
  it('non-finite runtime values restore to bounded defaults', () => {
    expect(value(ratio, { voltage: Infinity, resistance: NaN })).toBe(3);
    expect(value(ratio, { voltage: 999, resistance: -999 })).toBe(48);
  });
});
describe('prediction, grounding, persisted progress and export', () => {
  it('correct options are independently computed, not trusted from AI', () => {
    expect(buildToyChallenge(ratio).correctId).toBe('decrease');
    expect(buildToyChallenge(saturation).correctId).toBe('increase');
    expect(buildToyChallenge(equilibrium).correctId).toBe('increase');
    expect(buildToyChallenge(cycle).correctId).toBe('recover');
    expect(buildToyChallenge(threshold).correctId).toBe('critical');
  });
  it('outdated fingerprints and fabricated option IDs relock the lab', () => {
    expect(restoreToyProgress(ratio, { ...solved(ratio), modelKey: 'old' }).predictionId).toBeUndefined();
    expect(restoreToyProgress(ratio, { ...solved(ratio), predictionId: 'hallucinated' }).revealed).toBe(false);
  });
  it('a reveal cannot be restored without exploration', () => {
    expect(restoreToyProgress(ratio, { ...solved(ratio), explored: false }).revealed).toBe(false);
  });
  it('valid lab survives encoded-schema validation; invalid one is dropped with reasons', () => {
    const activity = activityForToyExample(TOY_EXAMPLES[0]);
    const valid = validateEncodedSchema({ activities: [activity] }, 'conceptual', TOY_EXAMPLES[0].notes);
    expect(valid.activities[0].toyModel).toEqual(ratio);
    const invalid = validateEncodedSchema({ activities: [{ ...activity, toyModel: { ...ratio, coefficient: NaN } }] }, 'conceptual', TOY_EXAMPLES[0].notes);
    expect(invalid.activities[0].toyModel).toBeUndefined();
    expect(invalid.activities[0].toyModelIssues?.length).toBeGreaterThan(0);
    expect(invalid.activities[0].scaffold.field1Label).toBe(activity.scaffold.field1Label);
  });
  it('offline examples require exact supplied source, not vague keyword matches', () => {
    expect(findGroundedToyExample('enzymes and voltage and resistance')).toBeUndefined();
    for (const example of TOY_EXAMPLES) {
      expect(generateOfflineWorkout(example.notes).activities[0].toyModel).toEqual(example.config);
    }
  });
  it('revealed traps export through stage, full schema and RemNote, never before manipulation', () => {
    const activity = activityForToyExample(TOY_EXAMPLES[0]);
    const response = { field1: '', field2: '', toyModelProgress: solved(ratio) };
    const schema = { activities: [activity], userResponses: { [activity.id]: response }, topicSummary: 'Ohm' };
    const card = toyBoundaryCard(activity, response)!;
    expect(card.back).toContain('halves current only when voltage is held fixed');
    const stage = extractStageAnkiCards(activity, response).find((item) => item.id === card.id)!;
    const full = extractAnkiCardsFromSchema(schema).find((item) => item.id === card.id)!;
    expect(stage.front).toBe(full.front);
    expect(full.tags).toContain('InterferenceTrap');
    expect(sanitizeExtracted([full]).cards).toHaveLength(1);
    const remnote = generateRemnoteHierarchy(schema);
    expect(remnote.markdown).toContain('Boundary: Doubling resistance halves current');
    expect(toyBoundaryCard(activity, { ...response, toyModelProgress: { ...response.toyModelProgress, revealed: false } })).toBeUndefined();
  });
  it('export escapes potential HTML in source-grounded text', () => {
    const activity = activityForToyExample(TOY_EXAMPLES[0]);
    activity.toyModel = { ...ratio, takeaway: 'Do not execute <script>alert(1)</script>.' };
    const response = { field1: '', field2: '', toyModelProgress: solved(activity.toyModel) };
    const card = extractStageAnkiCards(activity, response).find((item) => item.tags.includes('ToyModel'))!;
    expect(card.back).not.toContain('<script>');
    expect(card.back).toContain('&lt;script&gt;');
  });
});
