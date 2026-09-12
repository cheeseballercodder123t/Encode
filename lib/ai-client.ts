import { GoogleGenAI } from "@google/genai";
import { AISettings, UploadedFileAsset } from "./types";
import { safeParseJson } from "./ai-output-validation";

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
}

/** Clears the entire AI response cache (exposed for tests / settings changes). */
export function clearAICache(): void {
  responseCache.clear();
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
    const modelsToTry = [targetModel];
    const fallbackChain = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
    for (const fb of fallbackChain) {
      if (!modelsToTry.includes(fb)) {
        modelsToTry.push(fb);
      }
    }

    let lastError: any = null;
    for (const mName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: mName,
          contents: [
            {
              role: "user",
              parts
            }
          ],
          config,
        });

        const text = response.text;
        if (!text) {
          throw new Error("Empty response returned from Gemini.");
        }
        const parsed = safeParseJson(text);
        if (parsed === null) {
          throw new Error(`Gemini returned invalid JSON for model ${mName}.`);
        }
        if (useCache) cacheSet(cacheKey, parsed);
        return parsed;
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || err).toLowerCase();
        // If it's a quota / rate limit / 429 error, try fallback model in loop
        if (errStr.includes('quota') || errStr.includes('429') || errStr.includes('resource_exhausted') || errStr.includes('limit')) {
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

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
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

    const res = await fetch(`${baseUrl}/chat/completions`, {
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
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI-compatible error (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI-compatible provider");
    const parsedOa = safeParseJson(content);
    if (parsedOa === null) throw new Error("OpenAI-compatible provider returned invalid JSON.");
    if (useCache) cacheSet(cacheKey, parsedOa);
    return parsedOa;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
