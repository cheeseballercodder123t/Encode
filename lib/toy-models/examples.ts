import type { Activity } from '../types';
import { buildToyChallenge } from './engine';
import type { PhasePlaneConfig, ToyModelConfig, ToyVariable } from './types';

export interface ToyExample { id: string; label: string; notes: string; config: ToyModelConfig }
const variable = (key: string, label: string, symbol: string, unit: string, min: number, max: number, initial: number, step: number, evidence: string): ToyVariable => ({ key, label, symbol, unit, min, max, initial, step, evidence });
const assumptions = ['Slider ranges and starting values are illustrative teaching choices, not measurements from the source.'];

export const TOY_EXAMPLES: ToyExample[] = [
  {
    id: 'ohm', label: 'Ohm’s law',
    notes: 'Ohm’s law: I = V / R. Voltage V is measured in volts (V), resistance R in ohms (Ω), and current I in amperes (A). For an ideal ohmic resistor at constant temperature, doubling resistance at fixed voltage halves current.',
    config: {
      version: 1, type: 'ratio_scaling', title: 'Ohm’s law · current you can feel',
      primaryVar: variable('voltage', 'Voltage', 'V', 'V', 0, 24, 12, 0.1, 'Voltage V is measured in volts (V)'),
      denominator: variable('resistance', 'Resistance', 'R', 'Ω', 0.5, 12, 4, 0.1, 'resistance R in ohms (Ω)'),
      coefficient: 1, numeratorExponent: 1, denominatorExponent: 1, requiresPositiveOnly: true,
      output: { label: 'Current', symbol: 'I', unit: 'A' },
      evidence: [{ quote: 'I = V / R', supports: 'Ideal ohmic relation' }], assumptions: [...assumptions, 'Ideal constant-temperature resistor. No thermal, safety or dielectric-breakdown limits are modeled. Particle speed illustrates conventional current, not electron drift velocity.'],
      prediction: { variableKey: 'resistance', target: 8, explanation: 'At fixed voltage, twice the resistance gives half the current: 12/8 = 1.5 A.' },
      takeaway: 'Doubling resistance halves current only when voltage is held fixed.',
    },
  },
  {
    id: 'enzyme', label: 'Enzyme saturation',
    notes: 'Michaelis-Menten kinetics: v = Vmax [S] / (Km + [S]). For this enzyme, Vmax = 100 µmol/min and Km = 2 mM. At substrate concentration [S] = Km, reaction rate is half of Vmax. At high [S], the enzyme approaches Vmax because active sites are occupied.',
    config: {
      version: 1, type: 'saturation_sigmoid', title: 'Enzyme kinetics · find the ceiling',
      primaryVar: variable('substrate', 'Substrate concentration', '[S]', 'mM', 0, 20, 2, 0.1, 'substrate concentration [S] = Km'),
      hillCoefficient: variable('hill', 'Hill coefficient', 'n', 'dimensionless', 0.5, 4, 1, 0.1, 'Michaelis-Menten kinetics'),
      halfSaturation: 2, maximum: 100, output: { label: 'Reaction rate', symbol: 'v', unit: 'µmol/min' },
      evidence: [{ quote: 'Vmax = 100 µmol/min and Km = 2 mM', supports: 'Capacity and half-saturation constants' }],
      assumptions: [...assumptions, 'n=1 is the source Michaelis-Menten law; changing n explores hypothetical cooperativity, not a fitted property of this enzyme. No denaturation is modeled.'],
      prediction: { variableKey: 'substrate', target: 10, explanation: 'More substrate raises rate toward Vmax, but occupied active sites prevent unlimited linear growth.' },
      takeaway: 'At [S]=Km, rate is Vmax/2; extra substrate cannot exceed the capacity ceiling.',
      counterModel: { law: 'linear', assumption: 'Every extra substrate molecule increases rate without a capacity limit.', explanation: 'The dashed linear model exceeds Vmax. Finite active-site occupancy imposes saturation.', evidence: 'At high [S], the enzyme approaches Vmax because active sites are occupied.' },
    },
  },
  {
    id: 'equilibrium', label: 'Le Chatelier',
    notes: 'An ideal two-state isomerization A ⇌ B has equilibrium constant K = 3 at 298 K. Reaction quotient Q = B/A. Gibbs energy ΔG = RT ln(Q/K). If Q < K the forward reaction A → B is favored; if Q > K the reverse reaction B → A is favored. Total material A+B is conserved.',
    config: {
      version: 1, type: 'two_state_equilibrium', title: 'Equilibrium · push, then watch it settle',
      primaryVar: variable('fraction', 'Fraction in state B', 'B/(A+B)', 'fraction', 0.01, 0.99, 0.5, 0.01, 'Total material A+B is conserved.'),
      temperature: variable('temperature', 'Temperature', 'T', 'K', 250, 350, 298, 1, 'K = 3 at 298 K'),
      equilibriumConstant: 3, stateA: 'Isomer A', stateB: 'Isomer B', total: 100, amountUnit: 'relative units',
      output: { label: 'Reaction Gibbs energy', symbol: 'ΔG', unit: 'kJ/mol' }, evidence: [{ quote: 'equilibrium constant K = 3 at 298 K', supports: 'Equilibrium constant' }, { quote: 'Gibbs energy ΔG = RT ln(Q/K).', supports: 'Direction law' }],
      assumptions: [...assumptions, 'Ideal unit activity coefficients. Total=100 relative units is illustrative. K is held fixed while temperature rescales ΔG; this is not a temperature-dependent equilibrium model.'],
      prediction: { variableKey: 'fraction', target: 0.9, explanation: 'Q rises above K. ΔG becomes positive for A→B, so net reaction favors B→A.' },
      takeaway: 'Q>K favors reverse flux; equilibrium is Q=K, not necessarily equal amounts of A and B.',
    },
  },
  {
    id: 'cycle', label: 'Action potential',
    notes: 'The action potential follows this cycle: resting membrane → depolarization → repolarization → refractory recovery → resting membrane. Depolarization opens voltage-gated Na+ channels; repolarization inactivates Na+ channels while K+ exits; refractory recovery restores excitability before another spike.',
    config: {
      version: 1, type: 'cyclic_state_machine', title: 'Action potential · walk the cycle',
      primaryVar: variable('progress', 'Reaction progress', 'p', '%', 0, 100, 0, 1, 'resting membrane → depolarization → repolarization → refractory recovery → resting membrane'),
      output: { label: 'Illustrative energy coordinate', symbol: 'E', unit: 'relative units' },
      states: [
        { id: 'rest', label: 'Resting membrane', mechanism: 'Ion gradients prime the membrane for the next stimulus.', duration: 1, energy: 0, activationBarrier: 5, evidence: 'resting membrane' },
        { id: 'depolarize', label: 'Depolarization', mechanism: 'Voltage-gated Na+ channels open.', duration: 1, energy: 4, activationBarrier: 4, evidence: 'Depolarization opens voltage-gated Na+ channels' },
        { id: 'repolarize', label: 'Repolarization', mechanism: 'Na+ inactivates while K+ exits.', duration: 1, energy: 1, activationBarrier: 3, evidence: 'repolarization inactivates Na+ channels while K+ exits' },
        { id: 'recover', label: 'Refractory recovery', mechanism: 'Excitability is restored before another spike.', duration: 3, energy: -1, activationBarrier: 2, evidence: 'refractory recovery restores excitability before another spike.' },
      ], cyclic: true, energyUnit: 'relative units', energyIsIllustrative: true,
      evidence: [{ quote: 'resting membrane → depolarization → repolarization → refractory recovery → resting membrane', supports: 'State order and cyclic return' }],
      assumptions: [...assumptions, 'Energy/barrier heights and relative dwell times are illustrative. This is a state-order model, not measured Gibbs energy or a Hodgkin-Huxley voltage simulation. Recovery is deliberately the toy bottleneck.'],
      prediction: { variableKey: 'progress', target: 75, explanation: 'Recovery occupies the longest relative dwell interval (50–100%) in this illustrative timeline.' },
      takeaway: 'Repolarization and refractory recovery are different states: restoring voltage does not immediately restore excitability.',
    },
  },
  {
    id: 'threshold', label: 'Thermal failure',
    notes: 'In this illustrative enzyme experiment, activity rises with temperature up to a peak at 37 °C, then declines to zero by a denaturation threshold of 45 °C. Increased thermal motion disrupts the non-covalent interactions maintaining the active-site shape. These temperatures describe this example, not every enzyme.',
    config: {
      version: 1, type: 'critical_threshold', title: 'Enzyme stability · find the breaking point',
      primaryVar: variable('temperature', 'Temperature', 'T', '°C', 10, 60, 25, 0.5, 'activity rises with temperature up to a peak at 37 °C'),
      threshold: 45, peak: 37, response: 'collapse', maximum: 100, slope: 0, intercept: 0,
      safeLabel: 'ACTIVE', criticalLabel: 'DENATURED', chain: ['Thermal motion rises', 'Non-covalent contacts fail', 'Active-site shape is lost'],
      output: { label: 'Relative activity', symbol: 'v', unit: '%' },
      evidence: [{ quote: 'a peak at 37 °C, then declines to zero by a denaturation threshold of 45 °C', supports: 'Peak and failure threshold' }],
      assumptions: [...assumptions, 'Piecewise-linear activity envelope and maximum=100% are illustrative, not measured unfolding kinetics. Failure is reversible in this toy slider; real denaturation may be irreversible.'],
      prediction: { variableKey: 'temperature', target: 45, explanation: 'In this example, thermal motion destroys stabilizing non-covalent contacts, losing the active-site geometry and catalytic activity.' },
      takeaway: 'More thermal motion can accelerate chemistry only while the enzyme retains its active-site shape.',
      counterModel: { law: 'no_threshold', assumption: 'Warming always accelerates the enzyme with no structural failure.', explanation: 'The dashed model keeps rising after the enzyme has lost its active-site shape; it ignores denaturation.', evidence: 'Increased thermal motion disrupts the non-covalent interactions maintaining the active-site shape.' },
    },
  },
];

