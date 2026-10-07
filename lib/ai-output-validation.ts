/**
 * Structured output validation for AI responses.
 *
 * The model providers are fallible: they can omit required keys, emit the
 * wrong type for a field, or wrap valid JSON in ```markdown fences. Every
 * API route should run its response through the matching validator here so a
 * malformed model payload degrades gracefully to a safe shape instead of
 * crashing the client or corrupting stored schemas.
 */

import {
  Activity,
  DiscriminationCheck,
  DiscriminationQuestion,
  EncodingMode,
  ParsonsResult,
  StageResponse,
} from './types';

import { validateToyModelConfig } from './toy-models/validation';
import { repairJson } from './json-repair';
import { aiMetrics } from './ai-hardening';
import { normalizeAutopsy, normalizeMrM } from './mr-m/payloads';
import { normalizeInquisitorRead, type InquisitorParseResult } from './inquisitor/parse';

// ─── JSON sanitizing ─────────────────────────────────────────────────────────

/**
 * Strips ```json fences, BOMs and leading/trailing prose so JSON.parse
 * succeeds. Kept as a re-export for the existing call sites and tests; the
 * implementation lives in `lib/json-repair.ts` alongside the repair ladder
 * it feeds.
 */
export { extractJson } from './json-repair';

/**
 * Parse model JSON with leniency; returns null when nothing salvageable
 * remains.
 *
 * Leniency ladder: direct parse → prose/fence strip → full repair
 * (trailing commas, smart quotes, unquoted keys, single quotes, literal
 * newlines inside strings, truncation close, prefix salvage). Every path the
 * models actually break survives here; null means even the truncation
 * salvage could not produce JSON, and the caller should retry or degrade.
 */
export function safeParseJson<T = unknown>(raw: string): T | null {
  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) return null;
  try {
    const value = JSON.parse(text) as T;
    aiMetrics.recordCleanParse();
    return value;
  } catch {
    // Not valid as-is. Hand the text to the repair ladder before giving up.
    const repaired = repairJson(text);
    if (repaired) aiMetrics.recordRepair(repaired.via);
    return repaired ? (repaired.value as T) : null;
  }
}

// ─── Schema generation validation ────────────────────────────────────────────


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
/**
 * Coerces a stage's `visualData`, normalising the Mr M overlay inside it.
 *
 * The Mr M block is normalised ONCE, here, at the boundary where model output
 * enters the app. Nothing downstream re-normalises it, which is deliberate:
 * `payloadFor` must return the payload by reference or a panel that compares
 * payload identity across renders would re-home on every pass.
 */
function normalizeVisualData(raw: unknown): Record<string, any> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const visual = { ...(raw as Record<string, any>) };
  const mrM = normalizeMrM(visual.mrM);
  if (mrM) visual.mrM = mrM;
  else delete visual.mrM;
  return visual;
}

