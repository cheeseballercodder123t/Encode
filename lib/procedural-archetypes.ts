import { ProceduralMCQArchetype } from './types';

// ─── Built-in Procedural Trap-Engine Archetypes ─────────────────────────────
// Starter pack of 9 verified parametric MCQ archetypes covering AP Physics C,
// AP Chemistry, and AP Statistics. Every formula here is deliberately built so
// that the correct answer and all three traps stay numerically distinct across
// the ENTIRE declared variable space (verified by lib/procedural-validator and
// tests/unit/procedural-archetypes.test.ts). AI-authored archetypes from
// /api/archetype are held to the same standard.

export const SHM_MAX_SPEED: ProceduralMCQArchetype = {
  id: 'physc-shm-vmax',
  topic: 'AP Physics C: Simple Harmonic Motion',
  questionTemplate:
    'A block of mass m = {{m}} kg is attached to a spring with spring constant k = {{k}} N/m. ' +
    'The block is pulled to an amplitude A = {{A}} m on a frictionless surface and released from rest. ' +
    'What is its maximum speed v_max during the resulting simple harmonic motion?',
  variables: {
    m: { min: 0.5, max: 2.0, step: 0.1, decimals: 2 },
    k: { min: 50, max: 200, step: 5, decimals: 0 },
    A: { min: 0.1, max: 0.5, step: 0.05, decimals: 2 },
  },
  unit: 'm/s',
  correctFormulaJs: '(A * Math.sqrt(k / m)).toFixed(2)',
  traps: [
    {
      trapName: 'Inverted Frequency Formula',
      formulaJs: '(A * Math.sqrt(m / k)).toFixed(2)',
      explanation:
        'You used \\(\\sqrt{m/k}\\), which belongs to the period \\(T = 2\\pi\\sqrt{m/k}\\). ' +
        'Maximum speed requires the angular frequency \\(\\omega = \\sqrt{k/m}\\).',
    },
    {
      trapName: 'Forgot the Amplitude',
      formulaJs: 'Math.sqrt(k / m).toFixed(2)',
      explanation:
        'You computed \\(\\omega\\) itself, not a speed. Energy conservation gives ' +
        '\\(\\tfrac{1}{2}kA^2 = \\tfrac{1}{2}mv_{max}^2\\), so \\(v_{max} = A\\omega\\) : the amplitude must appear.',
    },
    {
      trapName: 'Period-Speed Confusion (2π Error)',
      formulaJs: '(2 * Math.PI * A / Math.sqrt(k / m)).toFixed(2)',
      explanation:
        'You computed \\(A \\cdot T\\). The period \\(T = 2\\pi\\sqrt{m/k}\\) is a TIME, not a frequency : ' +
        'you needed \\(v_{max} = A\\omega\\) with \\(\\omega = \\sqrt{k/m}\\), which has no \\(2\\pi\\) and no inversion.',
    },
  ],
  stepByStepSolutionTemplate:
    'Energy conservation between maximum displacement and maximum speed: ' +
    '\\( \\tfrac{1}{2}kA^2 = \\tfrac{1}{2}mv_{max}^2 \\).<br>' +
    'Solve: \\( v_{max} = A\\sqrt{k/m} \\). With \\( \\omega = \\sqrt{k/m} \\), this is \\( v_{max} = A\\omega \\).<br>' +
    'Plugging in \\( m = {{m}} \\ \\text{kg} \\), \\( k = {{k}} \\ \\text{N/m} \\), \\( A = {{A}} \\ \\text{m} \\): ' +
    'the computed maximum speed is shown as the highlighted answer above.',
};

