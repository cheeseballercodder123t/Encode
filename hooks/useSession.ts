'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Activity,
  EncodingMode,
  GuidedPathModule,
  ResearchContextItem,
  SavedSchema,
  StageResponse,
  YouTubeMetadata,
} from '@/lib/types';
import {
  clearStageDraft,
  saveStageDraft,
  stageDraftHasTyping,
  type StageDraft,
} from '@/lib/stage-draft';

/**
 * How long after the last keystroke the stage draft is written.
 *
 * Short enough that stopping to think is already saved, long enough that a
 * burst of typing is one write. A reload inside the window is still safe: the
 * `pagehide` flush in `useSession` writes the latest draft synchronously.
 */
export const STAGE_DRAFT_DEBOUNCE_MS = 300;

export type AppState = 'input' | 'loading' | 'encoding' | 'completed';

/** Immutable snapshot of the three scaffold fields + preset picker. */
export interface FieldSnapshot {
  field1: string;
  field2: string;
  field3: string;
  selectedPreset: string;
}

function snapshotFields(s: Pick<SessionState, 'field1' | 'field2' | 'field3' | 'selectedPreset'>): FieldSnapshot {
  return { field1: s.field1, field2: s.field2, field3: s.field3, selectedPreset: s.selectedPreset };
}

/**
 * Full session state for the encode flow. Owned by a single reducer so every
 * transition-none (generation, stage navigation, checks, completion) is explicit
 * and testable.
 */
export interface SessionState {
  appState: AppState;
  encodingMode: EncodingMode;
  topicSummary: string;
  activities: Activity[];
  currentActivityIndex: number;
  userResponses: Record<string, StageResponse>;
  isGuidedPathMode: boolean;
  guidedModules: GuidedPathModule[];
  currentModuleIndex: number;
  youtubeData: YouTubeMetadata | null;
  researchContexts: ResearchContextItem[];
  // Current active stage inputs
  field1: string;
  field2: string;
  field3: string;
  selectedPreset: string;
  // Undo/redo stacks for the active stage's text fields (snapshot BEFORE a change).
  fieldUndoStack: FieldSnapshot[];
  fieldRedoStack: FieldSnapshot[];
  // Feynman Evaluator checking state
  feynmanResult: StageResponse['feynmanReview'] | null;
  stageConfidence: number;
  stageReflection: string;
  stageCheckCount: number;
  stageErrorAnalysis: string | null;
  // Gamification
  xp: number;
  combo: number;
}

export const initialSessionState: SessionState = {
  appState: 'input',
  encodingMode: 'conceptual',
  topicSummary: '',
  activities: [],
  currentActivityIndex: 0,
  userResponses: {},
  isGuidedPathMode: false,
  guidedModules: [],
  currentModuleIndex: 0,
  youtubeData: null,
  researchContexts: [],
  field1: '',
  field2: '',
  field3: '',
  selectedPreset: '',
  fieldUndoStack: [],
  fieldRedoStack: [],
  feynmanResult: null,
  stageConfidence: 75,
  stageReflection: '',
  stageCheckCount: 0,
  stageErrorAnalysis: null,
  xp: 0,
  combo: 1,
};

type SetterArg<T> = T | ((prev: T) => T);

/**
 * Partial state patch. Values may be plain values or updater functions
 * (mirroring useState semantics), used as a bridge for existing call sites.
 */
export type SessionPatch = {
  [K in keyof SessionState]?: SetterArg<SessionState[K]>;
};

export type SessionAction =
  | { type: 'patch'; payload: SessionPatch }
  | { type: 'load_stage'; index: number; activities: Activity[]; responses: Record<string, StageResponse> }
  | { type: 'add_xp'; amount: number }
  | { type: 'reset' }
  | { type: 'resume_schema'; schema: SavedSchema }
  | { type: 'resume_to_encoding'; schema: SavedSchema }
  | { type: 'select_module'; index: number }
  | { type: 'feynman_pass'; moduleIndex: number; score: number; feedback: string }
  | { type: 'restore_draft'; draft: StageDraft }
  | { type: 'push_field_snapshot'; snapshot: FieldSnapshot }
  | { type: 'undo_fields' }
  | { type: 'redo_fields' };

