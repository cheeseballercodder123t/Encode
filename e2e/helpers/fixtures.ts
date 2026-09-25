import type { Activity, SavedSchema } from '../../lib/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

export const MOCK_NOTES =
  'Neurobiology: The Action Potential. Resting potential is -70mV maintained by Na+/K+ pumps. ' +
  'At -55mV threshold, voltage-gated Na+ channels open causing depolarization to +40mV. ' +
  'Na+ channels then inactivate and K+ channels open, repolarizing the membrane.';

/** Unique placeholders double as stable Playwright locators. */
export const P1_FIELD1 = 'STAGE1_FIELD1_PLACEHOLDER';
export const P1_FIELD2 = 'STAGE1_FIELD2_PLACEHOLDER';
export const P2_FIELD1 = 'STAGE2_FIELD1_PLACEHOLDER';
export const P2_FIELD2 = 'STAGE2_FIELD2_PLACEHOLDER';

// ─── Procedural MCQ AI-author mocks (/api/archetype) ─────────────────────────
// Structurally identical to the built-in physc-shm-vmax archetype so the
// embedded preview runner and the .apkg generator both work offline.

const AI_SHM_ARCHETYPE = {
  id: 'aiai-shm-vmax',
  topic: 'AP Physics C: Simple Harmonic Motion (AI-authored)',
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
      explanation: 'You used the period form sqrt(m/k) instead of omega = sqrt(k/m).',
    },
    {
      trapName: 'Forgot the Amplitude',
      formulaJs: 'Math.sqrt(k / m).toFixed(2)',
      explanation: 'You computed omega itself, not a speed; v_max = A*omega.',
    },
    {
      trapName: 'Period-Speed Confusion',
      formulaJs: '(2 * Math.PI * A / Math.sqrt(k / m)).toFixed(2)',
      explanation: 'You computed A*T; the period is a time, not a speed.',
    },
  ],
  stepByStepSolutionTemplate:
    'Energy conservation: (1/2)kA^2 = (1/2)mv_max^2, so v_max = A*sqrt(k/m). ' +
    'With m = {{m}} kg, k = {{k}} N/m and A = {{A}} m, the highlighted answer above is the maximum speed.',
};

// Round 1 "broken" archetype: trap 2 collides with the correct answer, which
// the 50-trial client-side validator flags (shows as 'Fails validation').
const AI_GAS_KE_BROKEN = {
  ...AI_SHM_ARCHETYPE,
  id: 'aiai-gas-ke',
  topic: 'AP Physics C: Gas Molecule Kinetic Energy (repair demo)',
  traps: [
    AI_SHM_ARCHETYPE.traps[0],
    AI_SHM_ARCHETYPE.traps[1],
    { ...AI_SHM_ARCHETYPE.traps[2], formulaJs: AI_SHM_ARCHETYPE.correctFormulaJs },
  ],
};

// Round 2 "repaired" archetype: same id/topic, distinct trap formula.
const AI_GAS_KE_REPAIRED = {
  ...AI_SHM_ARCHETYPE,
  id: 'aiai-gas-ke',
  topic: 'AP Physics C: Gas Molecule Kinetic Energy (repair demo)',
};

export const ARCHETYPE_ROUND1 = {
  archetypes: [AI_SHM_ARCHETYPE, AI_GAS_KE_BROKEN],
  validationReport: {
    ok: false,
    issues: [
      {
        archetypeId: 'aiai-gas-ke',
        message: 'Trap 2 collides with the correct answer across the variable space.',
      },
    ],
  },
};

export const ARCHETYPE_ROUND2 = {
  archetypes: [AI_GAS_KE_REPAIRED],
  validationReport: { ok: true, issues: [] },
};

