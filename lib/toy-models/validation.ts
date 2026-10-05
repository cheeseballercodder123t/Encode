import { buildToyChallenge, computeArchetypeOutput, initialInputs, phasePlaneDerivative, phasePlaneEquilibrium, variablesFor } from './engine';
import { TOY_MODEL_TYPES, type ToyModelConfig, type ToyModelValidationResult, type ToyVariable } from './types';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const generic = /^(?:variable\s*[abxy12]|factor\s*[ab12]|parameter\s*\d*|input\s*\d*|output\s*\d*)$/i;

/** No eval, no guessed coefficients, no mutation of model payloads or stored sessions. */
export function validateToyModelConfig(raw: unknown, source?: string): ToyModelValidationResult {
  const issues: string[] = [];
  const failures: string[] = [];
  const data = object(raw);
  const text = (value: unknown, name: string, max = 500): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) { failures.push(`${name} must be nonempty text (max ${max})`); return ''; }
    return value.trim();
  };
  const number = (value: unknown, name: string, min = -1e9, max = 1e9): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) { failures.push(`${name} must be finite in [${min}, ${max}]`); return 0; }
    return value;
  };
  const quote = (value: unknown, name: string): string => {
    const result = text(value, name, 1200);
    if (source !== undefined && result && !normalize(source).includes(normalize(result))) failures.push(`${name} is not an exact quotation from the supplied source`);
    return result;
  };
  const variable = (rawVariable: unknown, name: string, domain?: 'positive' | 'nonnegative' | 'fraction'): ToyVariable => {
    const item = object(rawVariable);
    const label = text(item.label, `${name}.label`, 90);
    if (generic.test(label)) failures.push(`${name} uses a generic variable label`);
    const key = text(item.key, `${name}.key`, 30);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) failures.push(`${name}.key is unsafe`);
    let min = number(item.min, `${name}.min`);
    const repairedPositiveDomain = domain === 'positive' && min <= 0;
    const max = number(item.max, `${name}.max`);
    if (domain === 'positive' && min <= 0) { min = 0.01; issues.push(`Clamped ${name} minimum to 0.01 to protect the positive domain`); }
    if (domain === 'nonnegative' && min < 0) { min = 0; issues.push(`Clamped ${name} minimum to zero`); }
    if (domain === 'fraction' && (min <= 0 || max >= 1)) failures.push(`${name} fractions must stay strictly between 0 and 1`);
    if (!(max > min) || max - min < 1e-9) failures.push(`${name} has an empty or numerically unusable range`);
    let step = number(item.step, `${name}.step`, 1e-9, 1e9);
    if (repairedPositiveDomain && step > 0.01) {
      step = 0.01;
      issues.push(`Refined ${name} step to 0.01 so domain repair preserves reachable targets`);
    }
    if (step > max - min) failures.push(`${name}.step exceeds its range`);
    let initial = number(item.initial, `${name}.initial`);
    if (initial < min && (domain === 'positive' || domain === 'nonnegative')) { initial = min; issues.push(`Clamped ${name} initial value into its repaired domain`); }
    if (initial < min || initial > max) failures.push(`${name}.initial is outside the slider range`);
    return { key, label, symbol: text(item.symbol, `${name}.symbol`, 20), unit: text(item.unit, `${name}.unit`, 40), min, max, initial, step, evidence: quote(item.evidence, `${name}.evidence`) };
  };
  if (data.version !== 1) failures.push('Unsupported model version');
  if (!TOY_MODEL_TYPES.includes(data.type as ToyModelConfig['type'])) return { valid: false, issues: ['Unknown simulation archetype'] };
  const type = data.type as ToyModelConfig['type'];
  const output = object(data.output);
  const prediction = object(data.prediction);
  const evidence = Array.isArray(data.evidence) && data.evidence.length <= 12 ? data.evidence.map((entry, index) => {
    const item = object(entry);
    return { quote: quote(item.quote, `evidence[${index}].quote`), supports: text(item.supports, `evidence[${index}].supports`) };
  }) : [];
  if (evidence.length === 0) failures.push('Source evidence is required (1–12 quotations)');
  if (generic.test(String(output.label || ''))) failures.push('Output uses a generic label');
  const assumptions = Array.isArray(data.assumptions) && data.assumptions.length <= 12 ? data.assumptions.map((item, index) => text(item, `assumptions[${index}]`)) : [];
  if (!assumptions.length) failures.push('Explicit model assumptions and range provenance are required');
  const base = {
    version: 1 as const,
    title: text(data.title, 'title', 120),
    primaryVar: variable(data.primaryVar, 'primaryVar', type === 'saturation_sigmoid' || (type === 'ratio_scaling' && data.requiresPositiveOnly === true) || type === 'phase_plane' ? 'nonnegative' : type === 'two_state_equilibrium' ? 'fraction' : undefined),
    output: { label: text(output.label, 'output.label', 90), symbol: text(output.symbol, 'output.symbol', 20), unit: text(output.unit, 'output.unit', 40) },
    evidence,
    assumptions,
    prediction: { variableKey: text(prediction.variableKey, 'prediction.variableKey', 30), target: number(prediction.target, 'prediction.target'), explanation: text(prediction.explanation, 'prediction.explanation', 900), ...(prediction.targetY !== undefined ? { targetY: number(prediction.targetY, 'prediction.targetY') } : {}) },
    takeaway: text(data.takeaway, 'takeaway', 900),
  };
  let config: ToyModelConfig;
  switch (type) {
    case 'ratio_scaling': {
      config = { ...base, type, denominator: variable(data.denominator, 'denominator', 'positive'), coefficient: number(data.coefficient, 'coefficient'), numeratorExponent: number(data.numeratorExponent, 'numeratorExponent', -4, 4), denominatorExponent: number(data.denominatorExponent, 'denominatorExponent', -4, 4), requiresPositiveOnly: data.requiresPositiveOnly === true };
      if (!Number.isInteger(config.numeratorExponent) && config.primaryVar.min < 0) failures.push('Fractional powers require a nonnegative numerator');
      if (config.numeratorExponent < 0 && config.primaryVar.min <= 0) failures.push('Negative exponents require a strictly positive numerator');
      if (config.coefficient === 0 || (config.numeratorExponent === 0 && config.denominatorExponent === 0)) failures.push('Constant-zero or input-independent ratio models are not usable labs');
      break;
    }
    case 'saturation_sigmoid': {
      config = { ...base, type, hillCoefficient: variable(data.hillCoefficient, 'hillCoefficient', 'positive'), halfSaturation: number(data.halfSaturation, 'halfSaturation', 1e-9, 1e9), maximum: number(data.maximum, 'maximum', 1e-9, 1e9) };
      if (config.hillCoefficient.max > 8) failures.push('Hill coefficient exceeds the supported range (0.01–8)');
      if (config.halfSaturation < config.primaryVar.min || config.halfSaturation > config.primaryVar.max) failures.push('Half-saturation beacon must be inside the concentration range');
      break;
    }
    case 'two_state_equilibrium': {
      config = { ...base, type, temperature: variable(data.temperature, 'temperature', 'positive'), equilibriumConstant: number(data.equilibriumConstant, 'equilibriumConstant', 1e-6, 1e6), stateA: text(data.stateA, 'stateA', 70), stateB: text(data.stateB, 'stateB', 70), total: number(data.total, 'total', 1e-9, 1e9), amountUnit: text(data.amountUnit, 'amountUnit', 40) };
      if (config.temperature.unit !== 'K' || config.output.unit !== 'kJ/mol') failures.push('Equilibrium engine requires temperature in K and energy in kJ/mol');
      const equilibriumFraction = config.equilibriumConstant / (1 + config.equilibriumConstant);
      if (equilibriumFraction < config.primaryVar.min || equilibriumFraction > config.primaryVar.max) failures.push('Equilibrium fraction must be reachable');
      if (config.stateA === config.stateB) failures.push('Two equilibrium states must be distinct');
      break;
    }
    case 'cyclic_state_machine': {
      const states = Array.isArray(data.states) && data.states.length <= 8 ? data.states.map((entry, index) => {
        const state = object(entry);
        return { id: text(state.id, `states[${index}].id`, 30), label: text(state.label, `states[${index}].label`, 70), mechanism: text(state.mechanism, `states[${index}].mechanism`, 600), duration: number(state.duration, `states[${index}].duration`, 0.1, 100), energy: number(state.energy, `states[${index}].energy`, -1e4, 1e4), activationBarrier: number(state.activationBarrier, `states[${index}].activationBarrier`, 0, 1e4), evidence: quote(state.evidence, `states[${index}].evidence`) };
      }) : [];
      config = { ...base, type, states, cyclic: data.cyclic === true, energyUnit: text(data.energyUnit, 'energyUnit', 40), energyIsIllustrative: data.energyIsIllustrative === true };
      if (states.length < 3 || new Set(states.map((state) => state.id)).size !== states.length) failures.push('Cycle needs 3–8 states with unique IDs');
      if (config.primaryVar.min !== 0 || config.primaryVar.max !== 100 || config.primaryVar.unit !== '%') failures.push('Reaction progress must run from 0 to 100%');
      break;
    }
    case 'critical_threshold': {
      config = { ...base, type, threshold: number(data.threshold, 'threshold'), response: data.response as 'collapse' | 'activate' | 'sign_change', peak: number(data.peak, 'peak'), maximum: number(data.maximum, 'maximum', 1e-9, 1e9), slope: number(data.slope, 'slope'), intercept: number(data.intercept, 'intercept'), safeLabel: text(data.safeLabel, 'safeLabel', 60), criticalLabel: text(data.criticalLabel, 'criticalLabel', 60), chain: Array.isArray(data.chain) && data.chain.length <= 6 ? data.chain.map((item, index) => text(item, `chain[${index}]`, 100)) : [] };
      if (!['collapse', 'activate', 'sign_change'].includes(config.response)) failures.push('Unknown threshold response');
      if (config.threshold <= config.primaryVar.min || config.threshold >= config.primaryVar.max) failures.push('Threshold must lie strictly inside the range');
      if (config.response === 'collapse' && !(config.peak > config.primaryVar.min && config.peak < config.threshold)) failures.push('Collapse requires min < peak < threshold < max');
      if (config.response === 'sign_change' && (config.slope === 0 || Math.abs(config.intercept + config.slope * config.threshold) > Math.max(1e-6, Math.abs(config.intercept) * 1e-6))) failures.push('Sign-change threshold does not match the zero of the affine law');
      if (config.chain.length < 2) failures.push('Threshold needs 2–6 grounded mechanism nodes');
      break;
    }
    case 'phase_plane': {
      config = { ...base, type, secondVar: variable(data.secondVar, 'secondVar', 'positive'), alpha: number(data.alpha, 'alpha', 0, 100), beta: number(data.beta, 'beta', 0, 100), gamma: number(data.gamma, 'gamma', 0, 100), delta: number(data.delta, 'delta', 0, 100) };
      const eq = phasePlaneEquilibrium(config);
      // Both nullclines (X = γ/δ, Y = α/β) must sit strictly inside the drawing
      // range, or the coexistence equilibrium — the whole point of the lab — is
      // unreachable and no orbit can close on screen.
      if (eq.x <= config.primaryVar.min || eq.x >= config.primaryVar.max) failures.push('Prey nullcline γ/δ must lie strictly inside the primary range');
      if (eq.y <= config.secondVar.min || eq.y >= config.secondVar.max) failures.push('Predator nullcline α/β must lie strictly inside the second range');
      if (config.alpha <= 0 || config.beta <= 0 || config.gamma <= 0 || config.delta <= 0) failures.push('Lotka–Volterra constants must be strictly positive');
      break;
    }
  }
  if (data.counterModel !== undefined) {
    const counter = object(data.counterModel);
    const expectedLaw = type === 'saturation_sigmoid' ? 'linear' : type === 'critical_threshold' ? 'no_threshold' : undefined;
    if (!expectedLaw || counter.law !== expectedLaw || (type === 'critical_threshold' && config.type === type && config.response === 'sign_change')) failures.push('Unsupported counter-model comparison');
    else config.counterModel = { law: expectedLaw, assumption: text(counter.assumption, 'counterModel.assumption'), explanation: text(counter.explanation, 'counterModel.explanation', 900), evidence: quote(counter.evidence, 'counterModel.evidence') };
  }
  // The Devil's Advocate duel: the refutation must be a REAL reachable lab
  // configuration that differs from baseline, so "debunking" means actually
  // reconfiguring the instrument — and its evidence must quote the source.
  if (data.devilsAdvocate !== undefined) {
    const duel = object(data.devilsAdvocate);
    const refutation = object(duel.refutationInputs);
    const refutationInputs: Record<string, number> = {};
    for (const [key, value] of Object.entries(refutation)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) { failures.push(`devilsAdvocate.refutationInputs.${key} is an unsafe key`); continue; }
      refutationInputs[key] = number(value, `devilsAdvocate.refutationInputs.${key}`);
    }
    config.devilsAdvocate = {
      speaker: text(duel.speaker, 'devilsAdvocate.speaker', 60),
      claim: text(duel.claim, 'devilsAdvocate.claim', 600),
      fallacy: text(duel.fallacy, 'devilsAdvocate.fallacy', 200),
      refutationInputs,
      refutationOutcome: text(duel.refutationOutcome, 'devilsAdvocate.refutationOutcome', 900),
      evidence: quote(duel.evidence, 'devilsAdvocate.evidence'),
    };
  }
  const variables = variablesFor(config);
  if (new Set(variables.map((item) => item.key)).size !== variables.length) failures.push('Independent variable keys must be unique');
  const predictionVariable = variables.find((item) => item.key === config.prediction.variableKey);
  if (!predictionVariable || config.prediction.target < predictionVariable.min || config.prediction.target > predictionVariable.max || config.prediction.target === predictionVariable.initial) failures.push('Prediction needs a different, reachable target on a real slider');
  if (predictionVariable) {
    const tick = (config.prediction.target - predictionVariable.min) / predictionVariable.step;
    if (Math.abs(tick - Math.round(tick)) > 1e-6) failures.push('Prediction target must be reachable on the slider step grid');
  }
  // Phase-plane predictions move BOTH coordinates, so the second one needs the
  // same reachability proof as the first.
  if (config.type === 'phase_plane') {
    if (config.prediction.variableKey !== config.primaryVar.key) failures.push('Phase-plane prediction must move the primary (prey) coordinate');
    const yVar = config.secondVar;
    const yTarget = config.prediction.targetY;
    if (yTarget === undefined || yTarget < yVar.min || yTarget > yVar.max) failures.push('Phase-plane prediction needs targetY inside the second slider range');
    else {
      const tickY = (yTarget - yVar.min) / yVar.step;
      if (Math.abs(tickY - Math.round(tickY)) > 1e-6) failures.push('Prediction targetY must be reachable on the slider step grid');
    }
  }
  if (failures.length) return { valid: false, issues: [...issues, ...failures] };

  // 51 points per axis; for two-slider labs also the full 51×51 grid, not only
  // a diagonal that could miss a tiny denominator at a large numerator.
  const baseline = initialInputs(config);
  const sample = (inputs: Record<string, number>): boolean => {
    const result = computeArchetypeOutput(config, inputs);
    return Number.isFinite(result.value) && Math.abs(result.value) <= 1e15 && Number.isFinite(result.normalized);
  };
  const first = variables[0];
  const second = variables[1];
  for (let i = 0; i <= 50; i++) {
    for (let j = 0; j <= (second ? 50 : 0); j++) {
      const inputs = { ...baseline, [first.key]: first.min + (first.max - first.min) * i / 50, ...(second ? { [second.key]: second.min + (second.max - second.min) * j / 50 } : {}) };
      if (!sample(inputs)) return { valid: false, issues: [...issues, `Non-finite or oversized output at sample ${i},${j}`] };
    }
  }
  const challenge = buildToyChallenge(config);
  if (!sample(challenge.targetInputs)) return { valid: false, issues: [...issues, 'Prediction target produced invalid output'] };
  const criticalPoints = config.type === 'critical_threshold' ? [config.peak, config.threshold] : config.type === 'saturation_sigmoid' ? [config.halfSaturation] : [];
  if (criticalPoints.some((point) => !sample({ ...baseline, [first.key]: point }))) return { valid: false, issues: [...issues, 'Invalid output at a critical boundary'] };
  // Verify directional invariants along each axis, not just finite outputs.
  const ordered = (points: number[], direction: number) => points.every((point, index) => index === 0 || direction * (point - points[index - 1]) >= -Math.max(1e-8, Math.abs(point) * 1e-10));
  for (const axis of variables) {
    if (config.type === 'cyclic_state_machine' || (config.type === 'critical_threshold' && config.response === 'collapse')) continue;
    // The conserved orbit quantity is non-monotonic in each axis by design:
    // V has a minimum on the nullcline, which is why orbits close.
    if (config.type === 'phase_plane') continue;
    if (config.type === 'saturation_sigmoid' && axis.key !== first.key) continue; // n steepens, not uniformly raises, a Hill curve.
    const outputs = Array.from({ length: 51 }, (_, index) => computeArchetypeOutput(config, { ...baseline, [axis.key]: axis.min + (axis.max - axis.min) * index / 50 }).value);
    if (config.type === 'ratio_scaling' && config.primaryVar.min < 0) continue; // even powers cross their extremum at zero.
    const direction = Math.sign(outputs[outputs.length - 1] - outputs[0]);
    if (direction && !ordered(outputs, direction)) return { valid: false, issues: [...issues, `Monotonicity invariant failed for ${axis.label}`] };
  }
  if (config.type === 'critical_threshold' && config.response === 'collapse') {
    const peak = computeArchetypeOutput(config, config.peak).value;
    const failure = computeArchetypeOutput(config, config.threshold).value;
    if (Math.abs(peak - config.maximum) > 1e-6 || failure !== 0) return { valid: false, issues: [...issues, 'Collapse boundary invariant failed'] };
  }
  if (config.type === 'two_state_equilibrium') {
    const zero = computeArchetypeOutput(config, config.equilibriumConstant / (1 + config.equilibriumConstant)).value;
    if (Math.abs(zero) > 1e-6) return { valid: false, issues: [...issues, 'Equilibrium sign boundary failed'] };
  }
  // Phase-plane invariant: the coexistence equilibrium must actually be one —
  // both velocity components vanish there to integrator precision. The exact
  // point (γ/δ, α/δ) rarely sits on the slider step grid, so the velocity is
  // evaluated at the analytically exact point, not a snapped one.
  if (config.type === 'phase_plane') {
    const eq = phasePlaneEquilibrium(config);
    const velocity = phasePlaneDerivative(config, eq.x, eq.y);
    if (Math.abs(velocity.dx) > 1e-9 || Math.abs(velocity.dy) > 1e-9) return { valid: false, issues: [...issues, 'Phase-plane equilibrium invariant failed'] };
    // The duel's target must also produce a decisive direction (no null point
    // where the multiple-choice question would be ambiguous).
    const duelVelocity = phasePlaneDerivative(config, challenge.targetInputs[first.key], challenge.targetInputs[second?.key ?? first.key]);
    if (duelVelocity.dx === 0 || duelVelocity.dy === 0) return { valid: false, issues: [...issues, 'Phase-plane prediction target sits on a nullcline with ambiguous flow'] };
  }
  // The duel's refutation configuration must be reachable (each named input
  // exists as a slider and the value lands on its step grid, inside its range)
  // and must actually differ from the starting configuration — otherwise the
  // "debunk" would be a no-op the learner could pass without touching anything.
  if (config.devilsAdvocate) {
    const duel = config.devilsAdvocate;
    if (Object.keys(duel.refutationInputs).length === 0) return { valid: false, issues: [...issues, 'Devil’s advocate duel needs at least one refutation input'] };
    for (const [key, value] of Object.entries(duel.refutationInputs)) {
      const slider = variables.find((item) => item.key === key);
      if (!slider) return { valid: false, issues: [...issues, `Duel refutation names unknown variable ${key}`] };
      if (value < slider.min || value > slider.max) return { valid: false, issues: [...issues, `Duel refutation for ${key} is outside its slider range`] };
      const tick = (value - slider.min) / slider.step;
      if (Math.abs(tick - Math.round(tick)) > 1e-6) return { valid: false, issues: [...issues, `Duel refutation for ${key} is not on the slider step grid`] };
      if (Math.abs(value - slider.initial) <= slider.step / 2) return { valid: false, issues: [...issues, `Duel refutation for ${key} equals the initial value`] };
    }
  }
  return { valid: true, sanitizedConfig: config, issues };
}
