/**
 * Server-side request validation for the API routes.
 *
 * Before this module the route handlers trusted client JSON bodies: a missing
 * `notes` crashed deep inside prompt assembly, a `settings` object with a
 * wrong shape leaked an opaque provider error, and `mode` could be any string.
 * Routes now parse their bodies through the matching schema here, so bad
 * input is rejected up front with a 400 that names the field.
 *
 * Schemas are deliberately lenient — they enforce *type and boundary* (no
 * 10MB string as "notes", no nested functions, no wrong-typed flags) but not
 * content, because the routes already coerce model output downstream. The
 * goal is to make impossible input impossible, not to re-specify the app.
 *
 * Every route that reads a request body has a schema here (or, like /api/forge,
 * one declared next to the handler): an unguarded body is how a route answered
 * 500 to malformed JSON, and how free text reached a paid provider with no
 * ceiling at all.
 *
 * A field the route itself validates for emptiness stays optional in its
 * schema. The route keeps the sentence a learner reads ("Name the topic first
 * — the crucible is timed against a chapter"); the schema's job is the shape
 * and the ceiling, not the encouragement.
 */

import { z } from 'zod';

// ─── Shared fragments ────────────────────────────────────────────────────────

/** User-supplied provider settings. API keys are strings; usage is optional. */
export const settingsSchema = z
  .object({
    provider: z.enum(['gemini', 'openrouter', 'openai']).optional(),
    geminiApiKey: z.string().max(500).optional(),
    geminiModel: z.string().max(120).optional(),
    geminiCheckerModel: z.string().max(120).optional(),
    openrouterApiKey: z.string().max(500).optional(),
    openrouterModel: z.string().max(200).optional(),
    openrouterCheckerModel: z.string().max(200).optional(),
    openaiApiKey: z.string().max(500).optional(),
    openaiBaseUrl: z.string().max(300).optional(),
    openaiModel: z.string().max(200).optional(),
    openaiCheckerModel: z.string().max(200).optional(),
  })
  .optional();

/**
 * Base64 multimodal attachment (PDF/image). Bounded so a route never holds
 * 100MB strings.
 *
 * `nullish`, not `optional`: the file is React state (`UploadedFileAsset |
 * null`), so "no attachment, notes only" arrives as an explicit `null` that
 * `JSON.stringify` keeps. Rejecting that turned the most ordinary request in
 * the app — paste notes, upload nothing — into a 400.
 */
export const fileAssetSchema = z
  .object({
    name: z.string().max(300),
    type: z.string().max(120),
    size: z.number().max(30 * 1024 * 1024),
    base64Data: z.string().max(45 * 1024 * 1024),
    previewUrl: z.string().max(45 * 1024 * 1024).optional(),
  })
  .nullish();

/** Free-text source material. 64k chars covers any realistic paste; the encode prompt slices to 16k words anyway. */
const sourceText = z.string().max(200_000);

/** A topic, a stage title, a framework name or another short label. */
const shortText = z.string().max(300);

/** A stage's own prompt / instruction line (the widest one the UI authors). */
const promptText = z.string().max(5_000);

/** The excerpt of source material a stage-level drill is authored from. */
const contextText = z.string().max(20_000);

/** Prose the learner typed: a claim, a checkpoint answer, an autopsy target. */
const answerText = z.string().max(20_000);

// ─── Route schemas ───────────────────────────────────────────────────────────
// One schema per AI route; `parseRouteBody` turns a ZodError into a 400 whose
// message names the first offending field.

export const encodeSchema = z.object({
  notes: sourceText.optional(),
  mode: z.enum(['conceptual', 'memorization']).default('conceptual'),
  settings: settingsSchema,
  file: fileAssetSchema,
  enableDeepResearch: z.boolean().default(true),
  enableGuidedPath: z.boolean().default(false),
  userConfidence: z.number().min(0).max(5).optional(),
  successRate: z.number().min(0).max(1).optional(),
  interleaveMode: z.boolean().default(false),
  gear: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  hiddenTemplates: z.array(z.string().max(120)).max(60).default([]),
  /** Mr M mode: asks the encoder for the first-principles overlay payloads. */
  mrMMode: z.boolean().optional().default(false),
  /** Stream flag used by /api/encode/stream downstream call. */
  stream: z.boolean().optional(),
});