export function makeActivity(overrides: Partial<Activity> & { id: string }): Activity {
  return {
    stageNumber: 1,
    title: 'Deconstruct the Mechanism',
    framework: 'cause-effect',
    cognitiveGoal: 'Build a causal model',
    contextSnippet: 'Voltage-gated channels open at threshold.',
    keywords: ['depolarization', 'sodium', 'potassium'],
    templateType: 'cause_effect',
    prompt: 'Explain the mechanism in your own words.',
    scaffold: {
      field1Label: 'What Happens',
      field1Placeholder: P1_FIELD1,
      field2Label: 'Why It Happens',
      field2Placeholder: P1_FIELD2,
      exampleAnswer: 'Sodium influx depolarizes the membrane.',
    },
    ...overrides,
  } as Activity;
}

export const STAGE_1 = makeActivity({ id: 'act-1' });

export const STAGE_2 = makeActivity({
  id: 'act-2',
  stageNumber: 2,
  title: 'Stress-Test the Boundary',
  scaffold: {
    field1Label: 'What Happens',
    field1Placeholder: P2_FIELD1,
    field2Label: 'Why It Happens',
    field2Placeholder: P2_FIELD2,
    exampleAnswer: 'Channels fail and the signal collapses.',
  },
});

export const ENCODE_RESPONSE = {
  topicSummary: 'Action Potentials',
  activities: [STAGE_1, STAGE_2],
  researchContexts: [],
};

export const YOUTUBE_RESPONSE = {
  topicSummary: 'Neural Networks Lecture',
  videoTitle: 'Neural Networks Lecture',
  activities: [makeActivity({ id: 'yt-1', title: 'Extract the Mechanism' })],
  youtubeData: {
    videoId: 'aircAruvnKk',
    videoUrl: 'https://www.youtube.com/watch?v=aircAruvnKk',
    title: 'Neural Networks Lecture',
    timestamps: [],
  },
  researchContexts: [],
};

export const EVAL_SINGLE = {
  grade: 'good',
  score: 78,
  feedback: 'Good mechanism : tighten the threshold detail.',
  xpBonus: 25,
  // Delta feedback: what landed + the single missing causal step. The workbench
  // renders both and offers an inline "patch the gap" field.
  nailedIt: 'Na+ influx and threshold crossing are both correct.',
  missingLink: 'S4 segments physically swing outward, which is what opens the pore.',
  errorAnalysis: 'S4 segments physically swing outward, which is what opens the pore.',
};

// ─── Predict–Observe–Explain gate (/api/pretest) ────────────────────────────
// One gate: option 'b' is the intuitive trap (linear thinking on a 4th-power
// law), option 'c' is the truth.

export const PRETEST_RESPONSE = {
  topic: 'Action Potentials',
  scientificRationale:
    'A committed prediction makes the reveal land as a prediction error, which is what encodes it.',
  questions: [
    {
      id: 'pq-1',
      questionNumber: 1,
      questionPrompt:
        'If a vessel radius doubles at a fixed pressure gradient, what must flow do to stay consistent with Poiseuille?',
      options: [
        { id: 'a', label: 'Doubles' },
        { id: 'b', label: 'Quadruples' },
        { id: 'c', label: 'Increases 16x' },
        { id: 'd', label: 'Halves' },
      ],
      correctOptionId: 'c',
      trapOptionId: 'b',
      subtleTrap:
        'Resistance feels like it should fall in step with radius, so flow "doubles with the square".',
      firstPrincipleAnswer:
        'Resistance falls with the fourth power of radius, so flow rises 2^4 = 16x.',
      whyAttemptingMatters:
        'Committing to 4x makes the fourth-power reveal land as a prediction error you will not forget.',
      trapCardFront: 'Why does doubling a vessel radius raise flow 16x rather than 4x?',
      trapCardBack:
        'Resistance falls with {{c1::the fourth power of radius}}, so flow scales as r^4.',
    },
  ],
};

// ─── Recursive why-ladder (/api/probe) ──────────────────────────────────────
// Round 1 interrogates the learner's own wording; round 2 reports bedrock.

export const PROBE_RESPONSE = {
  target: 'the membrane crossed threshold, so gates open',
  question:
    'What property of the channel protein forces it to open when the field across the membrane changes?',
  isAxiom: false,
  axiom: '',
  depth: 1,
};

