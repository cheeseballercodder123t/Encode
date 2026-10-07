import { GoogleGenAI } from "@google/genai";
import { AISettings, UploadedFileAsset } from "./types";
import { safeParseJson } from "./ai-output-validation";
import { loadAICacheFromIDB, putAICacheEntryIDB, clearAICacheIDB } from "./db";
import {
  AI_TIMEOUT_MS,
  AiTimeoutError,
  aiMetrics,
  extractUsage,
  fetchJsonWithRetry,
  recordUsage,
  withTimeout,
} from "./ai-hardening";
import { captureAiError } from "./monitoring";

interface GenerateJSONOptions {
  systemPrompt: string;
  userPrompt: string;
  responseSchema?: any;
  settings?: Partial<AISettings>;
  isChecker?: boolean;
  file?: UploadedFileAsset | null;
  /** When true, identical (provider, model, prompt) calls short-circuit from the in-memory cache. */
  useCache?: boolean;
}

// ─── Small LRU response cache ────────────────────────────────────────────────
//
// Repeated generation requests (same provider + model + exact prompt) are the
// only ones cached — saves latency + token cost when a user regenerates a stage
// or the same notes twice in a session. Bounded to keep memory flat.

const CACHE_MAX = 60;
const responseCache = new Map<string, { at: number; value: any }>();

function hashKey(input: string): string {
  // djb2-style 53-bit hash (fast, no deps, fine for non-adversarial cache keys).
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36) + '_' + input.length;
}

function cacheGet(key: string): any | undefined {
  const entry = responseCache.get(key);
  return entry ? entry.value : undefined;
}

function cacheSet(key: string, value: any): void {
  if (responseCache.has(key)) responseCache.delete(key);
  responseCache.set(key, { at: Date.now(), value });
  // Evict oldest beyond CACHE_MAX.
  while (responseCache.size > CACHE_MAX) {
    const oldestKey = responseCache.keys().next().value as string | undefined;
    if (oldestKey) responseCache.delete(oldestKey);
    else break;
  }
  // L2: persist so a reload (or tomorrow) reuses this generation for free.
  void putAICacheEntryIDB(key, { at: Date.now(), value });
}

// Hydrate the in-memory LRU from the IndexedDB L2 once, in the browser.
// Fire-and-forget: a miss before hydration simply falls through to the API
// exactly as it did before this layer existed.
if (typeof window !== 'undefined') {
  void loadAICacheFromIDB().then((persisted) => {
    for (const [key, entry] of persisted) {
      if (!responseCache.has(key)) responseCache.set(key, entry);
    }
    // Keep memory bounded after hydration.
    while (responseCache.size > CACHE_MAX) {
      const oldestKey = responseCache.keys().next().value as string | undefined;
      if (oldestKey) responseCache.delete(oldestKey);
      else break;
    }
  });
}

/** Clears the entire AI response cache (exposed for tests / settings changes). */
export function clearAICache(): void {
  responseCache.clear();
  void clearAICacheIDB();
}

/** Returns the number of entries currently cached (exposed for tests). */
export function aiCacheSize(): number {
  return responseCache.size;
}

function providerCacheKey(
  provider: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  file?: UploadedFileAsset | null
): string {
  const fileFingerprint = file?.base64Data
    ? file.base64Data.length.toString(36) + '_' + hashKey(file.base64Data.slice(-256))
    : 'none';
  return hashKey(`${provider}|${model}|${systemPrompt}|${userPrompt}|${fileFingerprint}`);
}

// ─── Model availability memory ───────────────────────────────────────────────
//
// The Gemini branch walks a ladder (the configured target, then 3.6, 3.5, 2.5).
// On a key or tier where the configured target does not exist, that ladder had
// two costs, and the second was worse than the first:
//
//   1. a NOT-FOUND error is not a quota error, so it was classified as a
//      structural failure and thrown — the request died on a model the learner
//      never chose, without ever reaching the rung that would have answered; and
//   2. nothing was remembered between calls, so even a user whose KEY is fine
//      paid the same dead round trip on every generation for the session.
//
// One piece of state fixes both: a model the API says does not exist is
// remembered HERE for the session, and a remembered model is skipped when the
// ladder is built. The memory is only for errors that are about the MODEL — a
// 429, a quota cap, a deadline or a credential problem keeps its existing
// retry-and-fall-through behavior and is never remembered, because those are
// transient or about the key, and mislabeling one would move the learner onto a
// model that cannot help either.

const unsupportedModels = new Set<string>();

/**
 * Transient / credential markers, checked BEFORE the model markers.
 *
 * A message that mentions a quota, a rate limit, a deadline or a badge is not
 * evidence about the model, however else it reads.
 */