export const evaluateSchema = z.object({
  batchMode: z.boolean().optional(),
  preSessionConfidence: z.number().min(0).max(5).optional(),
  stages: z
    .array(
      z.object({
        title: z.string().max(300).optional(),
        framework: z.string().max(200).optional(),
        field1Label: z.string().max(200).optional(),
        field1Value: z.string().max(20_000).optional(),
        field2Label: z.string().max(200).optional(),
        field2Value: z.string().max(20_000).optional(),
        field3Label: z.string().max(200).optional(),
        field3Value: z.string().max(20_000).optional(),
        reflection: z.string().max(5_000).optional(),
      })
    )
    .max(30)
    .optional(),
  settings: settingsSchema,
  topicSummary: z.string().max(300).optional(),
  stageTitle: z.string().max(300).optional(),
  framework: z.string().max(200).optional(),
  prompt: z.string().max(5_000).optional(),
  contextSnippet: z.string().max(20_000).optional(),
  premisePrompt: z.string().max(2_000).optional(),
  expertCompletion: z.string().max(10_000).optional(),
  field1Label: z.string().max(200).optional(),
  field1Value: z.string().max(20_000).optional(),
  field2Label: z.string().max(200).optional(),
  field2Value: z.string().max(20_000).optional(),
  field3Label: z.string().max(200).optional(),
  field3Value: z.string().max(20_000).optional(),
  tabooTerms: z.array(z.string().max(120)).max(30).optional(),
  strictnessLevel: z.enum(['sherpa', 'feynman', 'viva']).optional(),
  /** Mr M mode: asks the examiner for the trap-aware autopsy narrative. */
  mrMMode: z.boolean().optional().default(false),
});

export const teachSchema = z.object({
  notes: sourceText.optional(),
  settings: settingsSchema,
  file: fileAssetSchema,
  topicSummary: z.string().max(300).optional(),
  strictnessLevel: z.enum(['sherpa', 'feynman', 'viva']).optional(),
  storyTopic: z.string().max(300).optional(),
  storyMode: z.boolean().optional(),
  savedLesson: z.unknown().optional(),
  resumeLessonId: z.string().max(200).optional(),
}).passthrough();

export const youtubeSchema = z.object({
  videoUrl: z.string().max(2_000),
  mode: z.enum(['conceptual', 'memorization']).default('conceptual'),
  settings: settingsSchema,
  hiddenTemplates: z.array(z.string().max(120)).max(60).default([]),
});

// ─── Schemas for the note-and-attachment routes ──────────────────────────────
// Four routes hand one paste (and optionally one attachment) to the model:
// /api/roast, /api/prerequisites, /api/pretest and /api/segregate. They differ
// only in the prompt, so they share one body shape (segregate adds `include`).

const notesAndFile = {
  notes: sourceText.optional(),
  file: fileAssetSchema,
  settings: settingsSchema,
};

export const roastSchema = z.object({ ...notesAndFile });
export const prerequisitesSchema = z.object({ ...notesAndFile });
export const pretestSchema = z.object({ ...notesAndFile });

export const segregateSchema = z.object({
  ...notesAndFile,
  /** Section list (array) or section map (record). `resolveSegregationSections` reads both. */
  include: z
    .union([z.array(z.string().max(40)).max(16), z.record(z.string(), z.boolean())])
    .optional(),
});

// ─── Schemas for the stage-level drills ──────────────────────────────────────
// The workbench drill routes all send the same stage context (the stage it was
// opened from, plus the topic summary); priming adds the requested archetype
// and the probe ladder adds its own answer chain.

const stageDrill = {
  stageTitle: shortText.optional(),
  framework: shortText.optional(),
  contextSnippet: contextText.optional(),
  prompt: promptText.optional(),
  topicSummary: shortText.optional(),
  settings: settingsSchema,
};

export const sequenceSchema = z.object({ ...stageDrill });
export const invertStepSchema = z.object({ ...stageDrill });

export const primingSchema = z.object({
  ...stageDrill,
  /** Requested warm-up archetype; the route falls back to its own choice. */
  kind: z.string().max(40).optional(),
});

export const probeSchema = z.object({
  ...stageDrill,
  /** The learner's own answers, deepest last — the ladder interrogates them. */
  layers: z.array(z.string().max(20_000)).max(40).optional(),
});

// ─── Schemas for the remaining body-reading routes ───────────────────────────

export const triageSchema = z.object({
  text: sourceText.optional(),
  topicSummary: shortText.optional(),
  settings: settingsSchema,
});

export const crisisSchema = z.object({
  dump: answerText.optional(),
  /** The learner's own read of how much they know; drives the severity band. */
  scorePct: z.number().min(0).max(100).optional(),
  settings: settingsSchema,
});

export const crucibleSchema = z.object({
  topic: shortText.optional(),
  /** Wall-clock minutes; the route clamps to its own 3–30 window. */
  minutes: z.number().finite().optional(),
  boss: z.boolean().optional(),
  sourceContext: contextText.optional(),
  settings: settingsSchema,
});