export const PROBE_AXIOM_RESPONSE = {
  target: 'voltage-gated',
  question: 'Bedrock reached.',
  isAxiom: true,
  axiom:
    'The pore can only open if the charged S4 segments are physically pulled by the field, so a voltage change is mechanically obliged to move them.',
  depth: 2,
};

// ─── Spot the inverted step (/api/invert-step) ──────────────────────────────
// Step 3 is the lie: inactivation CLOSES the pore, it does not open it.

export const INVERT_RESPONSE = {
  title: 'Action Potential Chain',
  steps: [
    { id: 's1', text: 'The membrane crosses -55 mV.' },
    { id: 's2', text: 'Voltage-gated Na+ channels snap open.' },
    { id: 's3', text: 'Na+ channel inactivation opens the pore permanently.' },
    { id: 's4', text: 'K+ efflux restores the resting charge.' },
  ],
  falsifiedStepId: 's3',
  flawType: 'reversed causality',
  whyFalsified:
    'Inactivation closes the pore and ends the spike; it never opens it. Opening is caused by the S4 segments moving in the field.',
  correctVersion: 'Na+ channel inactivation closes the pore and ends the spike.',
};

export const EVAL_BATCH = {
  overallScore: 84,
  analysis: 'Batch analysis complete: strong first-principles encoding.',
  perStageGrades: [
    { stageTitle: STAGE_1.title, grade: 'good', score: 82, feedback: 'Solid.' },
    { stageTitle: STAGE_2.title, grade: 'good', score: 86, feedback: 'Strong boundary test.' },
  ],
};

export function makeSavedSchema(overrides: Partial<SavedSchema> = {}): SavedSchema {
  return {
    id: 'schema_e2e_1',
    timestamp: Date.now(),
    topicSummary: 'E2E Seeded Topic',
    mode: 'conceptual',
    xpEarned: 320,
    activities: [makeActivity({ id: 'seed-1' })],
    userResponses: {
      'seed-1': { field1: 'seeded one', field2: 'seeded two', readinessConfirmed: true },
    },
    ...overrides,
  };
}

// ─── FSRS Card Audit fixtures ──────────────────────────────────────────────
// A segregation report that deliberately produces one TOO-LONG cloze (>15
// words) and one AMBIGUOUS cloze ({{Na+ or K+}}) so the audit tab has
// flagged cards to render and the auto-split button is exercisable.

export const AUDIT_SEGREGATE_RESPONSE = {
  topic: 'AP Chemistry: Acid-Base Equilibria',
  declarativeFacts: [
    {
      id: 'fact-clean',
      factStatement: 'HCl is a strong acid.',
      clozeSuggestion: '{{c1::HCl}} is a strong acid.',
      tag: 'Chemistry',
    },
    {
      id: 'fact-ambiguous',
      factStatement: 'The cation is Na+ or K+.',
      clozeSuggestion: 'The cation is {{c1::Na+ or K+}}.',
      tag: 'Chemistry',
    },
    {
      id: 'fact-too-long',
      factStatement:
        'The mitochondrial electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane.',
      clozeSuggestion:
        'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane.',
      tag: 'Biochemistry',
    },
  ],
  conceptualMechanisms: [],
};

// ─── TEACH ME interactive-lesson mock (/api/teach) ─────────────────────────
// A full AI-authored Brilliant-style lesson used by e2e/teachme.spec.ts. The
// UI renders this deterministically without any API key or network.

