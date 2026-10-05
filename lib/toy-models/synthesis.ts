import { Type } from '@google/genai';

const string = { type: Type.STRING };
const number = { type: Type.NUMBER };
const boolean = { type: Type.BOOLEAN };
const variable = {
  type: Type.OBJECT,
  properties: { key: string, label: string, symbol: string, unit: string, min: number, max: number, initial: number, step: number, evidence: string },
  required: ['key', 'label', 'symbol', 'unit', 'min', 'max', 'initial', 'step', 'evidence'],
};
/** Optional fields are used only by their named archetype; runtime validation is stricter. */
export const toyModelSchema = {
  type: Type.OBJECT,
  description: 'Optional note-grounded configuration for one of five precompiled interactive engines. Omit if no engine fits; never invent a physical law.',
  properties: {
    version: { type: Type.INTEGER, description: 'Always 1' },
    type: { type: Type.STRING, enum: ['ratio_scaling', 'saturation_sigmoid', 'two_state_equilibrium', 'cyclic_state_machine', 'critical_threshold', 'phase_plane'] },
    title: string,
    primaryVar: variable,
    output: { type: Type.OBJECT, properties: { label: string, symbol: string, unit: string }, required: ['label', 'symbol', 'unit'] },
    evidence: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { quote: string, supports: string }, required: ['quote', 'supports'] } },
    assumptions: { type: Type.ARRAY, items: string },
    prediction: { type: Type.OBJECT, properties: { variableKey: string, target: number, explanation: string }, required: ['variableKey', 'target', 'explanation'] },
    takeaway: string,
    denominator: variable,
    coefficient: number,
    numeratorExponent: number,
    denominatorExponent: number,
    requiresPositiveOnly: boolean,
    hillCoefficient: variable,
    halfSaturation: number,
    maximum: number,
    temperature: variable,
    equilibriumConstant: number,
    stateA: string,
    stateB: string,
    total: number,
    amountUnit: string,
    states: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: string, label: string, mechanism: string, duration: number, energy: number, activationBarrier: number, evidence: string }, required: ['id', 'label', 'mechanism', 'duration', 'energy', 'activationBarrier', 'evidence'] } },
    cyclic: boolean,
    energyUnit: string,
    energyIsIllustrative: boolean,
    threshold: number,
    response: { type: Type.STRING, enum: ['collapse', 'activate', 'sign_change'] },
    peak: number,
    slope: number,
    intercept: number,
    safeLabel: string,
    criticalLabel: string,
    chain: { type: Type.ARRAY, items: string },
    counterModel: { type: Type.OBJECT, properties: { assumption: string, law: { type: Type.STRING, enum: ['linear', 'no_threshold'] }, explanation: string, evidence: string }, required: ['assumption', 'law', 'explanation', 'evidence'] },
    secondVar: variable,
    alpha: number,
    beta: number,
    gamma: number,
    delta: number,
    devilsAdvocate: {
      type: Type.OBJECT,
      properties: { speaker: string, claim: string, fallacy: string, refutationInputs: { type: Type.OBJECT, properties: {}, required: [] as string[] }, refutationOutcome: string, evidence: string },
      required: ['speaker', 'claim', 'fallacy', 'refutationInputs', 'refutationOutcome', 'evidence'],
    },
  },
  required: ['version', 'type', 'title', 'primaryVar', 'output', 'evidence', 'assumptions', 'prediction', 'takeaway'],
};

