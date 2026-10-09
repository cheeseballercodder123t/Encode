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

// ─── Mr M mode overlay (/api/encode with the mode on) ───────────────────────
//
// A calorimetry stage carrying all four Mr M blocks. It is deliberately free of
// chemical formulae: the trap classifier's subscript rule looks for formulae,
// and keeping them out lets the numeric rule be asserted in isolation — the
// exemplar's 0.0336 against a learner's 0.0168 is exactly a factor of two.
//
// The placeholders stay the shared P1_* ones, so the fields are addressed the
// same way every other spec addresses them.
export const MR_M_ENCODE_RESPONSE = {
  topicSummary: 'Calorimetry',
  activities: [
    makeActivity({
      id: 'mr-m-1',
      title: 'Calorimetry: Where the Energy Goes',
      framework: 'first-principles',
      templateType: 'first_principles',
      prompt: 'Trace the heat into the water and account for every joule.',
      contextSnippet: 'A hot solid is dropped into water; the heat lost equals the heat gained.',
      scaffold: {
        field1Label: 'Mechanism',
        field1Placeholder: P1_FIELD1,
        field2Label: 'Physical Reasoning',
        field2Placeholder: P1_FIELD2,
        exampleAnswer: '0.0336 kJ of heat leaves the water.',
      },
      visualData: {
        generationChallenge: {
          premisePrompt: 'If the calorimeter is a ledger, what is the closing balance?',
          missingRoleOrTarget: 'the heat transferred',
          expertCompletion: '0.0336 kJ of heat leaves the water.',
        },
        mrM: {
          axiomFirst: {
            governingLaw: 'Energy is conserved: whatever the water loses, the solid gains.',
            coordinateOrigin: 'Zero is no heat transferred at all — equilibrium at the starting temperature.',
            zeroPoint: 'Zero is a measurable state here, not a bookkeeping convention.',
            whyThisDefinition:
              'Products minus reactants works because the products are the destination and the reactants the origin.',
            calculusTranslation:
              'q is the integral of the heat flow over time, so only the total matters, not the path.',
            counterexample:
              'A cup that leaks heat to the room still balances — the room is part of the ledger.',
          },
          ontology: [
            {
              symbol: 'q',
              physicalIdentity: 'The heat transferred INTO the system',
              unit: 'kJ',
              whatItIsNot: 'Not the temperature, and not the energy already inside.',
              doublesTo: 'Everything else fixed, q doubles.',
            },
            {
              symbol: 'm',
              physicalIdentity: 'The mass of the WATER being heated, not the solid',
              unit: 'kg',
              whatItIsNot: 'Not the mass of the solid you dropped in.',
              doublesTo: 'q doubles.',
            },
            {
              symbol: 'ΔT',
              physicalIdentity: 'The temperature RISE of the water',
              unit: 'K',
              whatItIsNot: 'Not the final temperature on its own.',
              doublesTo: 'q doubles.',
            },
          ],
          stateMachine: [
            {
              stepNumber: 1,
              action: 'Convert the measured volume of water to litres, then to kilograms.',
              holdsInHead: '1 L of water has a mass of 1 kg.',
              output: 'm in kg',
            },
            {
              stepNumber: 2,
              action: 'Take the temperature difference, not the final temperature.',
              holdsInHead: 'ΔT = T_final - T_initial.',
              output: 'ΔT in K',
            },
            {
              stepNumber: 3,
              action: 'Multiply m c ΔT with the units carried through.',
              holdsInHead: 'q = m c ΔT.',
              output: 'q in kJ',
            },
          ],
          perturbation: {
            invariant: 'q = m c ΔT',
            variables: [
              { symbol: 'm', base: 0.25, min: 0.05, max: 1, unit: 'kg', exponent: 1 },
              { symbol: 'ΔT', base: 32, min: 1, max: 100, unit: 'K', exponent: 1 },
            ],
            limitNotes: [
              { symbol: 'm', note: 'No water means no heat is stored, so the readout collapses to zero.' },
              { symbol: 'ΔT', note: 'A vanishing temperature difference carries no heat, however long you wait.' },
            ],
          },
        },
      },
    }),
  ],
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
  // The examiner returns no score and no grade: a boolean plus the sentences
  // that move the learner forward.
  secured: false,
  feedback: 'Good mechanism : tighten the threshold detail.',
  // What landed + the single missing causal step. The workbench renders both
  // and offers an inline "patch the gap" field.
  nailedIt: 'Na+ influx and threshold crossing are both correct.',
  missingLink: 'S4 segments physically swing outward, which is what opens the pore.',
  errorAnalysis: 'S4 segments physically swing outward, which is what opens the pore.',
  // The Socratic pressure test: one edge case that proves the mechanism.
  counterProbe: 'What happens to the gradient if vasa recta flow surges 500%?',
  sentenceFinisher: 'the pore opens because the charged helices were pulled outward.',
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
  analysis: 'Batch analysis complete: strong first-principles encoding.',
  perStageGrades: [
    { stageTitle: STAGE_1.title, secured: true, counterProbe: '', feedback: 'Solid.' },
    {
      stageTitle: STAGE_2.title,
      secured: true,
      counterProbe: 'What happens if the pump stalls halfway?',
      feedback: 'Strong boundary test.',
    },
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
      'seed-1': { field1: 'seeded one', field2: 'seeded two' },
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

// A deliberately SHORT lesson (3 segments) whose last segment is the wrapup:
// the end-of-lesson exit panel is what these specs are about, so the walk to it
// must be two clicks rather than twenty. It still carries the full depth shape
// (objectives, glossary, why, misconceptions, encoding seeds) so the deep
// rendering is asserted too.
export const TEACH_SHORT_RESPONSE = {
  lesson: {
    title: 'Threshold: The Two-Minute Version',
    tagline: 'Everything that matters about firing, nothing that does not.',
    estimatedMin: 3,
    intro: {
      hook: 'A neuron sits at -70 mV. What flips it in a millisecond?',
      whyItMatters: 'Every spike you will ever draw starts at threshold.',
    },
    objectives: [
      'State why -55 mV is the trigger and not a coincidence',
      'Separate threshold from the refractory period',
    ],
    glossary: [
      { term: 'threshold', definition: 'the voltage at which voltage-gated Na+ channels open' },
    ],
    segments: [
      {
        id: 'sc1',
        type: 'concept',
        title: 'The Threshold',
        body: 'At -55 mV the voltage-gated Na+ channels open and Na+ rushes in.',
        why: 'The channel protein senses the field across the membrane, so a small voltage change physically opens the pore.',
        misconceptions: [
          {
            claim: 'The Na+/K+ pump reverses to cause the spike',
            correction: 'The pump never reverses; the spike is pure Na+ conductance.',
          },
        ],
        keyTerms: ['threshold', '-55 mV'],
        xpValue: 5,
      },
      {
        id: 'sc2',
        type: 'deepDive',
        title: 'Where threshold stops being useful',
        body: 'Above threshold the size of the spike stops depending on the stimulus: it is all-or-none.',
        why: 'Once every available Na+ channel is open, a bigger stimulus has nothing left to recruit.',
        xpValue: 10,
      },
      {
        id: 'sc3',
        type: 'wrapup',
        title: 'Wrap Up',
        body: 'Threshold is a mechanical gate, not a magic number.',
        xpValue: 0,
      },
    ],
    masteryCheck: {
      prompt: 'Explain in one sentence why the spike is all-or-none.',
      keywords: ['threshold', 'all-or-none'],
      modelAnswer: 'Past threshold every Na+ channel is already open, so a stronger stimulus changes nothing.',
    },
    encodingSeeds: [
      {
        title: 'Threshold',
        prompt: 'Why does -55 mV open the Na+ gates?',
        exemplar: 'The field across the membrane physically pulls the gate open at that voltage.',
      },
      {
        title: 'All-or-none',
        prompt: 'Why does a bigger stimulus not make a bigger spike?',
        exemplar: 'Every available channel is already open.',
      },
    ],
    wrapup: {
      summary: 'Lesson complete. The two facts that carry the whole mechanism are on the exit panel.',
      callToAction: 'Encode these two prompts now, or park the lesson and come back to it.',
      connectionPrompt: 'How would a demyelinated axon change the threshold behaviour?',
    },
  },
};

// The merged deck the Forge returns for several sources: two cloze facts (no
// drill prompt, so they exercise the cloze export path), one 4-quadrant
// mechanism with its lookalike, one drill, one worked example. Ids are
// namespaced per source, exactly as `mergeSegregationReports` namespaces them.
// The last source FAILED (a video with no caption track): the deck still ships
// and the log has to say why that one source contributed nothing.
export const FORGE_RESPONSE = {
  topic: 'Renal Physiology',
  report: {
    topic: 'Renal Physiology',
    declarativeFacts: [
      {
        id: 'src_1-f1',
        factStatement: 'The loop of Henle reaches 1,200 mOsm at the hairpin.',
        clozeSuggestion: 'The loop of Henle reaches {{1,200 mOsm}} at the hairpin.',
        tag: 'Constant',
        memoryHook: 'Hairpin = highest.',
      },
      {
        id: 'src_2-f1',
        factStatement: 'ADH inserts aquaporin-2 into the collecting duct.',
        clozeSuggestion: 'ADH inserts {{aquaporin-2}} into the collecting duct.',
        tag: 'Mechanism',
      },
    ],
    conceptualMechanisms: [
      {
        id: 'src_1-m1',
        conceptName: 'Countercurrent multiplication',
        whatIsIt: 'A gradient built by opposing flows in the loop.',
        whyItMatters: 'It is the only way to concentrate urine above plasma.',
        howItWorks: 'Active transport at the thick ascending limb sets up passive water movement.',
        whatIfEdgeCase: 'Without it, urine stays isotonic.',
        boundaryContrast: {
          confusableLookalike: 'Countercurrent exchange',
          distinguishingRule: 'Multiplication builds the gradient; exchange only preserves it.',
        },
      },
    ],
    practiceQuestions: [
      { id: 'src_3-q1', question: 'Which limb pumps salt out?', answer: 'The thick ascending limb.' },
    ],
    workedExamples: [
      {
        id: 'src_3-e1',
        title: 'Free-water clearance',
        problem: 'Compute CH2O given CH2O = V − Cosm.',
        steps: ['Find V', 'Find Cosm', 'Subtract'],
        takeaway: 'Positive CH2O means dilute urine.',
      },
    ],
    compressionRatio: '3 sources merged · 4 duplicate cards dropped',
  },
  sources: [
    { id: 'src_1', kind: 'text', label: 'Lecture 4 slides', status: 'ok', counts: { facts: 1, mechanisms: 1, drills: 0, examples: 0 } },
    { id: 'src_2', kind: 'file', label: 'handout.pdf', status: 'ok', counts: { facts: 1, mechanisms: 0, drills: 0, examples: 0 } },
    { id: 'src_3', kind: 'text', label: 'Problem set 4', status: 'ok', counts: { facts: 0, mechanisms: 0, drills: 1, examples: 1 } },
    {
      id: 'src_4',
      kind: 'youtube',
      label: 'youtube:renal',
      status: 'failed',
      counts: { facts: 0, mechanisms: 0, drills: 0, examples: 0 },
      note: 'No captions on this video, so there is no source text to cut cards from.',
    },
  ],
  dropped: 4,
  total: 5,
  counts: { facts: 2, mechanisms: 1, drills: 1, examples: 1 },
  contradictions: [],
};

// The same forge when one of the sources is an uploaded lecture recording:
// the server transcribed it (no captions anywhere), so the log says so.
export const FORGE_MEDIA_RESPONSE = {
  ...FORGE_RESPONSE,
  sources: [
    ...FORGE_RESPONSE.sources,
    {
      id: 'src_5',
      kind: 'file',
      label: 'lecture-recording.m4a',
      status: 'ok',
      counts: { facts: 1, mechanisms: 0, drills: 0, examples: 0 },
      note: 'transcribed from the uploaded recording',
    },
  ],
};

// Two sources that disagree (4 h vs 6 h). The merge replaced both claims with
// ONE conflict card that leads the deck, and reports them in `contradictions`
// rather than silently keeping whichever arrived first.
export const FORGE_CONFLICT_RESPONSE = {
  topic: 'Pharmacology',
  report: {
    topic: 'Pharmacology',
    declarativeFacts: [
      {
        id: 'conflict-1-the-half-lif',
        factStatement:
          'The half-life of the drug is 4 h — Lecture 4 slides · The half-life of the drug is 6 h — handout.pdf',
        clozeSuggestion:
          'Sources disagree: The half-life of the drug is ___ h. Resolve: {{4 h — Lecture 4 slides}} or {{6 h — handout.pdf}}.',
        question: 'Sources disagree: The half-life of the drug is ___ h. Which is right?',
        tag: 'Contradiction',
        memoryHook: 'Resolve this before the exam — two of your sources cannot both be right.',
      },
    ],
    conceptualMechanisms: [],
    practiceQuestions: [],
    workedExamples: [],
    compressionRatio: '2 sources merged · no overlap · 1 source conflict flagged',
  },
  sources: [
    {
      id: 'src_1',
      kind: 'text',
      label: 'Lecture 4 slides',
      status: 'ok',
      counts: { facts: 0, mechanisms: 0, drills: 0, examples: 0 },
      note: '1 claim merged into a conflict card',
    },
    {
      id: 'src_2',
      kind: 'file',
      label: 'handout.pdf',
      status: 'ok',
      counts: { facts: 0, mechanisms: 0, drills: 0, examples: 0 },
      note: '1 claim merged into a conflict card',
    },
  ],
  dropped: 0,
  total: 1,
  counts: { facts: 1, mechanisms: 0, drills: 0, examples: 0 },
  contradictions: [
    {
      id: 'conflict-1-the-half-lif',
      kind: 'numeric',
      subject: 'the half lif of the drug is # h',
      summary: '4 h vs 6 h',
      claims: [
        {
          id: 'src_1-f1',
          sourceId: 'src_1',
          sourceLabel: 'Lecture 4 slides',
          text: 'The half-life of the drug is 4 h.',
          values: ['4 h'],
        },
        {
          id: 'src_2-f1',
          sourceId: 'src_2',
          sourceLabel: 'handout.pdf',
          text: 'The half-life of the drug is 6 h.',
          values: ['6 h'],
        },
      ],
      card: {
        id: 'conflict-1-the-half-lif',
        factStatement:
          'The half-life of the drug is 4 h — Lecture 4 slides · The half-life of the drug is 6 h — handout.pdf',
        clozeSuggestion:
          'Sources disagree: The half-life of the drug is ___ h. Resolve: {{4 h — Lecture 4 slides}} or {{6 h — handout.pdf}}.',
        question: 'Sources disagree: The half-life of the drug is ___ h. Which is right?',
        tag: 'Contradiction',
        memoryHook: 'Resolve this before the exam — two of your sources cannot both be right.',
      },
    },
  ],
};

// The same sources run again because the deck was too small. Only the cards the
// deck did not already have come back — nothing here repeats FORGE_RESPONSE.
export const FORGE_MORE_RESPONSE = {
  mode: 'more',
  topic: 'Renal Physiology',
  report: {
    topic: 'Renal Physiology',
    declarativeFacts: [
      {
        id: 'src_1-more-f1',
        factStatement: 'The vasa recta run parallel to the loop of Henle.',
        clozeSuggestion: 'The {{vasa recta}} run parallel to the loop of Henle.',
        tag: 'Anatomy',
      },
    ],
    conceptualMechanisms: [],
    practiceQuestions: [
      { id: 'src_1-more-q1', question: 'Which hormone inserts aquaporin-2?', answer: 'ADH.' },
    ],
    workedExamples: [],
    compressionRatio: '1 source merged · no overlap',
  },
  sources: [
    {
      id: 'src_1',
      kind: 'text',
      label: 'Lecture 4 slides',
      status: 'ok',
      counts: { facts: 1, mechanisms: 0, drills: 1, examples: 0 },
    },
  ],
  dropped: 0,
  total: 2,
  counts: { facts: 1, mechanisms: 0, drills: 1, examples: 0 },
  contradictions: [],
  resolved: [],
};

// One failed source re-forged on its own: the batch is restricted to that
// source, so only its new cards come back — and its row stops being a failure.
export const FORGE_RETRY_RESPONSE = {
  ...FORGE_MORE_RESPONSE,
  mode: 'retry',
  sources: [
    {
      id: 'src_4',
      kind: 'youtube',
      label: 'youtube:renal',
      status: 'ok',
      counts: { facts: 1, mechanisms: 0, drills: 1, examples: 0 },
      note: 'transcribed from the audio (no captions)',
      words: 1240,
      yield: { words: 1240, cards: 2, expected: 5, verdict: 'thin', note: '1,240 words in but only 2 cards out (about 5 expected)' },
    },
  ],
};

// The same deck folded down: five cards become three, purely by merging overlap.
export const FORGE_CONDENSE_RESPONSE = {
  mode: 'condense',
  topic: 'Renal Physiology',
  report: {
    topic: 'Renal Physiology',
    declarativeFacts: [
      {
        id: 'cond_1',
        factStatement: 'The loop of Henle reaches 1,200 mOsm, and ADH adds aquaporin-2 to hold it.',
        clozeSuggestion: 'The loop of Henle reaches {{1,200 mOsm}}; ADH adds aquaporin-2.',
        tag: 'Constant',
      },
    ],
    conceptualMechanisms: [
      {
        id: 'cond_2',
        conceptName: 'Countercurrent multiplication',
        whatIsIt: 'A gradient built by opposing flows in the loop.',
        whyItMatters: 'It is the only way to concentrate urine above plasma.',
        howItWorks: 'Active transport at the thick ascending limb sets up passive water movement.',
        whatIfEdgeCase: 'Without it, urine stays isotonic.',
      },
    ],
    practiceQuestions: [
      { id: 'cond_3', question: 'Which limb pumps salt out?', answer: 'The thick ascending limb.' },
    ],
    workedExamples: [],
    compressionRatio: 'folding overlap',
  },
  sources: [],
  dropped: 0,
  total: 3,
  before: 5,
  counts: { facts: 1, mechanisms: 1, drills: 1, examples: 0 },
  contradictions: [],
  resolved: [],
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

// ─── Timed crucible (/api/crucible) ─────────────────────────────────────────
//
// Three multi-constraint problems, each decomposed into sequential STATES with
// a declared weight. The route turns those weights into whole seconds, so this
// fixture is what the HUD's "target 1.3m" is computed from: 12 minutes across
// three problems is 240s each, and three states of equal weight is 80s apiece.
// Every problem carries constraints and an ask, because a problem that states
// neither is not multi-constraint.
export const CRUCIBLE_RESPONSE = {
  minutes: 12,
  problems: [
    {
      title: 'Thermochemical piston',
      domain: 'Thermochemistry',
      constraints: [
        'The cylinder is frictionless and the piston is exposed to 1 atm.',
        '250 g of water starts at 22 °C and holds the heat released.',
      ],
      ask: 'Find the water\u2019s final temperature and the boundary work done by the H2 released.',
      states: [
        { label: 'System demand: the heat the water requires', weight: 1 },
        { label: 'Boundary work: the gas expanding against 1 atm', weight: 1 },
        { label: 'Energy balance: q + w on one ledger', weight: 1 },
      ],
    },
    {
      title: 'Unequal titration',
      domain: 'Solution chemistry',
      constraints: [
        'The weak acid is titrated with a strong base of equal concentration.',
        'The solution density is 1.08 g/mL.',
      ],
      ask: 'Find the pH of the buffer that survives the unequal volumes.',
      states: [
        { label: 'Moles of each species, from unequal volumes', weight: 2 },
        { label: 'The excess reagent after neutralization', weight: 1 },
        { label: 'Henderson-Hasselbalch on the surviving pair', weight: 1 },
      ],
    },
    {
      title: 'Blocked conductance',
      domain: 'Electrophysiology',
      constraints: [
        'Extracellular K+ is doubled while the Na+ conductance is half-blocked.',
        'The cell sits at 37 °C.',
      ],
      ask: 'Find the shift in the resting membrane potential and the new firing threshold.',
      states: [
        { label: 'Nernst equilibrium for the changed K+ gradient', weight: 1 },
        { label: 'Partial Na+ block inside GHK', weight: 1 },
      ],
    },
  ],
  // The arithmetic gate's own report, in the shape the route returns it: two of
  // the three served problems arrived with every declared relation closed, one
  // problem did not survive the check at all (so the sprint is one problem
  // shorter than the proctor wrote), and the escalation is the re-aimed one a
  // domain-matched material earns when none of the collision's chapters could be
  // identified in it. The client received all of this and rendered none of it
  // until the summary grew a receipt for it.
  ledger: { verifiedProblems: 2, checkedProblems: 3 },
  rejectedProblems: [
    'Unequal titration: RELATION_2 does not close: n_base = 0.011 against n_base = 0.0128 (14.1% apart)',
  ],
  escalation: {
    mode: 'depth',
    reason:
      'This material matches Thermochemistry, but none of the chapters the collision needs could be identified in it, so the sprint goes DEEPER inside the chapter the material actually carries instead of colliding it with two chapters you have not met.',
  },
};

// ─── Emergency triage (/api/crisis) ─────────────────────────────────────────
//
// The shape the route returns for a night with two deadlines and three overdue
// items. The frozen lines and the panic arithmetic are computed server-side by
// `lib/crisis/buffer.ts` from the weights the dump states, so the fixture is the
// derived plan rather than the derived plan's inputs.
export const TRIAGE_DUMP =
  'Gothic Lit essay — due Oct 14, worth 30%\n' +
  'Chem makeup quiz — due tomorrow, worth 5%\n' +
  'Care of Athletes quiz — Friday, 10 points\n' +
  'Practice set 7 (optional)\n' +
  'QuestBridge application — due Oct 20';

export const CRISIS_RESPONSE = {
  tasks: [
    { id: 'crisis-1', title: 'Gothic Lit essay', dueAt: null, dueLabel: 'due Oct 14', weightPct: 30, ungraded: false },
    { id: 'crisis-2', title: 'Chem makeup quiz', dueAt: null, dueLabel: 'due tomorrow', weightPct: 5, ungraded: false },
    { id: 'crisis-3', title: 'Care of Athletes quiz', dueAt: null, dueLabel: 'Friday', weightPct: null, ungraded: false },
    { id: 'crisis-4', title: 'Practice set 7', dueAt: null, dueLabel: '', weightPct: null, ungraded: true },
    { id: 'crisis-5', title: 'QuestBridge application', dueAt: null, dueLabel: 'due Oct 20', weightPct: null, ungraded: false },
  ],
  frozen: [
    {
      task: { id: 'crisis-4', title: 'Practice set 7', dueAt: null, dueLabel: '', weightPct: null, ungraded: true },
      riskPct: 0,
      line: 'Freezing Practice set 7 for 48 hours. Marginal grade risk: 0.0%. It carries no grade at all.',
    },
  ],
  focus: { id: 'crisis-3', title: 'Care of Athletes quiz', dueAt: null, dueLabel: 'Friday', weightPct: null, ungraded: false },
  panicLines: [
    '4/5 on the Chem makeup quiz is 80%, on an item worth 5% of the final grade: 5 × 80 ÷ 100 = 4.0 points.',
    'Frozen work carries 0.0% of the remaining grade. The rest is still live.',
    'State a weight for Care of Athletes and QuestBridge and they become decidable.',
  ],
  withheld: [
    {
      task: { id: 'crisis-3', title: 'Care of Athletes quiz', dueAt: null, dueLabel: 'Friday', weightPct: null, ungraded: false },
      reason: 'no weight was stated, so \u201clow-leverage\u201d cannot be shown and nothing was frozen on its behalf',
    },
  ],
  runwayMinutes: 90,
  assumedScorePct: 80,
};

// ─── Question-first inquisitor (/api/inquisitor) ─────────────────────────────
//
// Three reads, because the three verdicts are three different surfaces: a plain
// true, a true-with-one-boundary (which is the one that becomes a ledger entry),
// and a false whose correction must be on screen. The refusal path is a status
// code rather than a payload, so it is mocked inline by the spec that needs it.

export const INQUISITOR_TRUE_RESPONSE = {
  verdict: 'TRUE',
  claim: 'Bond breaking releases energy, because breaking a bond gives off the stored energy.',
  proof: [
    'Bond enthalpy is defined as the energy REQUIRED to break the bond, measured from the separated atoms as the reference state.',
    'The familiar release of energy in an exothermic reaction comes from forming the products\u2019 bonds, which outweighs what the breaking costs.',
  ],
  tripwire: '',
  correction: '',
};

export const INQUISITOR_TRIPWIRE_RESPONSE = {
  verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
  claim: 'Every smooth function equals its own Taylor series near the point of expansion.',
  proof: [
    'A Taylor series is defined as the polynomial whose derivatives match the function at the origin, so it always exists for a smooth function.',
    'Its equality to the function requires that the remainder term vanish, which smoothness alone does not force.',
  ],
  tripwire:
    'f(x) = e^(-1/x^2) is smooth everywhere, yet every one of its derivatives at zero is 0, so its Taylor series is the zero function.',
  correction: '',
};

export const INQUISITOR_FALSE_RESPONSE = {
  verdict: 'FALSE',
  claim: 'Bond breaking releases energy, because breaking a bond gives off the stored energy.',
  proof: [
    'Energy is conserved, and a bond is a lower-energy state than the separated atoms it releases from.',
    'So the breaking direction runs uphill and the forming direction releases; the intuition has the arrow backwards.',
  ],
  tripwire: '',
  correction:
    'Breaking a bond COSTS energy \u2014 that cost is the bond enthalpy. Forming a bond releases it. ATP hydrolysis is exothermic because the new bonds formed outweigh the one broken.',
};

