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

/** Base64 multimodal attachment (PDF/image). Bounded so a route never holds 100MB strings. */
export const fileAssetSchema = z
  .object({
    name: z.string().max(300),
    type: z.string().max(120),
    size: z.number().max(30 * 1024 * 1024),
    base64Data: z.string().max(45 * 1024 * 1024),
    previewUrl: z.string().max(45 * 1024 * 1024).optional(),
  })
  .optional();

/** Free-text source material. 64k chars covers any realistic paste; the encode prompt slices to 16k words anyway. */
const sourceText = z.string().max(200_000);

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
});

export const evaluateSchema = z.object({
  batchMode: z.boolean().optional(),
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
