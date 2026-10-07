import { describe, it, expect, beforeEach } from 'vitest';
import {
  AI_TIMEOUT_MS,
  ApiHttpError,
  AiTimeoutError,
  aiMetrics,
  backoffDelay,
  estimateCostUsd,
  extractUsage,
  fetchJsonWithRetry,
  isRetryableError,
  isRetryableStatus,
  withTimeout,
} from '../../lib/ai-hardening';

describe('withTimeout', () => {
  it('resolves when the promise beats the deadline', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('rejects with AiTimeoutError when the deadline passes', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(slow, 20, 'slow call')).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it('propagates the original error when the promise rejects first', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });
});

describe('retry classification', () => {
  it('treats 429/5xx as retryable and 4xx as fatal', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
  });

  it('classifies quota/timeout/network message errors as retryable', () => {
    expect(isRetryableError(new AiTimeoutError('late'))).toBe(true);
    expect(isRetryableError(new Error('429 resource_exhausted'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
    expect(isRetryableError(new Error('The model is overloaded. Please try again later.'))).toBe(true);
    expect(isRetryableError({ status: 503, message: 'UNAVAILABLE' })).toBe(true);
    expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
  });

  it('backs off exponentially with jitter inside the ceiling', () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const ceiling = 700 * Math.pow(2, attempt);
      const delay = backoffDelay(attempt);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(ceiling);
    }
  });
});

describe('fetchJsonWithRetry', () => {
  afterEachIfStubbed();

  it('returns parsed JSON on first success', async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
    const { data } = await fetchJsonWithRetry('https://x.test', { method: 'POST' }, { timeoutMs: 1000, label: 't' });
    expect(data).toEqual({ ok: true });
  });

  it('retries a 503 then succeeds', async () => {
    let calls = 0;
    global.fetch = (async () => {
      calls++;
      if (calls === 1) return new Response('overloaded', { status: 503 });
      return new Response(JSON.stringify({ fine: 1 }), { status: 200 });
    }) as typeof fetch;
    const { data } = await fetchJsonWithRetry('https://x.test', { method: 'POST' }, { timeoutMs: 1000, label: 't' });
    expect(data).toEqual({ fine: 1 });
    expect(calls).toBe(2);
    expect(aiMetrics.retries).toBe(1);
  });

  it('throws ApiHttpError (no retry) on 401', async () => {
    global.fetch = (async () => new Response('bad key', { status: 401 })) as typeof fetch;
    await expect(
      fetchJsonWithRetry('https://x.test', { method: 'POST' }, { timeoutMs: 1000, label: 't' })
    ).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('gives up after the retry budget on persistent 500s', async () => {
    let calls = 0;
    global.fetch = (async () => {
      calls++;
      return new Response('still broken', { status: 500 });
    }) as typeof fetch;
    await expect(
      fetchJsonWithRetry('https://x.test', { method: 'POST' }, { timeoutMs: 1000, label: 't' })
    ).rejects.toBeInstanceOf(ApiHttpError);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('does not retry a non-retryable network error', async () => {
    let calls = 0;
    global.fetch = (async () => {
      calls++;
      throw new Error('Invalid API key');
    }) as typeof fetch;
    await expect(
      fetchJsonWithRetry('https://x.test', { method: 'POST' }, { timeoutMs: 1000, label: 't' })
    ).rejects.toThrow('Invalid API key');
    expect(calls).toBe(1);
  });
});

describe('usage + cost', () => {
  it('normalizes OpenAI-style usage payloads', () => {
    expect(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('normalizes Gemini usageMetadata payloads', () => {
    expect(
      extractUsage({ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, totalTokenCount: 140 } })
    ).toEqual({ promptTokens: 100, completionTokens: 40, totalTokens: 140 });
  });

  it('returns an empty usage for absent metadata', () => {
    expect(extractUsage({})).toEqual({});
    expect(extractUsage(null)).toEqual({});
  });

  it('prices known models and charges unknown ones at zero', () => {
    expect(estimateCostUsd('gemini-3.7-flash', { promptTokens: 1_000_000, completionTokens: 1_000_000 })).toBeCloseTo(0.75, 5);
    expect(estimateCostUsd('totally-unknown-model', { promptTokens: 1_000_000 })).toBe(0);
  });

  it('charges total-only usage conservatively at the input rate', () => {
    expect(estimateCostUsd('gemini-3.7-flash', { totalTokens: 1_000_000 })).toBeCloseTo(0.15, 5);
  });
});

describe('aiMetrics', () => {
  beforeEach(() => aiMetrics.__reset());

  it('counts repairs and clean parses distinctly', () => {
    aiMetrics.recordRepair('truncation-close');
    aiMetrics.recordCleanParse();
    const snap = aiMetrics.snapshot();
    expect(snap.repairsApplied).toBe(1);
    expect(snap.lastRepairLayer).toBeNull(); // a later clean parse clears the pointer
    expect(snap.repairLayersUsed).toBe(1);
  });

  it('counts fallbacks, retries and timeouts', () => {
    aiMetrics.recordModelFallback();
    aiMetrics.recordTimeout();
    const snap = aiMetrics.snapshot();
    expect(snap.modelFallbacks).toBe(1);
    expect(snap.timeouts).toBe(1);
  });
});

describe('timeout budget', () => {
  it('gives generation more headroom than checker calls', () => {
    expect(AI_TIMEOUT_MS.generate).toBeGreaterThan(AI_TIMEOUT_MS.checker);
  });
});

/** Minimal local stand-in for vitest's afterEach when only some suites stub fetch. */
function afterEachIfStubbed() {
  // Each test assigns global.fetch directly; vitest restores the environment
  // per file, so nothing to unwind here.
}