export const RC_TIME_CONSTANT: ProceduralMCQArchetype = {
  id: 'physc-rc-tau',
  topic: 'AP Physics C: RC Circuit Time Constant',
  questionTemplate:
    'A series circuit contains a resistor R = {{R}} kΩ and a capacitor C = {{C}} µF. ' +
    'The capacitor begins fully uncharged and the switch is closed at t = 0. ' +
    'What is the time constant τ of this RC circuit?',
  variables: {
    R: { min: 2, max: 10, step: 0.5, decimals: 1 },
    C: { choices: [10, 22, 47, 100, 220, 470, 1000], decimals: 0 },
  },
  unit: 'ms',
  correctFormulaJs: '(R * C).toFixed(1)',
  traps: [
    {
      trapName: 'Divided Instead of Multiplied',
      formulaJs: '(R / C).toFixed(3)',
      explanation:
        'The time constant is the PRODUCT \\(\\tau = RC\\): resistance opposes the charge flow and capacitance stores ' +
        'more charge, so both slow the process : they multiply. \\(R/C\\) does not even have units of time.',
    },
    {
      trapName: 'Half-Life Confusion (τ·ln2)',
      formulaJs: '(R * C * 0.693).toFixed(1)',
      explanation:
        'You computed \\(\\tau\\ln 2\\), the time to reach ~50% charge (the "half-life" of the capacitor). ' +
        'The time constant \\(\\tau = RC\\) is the time to reach \\(1 - e^{-1} \\approx 63.2\\%\\) of full charge.',
    },
    {
      trapName: 'Inverse Frequency (1/RC)',
      formulaJs: '(1000 / (R * C)).toFixed(2)',
      explanation:
        '\\(1/\\tau\\) is the inverse time constant (the corner frequency scale of the circuit), not the time constant. ' +
        'The capacitor voltage rises as \\(V(t) = V_0(1 - e^{-t/RC})\\) : the exponent is \\(-t/RC\\), so \\(\\tau = RC\\).',
    },
  ],
  stepByStepSolutionTemplate:
    'Charging a capacitor through a resistor: \\( V_C(t) = V_0\\left(1 - e^{-t/RC}\\right) \\).<br>' +
    'The time constant is \\( \\tau = RC \\). With R in kΩ and C in µF, the product \\( RC \\) comes out directly in ms ' +
    '(kΩ × µF = 10³ Ω × 10⁻⁶ F = 10⁻³ s).<br>' +
    'Here \\( \\tau = {{R}} \\times {{C}} \\), the highlighted answer above, in milliseconds.',
};

export const ROTATIONAL_TORQUE: ProceduralMCQArchetype = {
  id: 'physc-torque-ialpha',
  topic: 'AP Physics C: Rotational Torque',
  questionTemplate:
    'A flywheel with moment of inertia I = {{I}} kg·m² experiences a constant net torque that produces ' +
    'an angular acceleration α = {{alpha}} rad/s². What is the magnitude of the net torque τ acting on the flywheel?',
  variables: {
    I: { min: 2.5, max: 5.0, step: 0.25, decimals: 2 },
    alpha: { min: 2, max: 12, step: 0.5, decimals: 1 },
  },
  unit: 'N·m',
  correctFormulaJs: '(I * alpha).toFixed(2)',
  traps: [
    {
      trapName: 'Linear F=ma Misfire (Dividing)',
      formulaJs: '(I / alpha).toFixed(2)',
      explanation:
        'You divided where the rotational Newton\u2019s second law multiplies: \\(\\tau_{net} = I\\alpha\\), the rotational ' +
        'analogue of \\(F = ma\\). The quotient \\(I/\\alpha\\) is not a torque.',
    },
    {
      trapName: 'Square-Root Slip √(Iα)',
      formulaJs: 'Math.sqrt(I * alpha).toFixed(2)',
      explanation:
        'There is no square root in Newton\u2019s second law for rotation. \\(\\tau = I\\alpha\\) is linear in both ' +
        'moment of inertia and angular acceleration.',
    },
    {
      trapName: 'Half-Inertia Oversight (I = ½mr²)',
      formulaJs: '(I * alpha * 0.5).toFixed(2)',
      explanation:
        'The factor of ½ already lives INSIDE the moment of inertia (e.g. a solid disc has \\(I = \\tfrac{1}{2}mr^2\\)). ' +
        'Once \\(I\\) is given as a number, apply \\(\\tau = I\\alpha\\) with no extra factor.',
    },
  ],
  stepByStepSolutionTemplate:
    'Newton\u2019s second law for rotation: \\( \\tau_{net} = I\\alpha \\).<br>' +
    'This is the exact rotational analogue of \\(F = ma\\): rotational inertia (I) times angular acceleration (α).<br>' +
    'Here \\( \\tau = {{I}} \\times {{alpha}} \\), the highlighted answer above, in N·m.',
};