export const TEACH_RESPONSE = {
  lesson: {
    title: 'Action Potentials: The Voltage Story',
    tagline: 'Repair the pump and you will never forget the threshold.',
    estimatedMin: 5,
    intro: {
      hook: 'A neuron at rest holds -70 mV. What changes in the first millisecond of a thought?',
      whyItMatters: 'Every nerve signal, muscle contraction and heartbeat starts here.',
    },
    segments: [
      {
        id: 't1',
        type: 'concept',
        title: 'The Resting Membrane',
        body: 'A healthy neuron sits at -70 mV. The Na+/K+ pump constantly exports 3 Na+ and imports 2 K+, maintaining the gradient.',
        keyTerms: ['resting potential', 'Na+/K+ pump', '-70 mV'],
        visual: {
          kind: 'steps',
          lines: [
            { label: 'Pump runs', detail: '3 Na+ out, 2 K+ in' },
            { label: 'Gradient holds', detail: '-70 mV steady' },
          ],
        },
        xpValue: 5,
      },
      {
        id: 't2',
        type: 'concept',
        title: 'Firing the Threshold',
        body: 'When stimulus pushes the membrane to -55 mV, voltage-gated Na+ channels snap open. Na+ rushes in and the voltage rockets toward +40 mV.',
        keyTerms: ['threshold', 'depolarization'],
        xpValue: 5,
      },
      {
        id: 't3',
        type: 'checkpoint',
        title: 'Checkpoint',
        question: {
          kind: 'mcq',
          prompt: 'What triggers the rapid depolarization phase?',
          options: [
            { id: 'a', label: 'Voltage-gated Na+ channels opening at -55 mV', correct: true, explanation: 'Threshold opens Na+ channels; influx drives depolarization.' },
            { id: 'b', label: 'Passive K+ leak alone', correct: false, explanation: 'Trap: passive leak maintains rest, it does not cause the spike.' },
            { id: 'c', label: 'The Na+/K+ pump reversing', correct: false, explanation: 'The pump maintains the gradient; it does not reverse during firing.' },
          ],
          hints: ['It happens right at threshold.', 'Which ion rushes IN?'],
        },
        trapNote: 'Confusable lookalike detected.',
        xpValue: 15,
      },
      {
        id: 't4',
        type: 'guidedProblem',
        title: 'Worked Example',
        body: 'Walk through one full cycle.',
        steps: [
          { title: 'Reach threshold', detail: 'Stimulus drives membrane from -70 mV to -55 mV.' },
          { title: 'Na+ influx', detail: 'Voltage-gated Na+ channels open; Na+ rushes in to +40 mV.' },
          { title: 'Repolarize', detail: 'Na+ channels inactivate and K+ channels open; K+ exits toward -70 mV.' },
        ],
        finalAnswer: 'The membrane fires and resets in under 2 ms.',
        xpValue: 20,
      },
      {
        id: 't5',
        type: 'youTry',
        title: 'Your Turn',
        question: {
          kind: 'freeResponse',
          prompt: 'What happens if Na+ channels never inactivate?',
          modelAnswer: 'The cell stays depolarized and cannot fire again until the pump restores the gradient.',
          hints: ['Think about the refractory period.'],
        },
        xpValue: 25,
      },
      {
        id: 't6',
        type: 'wrapup',
        title: 'Wrap Up',
        body: 'You reconstructed the action potential from the mechanism up.',
        xpValue: 0,
      },
    ],
    masteryCheck: {
      prompt: 'Explain the full cycle in one plain-language sentence.',
      keywords: ['threshold', 'inactivate', 'repolarize'],
      modelAnswer: 'At threshold Na+ rushes in to spike the voltage, then Na+ channels inactivate and K+ exits to reset the membrane.',
      hints: ['Name the ion that enters, then the ion that exits.'],
    },
    wrapup: {
      summary: 'Concept encoded. Ready to encode the full schema.',
      callToAction: 'Now build the cognitive schema — you are pre-warmed.',
      connectionPrompt: 'How would this change in a demyelinated neuron?',
    },
  },
};

// ─── Fluff Guillotine semantic triage (/api/triage) ────────────────────────
// The spec pastes TRIAGE_NOTE (two paragraphs); the second is pure preamble.

export const TRIAGE_NOTE =
  'Sodium influx drives the membrane across threshold.\n\n' +
  'Welcome to lecture four — today we will cover the syllabus and the exam dates.';

export const TRIAGE_RESPONSE = {
  summary: 'Half of this note is administrative preamble.',
  units: [
    { index: 0, kind: 'kernel', note: 'load-bearing causal claim' },
    { index: 1, kind: 'noise', note: 'administrative preamble' },
  ],
};

// ─── Priming warm-ups (/api/priming) ───────────────────────────────────────
// One payload per archetype: the mock serves whichever kind the learner picked,
// so the selector can be driven end to end. Every probe's option B (index 1) is
// the intuitive-but-wrong answer.