export function validateEncodedSchema(raw: unknown, mode: EncodingMode, source?: string): {
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
          const toy = a.toyModel === undefined ? undefined : validateToyModelConfig(a.toyModel, source);
          return {
            toyModel: toy?.sanitizedConfig,
            toyModelIssues: toy ? toy.issues : undefined,
            id: asString(a.id, `stage-${i + 1}`),
            stageNumber: typeof a.stageNumber === 'number' && a.stageNumber > 0 ? a.stageNumber : i + 1,
            title: asString(a.title, `Stage ${i + 1}`),
            framework: asString(a.framework, 'Cognitive Encoding'),
            cognitiveGoal: asString(
              a.cognitiveGoal,
              mode === 'memorization' ? 'Anchor the material mnemonically.' : 'Explain the core mechanism.'
            ),
            contextSnippet: asString(a.contextSnippet, topicSummary),
            // The paradox hook and the thought experiment are optional: older
            // stored schemas and thin-note stages simply do not have them, and
            // the workbench falls back to the prompt.
            paradox: asString(a.paradox) || undefined,
            gedankenexperiment: asString(a.gedankenexperiment) || undefined,
            keywords: asStringArray(a.keywords),
            visualData: normalizeVisualData(a.visualData),
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
              // Causal Mad-Libs sentence template. Left undefined when the model
              // skipped it (or wrote something unusable): the workbench derives
              // a structural frame from the labels instead, so sentence mode
              // never depends on the model getting this right.
              causalFrame: asString(scaffold.causalFrame) || undefined,
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
 *
 * There is no score and no grade to coerce any more: the examiner returns a
 * boolean (`secured`) plus the sentences that move the learner forward. A
 * malformed payload therefore defaults to `secured: false` with an empty
 * counter-probe — it never invents a verdict, and it never invents a number.
 *
 * Sessions saved before this contract existed still carry `grade`/`score`;
 * those are read once here so an old schema keeps rendering sanely instead of
 * flipping every finished stage back to unsecured.
 */
export function validateEvaluationResult(raw: unknown): NonNullable<StageResponse['feynmanReview']> {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  // Legacy bridge: a stored `grade` maps onto the boolean, so old decks keep
  // their meaning without the number ever resurfacing in the UI.
  const legacyGrade = typeof data.grade === 'string' ? data.grade.toLowerCase() : '';
  const secured =
    typeof data.secured === 'boolean'
      ? data.secured
      : legacyGrade === 'mastered' || legacyGrade === 'good';

  const result: NonNullable<StageResponse['feynmanReview']> = {
    secured,
    feedback: asString(data.feedback, ''),
  };
  if (data.depthAlert) result.depthAlert = asString(data.depthAlert);
  if (data.errorAnalysis) result.errorAnalysis = asString(data.errorAnalysis, data.errorAnalysis);
  if (data.jargonBuzzer) result.jargonBuzzer = asString(data.jargonBuzzer);
  if (data.vivaCrossExamination) result.vivaCrossExamination = asString(data.vivaCrossExamination);
  // What landed + the one sentence that completes it. Falls back to
  // errorAnalysis for the gap so older checker prompts still render the panel.
  if (data.nailedIt) result.nailedIt = asString(data.nailedIt);
  const missingLink = asString(data.missingLink) || asString(data.errorAnalysis);
  if (missingLink) result.missingLink = missingLink;
  // The pressure test: one question that pushes the mechanism to its edge.
  if (data.counterProbe) result.counterProbe = asString(data.counterProbe);
  if (data.sentenceFinisher) result.sentenceFinisher = asString(data.sentenceFinisher);
  // Mr M post-mortem. Absent when the stage landed, when the mode was off, or
  // when the examiner had nothing structural to name — all three are the same
  // outcome for the UI, and the deterministic half of the autopsy is computed
  // on the client rather than stored here.
  if (data.autopsy) {
    const autopsy = normalizeAutopsy(data.autopsy);
    if (autopsy) result.autopsy = autopsy;
  }
  return result;
}

// ─── Recursive why-ladder validation ────────────────────────────────────────

export interface ProbeResult {
  /** The load-bearing claim in the last layer being interrogated. */
  target: string;
  /** The next single why-question, or an acknowledgement at bedrock. */
  question: string;
  /** True when the last layer is already a fundamental constraint. */
  isAxiom: boolean;
  /** One-sentence systemic necessity (only meaningful when isAxiom). */
  axiom: string;
  /** 1-based index of the layer that was interrogated (set by the route). */
  depth: number;
}

function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

/**
 * Coerces a ladder probe into a safe shape. An "axiom" without a sentence is
 * downgraded to a normal question so the UI never dead-ends on an empty block.
 */
export function validateProbeResult(raw: unknown): ProbeResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const axiom = asString(data.axiom);
  const isAxiom = asBool(data.isAxiom) && axiom.length > 0;
  return {
    target: asString(data.target),
    question: asString(
      data.question,
      isAxiom ? 'Bedrock reached.' : 'What property forces that to be true?'
    ),
    isAxiom,
    axiom: isAxiom ? axiom : '',
    depth: clampScore(data.depth, 1, 1, 99),
  };
}

// ─── Inverted-step drill validation ─────────────────────────────────────────

export interface InvertedStepResult {
  title: string;
  /** 3–5 causal steps, exactly one of which is falsified. */
  steps: { id: string; text: string }[];
  /** Id of the falsified step; '' when the model's id matched nothing. */
  falsifiedStepId: string;
  flawType: string;
  /** The reveal: what the lie claims vs. the honest mechanism. */
  whyFalsified: string;
  /** The honest wording of the falsified step. */
  correctVersion: string;
}

/**
 * Coerces the adversarial drill into something playable. Steps are capped at 5
 * and given stable ids, and an unmatchable `falsifiedStepId` degrades to the
 * first step so the drill never becomes unanswerable — the reveal text is what
 * actually teaches, and it is preserved either way.
 */
export function validateInvertedStepResult(raw: unknown): InvertedStepResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  // Filter BEFORE capping: an empty step must not consume one of the five
  // slots, or a sloppy payload silently shrinks the drill.
  const steps = (Array.isArray(data.steps) ? data.steps : [])
    .map((s: any, i: number) => ({
      id: typeof s?.id === 'string' && s.id.trim() ? s.id.trim() : `s${i + 1}`,
      text: asString(s?.text),
    }))
    .filter((s: { text: string }) => s.text.length > 0)
    .slice(0, 5);

  const requested = typeof data.falsifiedStepId === 'string' ? data.falsifiedStepId.trim() : '';
  const matched = steps.some((s: { id: string }) => s.id === requested);

  return {
    title: asString(data.title, 'Causal chain'),
    steps,
    falsifiedStepId: matched ? requested : steps[0]?.id ?? '',
    flawType: asString(data.flawType, 'fatal flaw'),
    whyFalsified: asString(data.whyFalsified),
    correctVersion: asString(data.correctVersion),
  };
}

