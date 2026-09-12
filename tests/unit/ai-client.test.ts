import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateJSONWithProvider, clearAICache, aiCacheSize } from '../../lib/ai-client';

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