// extremum · a 3-probe sweep. Probe 1's trap is the linear extrapolation
// ("double r, double the flow"), which the fourth power kills.
export const PRIMING_EXTREMUM_RESPONSE = {
  kind: 'extremum',
  setup: 'Poiseuille flow through a vessel of radius r at a fixed pressure gradient.',
  steps: [
    {
      prompt: 'What must happen to the flow Q if the vessel radius r is doubled?',
      choices: [
        { id: 'a', label: 'Flow increases 16x' },
        { id: 'b', label: 'Flow doubles' },
        { id: 'c', label: 'Flow halves' },
        { id: 'd', label: 'Flow is unchanged' },
      ],
      correctChoiceId: 'a',
      trapChoiceId: 'b',
      trapExplanation: 'Flow feels like it should scale with the pipe the way circumference does, so doubling feels safe.',
      reveal: 'r enters to the fourth power, so 2^4 = 16 and the flow rises 16x.',
    },
    {
      prompt: 'What must happen to the flow Q as the fluid viscosity tends to infinity?',
      choices: [
        { id: 'a', label: 'Flow stops entirely' },
        { id: 'b', label: 'Flow is unchanged' },
        { id: 'c', label: 'Flow doubles' },
        { id: 'd', label: 'Flow reverses' },
      ],
      correctChoiceId: 'a',
      trapChoiceId: 'b',
      trapExplanation: 'Viscosity feels like a property of the fluid, not a term that can forbid flow.',
      reveal: 'An infinite denominator forces Q to zero, so viscosity can only live under the line.',
    },
    {
      prompt: 'What must happen to the resistance as the vessel length L tends to zero?',
      choices: [
        { id: 'a', label: 'Resistance vanishes' },
        { id: 'b', label: 'Resistance becomes infinite' },
        { id: 'c', label: 'Resistance is unchanged' },
        { id: 'd', label: 'Resistance doubles' },
      ],
      correctChoiceId: 'a',
      trapChoiceId: 'b',
      trapExplanation: 'A zero-length pipe feels degenerate and unphysical, so blowing the resistance up feels like the safer answer.',
      reveal: 'R = 8 eta L / pi r^4, so L -> 0 gives R -> 0: length belongs in the numerator of resistance.',
    },
  ],
  sketch: null,
  principle: 'Flow scales with r^4 and inversely with viscosity, so doubling the radius multiplies flow 16x.',
  cardFront: 'Why must viscosity sit in the denominator of Poiseuille?',
  cardBack: 'Because {{c1::infinite viscosity stops the flow entirely}}, so viscosity must divide.',
};

/** The default payload: what the mock serves when the learner keeps AUTO. */
export const PRIMING_RESPONSE = PRIMING_EXTREMUM_RESPONSE;

// gradient · the 2-step polarity check: locate the source, then the sink.
export const PRIMING_GRADIENT_RESPONSE = {
  kind: 'gradient',
  setup: 'Nucleophilic attack on the carbonyl carbon of an acyl chloride.',
  steps: [
    {
      prompt: 'Where is the electron density concentrated in the acyl chloride C=O group?',
      choices: [
        { id: 'a', label: 'On the oxygen lone pairs' },
        { id: 'b', label: 'On the carbonyl carbon' },
        { id: 'c', label: 'Evenly across both atoms' },
        { id: 'd', label: 'On the chlorine' },
      ],
      correctChoiceId: 'a',
      trapChoiceId: 'b',
      trapExplanation: 'The dipole makes the carbon feel like the charged end, but the density itself sits on oxygen.',
      reveal: 'Oxygen keeps the lone pairs and carries the partial negative charge: that is the source.',
    },
    {
      prompt: 'Which atom is the electron-poor sink the nucleophile must attack?',
      choices: [
        { id: 'a', label: 'The carbonyl carbon' },
        { id: 'b', label: 'The carbonyl oxygen' },
        { id: 'c', label: 'The chlorine' },
        { id: 'd', label: 'The alkyl chain' },
      ],
      correctChoiceId: 'a',
      trapChoiceId: 'b',
      trapExplanation: 'Oxygen looks reactive because it owns the electrons, but a nucleophile needs the opposite: the stripped carbon.',
      reveal: 'The carbon is stripped by both oxygen and chlorine, so the arrow can only run source to sink.',
    },
  ],
  sketch: null,
  principle: 'Arrow pushing is not memorization: draw from the electron-rich source to the electron-poor sink and it can only point one way.',
  cardFront: 'Why does the nucleophile attack the carbonyl carbon and not the oxygen?',
  cardBack: 'Because the carbon is the {{c1::electron-poor sink}}, while oxygen holds the electron density.',
};

