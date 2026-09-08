import { Activity, SavedSchema, StageResponse } from '@/lib/types';

let idCounter = 0;

export function makeActivity(overrides: Partial<Activity> = {}): Activity {
  idCounter += 1;
  return {
    id: `act_${idCounter}`,
    stageNumber: idCounter,
    title: `Stage ${idCounter}`,
    framework: 'Test Framework',
    cognitiveGoal: 'Test goal',
    contextSnippet: 'Test context',
    keywords: ['alpha', 'beta'],
    templateType: 'first_principles',
    prompt: 'Explain the mechanism.',
    scaffold: {
      field1Label: 'What is it?',
      field1Placeholder: 'Describe...',
      field2Label: 'Why does it work?',
      field2Placeholder: 'Explain...',
      exampleAnswer: 'Example answer.',
    },
    ...overrides,
  };
}

export function makeSchema(overrides: Partial<SavedSchema> = {}): SavedSchema {
  idCounter += 1;
  const acts = overrides.activities || [makeActivity(), makeActivity()];
  const userResponses: Record<string, StageResponse> =
    overrides.userResponses ||
    Object.fromEntries(
      acts.map(act => [
        act.id,
        {
          field1: 'answer one',
          field2: 'answer two',
          confidenceScore: 80,
          checkCount: 1,
          feynmanReview: { grade: 'good', score: 82, feedback: 'solid', xpBonus: 20 },
        } satisfies StageResponse,
      ])
    );
  return {
    id: `schema_${idCounter}`,
    timestamp: 1700000000000 + idCounter,
    topicSummary: `Topic ${idCounter}`,
    mode: 'conceptual',
    xpEarned: 500,
    activities: acts,
    userResponses,
    ...overrides,
  };
}
