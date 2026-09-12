/**
 * Structured output validation for AI responses.
 *
 * The model providers are fallible: they can omit required keys, emit the
 * wrong type for a field, or wrap valid JSON in ```markdown fences. Every
 * API route should run its response through the matching validator here so a
 * malformed model payload degrades gracefully to a safe shape instead of
 * crashing the client or corrupting stored schemas.
 */

import { Activity, EncodingMode, StageResponse } from './types';

// ─── JSON sanitizing ─────────────────────────────────────────────────────────

/** Strips ```json fences, BOMs and leading/trailing prose so JSON.parse succeeds. */
export function extractJson(text: string): string {
  if (!text) return '';
  let s = text.replace(/^\uFEFF/, '').trim();
  // ```json ... ``` or ``` ... ```
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // Sometimes the model wraps the object in a single backtick.
  const tickMatch = s.match(/^`([\s\S]*)`$/);
  if (tickMatch) return tickMatch[1].trim();
  // First { to last } (strip "Here is the JSON:" style prose).
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return s.slice(firstBrace, lastBrace + 1);
  }
  return s;
}

/** Parse model JSON with leniency; returns null when nothing salvageable remains. */
export function safeParseJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      return JSON.parse(extractJson(raw)) as T;
    } catch {
      return null;
    }
  }
}

// ─── Schema generation validation ────────────────────────────────────────────

const GRADE_ALLOWED = new Set(['mastered', 'good', 'needs_elaboration']);

function clampScore(n: unknown, fallback: number, min = 0, max = 100): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
/**
 * Coerces a raw AI schema payload into the shape DeepEncode's rendering layer
 * depends on. Fills missing scaffold labels with safe defaults, drops unusable
 * activities, and synthesizes a single generic stage when the model returned
 * zero usable ones (never stuck on an empty workbench).
 */
export function validateEncodedSchema(raw: unknown, mode: EncodingMode): {
  topicSummary: string;
  activities: Activity[];
  researchContexts: unknown[];
} {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const topicSummary = asString(
    data.topicSummary,
    mode === 'memorization' ? 'High-Yield Mnemonic Schema' : 'Active Cognitive Schema'
  );

  const activities: Activity[] = Array.isArray(data.activities)
    ? data.activities
        .filter((a): a is Record<string, any> => a && typeof a === 'object')
        .map((a, i) => {
          const scaffold = (a.scaffold && typeof a.scaffold === 'object' ? a.scaffold : {}) as Record<string, any>;
          return {
            id: asString(a.id, `stage-${i + 1}`),
            stageNumber: typeof a.stageNumber === 'number' && a.stageNumber > 0 ? a.stageNumber : i + 1,
            title: asString(a.title, `Stage ${i + 1}`),
            framework: asString(a.framework, 'Cognitive Encoding'),
            cognitiveGoal: asString(
              a.cognitiveGoal,
              mode === 'memorization' ? 'Anchor the material mnemonically.' : 'Explain the core mechanism.'
            ),
            contextSnippet: asString(a.contextSnippet, topicSummary),
            keywords: asStringArray(a.keywords),
            visualData: a.visualData && typeof a.visualData === 'object' ? a.visualData : undefined,
            templateType: asString(
              a.templateType,
              mode === 'memorization' ? 'memory_palace' : 'first_principles'
            ),
            prompt: asString(
              a.prompt,
              mode === 'memorization'
                ? 'Create a vivid spatial hook for this topic.'
                : 'Deconstruct this topic into its causal components.'
            ),
            scaffold: {
              field1Label: asString(scaffold.field1Label, 'Mechanism'),
              field1Placeholder: asString(scaffold.field1Placeholder),
              field2Label: asString(scaffold.field2Label, 'Causal Link'),
              field2Placeholder: asString(scaffold.field2Placeholder),
              field3Label: asString(scaffold.field3Label),
              field3Placeholder: asString(scaffold.field3Placeholder),
              exampleAnswer: asString(scaffold.exampleAnswer),
            },
            // Rich optional context passthroughs.
            researchContext: a.researchContext && typeof a.researchContext === 'object' ? a.researchContext : undefined,
            videoTimestamp: a.videoTimestamp && typeof a.videoTimestamp === 'object' ? a.videoTimestamp : undefined,
            boundaryContrast:
              a.boundaryContrast && typeof a.boundaryContrast === 'object'
                ? {
                    confusableLookalike: asString(a.boundaryContrast.confusableLookalike),
                    distinguishingRule: asString(a.boundaryContrast.distinguishingRule),
                  }
                : undefined,
          } as Activity;
        })
    : [];

  // If the model returned zero usable stages, fall back to a single generic
  // stage so the user is never stuck on an empty workbench.
  if (activities.length === 0) {
    activities.push({
      id: 'fallback-stage-1',
      stageNumber: 1,
      title: 'Core Mechanism',
      framework: 'Cognitive Encoding',
      cognitiveGoal: mode === 'memorization' ? 'Anchor the material mnemonically.' : 'Explain the core mechanism.',
      contextSnippet: topicSummary,
      keywords: [],
      visualData: undefined,
      templateType: mode === 'memorization' ? 'memory_palace' : 'first_principles',
      prompt: mode === 'memorization'
        ? 'Create a vivid spatial hook for this topic.'
        : 'Deconstruct this topic into its causal components.',
      scaffold: {
        field1Label: 'Mechanism',
        field1Placeholder: mode === 'memorization' ? 'Vivid sensory hook...' : 'Describe the core mechanism...',
        field2Label: 'Causal Link',
        field2Placeholder: 'What drives the change?',
        field3Label: '',
        field3Placeholder: '',
        exampleAnswer: '',
      },
    } as Activity);
  }

  const researchContexts = Array.isArray(data.researchContexts) ? data.researchContexts : [];

  return { topicSummary, activities, researchContexts };
}
// ─── Evaluation validation ───────────────────────────────────────────────────
/**
 * Coerces an /api/evaluate payload into a safe StageResponse['feynmanReview'].
 * Falls back to a neutral "needs_elaboration" grade so a malformed checker
 * response never accidentally grants mastery (or an empty feedback loop).
 */