// dimensional · one probe: the units pin the exponent.
export const PRIMING_DIMENSIONAL_RESPONSE = {
  kind: 'dimensional',
  setup: 'Dynamic pressure of a moving fluid, in pascals.',
  steps: [
    {
      prompt: 'Density rho (kg/m^3) and velocity v (m/s) are all you have. How MUST velocity enter to land on kg/(m s^2)?',
      choices: [
        { id: 'a', label: 'Squared (v^2)' },
        { id: 'b', label: 'Linearly (v)' },
        { id: 'c', label: 'Cubed (v^3)' },
        { id: 'd', label: 'Inverted (1/v)' },
      ],
      correctChoiceId: 'a',
      trapChoiceId: 'b',
      trapExplanation: 'Pressure and kinetic energy both seem to "scale with speed", so the linear form feels sufficient.',
      reveal: 'kg/m^3 * m^2/s^2 = kg/(m s^2), so velocity must be squared: the dynamic pressure is 0.5 rho v^2.',
    },
  ],
  sketch: null,
  principle: 'A quantity that must appear squared announces itself in the units: match them and the exponent is forced.',
  cardFront: 'Why is dynamic pressure 0.5 rho v^2 and not 0.5 rho v?',
  cardBack: 'Because only v^2 makes the units come out as {{c1::kg/(m s^2)}}, i.e. pascals.',
};

// shape · the learner DRAWS the curve first, then commits to its limiting
// behaviour. The shape label must not be on screen before the commit.
export const PRIMING_SHAPE_RESPONSE = {
  kind: 'shape',
  setup: 'Michaelis-Menten rate against substrate concentration, at fixed enzyme.',
  steps: [
    {
      prompt: 'As the substrate concentration grows without bound, what must the rate do?',
      choices: [
        { id: 'a', label: 'Plateau at Vmax' },
        { id: 'b', label: 'Keep rising linearly' },
        { id: 'c', label: 'Fall back to zero' },
        { id: 'd', label: 'Double with each doubling' },
      ],
      correctChoiceId: 'a',
      trapChoiceId: 'b',
      trapExplanation: 'Nothing else on the graph stops scaling, so a straight line feels like the safe extrapolation.',
      reveal: 'Binding sites are a finite resource, so above Km the enzyme is saturated and the rate tends to Vmax.',
    },
  ],
  sketch: {
    prompt: 'Sketch the rate against substrate concentration before you see the equation.',
    axes: 'x = [S] (mM), y = v0 (umol/s)',
    shapeLabel: 'Saturating hyperbola: first-order at low [S], zero-order at high [S].',
    shapeHint: 'Enzyme molecules are a finite resource: once every active site is occupied the rate cannot rise, however much substrate you add.',
  },
  principle: 'A finite resource upstream of the output forces a plateau: the curve must saturate.',
  cardFront: 'Why does the Michaelis-Menten curve bend over instead of rising forever?',
  cardBack: 'Because the enzyme is a {{c1::finite resource}}: once the sites are saturated the rate can only plateau.',
};

export const PRIMING_RESPONSES: Record<string, unknown> = {
  shape: PRIMING_SHAPE_RESPONSE,
  gradient: PRIMING_GRADIENT_RESPONSE,
  dimensional: PRIMING_DIMENSIONAL_RESPONSE,
  extremum: PRIMING_EXTREMUM_RESPONSE,
};