const preyPreyConfig: PhasePlaneConfig = {
  version: 1, type: 'phase_plane', title: 'Predator–prey · why neither side wins',
  primaryVar: variable('prey', 'Prey population', 'X', 'hundreds', 0.4, 8, 2, 0.05, 'Prey population X (in hundreds)'),
  secondVar: variable('predator', 'Predator population', 'Y', 'tens', 0.4, 8, 2, 0.05, 'Predator population Y (in tens)'),
  alpha: 1.1, beta: 0.4, gamma: 0.9, delta: 0.3,
  output: { label: 'Conserved orbit quantity', symbol: 'V', unit: 'relative' },
  evidence: [
    { quote: 'predator–prey dynamics', supports: 'Coupled two-species system' },
  ],
  assumptions: [
    ...assumptions,
    'Fixed Lotka–Volterra coupling constants α=1.1, β=0.4, γ=0.9, δ=0.3 are illustrative teaching values, not fitted from the source; the notes name the interaction shape, not the constants.',
    'Closed orbits around coexistence (X*=γ/δ=3.0, Y*=α/β=2.75): no damping, no carrying capacity, no seasonality, no harvesting. Populations are continuous, not discrete animals.',
    'The conserved quantity V = δX − γ ln X + βY − α ln Y is exact for this law; orbits are its level sets.',
  ],
  prediction: { variableKey: 'prey', targetY: 4.5, target: 1.2, explanation: 'At low prey and high predators, dY/dt = δXY − γY < 0: predators starve faster than encounters feed them, while dX/dt < 0 only weakly — the orbit turns upward as predation pressure collapses.' },
  takeaway: 'Neither population can eliminate the other: the coexistence point is a center, and every perturbation becomes an orbit around it.',
  devilsAdvocate: {
    speaker: 'Maya',
    claim: 'More predators always means fewer prey, so if I crank predators to the top the prey are wiped out and never come back.',
    fallacy: 'One-way coupling: predators consume prey but nothing feeds back.',
    refutationInputs: { predator: 7.5 },
    refutationOutcome: 'Predation crashes the prey briefly, but starving predators (dY/dt = δXY − γY < 0 at low X) collapse first, releasing predation pressure — the prey recover and the state orbits instead of exterminating.',
    evidence: 'predator–prey dynamics',
  },
};

