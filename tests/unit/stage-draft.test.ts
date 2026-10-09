// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  STAGE_DRAFT_KEY,
  STAGE_DRAFT_MAX_AGE_MS,
  clearStageDraft,
  isStageDraftFresh,
  loadStageDraft,
  saveStageDraft,
  stageDraftHasProgress,
  stageDraftHasTyping,
  stageDraftStageNumber,
  type StageDraft,
} from '@/lib/stage-draft';
import type { Activity } from '@/lib/types';

/**
 * The in-progress stage draft (defect 37).
 *
 * The visible stage's typing lives in React state and only reaches
 * `userResponses` on Submit/Skip, so a reload used to return to empty fields.
 * These tests pin the store that stops that: what it writes, what it refuses to
 * read back, and when it counts as work worth recovering.
 */

function makeActivity(id: string): Activity {
  return {
    id,
    stageNumber: 1,
    title: `Stage ${id}`,
    framework: 'feynman',
    cognitiveGoal: 'goal',
    contextSnippet: 'snippet',
    keywords: ['neuron'],
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

function makeDraft(overrides: Partial<StageDraft> = {}): StageDraft {
  return {
    savedAt: 0,
    topicSummary: 'Action Potentials',
    encodingMode: 'conceptual',
    xpEarned: 320,
    activities: [makeActivity('a1'), makeActivity('a2')],
    userResponses: {},
    currentActivityIndex: 1,
    isGuidedPath: false,
    guidedModules: [],
    youtubeData: null,
    researchContexts: [],
    field1: 'sodium rushes in',
    field2: 'threshold opens the gates',
    field3: 'anchor',
    selectedPreset: 'preset-1',
    reflection: '',
    ...overrides,
  };
}

const readRaw = () => JSON.parse(localStorage.getItem(STAGE_DRAFT_KEY) || 'null');

beforeEach(() => {
  localStorage.clear();
});

describe('saveStageDraft / loadStageDraft', () => {
  it('round-trips the live stage typing and the session it belongs to', () => {
    const draft = makeDraft();
    saveStageDraft(draft);

    const loaded = loadStageDraft();
    expect(loaded).not.toBeNull();
    expect(loaded!.field1).toBe('sodium rushes in');
    expect(loaded!.field2).toBe('threshold opens the gates');
    expect(loaded!.field3).toBe('anchor');
    expect(loaded!.selectedPreset).toBe('preset-1');
    expect(loaded!.currentActivityIndex).toBe(1);
    expect(loaded!.topicSummary).toBe('Action Potentials');
    expect(loaded!.xpEarned).toBe(320);
    expect(loaded!.activities.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('stamps the write itself instead of trusting the caller', () => {
    saveStageDraft(makeDraft({ savedAt: 1 }), 5_000);
    expect(readRaw().savedAt).toBe(5_000);
    // The stamp is what the freshness rule reads, so a caller passing a stale
    // one must not make a fresh draft look days old.
    expect(loadStageDraft(5_100)).not.toBeNull();
  });

  it('returns null when nothing has been written', () => {
    expect(loadStageDraft()).toBeNull();
  });

  it('survives a corrupt record instead of throwing', () => {
    localStorage.setItem(STAGE_DRAFT_KEY, 'not json at all{');
    expect(loadStageDraft()).toBeNull();

    localStorage.setItem(STAGE_DRAFT_KEY, '"a string"');
    expect(loadStageDraft()).toBeNull();

    localStorage.setItem(STAGE_DRAFT_KEY, '[1,2,3]');
    expect(loadStageDraft()).toBeNull();

    localStorage.setItem(STAGE_DRAFT_KEY, 'null');
    expect(loadStageDraft()).toBeNull();
  });

  it('refuses a record with no activities to resume', () => {
    saveStageDraft(makeDraft({ activities: [] }));
    expect(loadStageDraft()).toBeNull();
  });

  it('drops activities that are not records with ids', () => {
    saveStageDraft(makeDraft({ activities: [{ nope: true } as unknown as Activity, makeActivity('a1')] }));
    expect(loadStageDraft()!.activities.map((a) => a.id)).toEqual(['a1']);
  });

  it('coerces a hand-edited record rather than trusting it', () => {
    localStorage.setItem(
      STAGE_DRAFT_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        activities: [makeActivity('a1')],
        userResponses: 'not an object',
        currentActivityIndex: -3,
        field1: 42,
        // Enough real typing that the record still counts as work to resume.
        field2: 'kept from before',
      })
    );
    const loaded = loadStageDraft();
    expect(loaded).not.toBeNull();
    expect(loaded!.field1).toBe('');
    expect(loaded!.field2).toBe('kept from before');
    expect(loaded!.userResponses).toEqual({});
    expect(loaded!.currentActivityIndex).toBe(0);
    expect(loaded!.encodingMode).toBe('conceptual');
  });
});

describe('freshness', () => {
  it('keeps a draft inside the window, including one written in the future', () => {
    expect(isStageDraftFresh({ savedAt: 1_000 }, 1_000 + STAGE_DRAFT_MAX_AGE_MS)).toBe(true);
    expect(isStageDraftFresh({ savedAt: 10_000 }, 5_000)).toBe(true); // clock skew
  });

  it('drops a draft older than the window', () => {
    expect(isStageDraftFresh({ savedAt: 1_000 }, 1_001 + STAGE_DRAFT_MAX_AGE_MS)).toBe(false);
    saveStageDraft(makeDraft(), 1_000);
    expect(loadStageDraft(1_001 + STAGE_DRAFT_MAX_AGE_MS)).toBeNull();
  });

  it('treats an unreadable stamp as stale, never as fresh', () => {
    for (const stamp of [undefined, null, 0, -5, NaN, Infinity, '123', true]) {
      expect(isStageDraftFresh({ savedAt: stamp })).toBe(false);
    }
  });
});

describe('clearStageDraft', () => {
  it('removes the record', () => {
    saveStageDraft(makeDraft());
    clearStageDraft();
    expect(localStorage.getItem(STAGE_DRAFT_KEY)).toBeNull();
    expect(loadStageDraft()).toBeNull();
  });

  it('is a no-op when there is nothing stored', () => {
    expect(() => clearStageDraft()).not.toThrow();
  });
});

describe('what counts as recoverable work', () => {
  it('treats any live field with non-whitespace content as typing', () => {
    expect(stageDraftHasTyping(makeDraft({ field1: 'x', field2: '', field3: '', reflection: '' }))).toBe(true);
    expect(stageDraftHasTyping(makeDraft({ field1: '', field2: '', field3: '', reflection: 'took away' }))).toBe(true);
    expect(stageDraftHasTyping(makeDraft({ field1: '   ', field2: '\n', field3: '', reflection: '' }))).toBe(false);
  });

  it('needs a session and something in it', () => {
    expect(stageDraftHasProgress(makeDraft({ activities: [] }))).toBe(false);
    // Typed but not submitted: the defect case.
    expect(stageDraftHasProgress(makeDraft())).toBe(true);
    // A stage already submitted this session is progress too.
    expect(
      stageDraftHasProgress(
        makeDraft({ field1: '', field2: '', field3: '', reflection: '', userResponses: { a1: { field1: 'done', field2: 'done' } } })
      )
    ).toBe(true);
    // Nothing typed and nothing submitted: not worth offering back.
    expect(
      stageDraftHasProgress(makeDraft({ field1: '', field2: '', field3: '', reflection: '', userResponses: {} }))
    ).toBe(false);
  });

  it('reports the stage number the learner was on', () => {
    expect(stageDraftStageNumber({ currentActivityIndex: 0 })).toBe(1);
    expect(stageDraftStageNumber({ currentActivityIndex: 2 })).toBe(3);
    expect(stageDraftStageNumber({ currentActivityIndex: -1 })).toBe(1);
    expect(stageDraftStageNumber({ currentActivityIndex: NaN })).toBe(1);
  });
});