export const BUFFER_PH: ProceduralMCQArchetype = {
  id: 'apchem-buffer-ph',
  topic: 'AP Chemistry: Buffer pH (Henderson-Hasselbalch)',
  questionTemplate:
    'A buffer is prepared with a weak acid whose pKa = {{pKa}}. The equilibrium mixture contains ' +
    '[A⁻]/[HA] = {{ratio}} (conjugate base to weak acid molar ratio). ' +
    'Using the Henderson-Hasselbalch equation, what is the pH of this buffer?',
  variables: {
    pKa: { choices: [3.17, 4.2, 4.76, 6.35, 7.54, 9.25], decimals: 2 },
    ratio: { choices: [0.1, 0.25, 0.5, 2, 4, 10], decimals: 2 },
  },
  unit: 'pH units',
  correctFormulaJs: '(pKa + Math.log10(ratio)).toFixed(2)',
  traps: [
    {
      trapName: 'Inverted Base-to-Acid Ratio',
      formulaJs: '(pKa + Math.log10(1 / ratio)).toFixed(2)',
      explanation:
        'Henderson-Hasselbalch is \\(pH = pK_a + \\log\\frac{[A^-]}{[HA]}\\) : conjugate base on TOP. ' +
        'You inverted the ratio, which flips the sign of the log term.',
    },
    {
      trapName: 'No-Log Ratio (Linear Mix)',
      formulaJs: '(pKa + ratio).toFixed(2)',
      explanation:
        'The ratio enters through a LOGARITHM, not linearly. A 10× ratio changes pH by exactly 1 unit, ' +
        'not 10 units : that logarithmic compression is the entire point of Henderson-Hasselbalch.',
    },
    {
      trapName: 'pOH Confusion (14 − pH)',
      formulaJs: '(14 - (pKa + Math.log10(ratio))).toFixed(2)',
      explanation:
        'You computed pOH. The Henderson-Hasselbalch equation yields pH directly for the acid/conjugate-base pair; ' +
        'converting to pOH (\\(pOH = 14 - pH\\)) answers the complementary basicity question.',
    },
  ],
  stepByStepSolutionTemplate:
    'Henderson-Hasselbalch: \\( pH = pK_a + \\log_{10}\\dfrac{[A^-]}{[HA]} \\).<br>' +
    'Substitute \\( pK_a = {{pKa}} \\) and the ratio \\( \\dfrac{[A^-]}{[HA]} = {{ratio}} \\), take the base-10 ' +
    'logarithm of the ratio, and add: the result is the highlighted pH above.<br>' +
    'Buffer rule of thumb: when \\([A^-] = [HA]\\), pH = pKa exactly; every 10× ratio shift moves pH by ±1.',
};

export const REACTION_QUOTIENT: ProceduralMCQArchetype = {
  id: 'apchem-q-vs-k',
  topic: 'AP Chemistry: Reaction Quotient Q vs K',
  questionTemplate:
    'For the gas-phase equilibrium 2 NO₂(g) ⇌ N₂O₄(g), the concentrations at one instant are ' +
    '[NO₂] = {{n}} M and [N₂O₄] = {{d}} M. Compute the reaction quotient Qc at this instant.',
  variables: {
    n: { min: 0.5, max: 0.8, step: 0.01, decimals: 2 },
    d: { min: 0.02, max: 0.1, step: 0.01, decimals: 2 },
  },
  unit: 'unitless (Qc)',
  correctFormulaJs: '(d / (n * n)).toFixed(3)',
  traps: [
    {
      trapName: 'Inverted Equilibrium Expression',
      formulaJs: '((n * n) / d).toFixed(3)',
      explanation:
        'For \\(2NO_2 \\rightleftharpoons N_2O_4\\) the quotient is \\(Q_c = \\dfrac{[N_2O_4]}{[NO_2]^2}\\) : ' +
        'products over reactants. You flipped the fraction (that would be 1/Q).',
    },
    {
      trapName: 'Forgot the Stoichiometric Square',
      formulaJs: '(d / n).toFixed(3)',
      explanation:
        'The coefficient 2 in \\(2NO_2\\) becomes an EXPONENT in the quotient law: \\([NO_2]^2\\), not \\([NO_2]\\). ' +
        'Equilibrium expressions are built from balanced-coefficient exponents.',
    },
    {
      trapName: 'Both Errors Combined (Flipped AND Unsquared)',
      formulaJs: '(n / d).toFixed(3)',
      explanation:
        'You inverted the fraction AND dropped the exponent : two independent quotient-law rules violated at once. ' +
        'Slow down: write products over reactants first, then raise each species to its balanced coefficient.',
    },
  ],
  stepByStepSolutionTemplate:
    'Reaction quotient law for \\(2NO_2(g) \\rightleftharpoons N_2O_4(g)\\): \\( Q_c = \\dfrac{[N_2O_4]}{[NO_2]^2} \\).<br>' +
    'Products go in the numerator, reactants in the denominator, each raised to its stoichiometric coefficient.<br>' +
    'Substituting \\([NO_2] = {{n}}\\) M and \\([N_2O_4] = {{d}}\\) M gives the highlighted Qc value above. ' +
    'Compare with K: \\(Q < K\\) → net forward reaction; \\(Q > K\\) → net reverse reaction.',
};