/**
 * Coerces the Parsons-style ordering drill into something playable.
 *
 * The chain IS the answer, so a malformed payload cannot be repaired by
 * guessing: empty steps are dropped, the order is preserved as the canonical
 * sequence, and duplicates are removed (the same step twice would make the
 * puzzle ambiguous rather than merely hard). Fewer than three usable steps
 * means the drill is not worth showing, and the route reports that instead.
 */
export function validateParsonsResult(raw: unknown): ParsonsResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const seen = new Set<string>();
  const steps: ParsonsResult['steps'] = [];
  (Array.isArray(data.steps) ? data.steps : []).forEach((s: any, i: number) => {
    const text = asString(s?.text);
    if (!text) return;
    const key = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) return;
    seen.add(key);
    const id = typeof s?.id === 'string' && s.id.trim() ? s.id.trim() : `s${i + 1}`;
    steps.push({ id, text });
  });

  return {
    title: asString(data.title, 'Causal chain'),
    steps: steps.slice(0, 6),
    pivotRule: asString(data.pivotRule),
    summary: asString(data.summary),
  };
}

/**
 * Coerces the discrimination gate into something playable.
 *
 * The gate is only meaningful as a BLIND test, so the validator enforces the
 * two properties blindness depends on: exactly two vignettes, and one of them
 * answering `true` while the other answers `false` (two concept items, or two
 * lookalike items, would be answerable without discriminating anything). When
 * the payload cannot meet that, it returns an empty check and the UI skips the
 * gate rather than showing a rigged one.
 */
export function validateDiscriminationResult(raw: unknown): DiscriminationCheck {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const conceptLabel = asString(data.conceptLabel);
  const lookalikeLabel = asString(data.lookalikeLabel);

  const questions: DiscriminationQuestion[] = (Array.isArray(data.questions) ? data.questions : [])
    .map((q: any, i: number) => ({
      id: typeof q?.id === 'string' && q.id.trim() ? q.id.trim() : `dq${i + 1}`,
      vignette: asString(q?.vignette),
      answerIsConcept: q?.answerIsConcept === true,
      rationale: asString(q?.rationale),
    }))
    .filter((q: DiscriminationQuestion) => q.vignette.length > 0)
    .slice(0, 2);

  const bothSides = questions.some((q) => q.answerIsConcept) && questions.some((q) => !q.answerIsConcept);
  const playable = questions.length === 2 && bothSides && Boolean(conceptLabel && lookalikeLabel);

  return {
    topic: asString(data.topic, conceptLabel || 'Concept boundary'),
    conceptLabel,
    lookalikeLabel,
    questions: playable ? questions : [],
    operationalRule: asString(data.operationalRule),
    cardFront: asString(data.cardFront),
    cardBack: asString(data.cardBack),
  };
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
  analysis: string;
  perStageGrades: {
    stageTitle: string;
    secured: boolean;
    /** The one edge-case question still open for that stage; '' when none. */
    counterProbe: string;
    feedback: string;
  }[];
}

/**
 * Coerces the end-of-session read. Same no-verdict rule as the single-stage
 * path: the session ends with the mechanism named and the open questions
 * listed, never with a percentage.
 */
export function validateBatchEvaluation(raw: unknown): SafeBatchEvaluation {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const perStageGrades = Array.isArray(data.perStageGrades)
    ? data.perStageGrades
        .filter((g): g is Record<string, any> => g && typeof g === 'object')
        .map(g => {
          const legacyGrade = typeof g.grade === 'string' ? g.grade.toLowerCase() : '';
          return {
            stageTitle: asString(g.stageTitle, 'Stage'),
            secured:
              typeof g.secured === 'boolean'
                ? g.secured
                : legacyGrade === 'mastered' || legacyGrade === 'good',
            counterProbe: asString(g.counterProbe, ''),
            feedback: asString(g.feedback, ''),
          };
        })
    : [];
  return {
    analysis: asString(data.analysis, ''),
    perStageGrades,
  };
}

