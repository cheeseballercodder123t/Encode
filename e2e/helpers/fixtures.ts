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

// ─── 10-second discrimination gate (/api/discrimination) ───────────────────
// One vignette is the concept (dq1) and one the lookalike (dq2); neither names
// either label, which is what makes the check blind.

export const DISCRIMINATION_RESPONSE = {
  topic: 'Action Potentials',
  conceptLabel: 'Depolarisation',
  lookalikeLabel: 'Repolarisation',
  questions: [
    {
      id: 'dq1',
      vignette:
        'Membrane voltage jumps from -70mV to +30mV in under a millisecond, and Na+ permeability rises 500-fold as it does.',
      answerIsConcept: true,
      rationale: 'Voltage RISES abruptly: the Na+ conductance leads.',
    },
    {
      id: 'dq2',
      vignette:
        'Membrane voltage drifts from +30mV back toward -70mV over several milliseconds, and K+ permeability rises 300-fold as it does.',
      answerIsConcept: false,
      rationale: 'Voltage FALLS: the K+ conductance leads once Na+ has inactivated.',
    },
  ],
  operationalRule:
    'Track the sign of the voltage change: rising means the Na+ conductance leads, falling means the K+ conductance leads.',
  cardFront: 'When the membrane voltage is falling, which conductance leads?',
  cardBack: 'The K+ conductance leads, because {{c1::the Na+ inactivation gates have shut}}.',
};

// Encode payload whose stages carry boundaryContrast, so the export gate has a
// real concept/lookalike pair to test.
export const GATE_ENCODE_RESPONSE = {
  topicSummary: 'Action Potentials',
  activities: [
    makeActivity({
      id: 'gate-1',
      title: 'Depolarisation',
      boundaryContrast: {
        confusableLookalike: 'Repolarisation',
        distinguishingRule: 'Repolarisation has K+ conductance leading, not Na+.',
      },
    }),
    makeActivity({
      id: 'gate-2',
      stageNumber: 2,
      title: 'Stress-Test the Boundary',
      scaffold: {
        field1Label: 'What Happens',
        field1Placeholder: P2_FIELD1,
        field2Label: 'Why It Happens',
        field2Placeholder: P2_FIELD2,
        exampleAnswer: 'Channels fail and the signal collapses.',
      },
      boundaryContrast: {
        confusableLookalike: 'Refractory period',
        distinguishingRule: 'Na+ channels inactivate rather than simply closing.',
      },
    }),
  ],
  researchContexts: [],
};

// ─── Parsons causal ordering (/api/sequence) ───────────────────────────────
// Four true steps in canonical order; the drill shuffles them client-side.

export const SEQUENCE_RESPONSE = {
  title: 'Action Potential Chain',
  steps: [
    { id: 's1', text: 'The membrane crosses -55 mV.' },
    { id: 's2', text: 'Voltage-gated Na+ channels open.' },
    { id: 's3', text: 'Sodium floods inward and depolarises the cell.' },
    { id: 's4', text: 'K+ efflux restores the resting charge.' },
  ],
  pivotRule: 'The field must move the S4 segments before any pore can open.',
  summary: 'Threshold opens the gates, influx spikes the voltage, K+ resets it.',
};

// ─── Causal Mad-Libs + interactive diagram (custom /api/encode payload) ─────
// Stage 1 carries the examiner's own sentence template AND a visual chain with
// one blanked node, so both new scaffold surfaces are exercised on one stage.

export const FRAME_STAGE = makeActivity({
  id: 'frame-1',
  title: 'Depolarisation Cascade',
  templateType: 'first_principles',
  scaffold: {
    field1Label: 'Threshold Event',
    field1Placeholder: 'FRAME_FIELD1',
    field2Label: 'Physical Motion',
    field2Placeholder: 'FRAME_FIELD2',
    field3Label: 'Macro Consequence',
    field3Placeholder: 'FRAME_FIELD3',
    exampleAnswer: 'Threshold opens the gates.',
    causalFrame:
      'When [[1]], the [[2]] is physically forced, so [[3]] — UNLESS the pore is blocked.',
  },
  boundaryContrast: {
    confusableLookalike: 'Refractory period',
    distinguishingRule: 'Na+ channels inactivate; they do not simply close.',
  },
  visualData: {
    nodes: [
      { id: 'n1', label: 'Threshold is crossed', type: 'input' },
      {
        id: 'n2',
        label: 'S4 segments swing outward',
        subtext: 'the charged helices are pulled by the field',
        type: 'mechanism',
      },
      { id: 'n3', label: 'The pore opens', type: 'outcome' },
    ],
  },
});

export const FRAME_ENCODE_RESPONSE = {
  topicSummary: 'Depolarisation',
  activities: [FRAME_STAGE],
  researchContexts: [],
};

// ─── YouTube session with timestamped chapters ─────────────────────────────

export const YOUTUBE_CHAPTERS_RESPONSE = {
  topicSummary: 'Neural Networks Lecture',
  videoTitle: 'Neural Networks Lecture',
  youtubeData: {
    videoId: 'aircAruvnKk',
    videoUrl: 'https://www.youtube.com/watch?v=aircAruvnKk',
    title: 'Neural Networks Lecture',
    timestamps: [
      { seconds: 0, formatted: '00:00', label: 'Visualising Weights' },
      { seconds: 432, formatted: '07:12', label: 'Gradient Descent' },
      { seconds: 940, formatted: '15:40', label: 'Backpropagation' },
    ],
  },
  activities: [
    makeActivity({
      id: 'yt-ch-1',
      stageNumber: 1,
      title: 'Visualising Weights',
      scaffold: {
        field1Label: 'What Happens',
        field1Placeholder: 'YT1_FIELD1',
        field2Label: 'Why It Happens',
        field2Placeholder: 'YT1_FIELD2',
        exampleAnswer: 'Weights are scalars.',
      },
      videoTimestamp: { seconds: 0, formatted: '00:00', label: 'Visualising Weights' },
    }),
    makeActivity({
      id: 'yt-ch-2',
      stageNumber: 2,
      title: 'Gradient Descent',
      scaffold: {
        field1Label: 'What Happens',
        field1Placeholder: 'YT2_FIELD1',
        field2Label: 'Why It Happens',
        field2Placeholder: 'YT2_FIELD2',
        exampleAnswer: 'Loss slopes point downhill.',
      },
      videoTimestamp: { seconds: 432, formatted: '07:12', label: 'Gradient Descent' },
    }),
    makeActivity({
      id: 'yt-ch-3',
      stageNumber: 3,
      title: 'Backpropagation',
      scaffold: {
        field1Label: 'What Happens',
        field1Placeholder: 'YT3_FIELD1',
        field2Label: 'Why It Happens',
        field2Placeholder: 'YT3_FIELD2',
        exampleAnswer: 'Credit is assigned backwards.',
      },
      videoTimestamp: { seconds: 940, formatted: '15:40', label: 'Backpropagation' },
    }),
  ],
  researchContexts: [],
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

// ─── Priming warm-up (/api/priming) ────────────────────────────────────────
// Option 'b' is the intuitive trap: viscosity felt as a fluid property rather
// than a term that can force the flow to zero.

export const PRIMING_RESPONSE = {
  kind: 'extremum',
  setup: 'Poiseuille flow through a vessel of radius r at a fixed pressure gradient.',
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
  principle: 'Flow scales with r^4 and inversely with viscosity, so doubling the radius multiplies flow 16x.',
  cardFront: 'Why must viscosity sit in the denominator of Poiseuille?',
  cardBack: 'Because {{c1::infinite viscosity stops the flow entirely}}, so viscosity must divide.',
};