export const ARRHENIUS_RATIO: ProceduralMCQArchetype = {
  id: 'apchem-arrhenius-ratio',
  topic: 'AP Chemistry: Arrhenius Activation Energy Ratio',
  questionTemplate:
    'A reaction has an activation energy Ea = {{Ea}} kJ/mol. By what factor does its rate constant k increase ' +
    'when the temperature is raised from T1 = {{T1}} K to T2 = {{T2}} K? ' +
    '(Use the two-point Arrhenius equation with R = 8.314 J/(mol·K).)',
  variables: {
    Ea: { min: 40, max: 120, step: 5, decimals: 0 },
    T1: { min: 280, max: 350, step: 5, decimals: 0 },
    T2: { min: 360, max: 420, step: 5, decimals: 0 },
  },
  unit: '× factor (unitless)',
  correctFormulaJs: 'Math.exp((Ea * 1000 / 8.314) * (1 / T1 - 1 / T2)).toFixed(2)',
  traps: [
    {
      trapName: 'Forgot kJ → J Conversion',
      formulaJs: 'Math.exp((Ea / 8.314) * (1 / T1 - 1 / T2)).toFixed(2)',
      explanation:
        'R is in J/(mol·K) but Ea was given in kJ/mol. Without multiplying by 1000, the exponent shrinks 1000× ' +
        'and you conclude temperature barely matters : a classic unit-discipline failure.',
    },
    {
      trapName: 'Reversed Temperature Difference',
      formulaJs: 'Math.exp((Ea * 1000 / 8.314) * (1 / T2 - 1 / T1)).toFixed(2)',
      explanation:
        'You swapped the reciprocal temperatures. Since \\(\\frac{1}{T_1} > \\frac{1}{T_2}\\) when \\(T_2 > T_1\\), ' +
        'the two-point form \\(\\ln\\frac{k_2}{k_1} = \\frac{E_a}{R}\\left(\\frac{1}{T_1} - \\frac{1}{T_2}\\right)\\) ' +
        'requires the COLDER temperature first : otherwise you predict k decreases with heating.',
    },
    {
      trapName: 'Wrong Exponential Base (10^x instead of e^x)',
      formulaJs: 'Math.pow(10, (Ea * 1000 / 8.314) * (1 / T1 - 1 / T2)).toFixed(2)',
      explanation:
        'The two-point Arrhenius equation is natural-log based: \\(\\ln(k_2/k_1) = \\frac{E_a}{R}(...)\\), so the ratio ' +
        'is \\(e^{\\text{exponent}}\\). Raising 10 to the exponent overstates the effect by a factor of \\((10/e)^{\\text{exponent}}\\).',
    },
  ],
  stepByStepSolutionTemplate:
    'Two-point Arrhenius: \\( \\ln\\dfrac{k_2}{k_1} = \\dfrac{E_a}{R}\\left(\\dfrac{1}{T_1} - \\dfrac{1}{T_2}\\right) \\).<br>' +
    'Convert Ea to J/mol (× 1000), take the reciprocal-temperature difference with the COLDER temperature first, ' +
    'multiply by Ea/R, then exponentiate: \\( k_2/k_1 = e^{\\text{exponent}} \\).<br>' +
    'With \\(E_a = {{Ea}}\\) kJ/mol, \\(T_1 = {{T1}}\\) K, \\(T_2 = {{T2}}\\) K the exponent gives the highlighted factor above.',
};

