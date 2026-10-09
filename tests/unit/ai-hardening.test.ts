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

/**
 * Defect 40: the deadline used to race a timer against the promise and reject
 * while the call it had given up on kept running. Everything below is about the
 * transport actually being cancelled, in the order that makes it useful.
 */
describe('withTimeout aborts the work it gave up on', () => {
  it('hands the work an AbortSignal and aborts it when the deadline passes', async () => {
    const events: string[] = [];
    let seen: AbortSignal | null = null;

    const call = withTimeout(
      (signal) => {
        seen = signal;
        signal.addEventListener('abort', () => events.push('aborted'));
        return new Promise<string>(() => {}); // never settles on its own
      },
      20,
      'slow call'
    );

    await expect(call).rejects.toBeInstanceOf(AiTimeoutError);
    expect(seen).not.toBeNull();
    // The signal the transport was started with is the aborted one — which is
    // the difference between a cancelled request and a leaked one.
    expect((seen as unknown as AbortSignal).aborted).toBe(true);
    // And the abort event reached the transport, not just the signal's flag.
    expect(events).toEqual(['aborted']);
  });

  it('leaves the signal untouched when the work beats the deadline', async () => {
    let seen: AbortSignal | null = null;
    const value = await withTimeout(
      (signal) => {
        seen = signal;
        return Promise.resolve('ok');
      },
      1000
    );

    expect(value).toBe('ok');
    expect((seen as unknown as AbortSignal).aborted).toBe(false);
  });

  it('composes a caller signal: a cancel aborts the work and is not reported as a timeout', async () => {
    const caller = new AbortController();
    let transport: AbortSignal | null = null;

    const call = withTimeout(
      (signal) => {
        transport = signal;
        return new Promise<string>((_resolve, reject) => {
          const stop = () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
          if (signal.aborted) stop();
          else signal.addEventListener('abort', stop, { once: true });
        });
      },
      1000,
      'cancelled call',
      caller.signal
    );

    caller.abort();

    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
    expect((transport as unknown as AbortSignal).aborted).toBe(true);
  });

  it('starts cancelled when the caller signal was already aborted', async () => {
    const caller = new AbortController();
    caller.abort();

    const call = withTimeout(
      (signal) => {
        expect(signal.aborted).toBe(true);
        return Promise.resolve('should not be used');
      },
      1000,
      'pre-cancelled',
      caller.signal
    );

    await expect(call).resolves.toBe('should not be used');
  });
});

describe('fetchJsonWithRetry aborts the attempt it gave up on (defect 40)', () => {
  it('aborts the timed-out request, and starts no retry before it has stopped', async () => {
    const signals: AbortSignal[] = [];
    const stopped: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    global.fetch = ((_url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      const attempt = signals.push(signal);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // A request that only ends when it is aborted — the shape of a model that
      // is thinking past its deadline.
      return new Promise((_resolve, reject) => {
        const stop = () => {
          inFlight -= 1;
          stopped.push(attempt);
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      });
    }) as unknown as typeof fetch;

    await expect(
      fetchJsonWithRetry('https://x.test', { method: 'POST' }, { timeoutMs: 20, label: 't' })
    ).rejects.toBeInstanceOf(AiTimeoutError);

    // The initial attempt plus MAX_RETRIES — a timeout stays retryable.
    expect(signals).toHaveLength(3);
    // Every attempt reached the transport with a signal, and the deadline
    // aborted all of them rather than walking away.
    expect(signals.every((signal) => signal && signal.aborted)).toBe(true);
    // Each attempt stopped, and only then did the next one begin: 1, 2, 3.
    expect(stopped).toEqual([1, 2, 3]);
    // The defect in one number: the retry used to start beside the attempt it
    // was replacing, so three copies of one generation ran (and billed) at once.
    expect(maxInFlight).toBe(1);
  });

  it("cancels through the caller's own init.signal, without spending a retry", async () => {
    const caller = new AbortController();
    let calls = 0;

    global.fetch = ((_url: string, init?: RequestInit) => {
      calls += 1;
      const signal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        const stop = () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      });
    }) as unknown as typeof fetch;

    const pending = fetchJsonWithRetry(
      'https://x.test',
      { method: 'POST', signal: caller.signal },
      { timeoutMs: 5000, label: 't' }
    );
    caller.abort();

    // A cancel is the caller's decision, not a transport hiccup, so it is
    // reported as an AbortError and is not retried.
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(1);
  });
});

/** Minimal local stand-in for vitest's afterEach when only some suites stub fetch. */
function afterEachIfStubbed() {
  // Each test assigns global.fetch directly; vitest restores the environment
  // per file, so nothing to unwind here.
}
