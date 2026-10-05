import { describe, expect, it } from 'vitest';
import { buildToyChallenge, computeArchetypeOutput, initialInputs, modelFingerprint, phasePlaneDerivative, phasePlaneEquilibrium, phasePlaneStep, phasePlaneTrajectory, restoreToyProgress } from '@/lib/toy-models/engine';
import { validateToyModelConfig } from '@/lib/toy-models/validation';
import { toyDuelCard } from '@/lib/toy-models/progress';
import { TOY_EXAMPLES, activityForToyExample } from '@/lib/toy-models/examples';

const predprey = TOY_EXAMPLES.find(example => example.id === 'predprey')!;
type PhasePlane = NonNullable<ReturnType<typeof validateToyModelConfig>['sanitizedConfig']>;
const config = (() => {
  const validated = validateToyModelConfig(predprey.config, predprey.notes);
  if (!validated.valid || validated.sanitizedConfig?.type !== 'phase_plane') throw new Error('predprey fixture must validate');
  return validated.sanitizedConfig as Extract<PhasePlane, { type: 'phase_plane' }>;
})();

function V(x: number, y: number): number {
  return config.delta * x - config.gamma * Math.log(x) + config.beta * y - config.alpha * Math.log(y);
}

describe('phase-plane engine (Lotka–Volterra)', () => {
  it('validates the teaching example against exact source, without mutating it', () => {
    const original = JSON.stringify(predprey.config);
    const result = validateToyModelConfig(predprey.config, predprey.notes);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(JSON.stringify(predprey.config)).toBe(original);
  });

  it('coexistence equilibrium is (γ/δ, α/β) and both velocities vanish there', () => {
    const eq = phasePlaneEquilibrium(config);
    expect(eq.x).toBeCloseTo(config.gamma / config.delta, 12);
    expect(eq.y).toBeCloseTo(config.alpha / config.beta, 12);
    const velocity = phasePlaneDerivative(config, eq.x, eq.y);
    expect(Math.abs(velocity.dx)).toBeLessThan(1e-9);
    expect(Math.abs(velocity.dy)).toBeLessThan(1e-9);
  });

  it('flow directions match the quadrant of the velocity field', () => {
    // dX/dt = X(α − βY) depends only on Y; dY/dt = Y(δX − γ) only on X.
    // Below the prey nullcline (Y < α/β): prey rise; predators grow right of X* = γ/δ.
    const f = phasePlaneDerivative(config, config.gamma / config.delta + 1, config.alpha / config.beta - 0.5);
    expect(f.dx).toBeGreaterThan(0);
    expect(f.dy).toBeGreaterThan(0);
    // Above the prey nullcline: prey decline regardless of X.
    const g = phasePlaneDerivative(config, 1, config.alpha / config.beta + 0.5);
    expect(g.dx).toBeLessThan(0);
    // Few prey, few predators: prey recover, predators starve.
    const h = phasePlaneDerivative(config, 0.5, 0.5);
    expect(h.dx).toBeGreaterThan(0);
    expect(h.dy).toBeLessThan(0);
  });

  it('RK4 conserves the orbit invariant V over a full revolution', () => {
    const trajectory = phasePlaneTrajectory(config, 5, 1, 600, 0.05);
    const drift = Math.abs(V(trajectory[trajectory.length - 1].x, trajectory[trajectory.length - 1].y) - V(trajectory[0].x, trajectory[0].y));
    expect(drift).toBeLessThan(1e-5);
  });

  it('trajectories stay inside the drawing range and never cross an axis', () => {
    const trajectory = phasePlaneTrajectory(config, 5, 1, 400, 0.05);
    for (const point of trajectory) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.y).toBeGreaterThan(0);
      expect(point.x).toBeGreaterThanOrEqual(config.primaryVar.min);
      expect(point.x).toBeLessThanOrEqual(config.primaryVar.max);
      expect(point.y).toBeGreaterThanOrEqual(config.secondVar.min);
      expect(point.y).toBeLessThanOrEqual(config.secondVar.max);
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });

  it('challenge is computed locally from the velocity field, and moves both coordinates', () => {
    const challenge = buildToyChallenge(config);
    expect(challenge.targetInputs[config.primaryVar.key]).toBe(config.prediction.target);
    expect(challenge.targetInputs[config.secondVar.key]).toBe(config.prediction.targetY);
    const velocity = phasePlaneDerivative(config, challenge.targetInputs[config.primaryVar.key], challenge.targetInputs[config.secondVar.key]);
    const correct = challenge.choices.find(choice => choice.id === challenge.correctId)!;
    expect(correct.label).toContain(velocity.dy > 0 ? 'Predators rise' : 'Predators fall');
  });

  it('the duel refutation is reachable on the step grid and flips the naive reading', () => {
    const duel = config.devilsAdvocate!;
    for (const [key, value] of Object.entries(duel.refutationInputs)) {
      const slider = key === config.primaryVar.key ? config.primaryVar : config.secondVar;
      expect(slider.key).toBe(key);
      const tick = (value - slider.min) / slider.step;
      expect(Math.abs(tick - Math.round(tick))).toBeLessThan(1e-6);
      expect(value).toBeGreaterThanOrEqual(slider.min);
      expect(value).toBeLessThanOrEqual(slider.max);
    }
    const at = computeArchetypeOutput(config, { ...initialInputs(config), ...duel.refutationInputs });
    expect(at.status).toBe('BOTH FALLING');
  });

  it('rejects invented science: unknown refutation keys exceed the model surface', () => {
    const broken = structuredClone(predprey.config) as Extract<PhasePlane, { type: 'phase_plane' }>;
    broken.devilsAdvocate = { ...broken.devilsAdvocate!, refutationInputs: { ghost: 3 } };
    const result = validateToyModelConfig(broken, predprey.notes);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('ghost');
  });

  it('rejects an equilibrium outside the drawing range (orbits could not close)', () => {
    const broken = structuredClone(predprey.config) as Extract<PhasePlane, { type: 'phase_plane' }>;
    broken.gamma = 20; // X* = γ/δ = 66.7 — far outside the slider range
    const result = validateToyModelConfig(broken, predprey.notes);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('nullcline');
  });

  it('validation preserves targetY through reconstruction', () => {
    const result = validateToyModelConfig(predprey.config, predprey.notes);
    if (!result.valid || result.sanitizedConfig?.type !== 'phase_plane') throw new Error('fixture');
    expect(result.sanitizedConfig.prediction.targetY).toBe(4.5);
  });

  it('phase-plate (phase_plane) samples are finite over the whole 51×51 grid', () => {
    for (let i = 0; i <= 50; i++) {
      for (let j = 0; j <= 50; j++) {
        const x = config.primaryVar.min + (config.primaryVar.max - config.primaryVar.min) * i / 50;
        const y = config.secondVar.min + (config.secondVar.max - config.secondVar.min) * j / 50;
        const out = computeArchetypeOutput(config, { [config.primaryVar.key]: x, [config.secondVar.key]: y });
        expect(Number.isFinite(out.value)).toBe(true);
        expect(Number.isFinite(out.normalized)).toBe(true);
        expect(Math.abs(out.value)).toBeLessThanOrEqual(1e15);
      }
    }
  });
});

