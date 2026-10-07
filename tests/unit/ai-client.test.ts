import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateJSONWithProvider,
  clearAICache,
  aiCacheSize,
  clearUnsupportedModels,
  isUnsupportedModelError,
  unsupportedModelCount,
} from '../../lib/ai-client';

/**
 * The Gemini SDK is mocked at its own boundary so the REAL model ladder inside
 * `generateJSONWithProvider` runs — the loop, the error classification and the
 * session availability memory are the things under test, and stubbing the
 * exported function would hide all three.
 */
const gemini = vi.hoisted(() => ({
  calls: [] as string[],
  handler: null as null | ((args: { model: string }) => Promise<any>),
}));

// PARTIAL mock: only `GoogleGenAI` is replaced. `Type` and everything else the
// real module exports stay real, because other modules reachable from this
// graph (the inquisitor's response schema, for one) build their schema from
// `Type.OBJECT` at import time — a wholesale replacement makes those imports
// fail with "No \"Type\" export is defined on the @google/genai mock".
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = {
        generateContent: (args: { model: string }) => {
          gemini.calls.push(args.model);
          if (!gemini.handler) return Promise.reject(new Error('no handler installed'));
          return gemini.handler(args);
        },
      };
    },
  };
});

const settings = {
  provider: 'openrouter' as const,
  openrouterApiKey: 'test-key',
  openrouterModel: 'test/model',
};

function okFetch(payload: unknown, raw = false) {
  const content = raw ? payload : JSON.stringify(payload);
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

describe('generateJSONWithProvider response cache', () => {
  beforeEach(() => {
    clearAICache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves identical requests from cache (single fetch)', async () => {
    const fetchMock = okFetch({ result: 'one' });
    vi.stubGlobal('fetch', fetchMock);
    const opts = { systemPrompt: 'sys', userPrompt: 'user', settings, useCache: true };

    const first = await generateJSONWithProvider(opts);
    const second = await generateJSONWithProvider(opts);

    expect(first).toEqual({ result: 'one' });
    expect(second).toEqual({ result: 'one' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiCacheSize()).toBe(1);
  });

  it('does not cache when useCache is false (checker-style calls)', async () => {
    const fetchMock = okFetch({ result: 'one' });
    vi.stubGlobal('fetch', fetchMock);
    const opts = { systemPrompt: 'sys', userPrompt: 'user', settings };

    await generateJSONWithProvider(opts);
    await generateJSONWithProvider(opts);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aiCacheSize()).toBe(0);
  });

  it('different prompts map to different cache entries', async () => {
    const fetchMock = okFetch({ result: 'a' });
    vi.stubGlobal('fetch', fetchMock);

    await generateJSONWithProvider({ systemPrompt: 'sys', userPrompt: 'u1', settings, useCache: true });
    await generateJSONWithProvider({ systemPrompt: 'sys', userPrompt: 'u2', settings, useCache: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aiCacheSize()).toBe(2);
  });

  it('clearAICache forces a fresh fetch', async () => {
    const fetchMock = okFetch({ result: 'one' });
    vi.stubGlobal('fetch', fetchMock);
    const opts = { systemPrompt: 'sys', userPrompt: 'user', settings, useCache: true };

    await generateJSONWithProvider(opts);
    clearAICache();
    await generateJSONWithProvider(opts);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('generateJSONWithProvider JSON hardening', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses fenced JSON returned by the provider', async () => {
    vi.stubGlobal('fetch', okFetch('```json\n{"ok":true}\n```', true));
    const out = await generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'u', settings });
    expect(out).toEqual({ ok: true });
  });

  it('throws a clear error when the provider returns non-JSON', async () => {
    vi.stubGlobal('fetch', okFetch('garbage {', true));
    await expect(
      generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'u', settings })
    ).rejects.toThrow(/invalid JSON/i);
  });

  it('throws on non-ok responses with the provider error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad key',
    }));
    await expect(
      generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'u', settings })
    ).rejects.toThrow(/401/);
  });
});

