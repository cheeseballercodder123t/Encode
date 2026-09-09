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