describe('devil’s advocate duel state', () => {
  const keys = { x: config.primaryVar.key, y: config.secondVar.key };
  const duelSave = (inputs: Record<string, number>, flags: { duelHeard?: boolean; duelRefuted?: boolean } = {}) => ({
    version: 1 as const,
    modelKey: modelFingerprint(config),
    predictionId: buildToyChallenge(config).correctId,
    inputs: { ...initialInputs(config), ...inputs },
    explored: true,
    revealed: true,
    updatedAt: 42,
    ...flags,
  });

  it('a genuine refutation survives restoration only when the claim was heard', () => {
    const refuted = duelSave({ [keys.y]: 7.5 }, { duelHeard: true, duelRefuted: true });
    expect(restoreToyProgress(config, refuted).duelRefuted).toBe(true);
    const unheard = restoreToyProgress(config, { ...refuted, duelHeard: false });
    expect(unheard.duelHeard).toBe(false);
    expect(unheard.duelRefuted).toBe(false);
  });

  it('a stored flag without the refuting configuration is discarded on restore', () => {
    const away = duelSave({ [keys.y]: 5 }, { duelHeard: true, duelRefuted: true });
    expect(restoreToyProgress(config, away).duelRefuted).toBe(false);
  });

  it('legacy saves predating the duel restore cleanly', () => {
    const legacy = duelSave(buildToyChallenge(config).targetInputs);
    const restored = restoreToyProgress(config, legacy);
    expect(restored.duelHeard).toBe(false);
    expect(restored.duelRefuted).toBe(false);
    expect(restored.revealed).toBe(true);
  });

  it('only an engine-verified refutation becomes a Devil’s Advocate trap card', () => {
    const activity = activityForToyExample(predprey);
    const response = { field1: '', field2: '', toyModelProgress: duelSave({ [keys.y]: 7.5 }, { duelHeard: true, duelRefuted: true }) };
    const card = toyDuelCard(activity, response)!;
    expect(card.front).toContain('never come back');
    expect(card.back).toContain('Refuted by setting predator');
    expect(card.back).toContain('orbits');
    // Unrevealed work exports nothing…
    expect(toyDuelCard(activity, { ...response, toyModelProgress: { ...response.toyModelProgress, revealed: false } })).toBeUndefined();
    // …and neither does a flag the engine cannot verify.
    const unearned = duelSave(buildToyChallenge(config).targetInputs, { duelHeard: true, duelRefuted: true });
    expect(toyDuelCard(activity, { field1: '', field2: '', toyModelProgress: unearned })).toBeUndefined();
  });
});
