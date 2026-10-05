export const TOY_MODEL_TYPES = ['ratio_scaling', 'saturation_sigmoid', 'two_state_equilibrium', 'cyclic_state_machine', 'critical_threshold', 'phase_plane'] as const;
export type ToyModelType = typeof TOY_MODEL_TYPES[number];

export interface ToyVariable {
  key: string;
  label: string;
  symbol: string;
  unit: string;
  min: number;
  max: number;
  initial: number;
  step: number;
  /** Exact source quotation identifying this variable; range assumptions are separate. */
  evidence: string;
}
export interface ToyEvidence { quote: string; supports: string }
export interface ToyPrediction {
  /** One controlled perturbation; all other inputs remain at their initial values. */
  variableKey: string;
  target: number;
  /** Phase-plane second coordinate of the perturbation (required for that archetype only). */
  targetY?: number;
  explanation: string;
}
export interface ToyCounterModel {
  /** Deliberately wrong, named assumption, never arbitrary JavaScript. */
  assumption: string;
  law: 'linear' | 'no_threshold';
  explanation: string;
  evidence: string;
}
interface ToyBase {
  version: 1;
  title: string;
  primaryVar: ToyVariable;
  output: { label: string; symbol: string; unit: string };
  evidence: ToyEvidence[];
  /** Honest limitations, including any illustrative ranges/energies rather than measurements. */
  assumptions: string[];
  prediction: ToyPrediction;
  takeaway: string;
  counterModel?: ToyCounterModel;
  /**
   * Optional Devil's Advocate duel: the examiner voices a fictional student's
   * confident fallacy, and the learner must reconfigure the SAME lab to the
   * refuting configuration. Correctness is verified locally — refutationInputs
   * are evaluated by the engine, never trusted as text.
   */
  devilsAdvocate?: ToyDevilsAdvocate;
}
export interface RatioScalingConfig extends ToyBase {
  type: 'ratio_scaling';
  denominator: ToyVariable;
  coefficient: number;
  numeratorExponent: number;
  denominatorExponent: number;
  requiresPositiveOnly: boolean;
}
export interface SaturationConfig extends ToyBase {
  type: 'saturation_sigmoid';
  hillCoefficient: ToyVariable;
  halfSaturation: number;
  maximum: number;
}
export interface EquilibriumConfig extends ToyBase {
  type: 'two_state_equilibrium';
  temperature: ToyVariable;
  equilibriumConstant: number;
  stateA: string;
  stateB: string;
  /** Primary input is the fraction of conserved material in state B, not absolute molarity. */
  total: number;
  amountUnit: string;
}
export interface CycleState {
  id: string;
  label: string;
  mechanism: string;
  /** Relative dwell time; autoplay spends longer at bottlenecks. */
  duration: number;
  energy: number;
  activationBarrier: number;
  evidence: string;
}
export interface CycleConfig extends ToyBase {
  type: 'cyclic_state_machine';
  states: CycleState[];
  cyclic: boolean;
  energyUnit: string;
  energyIsIllustrative: boolean;
}
export interface ThresholdConfig extends ToyBase {
  type: 'critical_threshold';
  threshold: number;
  response: 'collapse' | 'activate' | 'sign_change';
  peak: number;
  maximum: number;
  /** Only sign_change uses slope/intercept: output = intercept + slope × input. */
  slope: number;
  intercept: number;
  safeLabel: string;
  criticalLabel: string;
  /** Grounded mechanism nodes used by the feedback-collapse visualization. */
  chain: string[];
}
/**
 * The Devil's Advocate duel: a confident fictional claim carrying a named
 * intuitive fallacy. The learner debunks it by reconfiguring the SAME lab —
 * correctness is verified locally against refutationInputs, never by a model.
 */
export interface ToyDevilsAdvocate {
  /** The fictional student's name, e.g. 'Alex'. */
  speaker: string;
  /** The confident wrong claim, in the speaker's voice. */
  claim: string;
  /** The named intuitive fallacy (p-prim) the claim rests on. */
  fallacy: string;
  /** The lab configuration that visibly debunks the claim. */
  refutationInputs: ToyInputs;
  /** What the model actually shows at that configuration. */
  refutationOutcome: string;
  /** Exact source quotation identifying where the model contradicts the claim. */
  evidence: string;
}
export interface PhasePlaneConfig extends ToyBase {
  type: 'phase_plane';
  /** Second coupled state variable (the vertical axis). */
  secondVar: ToyVariable;
  /** Lotka–Volterra coupling constants, all strictly positive (1/time family). */
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
}
export type ToyModelConfig = RatioScalingConfig | SaturationConfig | EquilibriumConfig | CycleConfig | ThresholdConfig | PhasePlaneConfig;
export type ToyInputs = Record<string, number>;
export interface ToyModelValidationResult {
  valid: boolean;
  sanitizedConfig?: ToyModelConfig;
  issues: string[];
}
export interface ToyModelOutput {
  value: number;
  normalized: number;
  status: string;
  critical: boolean;
  equilibrium: boolean;
  stateIndex?: number;
  localProgress?: number;
  q?: number;
  fractionA?: number;
  fractionB?: number;
}
export interface ToyChoice { id: string; label: string }
export interface ToyChallenge {
  question: string;
  choices: ToyChoice[];
  correctId: string;
  targetInputs: ToyInputs;
}
export interface ToyModelProgress {
  version: 1;
  /** Fingerprint prevents carrying a solved prediction into a different generated model. */
  modelKey: string;
  predictionId?: string;
  inputs: ToyInputs;
  explored: boolean;
  revealed: boolean;
  /** Devil's advocate duel state: the claim heard, and whether the refuting configuration has been set. */
  duelHeard?: boolean;
  duelRefuted?: boolean;
  updatedAt: number;
}