const TRANSIENT_MODEL_MARKERS = [
  '429',
  'quota',
  'resource_exhausted',
  'rate limit',
  'rate_limit',
  'overloaded',
  'timeout',
  'timed out',
  'api key',
  'api_key',
  'unauthorized',
  'permission denied',
];

/**
 * True when an error says the MODEL itself is unusable on this key, rather than
 * that the call failed for a transient reason.
 *
 * Message-shaped rather than "any 404": the SDK raises plain Errors whose text
 * carries the signal, and a 404 through a proxy is not evidence about a model.
 * A numeric status is respected when it is present, and only 404 counts as
 * availability — 429, 401 and 5xx are the provider's mood, not the model's
 * existence.
 */
export function isUnsupportedModelError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  if (!message) return false;

  const status = (error as any)?.status ?? (error as any)?.code;
  if (typeof status === 'number' && status !== 404) return false;
  if (TRANSIENT_MODEL_MARKERS.some((marker) => message.includes(marker))) return false;

  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('unknown model') ||
    message.includes('no such model') ||
    message.includes('unsupported model') ||
    message.includes('not supported') ||
    message.includes('invalid model') ||
    message.includes('model_not_found')
  );
}

/**
 * Detects HTTP 503 / UNAVAILABLE / overloaded service errors from Google GenAI
 * or proxies, excluding credential / auth issues.
 */
export function is503OrOverloadedError(error: unknown): boolean {
  if (!error) return false;
  const msg = String((error as any)?.message || error || '').toLowerCase();
  if (
    msg.includes('api key') ||
    msg.includes('api_key') ||
    msg.includes('unauthorized') ||
    msg.includes('permission denied') ||
    msg.includes('forbidden')
  ) {
    return false;
  }
  const status = (error as any)?.status ?? (error as any)?.code ?? (error as any)?.statusCode;
  if (typeof status === 'number' && (status === 503 || status === 502 || status === 504)) {
    return true;
  }
  return (
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('bad gateway') ||
    msg.includes('gateway timeout')
  );
}

/** How many models this session has learned do not exist (exposed for tests). */
export function unsupportedModelCount(): number {
  return unsupportedModels.size;
}

/** Forgets the session's availability memory (tests / a key or tier change). */
export function clearUnsupportedModels(): void {
  unsupportedModels.clear();
}

