import type { PhasePlaneConfig, ToyChallenge, ToyInputs, ToyModelConfig, ToyModelOutput, ToyModelProgress, ToyVariable } from './types';

/**
 * Deterministic RK4 for the predator–prey (Lotka–Volterra) phase plane.
 * dX/dt = alpha·X − beta·X·Y (prey grows alone, is eaten proportionally to
 * encounters), dY/dt = delta·X·Y − gamma·Y (predators starve alone, grow on
 * encounters). Same ODE at every call site, so the field, the trajectory and
 * the challenge all agree to integrator error.
 */
export function phasePlaneDerivative(config: PhasePlaneConfig, x: number, y: number): { dx: number; dy: number } {
  return {
    dx: config.alpha * x - config.beta * x * y,
    dy: config.delta * x * y - config.gamma * y,
  };
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const lerp = (min: number, max: number, fraction: number) => min + (max - min) * fraction;
export function variablesFor(config: ToyModelConfig): ToyVariable[] {
  switch (config.type) {
    case 'ratio_scaling': return [config.primaryVar, config.denominator];
    case 'saturation_sigmoid': return [config.primaryVar, config.hillCoefficient];
    case 'two_state_equilibrium': return [config.primaryVar, config.temperature];
    case 'phase_plane': return [config.primaryVar, config.secondVar];
    default: return [config.primaryVar];
  }
}
export function initialInputs(config: ToyModelConfig): ToyInputs {
  return Object.fromEntries(variablesFor(config).map((variable) => [variable.key, variable.initial]));
}
export function sanitizeInputs(config: ToyModelConfig, raw: ToyInputs): ToyInputs {
  return Object.fromEntries(variablesFor(config).map((variable) => {
    const value = raw[variable.key];
    return [variable.key, clamp(Number.isFinite(value) ? value : variable.initial, variable.min, variable.max)];
  }));
}
function logistic(value: number): number {
  return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
}
/** One fixed-step RK4 advance (dt=0.05 default) for trajectories and the duel. */
export function phasePlaneStep(config: Extract<ToyModelConfig, { type: 'phase_plane' }>, x: number, y: number, dt = 0.05): { x: number; y: number } {
  const k1 = phasePlaneDerivative(config, x, y);
  const k2 = phasePlaneDerivative(config, x + k1.dx * dt / 2, y + k1.dy * dt / 2);
  const k3 = phasePlaneDerivative(config, x + k2.dx * dt / 2, y + k2.dy * dt / 2);
  const k4 = phasePlaneDerivative(config, x + k3.dx * dt, y + k3.dy * dt);
  return {
    x: x + dt * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx) / 6,
    y: y + dt * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy) / 6,
  };
}
/** Forward trajectory of at most `steps` RK4 steps, clamped away from the axes. */
export function phasePlaneTrajectory(config: Extract<ToyModelConfig, { type: 'phase_plane' }>, x0: number, y0: number, steps: number, dt = 0.05): { x: number; y: number }[] {
  const points = [{ x: x0, y: y0 }];
  let current = { x: Math.max(x0, 1e-6), y: Math.max(y0, 1e-6) };
  for (let index = 0; index < steps; index++) {
    current = phasePlaneStep(config, current.x, current.y, dt);
    current = { x: Math.max(current.x, 1e-6), y: Math.max(current.y, 1e-6) };
    if (!Number.isFinite(current.x) || !Number.isFinite(current.y)) break;
    points.push({ ...current });
  }
  return points;
}
/** The coexistence equilibrium (γ/δ, α/β) — the center every orbit encircles.
 * X-nullcline Y=α/β, Y-nullcline X=γ/δ; they cross at coexistence. */
export function phasePlaneEquilibrium(config: Extract<ToyModelConfig, { type: 'phase_plane' }>): { x: number; y: number } {
  return { x: config.gamma / config.delta, y: config.alpha / config.beta };
}
/**
 * Exact phase-plane quantities. `value` is the conserved Lotka–Volterra
 * integral V = δX − γ ln X + βY − α ln Y: closed orbits are its level sets,
 * so two states on the same orbit share the same reading. `normalized` is
 * drawing-only (position between the plateau's outermost sampled levels).
 */