export const Z_STATISTIC: ProceduralMCQArchetype = {
  id: 'apstat-one-sample-z',
  topic: 'AP Statistics: One-Sample Z-Statistic',
  questionTemplate:
    'A hypothesis test uses the null hypothesis μ = {{mu0}}. A sample of n = {{n}} observations from a population ' +
    'with known σ = {{sigma}} produces a sample mean x̄ = {{xbar}}. ' +
    'Compute the one-sample z-statistic for this test.',
  variables: {
    mu0: { choices: [50], decimals: 0 },
    n: { choices: [16, 25, 36, 49, 64, 100], decimals: 0 },
    sigma: { min: 8, max: 15, step: 0.5, decimals: 1 },
    xbar: { min: 51, max: 58, step: 0.5, decimals: 1 },
  },
  unit: 'unitless (z)',
  correctFormulaJs: '((xbar - mu0) / (sigma / Math.sqrt(n))).toFixed(2)',
  traps: [
    {
      trapName: 'Forgot the √n (Standard Error of the Mean)',
      formulaJs: '((xbar - mu0) / (sigma / n)).toFixed(2)',
      explanation:
        'The denominator is the STANDARD ERROR \\(\\sigma/\\sqrt{n}\\), not \\(\\sigma/n\\). ' +
        'Averages vary \\(\\sqrt{n}\\) times less than individual observations : sampling has square-root power.',
    },
    {
      trapName: 'Used Variance σ² in the Denominator',
      formulaJs: '((xbar - mu0) / (sigma * sigma / Math.sqrt(n))).toFixed(2)',
      explanation:
        'You standardized with the variance \\(\\sigma^2\\). Standard deviation, not variance, sets the scale of ' +
        'the sampling distribution: \\(z = \\dfrac{\\bar{x} - \\mu_0}{\\sigma/\\sqrt{n}}\\).',
    },
    {
      trapName: 'Sign Flip (μ₀ − x̄)',
      formulaJs: '((mu0 - xbar) / (sigma / Math.sqrt(n))).toFixed(2)',
      explanation:
        'Standardization subtracts the HYPOTHESIZED mean from the statistic: \\(\\bar{x} - \\mu_0\\). ' +
        'Reversing the order flips the sign and would send you to the wrong tail of the test.',
    },
  ],
  stepByStepSolutionTemplate:
    'Standard error of the mean: \\( SE = \\dfrac{\\sigma}{\\sqrt{n}} \\) (known-σ case, so this is a z-test).<br>' +
    'One-sample z-statistic: \\( z = \\dfrac{\\bar{x} - \\mu_0}{\\sigma/\\sqrt{n}} \\).<br>' +
    'Substitute \\(\\bar{x} = {{xbar}}\\), \\(\\mu_0 = {{mu0}}\\), \\(\\sigma = {{sigma}}\\), \\(n = {{n}}\\): ' +
    'the highlighted value above is the test statistic (measure its tail area with the standard normal curve).',
};

export const CI_MARGIN_OF_ERROR: ProceduralMCQArchetype = {
  id: 'apstat-ci-margin',
  topic: 'AP Statistics: Confidence Interval Margin of Error',
  questionTemplate:
    'A researcher constructs a 95% confidence interval (z* = 1.96) for a population mean from a sample of ' +
    'n = {{n}} observations drawn from a population with known σ = {{sigma}}. ' +
    'What is the margin of error of the interval?',
  variables: {
    sigma: { min: 4, max: 20, step: 0.5, decimals: 1 },
    n: { choices: [16, 25, 36, 49, 64, 100, 144, 225], decimals: 0 },
  },
  unit: 'units of the mean',
  correctFormulaJs: '(1.96 * sigma / Math.sqrt(n)).toFixed(2)',
  traps: [
    {
      trapName: 'Forgot the √n',
      formulaJs: '(1.96 * sigma / n).toFixed(2)',
      explanation:
        'The margin of error divides σ by \\(\\sqrt{n}\\), the square root of the sample size. ' +
        'Quadrupling a sample only HALVES the margin of error : the √n is the whole story.',
    },
    {
      trapName: 'Multiplied by √n Instead of Dividing',
      formulaJs: '(1.96 * sigma * Math.sqrt(n)).toFixed(2)',
      explanation:
        'Larger samples give NARROWER intervals. You scaled the error UP by \\(\\sqrt{n}\\) : the direction of ' +
        'the effect is backwards: \\(ME = z^*\\sigma/\\sqrt{n}\\).',
    },
    {
      trapName: 'Wrong Critical Value (z* = 1.645, the 90% z*)',
      formulaJs: '(1.645 * sigma / Math.sqrt(n)).toFixed(2)',
      explanation:
        '1.645 is the critical value for 90% confidence. A 95% interval needs \\(z^* = 1.96\\) ' +
        '(the central 95% leaves 2.5% in each tail, not 5%).',
    },
  ],
  stepByStepSolutionTemplate:
    '95% confidence interval for a mean (known σ): \\( \\bar{x} \\pm z^*\\dfrac{\\sigma}{\\sqrt{n}} \\) with \\(z^* = 1.96\\).<br>' +
    'The margin of error is the piece AFTER ±: \\( ME = z^*\\sigma/\\sqrt{n} \\).<br>' +
    'With \\(\\sigma = {{sigma}}\\) and \\(n = {{n}}\\), the highlighted value above is ME. ' +
    'Note the square-root law: to halve ME you must QUADRUPLE n.',
};

