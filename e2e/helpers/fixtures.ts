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
  feedback: 'Good mechanism — tighten the threshold detail.',
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
