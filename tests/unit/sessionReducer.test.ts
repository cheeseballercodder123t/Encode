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

  it('resume_to_encoding restores a saved schema into the encoding workbench at the first unfinished stage', () => {
    const acts = [makeActivity('a1'), makeActivity('a2'), makeActivity('a3')];
    const schema: SavedSchema = {
      id: 'schema_1',
      timestamp: 1000,
      topicSummary: 'Action Potentials',
      mode: 'conceptual',
      xpEarned: 120,
      activities: acts,
      userResponses: {
        a1: { field1: 'done', field2: 'done', readinessConfirmed: true, confidenceScore: 90, checkCount: 1, feynmanReview: { grade: 'mastered', score: 95, feedback: '', xpBonus: 0 } },
        // a2 is unfinished (no response): resume should land here.
      },
    };
    const next = sessionReducer(initialSessionState, { type: 'resume_to_encoding', schema });
    expect(next.appState).toBe('encoding');
    expect(next.topicSummary).toBe('Action Potentials');
    expect(next.encodingMode).toBe('conceptual');
    expect(next.currentActivityIndex).toBe(1); // first unfinished stage
    expect(next.activities).toBe(acts);
    expect(next.field1).toBe('');
    expect(next.field2).toBe('');
  });

  it('resume_to_encoding lands on a skipped stage', () => {
    const acts = [makeActivity('a1'), makeActivity('a2')];
    const schema: SavedSchema = {
      id: 'schema_1',
      timestamp: 1000,
      topicSummary: 'Test',
      mode: 'conceptual',
      xpEarned: 0,
      activities: acts,
      userResponses: {
        a1: { field1: '', field2: '', skipped: true },
      },
    };
    const next = sessionReducer(initialSessionState, { type: 'resume_to_encoding', schema });
    expect(next.currentActivityIndex).toBe(0); // a1 skipped => resume there
    expect(next.appState).toBe('encoding');
  });

  it('resume_to_encoding falls back to stage 0 when everything is complete', () => {
    const acts = [makeActivity('a1')];
    const schema: SavedSchema = {
      id: 'schema_1',
      timestamp: 1000,
      topicSummary: 'Test',
      mode: 'conceptual',
      xpEarned: 0,
      activities: acts,
      userResponses: {
        a1: { field1: 'done', field2: 'done', readinessConfirmed: true, feynmanReview: { grade: 'mastered', score: 95, feedback: '', xpBonus: 0 } },
      },
    };
    const next = sessionReducer(initialSessionState, { type: 'resume_to_encoding', schema });
    expect(next.currentActivityIndex).toBe(0);
    expect(next.field1).toBe('done');
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

describe('sessionReducer field undo/redo', () => {
  const snap = (field1: string) => ({ field1, field2: '', field3: '', selectedPreset: '' });

  it('push_field_snapshot records pre-change state and clears the redo branch', () => {
    let s = { ...initialSessionState, field1: 'old' };
    s = sessionReducer(s, { type: 'patch', payload: { field1: 'old' } });
    s = sessionReducer(s, { type: 'push_field_snapshot', snapshot: snap('') });
    expect(s.fieldUndoStack).toHaveLength(1);
    expect(s.fieldUndoStack[0].field1).toBe('');
  });

  it('push_field_snapshot coalesces identical consecutive snapshots', () => {
    let s = initialSessionState;
    s = sessionReducer(s, { type: 'push_field_snapshot', snapshot: snap('') });
    const twice = sessionReducer(s, { type: 'push_field_snapshot', snapshot: snap('') });
    expect(twice).toBe(s);
  });

  it('undo restores the previous snapshot and builds a redo stack', () => {
    let s = { ...initialSessionState, field1: '' };
    s = sessionReducer(s, { type: 'push_field_snapshot', snapshot: snap('') });
    s = sessionReducer(s, { type: 'patch', payload: { field1: 'draft one' } });
    s = sessionReducer(s, { type: 'push_field_snapshot', snapshot: snap('draft one') });
    s = sessionReducer(s, { type: 'patch', payload: { field1: 'draft two' } });

    const undone = sessionReducer(s, { type: 'undo_fields' });
    // after popping the last snapshot ('draft one'), fields roll back to it
    expect(undone.field1).toBe('draft one');
    expect(undone.fieldRedoStack).toHaveLength(1);
    expect(undone.fieldRedoStack[0].field1).toBe('draft two');

    const redone = sessionReducer(undone, { type: 'redo_fields' });
    expect(redone.field1).toBe('draft two');
    expect(redone.fieldUndoStack).toHaveLength(2);
  });

  it('undo/redo are no-ops on empty stacks', () => {
    expect(sessionReducer(initialSessionState, { type: 'undo_fields' })).toBe(initialSessionState);
    expect(sessionReducer(initialSessionState, { type: 'redo_fields' })).toBe(initialSessionState);
  });

  it('a fresh change after undo clears the redo branch', () => {
    let s = { ...initialSessionState, field1: '' };
    s = sessionReducer(s, { type: 'push_field_snapshot', snapshot: snap('') });
    s = sessionReducer(s, { type: 'patch', payload: { field1: 'v1' } });
    const undone = sessionReducer(s, { type: 'undo_fields' });
    expect(undone.fieldRedoStack).toHaveLength(1);
    const changed = sessionReducer(undone, { type: 'push_field_snapshot', snapshot: snap('') });
    expect(changed.fieldRedoStack).toHaveLength(0);
  });

  it('bounds the undo stack at 100 snapshots', () => {
    let s = initialSessionState;
    for (let i = 0; i < 130; i++) {
      s = sessionReducer(s, { type: 'push_field_snapshot', snapshot: snap(`v${i}`) });
    }
    expect(s.fieldUndoStack).toHaveLength(100);
    expect(s.fieldUndoStack[99].field1).toBe('v129');
  });
});