export async function generateJSONWithProvider({
  systemPrompt,
  userPrompt,
  responseSchema,
  settings,
  isChecker = false,
  file = null,
  useCache = false,
}: GenerateJSONOptions): Promise<any> {
  const provider = settings?.provider || 'gemini';

  // Cache short-circuit: identical provider+model+prompt (and identical file)
  // returns the previously generated JSON. Checker calls stay cache-miss by
  // default because graders should re-read the submission.
  const targetModel0 = isChecker
    ? (settings?.geminiCheckerModel || 'gemini-3.5-flash')
    : (settings?.geminiModel || 'gemini-3.7-flash');
  const modelKey = provider === 'openrouter'
    ? (isChecker ? (settings?.openrouterCheckerModel || 'google/gemini-2.5-flash-lite') : (settings?.openrouterModel || 'google/gemini-2.5-flash'))
    : provider === 'openai'
      ? (isChecker ? (settings?.openaiCheckerModel || 'gpt-4o-mini') : (settings?.openaiModel || 'gpt-4o-mini'))
      : targetModel0;
  const cacheKey = useCache
    ? providerCacheKey(provider, modelKey, systemPrompt, userPrompt, file)
    : '';

  if (useCache && cacheKey) {
    const hit = cacheGet(cacheKey);
    if (hit !== undefined) {
      return hit;
    }
  }

  if (provider === 'gemini') {
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No Gemini API key found. Please provide a Gemini API Key in Settings or configure GEMINI_API_KEY.");
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    let targetModel = isChecker
      ? (settings?.geminiCheckerModel || 'gemini-3.5-flash')
      : (settings?.geminiModel || 'gemini-3.7-flash');

    const config: any = {
      responseMimeType: "application/json",
      temperature: isChecker ? 0.3 : 0.6,
    };

    if (responseSchema) {
      config.responseSchema = responseSchema;
    }

    const parts: any[] = [
      { text: systemPrompt },
      { text: userPrompt }
    ];

    // If multimodal file payload is present (PDF, PNG, JPEG, WEBP)
    if (file && file.base64Data && file.type) {
      parts.push({
        inlineData: {
          mimeType: file.type,
          data: file.base64Data
        }
      });
    }

    // Try primary target model with fallback chain: targetModel -> gemini-3.6-flash -> gemini-3.5-flash -> gemini-2.5-flash
    const modelChain = [targetModel];
    const fallbackChain = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
    for (const fb of fallbackChain) {
      if (!modelChain.includes(fb)) {
        modelChain.push(fb);
      }
    }
    // Skip the names this session has already been told do not exist, so the
    // dead round trip is paid once rather than on every generation. Which model
    // is tried FIRST on a fresh session is unchanged — this only removes rungs
    // the API has already rejected. If every rung is known dead we keep the full
    // chain rather than throwing a new kind of error: the caller still gets the
    // provider's own failure.
    const liveModels = modelChain.filter((name) => !unsupportedModels.has(name));
    const modelsToTry = liveModels.length > 0 ? liveModels : modelChain;

    let lastError: any = null;
    for (const mName of modelsToTry) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: mName,
            contents: [
              {
                role: "user",
                parts
              }
            ],
            config,
          }),
          isChecker ? AI_TIMEOUT_MS.checker : AI_TIMEOUT_MS.generate,
          `Gemini ${mName}`
        );

        const text = response.text;
        if (!text) {
          throw new Error("Empty response returned from Gemini.");
        }
        recordUsage(mName, extractUsage(response));
        const parsed = safeParseJson(text);
        if (parsed === null) {
          // Malformed JSON is a model failure like any other: fall through to
          // the next model in the chain instead of failing the request. The
          // repair ladder (lib/json-repair.ts) has already had its pass — a
          // null here means truncation salvage found nothing parseable.
          aiMetrics.recordModelFallback();
          captureAiError(lastError, { provider: 'gemini', model: mName, reason: 'unparseable-json' });
          console.warn(`Gemini model ${mName} returned unparseable JSON, falling back to next model...`);
          lastError = new Error(`Gemini returned invalid JSON for model ${mName}.`);
          continue;
        }
        if (useCache) cacheSet(cacheKey, parsed);
        return parsed;
      } catch (err: any) {
        lastError = err;
        // A deadline miss is a provider failure like a 429: try the next
        // model in the chain rather than hanging the route.
        if (err instanceof AiTimeoutError) {
          aiMetrics.recordTimeout();
          captureAiError(err, { provider: 'gemini', model: mName, reason: 'timeout' });
          console.warn(`Gemini model ${mName} timed out, falling back to next model...`);
          continue;
        }
        // A model the API says does not exist is not a failure of the REQUEST:
        // this is precisely the case the chain exists for. Remember it for the
        // session and move to the next rung — which is also what removes the
        // dead round trip from every later call.
        if (isUnsupportedModelError(err)) {
          const isNew = !unsupportedModels.has(mName);
          unsupportedModels.add(mName);
          if (isNew) {
            // Reported once per model, not once per call: the second attempt is
            // already known and silent by construction.
            captureAiError(err, { provider: 'gemini', model: mName, reason: 'unsupported-model' });
          }
          aiMetrics.recordModelFallback();
          console.warn(`Gemini model ${mName} is not available on this key, falling back to the next model...`);
          continue;
        }

        // 503 UNAVAILABLE / Overloaded: service is temporarily overloaded for this model.
        // Mark model temporarily dead for the session so subsequent calls skip this rung,
        // record the fallback metric, and step down to the next model in the ladder.
        if (is503OrOverloadedError(err)) {
          const isNew = !unsupportedModels.has(mName);
          unsupportedModels.add(mName);
          if (isNew) {
            captureAiError(err, { provider: 'gemini', model: mName, reason: 'overloaded-503' });
          }
          aiMetrics.recordModelFallback();
          console.warn(`Gemini model ${mName} is overloaded / unavailable (503), marking dead for session and falling back to next available model...`);
          continue;
        }

        const errStr = String(err?.message || err).toLowerCase();
        const errStatus = (err as any)?.status ?? (err as any)?.code ?? (err as any)?.statusCode;
        // If it's a quota / rate limit / 429 error, try fallback model in loop
        if (errStr.includes('quota') || errStr.includes('429') || errStr.includes('resource_exhausted') || errStr.includes('limit') || errStatus === 429) {
          aiMetrics.recordModelFallback();
          console.warn(`Gemini model ${mName} hit rate limit / quota error, falling back to next available model...`);
          continue;
        }
        // If it's a structural or auth error, throw immediately
        throw err;
      }
    }

    throw lastError || new Error("All Gemini model fallbacks failed.");
  }

  if (provider === 'openrouter') {
    const apiKey = settings?.openrouterApiKey;
    if (!apiKey) {
      throw new Error("No OpenRouter API key found. Please enter your OpenRouter Key in Settings.");
    }

    const modelName = isChecker
      ? (settings?.openrouterCheckerModel || 'google/gemini-2.5-flash-lite')
      : (settings?.openrouterModel || 'google/gemini-2.5-flash');

    // Build user content array for OpenRouter if file is image
    let userContent: any = userPrompt;
    if (file && file.base64Data && file.type.startsWith('image/')) {
      userContent = [
        { type: "text", text: userPrompt },
        { 
          type: "image_url", 
          image_url: { url: `data:${file.type};base64,${file.base64Data}` } 
        }
      ];
    }

    const { data } = await fetchJsonWithRetry(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai.studio/build",
          "X-Title": "DeepEncode",
        },
        body: JSON.stringify({
          model: modelName,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${systemPrompt}\n\nIMPORTANT: Respond with valid JSON matching the requested structure.` },
            { role: "user", content: userContent }
          ],
          temperature: isChecker ? 0.3 : 0.6,
        }),
      },
      { timeoutMs: isChecker ? AI_TIMEOUT_MS.checker : AI_TIMEOUT_MS.generate, label: 'OpenRouter' }
    );

    recordUsage(modelName, extractUsage(data));
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenRouter");
    const parsedOr = safeParseJson(content);
    if (parsedOr === null) throw new Error("OpenRouter returned invalid JSON.");
    if (useCache) cacheSet(cacheKey, parsedOr);
    return parsedOr;
  }

  if (provider === 'openai') {
    const apiKey = settings?.openaiApiKey;
    if (!apiKey) {
      throw new Error("No OpenAI API key found. Please enter your OpenAI Compatible Key in Settings.");
    }

    const baseUrl = (settings?.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const modelName = isChecker
      ? (settings?.openaiCheckerModel || 'gpt-4o-mini')
      : (settings?.openaiModel || 'gpt-4o-mini');

    let userContent: any = userPrompt;
    if (file && file.base64Data && file.type.startsWith('image/')) {
      userContent = [
        { type: "text", text: userPrompt },
        { 
          type: "image_url", 
          image_url: { url: `data:${file.type};base64,${file.base64Data}` } 
        }
      ];
    }

    const { data } = await fetchJsonWithRetry(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${systemPrompt}\n\nIMPORTANT: Respond strictly with valid JSON conforming to the requested schema.` },
            { role: "user", content: userContent }
          ],
          temperature: isChecker ? 0.3 : 0.6,
        }),
      },
      { timeoutMs: isChecker ? AI_TIMEOUT_MS.checker : AI_TIMEOUT_MS.generate, label: 'OpenAI-compatible' }
    );

    recordUsage(modelName, extractUsage(data));
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI-compatible provider");
    const parsedOa = safeParseJson(content);
    if (parsedOa === null) throw new Error("OpenAI-compatible provider returned invalid JSON.");
    if (useCache) cacheSet(cacheKey, parsedOa);
    return parsedOa;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// ─── Streaming text generation ──────────────────────────────────────────────