/** Hydrate the active stage inputs from a saved response (or reset them). */
function applyLoadedStage(
  state: SessionState,
  index: number,
  acts: Activity[],
  responses: Record<string, StageResponse>
): SessionState {
  const act = acts[index];
  const saved = act ? responses[act.id] : undefined;
  const base: SessionState = {
    ...state,
    activities: acts,
    currentActivityIndex: index,
  };
  if (saved) {
    return {
      ...base,
      field1: saved.field1 || '',
      field2: saved.field2 || '',
      field3: saved.field3 || '',
      selectedPreset: saved.selectedPreset || '',
      feynmanResult: saved.feynmanReview || null,
      stageConfidence: saved.confidenceScore ?? 75,
      stageReflection: saved.reflection || '',
      stageCheckCount: saved.checkCount || 0,
      stageErrorAnalysis: saved.errorAnalysis || null,
      fieldUndoStack: [],
      fieldRedoStack: [],
    };
  }
  return {
    ...base,
    field1: '',
    field2: '',
    field3: '',
    selectedPreset: '',
    feynmanResult: null,
    stageConfidence: 75,
    stageReflection: '',
    stageCheckCount: 0,
    stageErrorAnalysis: null,
    fieldUndoStack: [],
    fieldRedoStack: [],
  };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'patch': {
      const entries = Object.entries(action.payload) as [keyof SessionState, unknown][];
      if (entries.length === 0) return state;
      const next: SessionState = { ...state };
      for (const [key, value] of entries) {
        (next as unknown as Record<string, unknown>)[key] =
          typeof value === 'function'
            ? (value as (prev: unknown) => unknown)(state[key])
            : value;
      }
      return next;
    }
    case 'load_stage':
      return applyLoadedStage(state, action.index, action.activities, action.responses);
    case 'add_xp':
      return { ...state, xp: state.xp + action.amount };
    case 'reset':
      // Preserve the chosen encoding mode (matches the original resetApp behavior)
      return { ...initialSessionState, encodingMode: state.encodingMode };
    case 'resume_schema': {
      const schema = action.schema;
      return applyLoadedStage(
        {
          ...state,
          topicSummary: schema.topicSummary,
          encodingMode: schema.mode,
          activities: schema.activities || [],
          userResponses: schema.userResponses || {},
          xp: schema.xpEarned,
          isGuidedPathMode: Boolean(schema.isGuidedPath),
          guidedModules: schema.guidedModules || [],
          youtubeData: schema.youtubeData || null,
          researchContexts: schema.researchContexts || [],
          currentActivityIndex: 0,
          appState: 'completed',
        },
        0,
        schema.activities || [],
        schema.userResponses || {}
      );
    }
    case 'resume_to_encoding': {
      // Resume path for incomplete sessions: like resume_schema, but lands in
      // the encoding workbench at the first unfinished stage so the learner
      // continues where they stopped instead of viewing a trophy.
      const schema = action.schema;
      const acts = schema.activities || [];
      const responses = schema.userResponses || {};
      const firstUnfinished = acts.findIndex(a => {
        const r = responses[a.id];
        return !r || (!r.field1?.trim() && !r.field2?.trim()) || r.skipped;
      });
      const index = firstUnfinished >= 0 ? firstUnfinished : 0;
      return applyLoadedStage(
        {
          ...state,
          topicSummary: schema.topicSummary,
          encodingMode: schema.mode,
          activities: acts,
          userResponses: responses,
          xp: schema.xpEarned,
          isGuidedPathMode: Boolean(schema.isGuidedPath),
          guidedModules: schema.guidedModules || [],
          youtubeData: schema.youtubeData || null,
          researchContexts: schema.researchContexts || [],
          currentActivityIndex: index,
          appState: 'encoding',
        },
        index,
        acts,
        responses
      );
    }
    case 'select_module': {
      const mod = state.guidedModules[action.index];
      if (!mod || !mod.unlocked) return state;
      const modActs = mod.activities || [];
      return applyLoadedStage(
        { ...state, currentModuleIndex: action.index, activities: modActs, currentActivityIndex: 0 },
        0,
        modActs,
        state.userResponses
      );
    }
    case 'restore_draft': {
      // Put the learner back on the stage they were typing on, with the typing
      // itself (defect 37). The live fields come from the draft verbatim rather
      // than from `applyLoadedStage`, which only knows about SUBMITTED
      // responses — the whole point of the draft is what never got submitted.
      const draft = action.draft;
      const acts = draft.activities || [];
      const lastIndex = Math.max(0, acts.length - 1);
      const index = Math.min(Math.max(0, Math.floor(draft.currentActivityIndex) || 0), lastIndex);
      return {
        ...state,
        appState: 'encoding',
        encodingMode: draft.encodingMode,
        topicSummary: draft.topicSummary,
        activities: acts,
        userResponses: draft.userResponses || {},
        currentActivityIndex: index,
        isGuidedPathMode: Boolean(draft.isGuidedPath),
        guidedModules: draft.guidedModules || [],
        youtubeData: draft.youtubeData ?? null,
        researchContexts: draft.researchContexts || [],
        xp: draft.xpEarned,
        field1: draft.field1 || '',
        field2: draft.field2 || '',
        field3: draft.field3 || '',
        selectedPreset: draft.selectedPreset || '',
        stageReflection: draft.reflection || '',
        // A restored draft is a starting point, not a reversible edit.
        fieldUndoStack: [],
        fieldRedoStack: [],
      };
    }
    case 'push_field_snapshot': {
      // Coalesce identical consecutive snapshots and bound stack growth.
      const stack = state.fieldUndoStack;
      const last = stack[stack.length - 1];
      if (
        last &&
        last.field1 === action.snapshot.field1 &&
        last.field2 === action.snapshot.field2 &&
        last.field3 === action.snapshot.field3 &&
        last.selectedPreset === action.snapshot.selectedPreset
      ) {
        return state;
      }
      return {
        ...state,
        fieldUndoStack: [...stack, action.snapshot].slice(-100),
        // A new change invalidates the redo branch.
        fieldRedoStack: [],
      };
    }
    case 'undo_fields': {
      if (state.fieldUndoStack.length === 0) return state;
      const prev = state.fieldUndoStack[state.fieldUndoStack.length - 1];
      const current = snapshotFields(state);
      return {
        ...state,
        field1: prev.field1,
        field2: prev.field2,
        field3: prev.field3,
        selectedPreset: prev.selectedPreset,
        fieldUndoStack: state.fieldUndoStack.slice(0, -1),
        fieldRedoStack: [...state.fieldRedoStack, current].slice(-100),
      };
    }
    case 'redo_fields': {
      if (state.fieldRedoStack.length === 0) return state;
      const next = state.fieldRedoStack[state.fieldRedoStack.length - 1];
      const current = snapshotFields(state);
      return {
        ...state,
        field1: next.field1,
        field2: next.field2,
        field3: next.field3,
        selectedPreset: next.selectedPreset,
        fieldRedoStack: state.fieldRedoStack.slice(0, -1),
        fieldUndoStack: [...state.fieldUndoStack, current].slice(-100),
      };
    }
    case 'feynman_pass': {
      const updated = [...state.guidedModules];
      const i = action.moduleIndex;
      if (updated[i]) {
        updated[i] = {
          ...updated[i],
          completed: true,
          feynmanCheckpoint: {
            ...updated[i].feynmanCheckpoint,
            passed: true,
            score: action.score,
            feedback: action.feedback,
          },
        };
      }
      // Unlock next module
      if (i + 1 < updated.length) {
        updated[i + 1] = { ...updated[i + 1], unlocked: true };
      }
      return { ...state, guidedModules: updated };
    }
    default:
      return state;
  }
}