// ─── Question-first inquisitor validation ───────────────────────────────────

/**
 * The inquisitor's read is the one payload in this file that is allowed to be
 * REJECTED rather than repaired, so this returns a refusal union instead of a
 * safe shape.
 *
 * Every other validator here has a benign default because its subject is
 * content the learner asked to generate. This one is a verdict about whether
 * their reasoning holds: a verdict with no proof, or a `false` with no fix, has
 * no benign default — the only "safe shape" would be a plausible-looking
 * answer assembled from nothing, which is worse than saying nothing. So the
 * rules live in `lib/inquisitor/parse.ts` (pure, unit-tested) and the route
 * turns a refusal into a message the learner can act on.
 *
 * `submittedClaim` is the learner's own sentence, and it is passed through so the
 * fidelity gate can run here rather than only in the client: a verdict about a
 * sentence the learner did not write is refused at the boundary it crossed,
 * which is the only place that can also catch a restatement arriving from a
 * proxy in front of the route.
 */
export function validateInquisitorRead(
  raw: unknown,
  submittedClaim = ''
): InquisitorParseResult {
  return normalizeInquisitorRead(raw, submittedClaim);
}

// ─── Error autopsy: the narrative half ──────────────────────────────────────

/** The model's prose over a fracture TypeScript has already named. */
export interface AutopsyNarrative {
  /** Why this is structural, in one or two sentences. */
  narrative: string;
  /** The corrected construction. */
  correction: string;
}

export type AutopsyNarrativeRefusal = 'empty' | 'factor-mismatch';

export interface AutopsyNarrativeResult {
  ok: boolean;
  narrative: AutopsyNarrative;
  refused?: AutopsyNarrativeRefusal;
  message?: string;
}

/** Number words a model reaches for when it means a factor. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  hundred: 100,
  thousand: 1000,
  half: 0.5,
  double: 2,
  twice: 2,
  triple: 3,
};

/**
 * A claim about the SIZE of the error: `factor of two`, `off by 3`, `×1000`.
 *
 * Deliberately narrow. A bare number is not a claim — "the 2 in the balanced
 * equation" is the model naming where to look, not asserting a magnitude — so
 * only the magnitude vocabulary counts, which is what keeps the guard from
 * refusing a correct narrative over an incidental digit.
 */
const FACTOR_CLAIM = /(?:factor\s+of|off\s+by|times)\s+([0-9]+(?:\.[0-9]+)?|[a-z]+)/gi;

function claimedFactors(text: string): number[] {
  const out: number[] = [];
  let match: RegExpExecArray | null;
  FACTOR_CLAIM.lastIndex = 0;
  while ((match = FACTOR_CLAIM.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    const word = NUMBER_WORDS[token];
    const numeric = word ?? Number(token);
    if (Number.isFinite(numeric) && numeric !== 0) out.push(numeric);
  }
  return out;
}

/**
 * Validates the autopsy's narrative against the arithmetic that was computed in
 * code.
 *
 * This validator REPAIRS nothing and REFUSES in one specific case: a narrative
 * that contradicts the number TypeScript already measured. The computed figure
 * is the evidence and the prose is the reading, so a reading that says "a factor
 * of three" over a computed factor of two is not a worse reading — it is a
 * wrong one, and showing it next to the arithmetic would teach the learner to
 * distrust the one part of the panel that cannot be wrong.
 *
 * `allowedFactors` is the set the prose is permitted to claim (the folded ratio
 * the diff measured). An empty narrative is refused as `empty`.
 */
export function validateAutopsyNarrative(
  raw: unknown,
  allowedFactors: number[]
): AutopsyNarrativeResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const narrative = asString(data.narrative, '');
  const correction = asString(data.correction, '');

  if (!narrative) {
    return {
      ok: false,
      narrative: { narrative: '', correction: '' },
      refused: 'empty',
      message: 'The autopsy came back with no explanation, so it is not shown.',
    };
  }

  const allowed = allowedFactors.filter((f) => Number.isFinite(f) && f !== 0);
  if (allowed.length > 0) {
    const mismatch = claimedFactors(narrative).find(
      (claimed) =>
        !allowed.some((factor) => Math.abs(claimed - factor) / Math.abs(factor) <= 0.02)
    );
    if (mismatch !== undefined) {
      return {
        ok: false,
        narrative: { narrative: '', correction: '' },
        refused: 'factor-mismatch',
        message: `The explanation claimed a factor of ${mismatch} while the computed discrepancy is ${allowed[0]}. The arithmetic is computed here, so the prose is not shown.`,
      };
    }
  }

  return { ok: true, narrative: { narrative, correction } };
}