TOY_EXAMPLES.push({
  id: 'predprey', label: 'Predator–prey orbits',
    notes: 'Ecology seminar: predator–prey dynamics. Prey population X (in hundreds) grows logistically in the absence of predators and is consumed at a rate proportional to the number of predator–prey encounters. Predator population Y (in tens) starves without prey and grows on the same encounters. The coupled feedback means neither species can eliminate the other: the system cycles. Crashing predator numbers release predation pressure and prey rebound; booming prey then feed a predator boom, and the cycle repeats. Coupled feedback means one-way reasoning always fails here.',
  config: preyPreyConfig,
});

export function activityForToyExample(example: ToyExample): Activity {
  return { id: `lab-${example.id}`, stageNumber: 1, title: example.config.title, framework: 'Predict → Manipulate → Reveal', cognitiveGoal: example.config.takeaway, contextSnippet: example.notes, keywords: [example.config.primaryVar.label, example.config.output.label], templateType: example.config.type === 'cyclic_state_machine' ? 'state_transition' : example.config.type === 'critical_threshold' ? 'boundary_stress_test' : example.config.type === 'phase_plane' ? 'formula_spatial_grid' : 'formula_spatial_grid', prompt: 'Commit to a prediction, manipulate the model, and explain the boundary you discovered.', paradox: buildToyChallenge(example.config).question, toyModel: example.config, scaffold: { field1Label: 'Observed change', field1Placeholder: 'What physically changed?', field2Label: 'Boundary rule', field2Placeholder: 'Which assumption stops holding?', exampleAnswer: example.config.takeaway } };
}

/** Offline source matching is deliberately conservative: no keyword-only numeric invention. */
export function findGroundedToyExample(source: string): ToyExample | undefined {
  const normalized = source.replace(/\s+/g, ' ').trim().toLowerCase();
  return TOY_EXAMPLES.find((example) => normalized.includes(example.notes.replace(/\s+/g, ' ').trim().toLowerCase()));
}