export const CHI_SQUARE_EXPECTED: ProceduralMCQArchetype = {
  id: 'apstat-chi-square-expected',
  topic: 'AP Statistics: Chi-Square Expected Counts',
  questionTemplate:
    'A two-way table has a row total of {{rowT}} and a column total of {{colT}}, out of a grand total of {{grand}} ' +
    'observations. Under the null hypothesis of independence, what is the EXPECTED COUNT for the cell in that ' +
    'row and column?',
  variables: {
    rowT: { min: 65, max: 195, step: 10, decimals: 0 },
    colT: { min: 40, max: 180, step: 10, decimals: 0 },
    grand: { choices: [400, 500, 600], decimals: 0 },
  },
  unit: 'expected count',
  correctFormulaJs: '((rowT * colT) / grand).toFixed(2)',
  traps: [
    {
      trapName: 'Divided by the Column Total Instead',
      formulaJs: '((rowT * grand) / colT).toFixed(2)',
      explanation:
        'Expected counts come from \\(\\dfrac{\\text{row total} \\times \\text{column total}}{\\text{grand total}}\\). ' +
        'The GRAND total belongs in the denominator : dividing by a column total can even exceed the row total, ' +
        'which is impossible for an expected count.',
    },
    {
      trapName: 'Added the Totals Instead of Multiplying',
      formulaJs: '((rowT + colT) / grand).toFixed(2)',
      explanation:
        'Independence multiplies proportions: \\(\\dfrac{\\text{row}}{\\text{grand}} \\times \\dfrac{\\text{col}}{\\text{grand}} \\times \\text{grand} = \\dfrac{\\text{row} \\times \\text{col}}{\\text{grand}}\\). ' +
        'Adding the totals treats independent proportions as additive : they are not.',
    },
    {
      trapName: 'Percent-of-Column Misapplied',
      formulaJs: '(100 * colT / grand).toFixed(2)',
      explanation:
        'You computed the column\u2019s share of the whole table (as a percent) without involving the ROW total. ' +
        'Expected counts are JOINT: both marginal totals must enter through their product.',
    },
  ],
  stepByStepSolutionTemplate:
    'Chi-square test of independence, expected counts: \\( E = \\dfrac{\\text{row total} \\times \\text{column total}}{\\text{grand total}} \\).<br>' +
    'Intuition: independence multiplies the two marginal proportions, and one factor of \\(n\\) cancels.<br>' +
    'With row total {{rowT}}, column total {{colT}}, grand total {{grand}}: the highlighted value above is \\(E\\). ' +
    'Then \\(\\chi^2 = \\sum\\frac{(O-E)^2}{E}\\) with \\((r-1)(c-1)\\) degrees of freedom.',
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const BUILT_IN_ARCHETYPES: ProceduralMCQArchetype[] = [
  SHM_MAX_SPEED,
  RC_TIME_CONSTANT,
  ROTATIONAL_TORQUE,
  BUFFER_PH,
  REACTION_QUOTIENT,
  ARRHENIUS_RATIO,
  Z_STATISTIC,
  CI_MARGIN_OF_ERROR,
  CHI_SQUARE_EXPECTED,
];

export const AP_SUBJECT_GROUPS: { subject: string; archetypeIds: string[] }[] = [
  {
    subject: 'AP Physics C',
    archetypeIds: [SHM_MAX_SPEED.id, RC_TIME_CONSTANT.id, ROTATIONAL_TORQUE.id],
  },
  {
    subject: 'AP Chemistry',
    archetypeIds: [BUFFER_PH.id, REACTION_QUOTIENT.id, ARRHENIUS_RATIO.id],
  },
  {
    subject: 'AP Statistics',
    archetypeIds: [Z_STATISTIC.id, CI_MARGIN_OF_ERROR.id, CHI_SQUARE_EXPECTED.id],
  },
];