//
// `generateJSONWithProvider` is all-or-nothing: it returns the parsed object
// once the model has finished writing it. The encode stream route wants the
// bytes as they arrive, so the stage outlines can be shown while the rest of
// the schema is still being written. This is the same request with the same
// credentials and the same context handling — only the transport differs.
//
// Providers are tried in the same order the non-streaming path uses, and a
// model that fails before it has emitted anything falls through to the next
// one. Once a delta has been yielded the fallback is gone on purpose: the
// consumer has already been shown that prefix, so silently switching models
// would splice two different generations together.

export interface StreamTextOptions {
  systemPrompt: string;
  userPrompt: string;
  settings?: Partial<AISettings>;
  isChecker?: boolean;
  file?: UploadedFileAsset | null;
}

export async function* streamTextWithProvider({
  systemPrompt,
  userPrompt,
  settings,
  isChecker = false,
  file = null,
}: StreamTextOptions): AsyncGenerator<string, void, void> {
  const provider = settings?.provider || 'gemini';

  if (provider === 'gemini') {
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("No Gemini API key found. Please provide a Gemini API Key in Settings or configure GEMINI_API_KEY.");
    }
    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });

    const preferred = isChecker
      ? settings?.geminiCheckerModel || 'gemini-3.5-flash'
      : settings?.geminiModel || 'gemini-3.7-flash';
    const modelsToTry = [preferred];
    for (const fallback of ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']) {
      if (!modelsToTry.includes(fallback)) modelsToTry.push(fallback);
    }
    const liveModels = modelsToTry.filter((name) => !unsupportedModels.has(name));
    const effectiveModels = liveModels.length > 0 ? liveModels : modelsToTry;

    const parts: any[] = [{ text: systemPrompt }, { text: userPrompt }];
    if (file && file.base64Data && file.type) {
      parts.push({ inlineData: { mimeType: file.type, data: file.base64Data } });
    }
    const config: any = {
      responseMimeType: 'application/json',
      temperature: isChecker ? 0.3 : 0.6,
    };

    let lastError: any = null;
    for (const model of effectiveModels) {
      let emitted = false;
      try {
        const response = await ai.models.generateContentStream({
          model,
          contents: [{ role: 'user', parts }],
          config,
        });
        for await (const chunk of response) {
          const text = chunk.text;
          if (text) {
            emitted = true;
            yield text;
          }
        }
        return;
      } catch (err: any) {
        lastError = err;
        if (emitted) throw err;
        if (isUnsupportedModelError(err)) {
          const isNew = !unsupportedModels.has(model);
          unsupportedModels.add(model);
          if (isNew) {
            captureAiError(err, { provider: 'gemini', model, reason: 'unsupported-model' });
          }
          aiMetrics.recordModelFallback();
          console.warn(`Gemini stream model ${model} is not available on this key, falling back…`);
          continue;
        }
        if (is503OrOverloadedError(err)) {
          const isNew = !unsupportedModels.has(model);
          unsupportedModels.add(model);
          if (isNew) {
            captureAiError(err, { provider: 'gemini', model, reason: 'overloaded-503' });
          }
          aiMetrics.recordModelFallback();
          console.warn(`Gemini stream model ${model} is overloaded / unavailable (503), marking dead for session and falling back…`);
          continue;
        }
        const errStr = String(err?.message || err).toLowerCase();
        const errStatus = (err as any)?.status ?? (err as any)?.code ?? (err as any)?.statusCode;
        if (
          errStr.includes('quota') ||
          errStr.includes('429') ||
          errStr.includes('resource_exhausted') ||
          errStr.includes('limit') ||
          errStatus === 429
        ) {
          aiMetrics.recordModelFallback();
          console.warn(`Gemini stream model ${model} hit a rate limit, falling back…`);
          continue;
        }
        throw err;
      }
    }
    throw lastError || new Error('All Gemini stream fallbacks failed.');
  }

  if (provider === 'openrouter' || provider === 'openai') {
    const isOpenRouter = provider === 'openrouter';
    const apiKey = isOpenRouter ? settings?.openrouterApiKey : settings?.openaiApiKey;
    if (!apiKey) {
      throw new Error(
        isOpenRouter
          ? 'No OpenRouter API key found. Please enter your OpenRouter Key in Settings.'
          : 'No OpenAI API key found. Please enter your OpenAI Compatible Key in Settings.'
      );
    }

    const baseUrl = isOpenRouter
      ? 'https://openrouter.ai/api/v1'
      : (settings?.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const modelName = isOpenRouter
      ? isChecker
        ? settings?.openrouterCheckerModel || 'google/gemini-2.5-flash-lite'
        : settings?.openrouterModel || 'google/gemini-2.5-flash'
      : isChecker
        ? settings?.openaiCheckerModel || 'gpt-4o-mini'
        : settings?.openaiModel || 'gpt-4o-mini';

    // Only images travel inline on the OpenAI-compatible APIs; a PDF is handled
    // by the non-streaming path, which can attach it properly.
    let userContent: any = userPrompt;
    if (file && file.base64Data && file.type?.startsWith('image/')) {
      userContent = [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: `data:${file.type};base64,${file.base64Data}` } },
      ];
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://ai.studio/build';
      headers['X-Title'] = 'DeepEncode';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        stream: true,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${systemPrompt}\n\nIMPORTANT: Respond with valid JSON matching the requested structure.` },
          { role: 'user', content: userContent },
        ],
        temperature: isChecker ? 0.3 : 0.6,
      }),
    });

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => '');
      throw new Error(
        `${isOpenRouter ? 'OpenRouter' : 'OpenAI-compatible'} stream error (${res.status}): ${errBody}`
      );
    }

    // Server-sent events: one `data: {json}` line per delta, terminated by
    // `data: [DONE]`. Chunks are split on newlines but a chunk can end mid-line,
    // so the tail is carried over until its newline arrives.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      let newline = carry.indexOf('\n');
      while (newline >= 0) {
        const line = carry.slice(0, newline).trim();
        carry = carry.slice(newline + 1);
        newline = carry.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // A keep-alive or a partial frame: the next line will carry it.
        }
      }
    }
    return;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