/**
 * The session state hub. Exposes the flat state (matching the original
 * page-level useState declarations 1:1), React-style setters backed by the
 * reducer, semantic actions and derived values.
 */
export function useSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [xpGainAnimation, setXpGainAnimation] = useState<number | null>(null);

  const patch = useCallback((payload: SessionPatch) => dispatch({ type: 'patch', payload }), []);

  const setters = useMemo(() => ({
    setAppState: (v: SetterArg<AppState>) => patch({ appState: v }),
    setEncodingMode: (v: SetterArg<EncodingMode>) => patch({ encodingMode: v }),
    setTopicSummary: (v: SetterArg<string>) => patch({ topicSummary: v }),
    setActivities: (v: SetterArg<Activity[]>) => patch({ activities: v }),
    setCurrentActivityIndex: (v: SetterArg<number>) => patch({ currentActivityIndex: v }),
    setUserResponses: (v: SetterArg<Record<string, StageResponse>>) => patch({ userResponses: v }),
    setIsGuidedPathMode: (v: SetterArg<boolean>) => patch({ isGuidedPathMode: v }),
    setGuidedModules: (v: SetterArg<GuidedPathModule[]>) => patch({ guidedModules: v }),
    setCurrentModuleIndex: (v: SetterArg<number>) => patch({ currentModuleIndex: v }),
    setYoutubeData: (v: SetterArg<YouTubeMetadata | null>) => patch({ youtubeData: v }),
    setResearchContexts: (v: SetterArg<ResearchContextItem[]>) => patch({ researchContexts: v }),
    setFeynmanResult: (v: SetterArg<StageResponse['feynmanReview'] | null>) => patch({ feynmanResult: v }),
    setStageConfidence: (v: SetterArg<number>) => patch({ stageConfidence: v }),
    setStageReflection: (v: SetterArg<string>) => patch({ stageReflection: v }),
    setStageCheckCount: (v: SetterArg<number>) => patch({ stageCheckCount: v }),
    setStageErrorAnalysis: (v: SetterArg<string | null>) => patch({ stageErrorAnalysis: v }),
    setXp: (v: SetterArg<number>) => patch({ xp: v }),
    setCombo: (v: SetterArg<number>) => patch({ combo: v }),
  }), [patch]);

  // ─── Undo/redo for the stage's text fields ─────────────────────────────────
  // Mirrors the live field state so setters can capture a pre-change snapshot
  // synchronously (before the reducer re-renders).
  const fieldStateRef = useRef<FieldSnapshot>({ field1: '', field2: '', field3: '', selectedPreset: '' });
  useEffect(() => {
    fieldStateRef.current = {
      field1: state.field1,
      field2: state.field2,
      field3: state.field3,
      selectedPreset: state.selectedPreset,
    };
  }, [state.field1, state.field2, state.field3, state.selectedPreset]);

  const makeFieldSetter = useCallback((key: 'field1' | 'field2' | 'field3' | 'selectedPreset') =>
    (v: SetterArg<string>) => {
      const cur = fieldStateRef.current[key];
      const next = typeof v === 'function' ? (v as (prev: string) => string)(cur) : v;
      if (next === cur) return;
      const pre = { ...fieldStateRef.current };
      dispatch({ type: 'push_field_snapshot', snapshot: pre });
      dispatch({ type: 'patch', payload: { [key]: next } as SessionPatch });
    }, []);

  const setField1 = useMemo(() => makeFieldSetter('field1'), [makeFieldSetter]);
  const setField2 = useMemo(() => makeFieldSetter('field2'), [makeFieldSetter]);
  const setField3 = useMemo(() => makeFieldSetter('field3'), [makeFieldSetter]);
  const setSelectedPreset = useMemo(() => makeFieldSetter('selectedPreset'), [makeFieldSetter]);

  const undoFields = useCallback(() => dispatch({ type: 'undo_fields' }), []);
  const redoFields = useCallback(() => dispatch({ type: 'redo_fields' }), []);
  const canUndo = state.fieldUndoStack.length > 0;
  const canRedo = state.fieldRedoStack.length > 0;

  // Award XP helper
  //
  // The XP pip is on a timer of its own, and the handle has to outlive the call
  // that started it. Discarding it meant two awards inside the same 1.8s window
  // left two live timers, and the FIRST one nulled the animation the second
  // award had just started — so a fast combo flashed its second gain and lost
  // it. One ref, one timer at a time.
  const xpAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addXP = useCallback((amount: number) => {
    dispatch({ type: 'add_xp', amount });
    setXpGainAnimation(amount);
    if (xpAnimationTimerRef.current) clearTimeout(xpAnimationTimerRef.current);
    xpAnimationTimerRef.current = setTimeout(() => {
      xpAnimationTimerRef.current = null;
      setXpGainAnimation(null);
    }, 1800);
  }, []);

  // Leaving the workbench mid-animation must not leave a timer behind that sets
  // state on a tree that is gone (and a reset must not cancel someone else's).
  useEffect(
    () => () => {
      if (xpAnimationTimerRef.current) {
        clearTimeout(xpAnimationTimerRef.current);
        xpAnimationTimerRef.current = null;
      }
    },
    []
  );

  // ─── In-progress stage draft (defect 37) ───────────────────────────────────
  //
  // The typing on the visible stage lives in this state and only reaches
  // `userResponses` on Submit/Skip, so a reload mid-stage used to return to
  // empty fields. The draft is written while the learner works and read back by
  // the launchpad, which offers the stage — content and all — rather than
  // silently dropping it.
  const latestDraftRef = useRef<StageDraft | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.appState !== 'encoding' || state.activities.length === 0) {
      latestDraftRef.current = null;
      return;
    }

    const draft: StageDraft = {
      savedAt: 0,
      topicSummary: state.topicSummary,
      encodingMode: state.encodingMode,
      xpEarned: state.xp,
      activities: state.activities,
      userResponses: state.userResponses,
      currentActivityIndex: state.currentActivityIndex,
      isGuidedPath: state.isGuidedPathMode,
      guidedModules: state.guidedModules,
      youtubeData: state.youtubeData,
      researchContexts: state.researchContexts,
      field1: state.field1,
      field2: state.field2,
      field3: state.field3,
      selectedPreset: state.selectedPreset,
      reflection: state.stageReflection,
    };

    // Nothing typed and nothing submitted (a stage looked at but untouched) is
    // not worth offering back: the draft is dropped instead of accumulating.
    if (!stageDraftHasTyping(draft) && Object.keys(state.userResponses).length === 0) {
      latestDraftRef.current = null;
      clearStageDraft();
      return;
    }

    latestDraftRef.current = draft;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      saveStageDraft(draft);
    }, STAGE_DRAFT_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [
    state.appState,
    state.topicSummary,
    state.encodingMode,
    state.xp,
    state.activities,
    state.userResponses,
    state.currentActivityIndex,
    state.isGuidedPathMode,
    state.guidedModules,
    state.youtubeData,
    state.researchContexts,
    state.field1,
    state.field2,
    state.field3,
    state.selectedPreset,
    state.stageReflection,
  ]);

  // A reload must not race the debounce: the draft is flushed synchronously as
  // the page goes away, so the keystroke before the reload is still there.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flush = () => {
      if (latestDraftRef.current) saveStageDraft(latestDraftRef.current);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  /**
   * Load stage inputs for the given activity index.
   *
   * Nothing gates this: the workbench paints immediately. A stage is a puzzle
   * to look at, not paperwork to clear first.
   */
  const loadStageInputs = useCallback(
    (index: number, acts: Activity[], responses: Record<string, StageResponse>) => {
      dispatch({ type: 'load_stage', index, activities: acts, responses });
    },
    []
  );

  const resetSession = useCallback(() => {
    dispatch({ type: 'reset' });
    setXpGainAnimation(null);
    latestDraftRef.current = null;
    clearStageDraft();
  }, []);

  /**
   * Restore an in-progress draft — the visible stage, with its unsubmitted
   * typing (defect 37). Used by the launchpad's recovered-stage banner.
   */
  const restoreDraft = useCallback((draft: StageDraft) => {
    dispatch({ type: 'restore_draft', draft });
  }, []);

  /** Restore a saved schema into the completed view. */
  const resumeSchema = useCallback((schema: SavedSchema) => {
    dispatch({ type: 'resume_schema', schema });
  }, []);

  /**
   * Resume an incomplete schema back into the ENCODING workbench at its first
   * unfinished stage (used by the input-screen shortcut + continue button).
   */
  const resumeToEncoding = useCallback((schema: SavedSchema) => {
    dispatch({ type: 'resume_to_encoding', schema });
  }, []);

  // Switch active module in Guided Path (locked modules are ignored)
  const selectModule = useCallback(
    (index: number) => dispatch({ type: 'select_module', index }),
    []
  );

  // Handle Feynman Checkpoint Pass in Guided Path
  const feynmanPass = useCallback(
    (moduleIndex: number, score: number, feedback: string) =>
      dispatch({ type: 'feynman_pass', moduleIndex, score, feedback }),
    []
  );

  const currentActivity = state.activities[state.currentActivityIndex];

  // Check matched keywords in real-time
  const matchedKeywords = useMemo(() => {
    if (!currentActivity?.keywords) return [];
    const combinedText = `${state.field1} ${state.field2} ${state.field3}`.toLowerCase();
    return currentActivity.keywords.filter(kw => {
      const cleanKw = kw.toLowerCase().trim();
      return cleanKw.length > 1 && combinedText.includes(cleanKw);
    });
  }, [currentActivity, state.field1, state.field2, state.field3]);

  // Real-time Semantic Depth score (0 to 100)
  const semanticDepth = useMemo(() => {
    let score = 0;
    const len1 = state.field1.trim().length;
    const len2 = state.field2.trim().length;
    const len3 = state.field3.trim().length;

    if (len1 > 10) score += 30;
    if (len1 > 30) score += 15;
    if (len2 > 10) score += 30;
    if (len2 > 30) score += 10;
    if (len3 > 5) score += 15;

    const kwBonus = (matchedKeywords.length / (currentActivity?.keywords?.length || 1)) * 20;
    return Math.min(100, Math.round(score + kwBonus));
  }, [state.field1, state.field2, state.field3, matchedKeywords, currentActivity]);

  return {
    ...state,
    ...setters,
    setField1,
    setField2,
    setField3,
    setSelectedPreset,
    undoFields,
    redoFields,
    canUndo,
    canRedo,
    currentActivity,
    matchedKeywords,
    semanticDepth,
    xpGainAnimation,
    addXP,
    patch,
    loadStageInputs,
    resetSession,
    restoreDraft,
    resumeSchema,
    resumeToEncoding,
    selectModule,
    feynmanPass,
  };
}