export function validateEvaluationResult(raw: unknown): NonNullable<StageResponse['feynmanReview']> {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const rawGrade = typeof data.grade === 'string' ? data.grade.toLowerCase() : '';
  const grade = GRADE_ALLOWED.has(rawGrade)
    ? (rawGrade as 'mastered' | 'good' | 'needs_elaboration')
    : 'needs_elaboration';
  const defaultScore = grade === 'mastered' ? 85 : grade === 'good' ? 70 : 55;
  const defaultXp = grade === 'mastered' ? 60 : grade === 'good' ? 40 : 25;
  const result: NonNullable<StageResponse['feynmanReview']> = {
    grade,
    score: clampScore(data.score, defaultScore, 0, 100),
    xpBonus: clampScore(data.xpBonus ?? defaultXp, defaultXp, 0, 500),
    feedback: asString(
      data.feedback,
      'Your explanation is a good start — tighten the causal bridge to the target mechanism.'
    ),
  };
  if (data.depthAlert) result.depthAlert = asString(data.depthAlert);
  if (data.errorAnalysis) result.errorAnalysis = asString(data.errorAnalysis, data.errorAnalysis);
  if (data.jargonBuzzer) result.jargonBuzzer = asString(data.jargonBuzzer);
  if (data.vivaCrossExamination) result.vivaCrossExamination = asString(data.vivaCrossExamination);
  return result;
}

// ─── YouTube validation ──────────────────────────────────────────────────────

export function validateYouTubeResult(raw: unknown): {
  topicSummary: string;
  activities: Activity[];
  youtubeData?: Record<string, any>;
  researchContexts: unknown[];
} {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const schema = validateEncodedSchema(raw, 'conceptual');
  return {
    ...schema,
    topicSummary: asString(data.topicSummary || data.videoTitle, schema.topicSummary),
    youtubeData:
      data.youtubeData && typeof data.youtubeData === 'object'
        ? data.youtubeData
        : data.videoId
          ? { videoId: data.videoId, videoUrl: data.videoUrl || '', title: schema.topicSummary, timestamps: [] }
          : undefined,
  };
}

// ─── Batch evaluation validation ─────────────────────────────────────────────

export interface SafeBatchEvaluation {
  overallScore: number;
  analysis: string;
  perStageGrades: {
    stageTitle: string;
    grade: 'mastered' | 'good' | 'needs_elaboration';
    score: number;
    feedback: string;
  }[];
}

export function validateBatchEvaluation(raw: unknown): SafeBatchEvaluation {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const perStageGrades = Array.isArray(data.perStageGrades)
    ? data.perStageGrades
        .filter((g): g is Record<string, any> => g && typeof g === 'object')
        .map(g => ({
          stageTitle: asString(g.stageTitle, 'Stage'),
          grade: (GRADE_ALLOWED.has(g.grade) ? g.grade : 'needs_elaboration') as SafeBatchEvaluation['perStageGrades'][number]['grade'],
          score: clampScore(g.score, 55),
          feedback: asString(g.feedback, ''),
        }))
    : [];
  return {
    overallScore: clampScore(data.overallScore, 0),
    analysis: asString(data.analysis, ''),
    perStageGrades,
  };
}
