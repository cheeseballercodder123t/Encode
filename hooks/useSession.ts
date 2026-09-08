'use client';

import { useCallback, useMemo, useReducer, useState } from 'react';
import {
  Activity,
  EncodingMode,
  GuidedPathModule,
  ResearchContextItem,
  SavedSchema,
  StageResponse,
  YouTubeMetadata,
} from '@/lib/types';

export type AppState = 'input' | 'loading' | 'encoding' | 'completed';

/**
 * Full session state for the encode flow. Owned by a single reducer so every
 * transition (generation, stage navigation, checks, completion) is explicit
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
  | { type: 'select_module'; index: number }
  | { type: 'feynman_pass'; moduleIndex: number; score: number; feedback: string };

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
    setField1: (v: SetterArg<string>) => patch({ field1: v }),
    setField2: (v: SetterArg<string>) => patch({ field2: v }),
    setField3: (v: SetterArg<string>) => patch({ field3: v }),
    setSelectedPreset: (v: SetterArg<string>) => patch({ selectedPreset: v }),
    setFeynmanResult: (v: SetterArg<StageResponse['feynmanReview'] | null>) => patch({ feynmanResult: v }),
    setStageConfidence: (v: SetterArg<number>) => patch({ stageConfidence: v }),
    setStageReflection: (v: SetterArg<string>) => patch({ stageReflection: v }),
    setStageCheckCount: (v: SetterArg<number>) => patch({ stageCheckCount: v }),
    setStageErrorAnalysis: (v: SetterArg<string | null>) => patch({ stageErrorAnalysis: v }),
    setXp: (v: SetterArg<number>) => patch({ xp: v }),
    setCombo: (v: SetterArg<number>) => patch({ combo: v }),
  }), [patch]);

  // Award XP helper
  const addXP = useCallback((amount: number) => {
    dispatch({ type: 'add_xp', amount });
    setXpGainAnimation(amount);
    setTimeout(() => setXpGainAnimation(null), 1800);
  }, []);

  /**
   * Load stage inputs for the given activity index. Returns true when the
   * Readiness modal should be opened (stage not yet confirmed) so UI side
   * effects stay in the component layer.
   */
  const loadStageInputs = useCallback(
    (index: number, acts: Activity[], responses: Record<string, StageResponse>) => {
      const act = acts[index];
      const saved = act ? responses[act.id] : undefined;
      dispatch({ type: 'load_stage', index, activities: acts, responses });
      return !(saved && saved.readinessConfirmed);
    },
    []
  );

  const resetSession = useCallback(() => {
    dispatch({ type: 'reset' });
    setXpGainAnimation(null);
  }, []);

  /** Restore a saved schema into the completed view. Returns readiness requirement. */
  const resumeSchema = useCallback((schema: SavedSchema) => {
    dispatch({ type: 'resume_schema', schema });
    const first = schema.activities?.[0];
    const saved = first ? schema.userResponses?.[first.id] : undefined;
    return !(saved && saved.readinessConfirmed);
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
    currentActivity,
    matchedKeywords,
    semanticDepth,
    xpGainAnimation,
    addXP,
    patch,
    loadStageInputs,
    resetSession,
    resumeSchema,
    selectModule,
    feynmanPass,
  };
}