export function computePhasePlaneOutput(config: PhasePlaneConfig, x: number, y: number): ToyModelOutput {
  const eq = phasePlaneEquilibrium(config);
  const level = (px: number, py: number) =>
    config.delta * px - config.gamma * Math.log(Math.max(px, 1e-9)) + config.beta * py - config.alpha * Math.log(Math.max(py, 1e-9));
  const value = level(x, y);
  const corners = [level(config.primaryVar.min, config.secondVar.min), level(config.primaryVar.max, config.secondVar.min), level(config.primaryVar.min, config.secondVar.max), level(config.primaryVar.max, config.secondVar.max), value];
  const low = Math.min(...corners);
  const high = Math.max(...corners);
  const atEquilibrium = Math.abs(x - eq.x) <= config.primaryVar.step / 2 + 1e-9 && Math.abs(y - eq.y) <= config.secondVar.step / 2 + 1e-9;
  const velocity = phasePlaneDerivative(config, x, y);
  // Quadrant of the flow, named by the sign of each velocity component:
  // above the X-nullcline (Y > α/β) prey decline; right of the Y-nullcline
  // (X > γ/δ) predators rise. Names track dX/dt and dY/dt exactly.
  const predatorZone = y > config.alpha / config.beta;
  const preyZone = x > config.gamma / config.delta;
  const status = atEquilibrium
    ? 'COEXISTENCE'
    : predatorZone && preyZone ? 'PREDATORS RISING'
    : predatorZone ? 'BOTH FALLING'
    : preyZone ? 'BOTH RISING'
    : 'PREDATORS STARVING';
  return { value, normalized: high > low ? clamp((value - low) / (high - low), 0, 1) : 0, status, critical: false, equilibrium: atEquilibrium };
}
export function cyclePosition(config: Extract<ToyModelConfig, { type: 'cyclic_state_machine' }>, progress: number) {
  const total = config.states.reduce((sum, state) => sum + state.duration, 0);
  const elapsed = clamp(progress, 0, 100) / 100 * total;
  let start = 0;
  for (let index = 0; index < config.states.length; index++) {
    const state = config.states[index];
    if (elapsed < start + state.duration || index === config.states.length - 1) {
      return { index, local: clamp((elapsed - start) / state.duration, 0, 1), start: start / total * 100, end: (start + state.duration) / total * 100 };
    }
    start += state.duration;
  }
  return { index: 0, local: 0, start: 0, end: 100 };
}
/** Two cubic Bézier half-segments meet smoothly at the exact activation peak.
 * Both the curve and marker use the same smoothstep polynomial. */