export const TOY_MODEL_INSTRUCTION = `
INTERACTIVE TOY-MODEL SYNTHESIZER (optional top-level 'toyModel' on each activity):
For a real quantitative law, state cycle or threshold in the SUPPLIED SOURCE, build a config for the following fixed engines. This is DATA, never executable code, arbitrary formulas, HTML, URLs, JavaScript, or invented science. Prefer interactive labs for formula_spatial_grid, state_transition, cause_effect, boundary_stress_test, broken_model_debug; any template may carry a fitting lab.

COMMON CONTRACT:
version: 1; type; title; primaryVar {key, label, symbol, unit, min, max, initial, step, evidence}; output {label,symbol,unit}; evidence [{quote,supports}]; assumptions [text]; prediction {variableKey,target,explanation}; takeaway.
All labels name real variables in the notes, never 'Variable A'/'Factor B'. All evidence quotes MUST be verbatim substrings of the supplied notes/transcript, or an exact transcription from the attached document. Do not cite your own invented stage context as source. Each variable's evidence identifies its real name in the source. Preserve units and convert ONLY when you explicitly explain it in assumptions. Prediction changes ONE slider to a different reachable target, leaving others initial; correctness is computed locally, not decided by you. Explanation gives the causal WHY and takeaway names a discriminative boundary.
Distinguish SOURCE constants/thresholds from ILLUSTRATIVE slider ranges, initial values, Hill-coefficient exploration, relative dwell times and energy heights. State every illustrative choice in assumptions. When a required governing constant, threshold, or state order is missing, OMIT the lab instead of inventing it. Omit for concepts not expressible by these engines. Never shoehorn ΔG=ΔH−TΔS into a ratio, saturation, or cyclic law.

1. ratio_scaling: Y=coefficient*A^numeratorExponent/B^denominatorExponent. primaryVar=A; denominator variable B (min>0); coefficient including explicit unit conversions; exponents [-4,4], requiresPositiveOnly boolean. Examples I=V/R -> coefficient=1, exponents=1,1; F=m*a -> numerator m, denominator acceleration with exponent=-1. Denominator is a mathematical slot, not necessarily a resisting quantity. Disclose that ideal ratios have no modeled breakdown threshold. Do not claim a safety limit without source evidence.
2. saturation_sigmoid: Y=maximum*X^n/(halfSaturation^n+X^n). X>=0, halfSaturation>0 inside slider range; maximum>0; hillCoefficient variable n in (0,8]. Michaelis-Menten starts n=1. n exploration is a hypothesis, not proof of cooperativity. Thermal denaturation is NOT saturation: use a critical collapse lab when notes give peak/threshold. Optional counterModel law='linear' with a named mistaken unsaturating assumption, source evidence and correction.
3. two_state_equilibrium: ideal A⇌B at constant supplied equilibriumConstant K. primaryVar is FRACTION B, min>0/max<1, unit='fraction'. temperature in K, total>0 in amountUnit, stateA/stateB real names, output ΔG in kJ/mol. Q=B/A; ΔG=RT ln(Q/K), ΔG°=-RT ln K. Temperature changes energy scale with K held fixed; DO NOT claim shifting K with T (no enthalpy model). The slider must reach K/(1+K). Q>K drives B→A, Q<K drives A→B; amount is conserved.
4. cyclic_state_machine: primaryVar reaction progress min=0/max=100/unit='%'. 3–8 states in SOURCE ORDER {id,label,mechanism,duration,energy,activationBarrier,evidence}, cyclic boolean (false for a linear process), energyUnit, energyIsIllustrative boolean. Each duration is positive relative dwell time (0.1–100); highest dwell is bottleneck. Energy/barrier heights are illustrative unless source supplies them. Do not imply real measured Gibbs energies for electrical/process cycles. State evidence is an exact quote identifying that state. No stochastic kinetics or time-calibrated reaction rate is simulated.
5. critical_threshold: threshold INSIDE range; response='activate' for a source threshold, 'collapse' for rise/peak/failure, 'sign_change' ONLY for an affine thermodynamic law. maximum>0, peak, slope, intercept, safeLabel, criticalLabel, chain [2–6 real mechanistic nodes]. activate: 0 below threshold, maximum above. collapse: piecewise linear envelope rising from min to peak then declining to zero at threshold; explicitly call the envelope illustrative, not measured protein-folding kinetics. sign_change: output=intercept+slope*X and threshold=-intercept/slope (e.g. X=T in K, intercept=ΔH, slope=-ΔS in matching energy units). peak/maximum are unused drawing fields for sign_change; explain that. Never claim all enzymes denature at a universal 45°C. Optional counterModel law='no_threshold' only for activate/collapse, never sign_change.
6. phase_plane: ONLY for a source-supplied coupled two-variable dynamical system (predator–prey/Lotka–Volterra, epidemic S-I host–pathogen, or any X,Y pair the notes give coupling constants or interaction terms for). primaryVar=prey/host/resource X (min>0), secondVar=predator/pathogen/consumer Y (min>0), output is the conserved quantity description. Fixed law dX/dt=αX−βXY, dY/dt=δXY−γY with STRICTLY POSITIVE α,β,γ,δ from the source or clearly-illustrative-and-stated-in-assumptions. Both nullclines X*=γ/δ and Y*=α/β must lie strictly inside the slider ranges, or the orbit cannot close: check this arithmetic before emitting. prediction moves BOTH coordinates: variableKey=X key, target=X value, targetY=Y value, and the target must be off both nullclines so the flow direction is decisive. State in assumptions that the engine models closed orbits around coexistence (γ/δ, α/δ) — no damping, no carrying capacity, no external forcing. Do NOT shoehorn a single-variable relationship into two sliders.

DEVIL'S ADVOCATE DUEL (optional 'devilsAdvocate' on any lab, only when the source contradicts a famous intuitive fallacy):
speaker: a fictional student name ('Alex', 'Maya'); claim: one confident sentence in their voice asserting the fallacy about THIS system (e.g. 'adding a competitive inhibitor lowers Vmax'); fallacy: the named intuitive rule the claim rests on ('more of X always means more of Y', 'resistance consumes current'); refutationInputs: an object of variableKey→value pairs naming REAL sliders of this same lab, each value a reachable slider step that differs from its initial value, whose configuration makes the model visibly contradict the claim (for competitive inhibition at saturating [S] the rate still approaches Vmax); refutationOutcome: what the lab shows at that configuration, in one sentence; evidence: an EXACT verbatim quotation from the source that grounds the refutation. Never fake a refutation the fixed engine cannot show; omit the duel entirely when the lab cannot demonstrate it.
`;