export const inquisitorSchema = z.object({
  claim: answerText.optional(),
  topic: shortText.optional(),
  domain: shortText.optional(),
  contextSnippet: contextText.optional(),
  settings: settingsSchema,
});

export const autopsySchema = z.object({
  learnerText: answerText.optional(),
  expectedText: answerText.optional(),
  sourceText: contextText.optional(),
  topic: shortText.optional(),
  settings: settingsSchema,
});

export const blurtSchema = z.object({
  blurtText: sourceText.optional(),
  schemaTitle: shortText.optional(),
  /** The session's stages, read for titles, goals and keywords only. */
  activities: z
    .array(z.object({ title: z.string().max(300).optional() }).passthrough())
    .max(60)
    .optional(),
  researchContexts: z.array(z.record(z.string(), z.unknown())).max(60).optional(),
  settings: settingsSchema,
});

export const checkpointSchema = z.object({
  moduleTitle: shortText.optional(),
  question: z.string().max(5_000).optional(),
  corePrerequisite: z.string().max(2_000).optional(),
  userAnswer: answerText.optional(),
  settings: settingsSchema,
});

export const discriminationSchema = z.object({
  conceptTitle: shortText.optional(),
  concept: shortText.optional(),
  lookalike: shortText.optional(),
  distinguishingRule: z.string().max(2_000).optional(),
  contextSnippet: contextText.optional(),
  topicSummary: shortText.optional(),
  settings: settingsSchema,
});

export const archetypeSchema = z.object({
  topic: shortText.optional(),
  /** How many MCQs to author; the route clamps it to its own 1–5 window. */
  count: z.number().min(1).max(50).optional(),
  notes: sourceText.optional(),
  settings: settingsSchema,
});

export const mutationSchema = z.object({
  topic: shortText.optional(),
  /** Only the three real tiers; anything else falls back to the boss flag. */
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  boss: z.boolean().optional(),
  sourceContext: contextText.optional(),
  settings: settingsSchema,
});

export const regenerateStageSchema = z.object({
  /**
   * The whole stage as the client holds it. The fields the regeneration prompt
   * quotes are typed and bounded; anything else the client's stage carries is
   * passed through untouched, because the route only serializes it.
   */
  activity: z
    .object({
      title: z.string().max(300).optional(),
      templateType: z.string().max(120).optional(),
      prompt: promptText.optional(),
      contextSnippet: contextText.optional(),
      cognitiveGoal: z.string().max(2_000).optional(),
      keywords: z.array(z.string().max(120)).max(60).optional(),
      stageNumber: z.number().optional(),
    })
    .passthrough()
    .optional(),
  topicSummary: shortText.optional(),
  mode: z.enum(['conceptual', 'memorization']).optional(),
  reason: z.string().max(2_000).optional(),
  settings: settingsSchema,
});

/**
 * The RemNote push proxy. Its credentials and markdown are the only body the
 * page ever sends to a third party through us, so the ceilings are explicit:
 * the markdown ceiling is the size of a large exported deck.
 */
export const remnoteSchema = z.object({
  apiKey: z.string().max(500).optional(),
  userId: z.string().max(200).optional(),
  markdown: z.string().max(1_000_000).optional(),
  title: shortText.optional(),
});

const comparativeDocument = z
  .object({
    id: z.string().max(200).optional(),
    name: z.string().max(300).optional(),
    contentSnippet: z.string().max(200_000).optional(),
    fileAsset: fileAssetSchema,
  })
  .passthrough();

export const synthesisSchema = z.object({
  /** Nullable: a missing document is the route's own 400, with its own wording. */
  docA: z.union([comparativeDocument, z.null()]).optional(),
  docB: z.union([comparativeDocument, z.null()]).optional(),
  settings: settingsSchema,
});

/**
 * Parses and validates a route body. Returns a discriminated result so the
 * route decides its own response shape; `error` is a user-safe message that
 * names the first offending field (never the raw Zod issue list).
 */
export function parseRouteBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; error: string; status: 400 }> {
  return req
    .json()
    .then((raw) => {
      const result = schema.safeParse(raw);
      if (result.success) return { ok: true as const, data: result.data };
      const first = result.error.issues[0];
      const path = first?.path?.length ? `${first.path.join('.')}: ` : '';
      return {
        ok: false as const,
        error: `Invalid request — ${path}${first?.message || 'malformed body'}.`,
        status: 400 as const,
      };
    })
    .catch(() => ({ ok: false as const, error: 'Request body must be valid JSON.', status: 400 as const }));
}