export function reactionEnergy(config: Extract<ToyModelConfig, { type: 'cyclic_state_machine' }>, index: number, t: number) {
  const current = config.states[index];
  const next = config.states[index + 1] ?? (config.cyclic ? config.states[0] : current);
  const peak = Math.max(current.energy, next.energy) + current.activationBarrier;
  const u = t <= 0.5 ? t * 2 : (t - 0.5) * 2;
  const smooth = u * u * (3 - 2 * u);
  return t <= 0.5 ? lerp(current.energy, peak, smooth) : lerp(peak, next.energy, smooth);
}
/** Exact laws; only numerical normalization for drawing is clamped, not the output. */
export function computeArchetypeOutput(config: ToyModelConfig, primaryOrInputs: number | ToyInputs): ToyModelOutput {
  const inputs = sanitizeInputs(config, typeof primaryOrInputs === 'number' ? { ...initialInputs(config), [config.primaryVar.key]: primaryOrInputs } : primaryOrInputs);
  const x = inputs[config.primaryVar.key];
  switch (config.type) {
    case 'ratio_scaling': {
      const denominator = inputs[config.denominator.key];
      const value = config.coefficient * x ** config.numeratorExponent / denominator ** config.denominatorExponent;
      const reference = Math.max(Math.abs(config.coefficient * config.primaryVar.initial ** config.numeratorExponent / config.denominator.initial ** config.denominatorExponent), 1e-9);
      return { value, normalized: clamp(Math.abs(value) / (reference * 3), 0, 1), status: 'SCALING', critical: false, equilibrium: value === 0 };
    }
    case 'saturation_sigmoid': {
      const fraction = x === 0 ? 0 : logistic(inputs[config.hillCoefficient.key] * (Math.log(x) - Math.log(config.halfSaturation)));
      return { value: config.maximum * fraction, normalized: fraction, status: fraction >= 0.95 ? 'SATURATED' : 'RESPONDING', critical: false, equilibrium: Math.abs(x - config.halfSaturation) <= config.primaryVar.step / 2 };
    }
    case 'two_state_equilibrium': {
      const fractionB = x;
      const q = fractionB / (1 - fractionB);
      const value = 8.314462618 * inputs[config.temperature.key] * Math.log(q / config.equilibriumConstant) / 1000;
      const balanced = Math.abs(Math.log(q / config.equilibriumConstant)) < 0.03;
      return { value, normalized: fractionB, q, fractionA: 1 - fractionB, fractionB, status: balanced ? 'EQUILIBRIUM' : q < config.equilibriumConstant ? 'A → B' : 'B → A', critical: false, equilibrium: balanced };
    }
    case 'cyclic_state_machine': {
      const position = cyclePosition(config, x);
      const slowest = Math.max(...config.states.map((state) => state.duration));
      return { value: reactionEnergy(config, position.index, position.local), normalized: x / 100, stateIndex: position.index, localProgress: position.local, status: config.states[position.index].duration === slowest ? 'BOTTLENECK' : 'TRANSITION', critical: false, equilibrium: x === 100 };
    }
    case 'critical_threshold': {
      const critical = x >= config.threshold;
      let value: number;
      if (config.response === 'sign_change') value = config.intercept + config.slope * x;
      else if (config.response === 'activate') value = critical ? config.maximum : 0;
      else {
        // Deliberately disclosed toy envelope: rise to peak, fall to zero at threshold.
        value = critical ? 0 : x <= config.peak
          ? config.maximum * (x - config.primaryVar.min) / (config.peak - config.primaryVar.min)
          : config.maximum * (config.threshold - x) / (config.threshold - config.peak);
      }
      return { value, normalized: config.response === 'sign_change' ? clamp((x - config.primaryVar.min) / (config.primaryVar.max - config.primaryVar.min), 0, 1) : clamp(value / config.maximum, 0, 1), status: critical ? config.criticalLabel : config.safeLabel, critical, equilibrium: config.response === 'sign_change' && Math.abs(value) <= Math.abs(config.slope) * config.primaryVar.step / 2 };
    }
    case 'phase_plane': {
      return computePhasePlaneOutput(config, x, inputs[config.secondVar.key]);
    }
  }
}
export function computeCounterModelOutput(config: ToyModelConfig, inputs: ToyInputs): number | undefined {
  if (!config.counterModel) return undefined;
  const values = sanitizeInputs(config, inputs);
  const x = values[config.primaryVar.key];
  if (config.type === 'saturation_sigmoid') return config.maximum * x / (2 * config.halfSaturation);
  if (config.type === 'critical_threshold') {
    if (config.response === 'activate') return config.maximum * clamp((x - config.primaryVar.min) / (config.primaryVar.max - config.primaryVar.min), 0, 1);
    return config.maximum * (x - config.primaryVar.min) / (config.peak - config.primaryVar.min);
  }
  return undefined;
}
export function buildToyChallenge(config: ToyModelConfig): ToyChallenge {
  const baseline = initialInputs(config);
  const targetInputs = { ...baseline, [config.prediction.variableKey]: config.prediction.target, ...(config.type === 'phase_plane' && config.prediction.targetY !== undefined ? { [config.secondVar.key]: config.prediction.targetY } : {}) };
  const variable = variablesFor(config).find((item) => item.key === config.prediction.variableKey)!;
  if (config.type === 'cyclic_state_machine') {
    const index = cyclePosition(config, config.prediction.target).index;
    return { question: `At ${config.prediction.target}% ${variable.label.toLowerCase()}, which state is active?`, choices: config.states.map((state) => ({ id: state.id, label: state.label })), correctId: config.states[index].id, targetInputs };
  }
  if (config.type === 'phase_plane') {
    // The duel question for the phase plane is the flow direction at the
    // perturbed point: both sliders move, so the answer must come from the
    // sign of each velocity component under the same law the field draws.
    const velocity = phasePlaneDerivative(config, targetInputs[config.primaryVar.key], targetInputs[config.secondVar.key]);
    const prey = velocity.dx > 0 ? 'increase' : velocity.dx < 0 ? 'decrease' : 'same';
    const predator = velocity.dy > 0 ? 'increase' : velocity.dy < 0 ? 'decrease' : 'same';
    // The wrong options name the intuitive mistakes: the fallacy the duel
    // targets ("more predators eat more, so prey only fall"), and the
    // catastrophe reading. Labels stay generic so the same engine serves any
    // coupled system the source describes.
    const preyArrow = prey === 'increase' ? 'rises' : prey === 'decrease' ? 'falls' : 'holds';
    const predatorArrow = predator === 'increase' ? 'rise' : predator === 'decrease' ? 'fall' : 'hold';
    const wrongA = predator === 'decrease' && prey === 'increase' ? 'Prey falls · Predators rise' : prey === 'increase' ? 'Both crash together' : 'Prey rises · Predators hold';
    const wrongB = prey === 'decrease' ? 'Both rise together' : 'Prey falls · Predators rise';
    return {
      question: `Set ${config.primaryVar.label.toLowerCase()} to ${config.prediction.target} ${config.primaryVar.unit} and ${config.secondVar.label.toLowerCase()} to ${config.prediction.targetY} ${config.secondVar.unit}. What does the flow do next?`,
      choices: [
        { id: 'flow-true', label: `Prey ${preyArrow} · Predators ${predatorArrow}` },
        { id: 'flow-wrong-a', label: wrongA },
        { id: 'flow-wrong-b', label: wrongB },
      ],
      correctId: 'flow-true',
      targetInputs,
    };
  }
  const current = computeArchetypeOutput(config, baseline);
  const target = computeArchetypeOutput(config, targetInputs);
  if (config.type === 'critical_threshold') {
    return { question: `Set ${variable.label} to ${config.prediction.target} ${variable.unit}. Which regime will you reach?`, choices: [{ id: 'safe', label: config.safeLabel }, { id: 'critical', label: config.criticalLabel }, { id: 'unchanged', label: 'No regime change is possible' }], correctId: target.critical ? 'critical' : 'safe', targetInputs };
  }
  const tolerance = Math.max(1e-9, Math.abs(current.value) * 1e-6);
  const correctId = Math.abs(target.value - current.value) <= tolerance ? 'same' : target.value > current.value ? 'increase' : 'decrease';
  return { question: `If ${variable.label} changes from ${variable.initial} to ${config.prediction.target} ${variable.unit}, what happens to ${config.output.label.toLowerCase()}?`, choices: [{ id: 'increase', label: 'Increases' }, { id: 'decrease', label: 'Decreases' }, { id: 'same', label: 'Unchanged' }], correctId, targetInputs };
}
export function modelFingerprint(config: ToyModelConfig): string {
  // Property order can change when validators reconstruct AI JSON. Fingerprints
  // encode values, never object insertion order.
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  const json = JSON.stringify(canonical(config));
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) hash = Math.imul(hash ^ json.charCodeAt(i), 16777619);
  return `toy-v1-${(hash >>> 0).toString(16)}`;
}
export function restoreToyProgress(config: ToyModelConfig, raw?: ToyModelProgress): ToyModelProgress {
  const modelKey = modelFingerprint(config);
  if (!raw || raw.modelKey !== modelKey || raw.version !== 1) return { version: 1, modelKey, inputs: initialInputs(config), explored: false, revealed: false, updatedAt: 0 };
  const challenge = buildToyChallenge(config);
  const predictionId = challenge.choices.some((choice) => choice.id === raw.predictionId) ? raw.predictionId : undefined;
  const base: ToyModelProgress = { version: 1, modelKey, inputs: predictionId ? sanitizeInputs(config, raw.inputs || {}) : initialInputs(config), predictionId, explored: !!predictionId && raw.explored === true, revealed: !!predictionId && raw.explored === true && raw.revealed === true, updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0 };
  if (config.devilsAdvocate) {
    // Duel state only survives when the refutation actually verifies against
    // the engine — a stored flag without the configuration that earns it is
    // discarded, so a stale save can never carry an unearned "refuted".
    const holds = Object.entries(config.devilsAdvocate.refutationInputs).every(([key, value]) => Math.abs((base.inputs[key] ?? NaN) - value) <= (variablesFor(config).find((item) => item.key === key)?.step ?? 0) / 2 + 1e-9);
    base.duelHeard = raw.duelHeard === true;
    // And the argument has to have been heard to be lost: a refuted flag
    // without duelHeard is the same unearned state from the other side.
    base.duelRefuted = raw.duelRefuted === true && base.duelHeard && holds;
  }
  return base;
}
export function formatToyNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (value !== 0 && (Math.abs(value) >= 1e5 || Math.abs(value) < 0.001)) return value.toExponential(2);
  return Number(value.toFixed(3)).toLocaleString('en-US');
}
export function equationFor(config: ToyModelConfig): string {
  const x = config.primaryVar.symbol;
  switch (config.type) {
    case 'ratio_scaling': return `${config.output.symbol} = ${config.coefficient} · ${x}^${config.numeratorExponent} / ${config.denominator.symbol}^${config.denominatorExponent}`;
    case 'saturation_sigmoid': return `${config.output.symbol} = ${config.maximum} · ${x}ⁿ / (${config.halfSaturation}ⁿ + ${x}ⁿ)`;
    case 'two_state_equilibrium': return 'ΔG = RT ln(Q/K) · Q = B/A';
    case 'cyclic_state_machine': return config.states.map((state) => state.label).join(' → ') + (config.cyclic ? ' ↻' : '');
    case 'critical_threshold': return config.response === 'sign_change' ? `${config.output.symbol} = ${config.intercept} + (${config.slope}) · ${x}` : `${x} < ${config.threshold} ↔ ${x} ≥ ${config.threshold} ${config.primaryVar.unit}`;
    case 'phase_plane': {
      const y = config.secondVar.symbol;
      return `d${x}/dt = ${config.alpha}${x} − ${config.beta}${x}${y} · d${y}/dt = ${config.delta}${x}${y} − ${config.gamma}${y}`;
    }
  }
}
