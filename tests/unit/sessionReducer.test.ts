import { describe, it, expect } from 'vitest';
import {
  sessionReducer,
  initialSessionState,
  type SessionState,
} from '@/hooks/useSession';
import type { Activity, GuidedPathModule, SavedSchema, StageResponse } from '@/lib/types';

function makeActivity(id: string): Activity {
  return {
    id,
    stageNumber: 1,
    title: `Stage ${id}`,
    framework: 'feynman',
    cognitiveGoal: 'goal',
    contextSnippet: 'snippet',
    keywords: ['neuron', 'depolarization'],
    templateType: 'cause_effect',
    prompt: 'prompt',
    scaffold: {
      field1Label: 'What',
      field1Placeholder: '',
      field2Label: 'How',
      field2Placeholder: '',
      exampleAnswer: 'answer',
    },
  };
}

function makeModule(index: number, opts?: Partial<GuidedPathModule>): GuidedPathModule {
  return {
    moduleId: `m${index}`,
    moduleNumber: index + 1,
    title: `Module ${index + 1}`,
    summary: 'summary',
    targetFocus: 'focus',
    unlocked: false,
    completed: false,
    feynmanCheckpoint: { question: 'q', corePrerequisite: 'p' },
    activities: [makeActivity(`m${index}-a1`)],
    ...opts,
  };
}

const savedResponse: StageResponse = {
  field1: 'answer one',
  field2: 'answer two',
  selectedPreset: 'preset-1',
  readinessConfirmed: true,
  confidenceScore: 90,
  reflection: 'took away',
  checkCount: 2,
};

describe('sessionReducer', () => {
  it('patch applies plain values', () => {
    const next = sessionReducer(initialSessionState, { type: 'patch', payload: { topicSummary: 'TCP', xp: 120 } });
    expect(next.topicSummary).toBe('TCP');
    expect(next.xp).toBe(120);
    expect(next.appState).toBe('input'); // untouched keys preserved
  });

  it('patch supports useState-style updater functions', () => {
    const withXp = sessionReducer(initialSessionState, { type: 'patch', payload: { xp: 100 } });
    const next = sessionReducer(withXp, { type: 'patch', payload: { xp: (prev) => prev + 50 } });
    expect(next.xp).toBe(150);
  });

  it('load_stage hydrates stage inputs from a saved response', () => {
    const acts = [makeActivity('a1'), makeActivity('a2')];
    const responses = { a2: savedResponse };
    const next = sessionReducer(initialSessionState, { type: 'load_stage', index: 1, activities: acts, responses });
    expect(next.currentActivityIndex).toBe(1);
    expect(next.activities).toBe(acts);
    expect(next.field1).toBe('answer one');
    expect(next.field2).toBe('answer two');
    expect(next.selectedPreset).toBe('preset-1');
    expect(next.stageConfidence).toBe(90);
    expect(next.stageCheckCount).toBe(2);
  });

  it('load_stage blanks inputs when no saved response exists', () => {
    const acts = [makeActivity('a1')];
    const next = sessionReducer(initialSessionState, { type: 'load_stage', index: 0, activities: acts, responses: {} });
    expect(next.field1).toBe('');
    expect(next.stageConfidence).toBe(75);
    expect(next.feynmanResult).toBeNull();
  });

  it('add_xp accumulates', () => {
    const next = sessionReducer(initialSessionState, { type: 'add_xp', amount: 150 });
    const again = sessionReducer(next, { type: 'add_xp', amount: 50 });
    expect(again.xp).toBe(200);
  });

  it('reset clears session state but preserves encodingMode', () => {
    const midSession: SessionState = {
      ...initialSessionState,
      encodingMode: 'memorization',
      appState: 'encoding',
      activities: [makeActivity('a1')],
      xp: 450,
    };
    const next = sessionReducer(midSession, { type: 'reset' });
    expect(next).toEqual({ ...initialSessionState, encodingMode: 'memorization' });
  });

  it('resume_schema restores a saved schema into the completed view', () => {
    const schema: SavedSchema = {
      id: 'schema_1',
      timestamp: 1,
      topicSummary: 'Cognitive Dissonance',
      mode: 'conceptual',
      xpEarned: 400,
      activities: [makeActivity('a1')],
      userResponses: { a1: savedResponse },
      isGuidedPath: true,
      guidedModules: [makeModule(0, { unlocked: true })],
    };
    const next = sessionReducer(initialSessionState, { type: 'resume_schema', schema });
    expect(next.appState).toBe('completed');
    expect(next.topicSummary).toBe('Cognitive Dissonance');
    expect(next.xp).toBe(400);
    expect(next.isGuidedPathMode).toBe(true);
    expect(next.field1).toBe('answer one');
    expect(next.currentActivityIndex).toBe(0);
  });

  it('select_module switches activities and is a no-op for locked modules', () => {
    const state: SessionState = {
      ...initialSessionState,
      isGuidedPathMode: true,
      guidedModules: [makeModule(0, { unlocked: true }), makeModule(1)],
    };
    // locked -> ignored
    expect(sessionReducer(state, { type: 'select_module', index: 1 })).toBe(state);
    // unlocked -> switch + hydrate first stage
    const unlocked = { ...state, guidedModules: [makeModule(0, { unlocked: true }), makeModule(1, { unlocked: true })] };
    const next = sessionReducer(unlocked, { type: 'select_module', index: 1 });
    expect(next.currentModuleIndex).toBe(1);
    expect(next.currentActivityIndex).toBe(0);
    expect(next.activities[0].id).toBe('m1-a1');
    expect(next.field1).toBe(''); // no saved response -> blank
  });

  it('feynman_pass marks the module complete and unlocks the next one', () => {
    const state: SessionState = {
      ...initialSessionState,
      guidedModules: [makeModule(0, { unlocked: true }), makeModule(1)],
    };
    const next = sessionReducer(state, { type: 'feynman_pass', moduleIndex: 0, score: 85, feedback: 'solid' });
    expect(next.guidedModules[0].completed).toBe(true);
    expect(next.guidedModules[0].feynmanCheckpoint.passed).toBe(true);
    expect(next.guidedModules[0].feynmanCheckpoint.score).toBe(85);
    expect(next.guidedModules[1].unlocked).toBe(true);
  });

  it('feynman_pass on the last module does not unlock anything beyond it', () => {
    const state: SessionState = { ...initialSessionState, guidedModules: [makeModule(0, { unlocked: true })] };
    const next = sessionReducer(state, { type: 'feynman_pass', moduleIndex: 0, score: 90, feedback: 'great' });
    expect(next.guidedModules).toHaveLength(1);
    expect(next.guidedModules[0].completed).toBe(true);
  });
});