describe('generateJSONWithProvider Gemini model availability memory', () => {
  /** No model of this name exists on the key, which is NOT a quota problem. */
  const missing = (model: string) =>
    new Error(
      `models/${model} is not found for API version v1beta, or is not supported for generateContent.`
    );

  const geminiSettings = { provider: 'gemini' as const, geminiApiKey: 'test-key' };

  beforeEach(() => {
    gemini.calls = [];
    gemini.handler = null;
    clearUnsupportedModels();
    clearAICache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('classifies a missing model, and never a transient or credential failure', () => {
    expect(isUnsupportedModelError(missing('gemini-9.9-flash'))).toBe(true);
    expect(isUnsupportedModelError(new Error('model gemini-9.9-flash does not exist'))).toBe(true);
    expect(isUnsupportedModelError({ status: 404, message: 'model not found' })).toBe(true);

    // A quota cap, a rate limit, a deadline and a bad key are all about the KEY
    // or the moment, so none of them may be remembered as "no such model".
    expect(isUnsupportedModelError(new Error('429 Too Many Requests: quota exceeded'))).toBe(false);
    expect(isUnsupportedModelError(new Error('RESOURCE_EXHAUSTED: rate limit reached'))).toBe(false);
    expect(isUnsupportedModelError(new Error('AI call timed out after 90s.'))).toBe(false);
    expect(isUnsupportedModelError(new Error('API key not valid. Please pass a valid API key.'))).toBe(false);
    expect(isUnsupportedModelError(new Error('fetch failed'))).toBe(false);
    // A status that is not 404 wins even when the text sounds like availability.
    expect(isUnsupportedModelError({ status: 429, message: 'model not found' })).toBe(false);
  });

  it('falls through a missing model, then skips it on every later call', async () => {
    gemini.handler = async ({ model }) => {
      if (model === 'gemini-2.5-flash') return { text: '{"ok":true}' };
      throw missing(model);
    };

    const first = await generateJSONWithProvider({
      systemPrompt: 's',
      userPrompt: 'first',
      settings: geminiSettings,
    });

    // The target and both rungs above the working model are dead on this key;
    // the first call is where that is discovered, and it still answers.
    expect(first).toEqual({ ok: true });
    expect(gemini.calls).toEqual([
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
    ]);
    expect(unsupportedModelCount()).toBe(3);

    gemini.calls = [];
    const second = await generateJSONWithProvider({
      systemPrompt: 's',
      userPrompt: 'second',
      settings: geminiSettings,
    });

    // The point of the memory: one round trip, not four.
    expect(second).toEqual({ ok: true });
    expect(gemini.calls).toEqual(['gemini-2.5-flash']);
  });

  it('remembers nothing from a quota error, so the ladder is walked again', async () => {
    gemini.handler = async ({ model }) => {
      if (model === 'gemini-2.5-flash') return { text: '{"ok":true}' };
      throw new Error('429 Too Many Requests: quota exceeded for this project');
    };

    await generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'a', settings: geminiSettings });
    expect(gemini.calls).toHaveLength(4);
    expect(unsupportedModelCount()).toBe(0);

    gemini.calls = [];
    await generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'b', settings: geminiSettings });

    // A rate limit is the provider's mood, not the model's existence: the same
    // four names are tried, because a quota that clears an hour from now must
    // not have been permanently written off.
    expect(gemini.calls).toHaveLength(4);
  });

  it('still fails fast on a credential error instead of walking the ladder', async () => {
    gemini.handler = async () => {
      throw new Error('API key not valid. Please pass a valid API key.');
    };

    await expect(
      generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'u', settings: geminiSettings })
    ).rejects.toThrow(/API key not valid/);
    // A bad key is not a model problem, so the other three names are not tried
    // and nothing is written off.
    expect(gemini.calls).toHaveLength(1);
    expect(unsupportedModelCount()).toBe(0);
  });

  it('keeps attempting when every rung is known dead, rather than inventing an error', async () => {
    gemini.handler = async ({ model }) => {
      throw missing(model);
    };

    await expect(
      generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'a', settings: geminiSettings })
    ).rejects.toThrow(/not found|not supported/i);
    expect(unsupportedModelCount()).toBe(4);

    gemini.calls = [];
    await expect(
      generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'b', settings: geminiSettings })
    ).rejects.toThrow(/not found|not supported/i);
    // The full chain is retried so the provider's own failure reaches the
    // caller — the memory must never turn a real error into a silent one.
    expect(gemini.calls).toHaveLength(4);
  });

  it('clearUnsupportedModels empties the memory', async () => {
    gemini.handler = async ({ model }) => {
      if (model === 'gemini-2.5-flash') return { text: '{"ok":true}' };
      throw missing(model);
    };

    await generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'a', settings: geminiSettings });
    expect(unsupportedModelCount()).toBeGreaterThan(0);

    clearUnsupportedModels();
    expect(unsupportedModelCount()).toBe(0);

    gemini.calls = [];
    await generateJSONWithProvider({ systemPrompt: 's', userPrompt: 'b', settings: geminiSettings });
    expect(gemini.calls).toHaveLength(4);
  });
});