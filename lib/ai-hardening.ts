/**
 * AI-call hardening: timeouts, retry with backoff, usage/cost capture and
 * observable metrics for the model fallback + JSON repair layers.
 *
 * Everything here is provider-agnostic so all three paths in ai-client
 * (Gemini SDK, OpenRouter, OpenAI-compatible) share one implementation:
 *
 *  - `fetchJsonWithRetry` — fetch + parse with a hard deadline and bounded
 *    retries on 429/5xx/network errors, exponential backoff with jitter. The
 *    deadline carries an AbortSignal into the transport, so the attempt it gave
 *    up on is cancelled before the next one starts (defect 40).
 *  - `withTimeout`       — the deadline itself: it starts the work with an
 *    AbortSignal, and aborts that signal when the deadline passes (or when the
 *    caller's own signal does), so a timed-out fetch/SDK call is really
 *    cancelled rather than merely abandoned.
 *  - usage capture       — normalizes provider usage payloads to
 *    { promptTokens, completionTokens, totalTokens } and records them per
 *    model in localStorage (`lib/storage` keeps call counts today; this adds
 *    the token + cost dimension).
 *  - `aiMetrics`         — process-local counters for repairs applied, JSON
 *    fallbacks to the next model, provider retries and timeouts. Surfaced via
 *    `/api/metrics` and (client-side) the settings drawer.
 */

import { loadUsageStats, recordTokenUsage } from './storage';

// ─── Timeouts ────────────────────────────────────────────────────────────────

/** Per-call deadlines, in ms. Generators write long schemas; checkers are short. */
export const AI_TIMEOUT_MS = {
  generate: 90_000,
  checker: 45_000,
  stream: 120_000,
} as const;

/**
 * A deadline over an abortable operation.
 *
 * `work` is either a promise that is already in flight, or — the form this
 * exists for — a factory that receives the deadline's `AbortSignal` and starts
 * the transport with it (a `fetch`, or the Gemini SDK's own `abortSignal`).
 *
 * When the deadline passes, the controller is aborted **before** the promise
 * rejects, so the request the deadline gave up on is cancelled at the transport
 * rather than abandoned mid-flight. That distinction is the whole of defect 40:
 * the timer used to race the promise and reject while the `fetch` it had given
 * up on kept running, and because `fetchJsonWithRetry` treats a timeout as
 * retryable, the retry started against the same provider while the first attempt
 * was still in flight — two or three concurrent copies of one generation, each
 * billed.
 *
 * A caller's own `signal` composes with the deadline: whichever fires first
 * aborts the one controller the transport is listening to, and a caller-driven
 * cancel is reported as the transport's own `AbortError` rather than as a
 * timeout.
 *
 * Rejects with {@link AiTimeoutError} when the deadline passes, and with the
 * underlying failure when the operation fails first.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, label?: string, signal?: AbortSignal): Promise<T>;
export function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label?: string,
  signal?: AbortSignal
): Promise<T>;
export function withTimeout<T>(
  work: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  ms: number,
  label = 'AI call',
  signal?: AbortSignal
): Promise<T> {
  const start: (signal: AbortSignal) => Promise<T> =
    typeof work === 'function' ? (work as (signal: AbortSignal) => Promise<T>) : () => work as Promise<T>;

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;

    // The caller's cancellation and the deadline drive the same controller, so
    // both reach the transport through the one signal it was started with.
    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Abort BEFORE rejecting: by the time the caller's `catch` runs, the
      // transport is already cancelled and its abort listeners have run, so a
      // retry cannot begin alongside the attempt it replaces.
      controller.abort();
      cleanup();
      reject(new AiTimeoutError(`${label} timed out after ${Math.round(ms / 1000)}s.`));
    }, ms);

    let promise: Promise<T>;
    try {
      promise = start(controller.signal);
    } catch (err) {
      settled = true;
      cleanup();
      reject(err);
      return;
    }

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      }
    );
  });
}

/** Error thrown when a provider call crosses its deadline. */
export class AiTimeoutError extends Error {
  readonly isTimeout = true;
  constructor(message: string) {
    super(message);
    this.name = 'AiTimeoutError';
  }
}

// ─── Retry with backoff ──────────────────────────────────────────────────────

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 700;

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504 || RETRYABLE_STATUS.has(status);
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof AiTimeoutError) return true;
  const status = (err as any)?.status ?? (err as any)?.code ?? (err as any)?.statusCode;
  if (typeof status === 'number' && isRetryableStatus(status)) return true;
  const msg = String((err as any)?.message || err).toLowerCase();
  // Gemini SDK surfaces quota/rate errors as messages, not statuses.
  if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) return true;
  if (msg.includes('rate limit') || msg.includes('rate_limit')) return true;
  if (msg.includes('503') || msg.includes('unavailable') || msg.includes('overloaded')) return true;
  if (msg.includes('502') || msg.includes('504') || msg.includes('bad gateway') || msg.includes('gateway timeout')) return true;
  if (msg.includes('timeout') || msg.includes('timed out')) return true;
  if (msg.includes('fetch failed') || msg.includes('networkerror') || msg.includes('econnreset')) return true;
  return false;
}

/** Full-jitter exponential backoff: 0.7s ±, 1.4s ± … */
export function backoffDelay(attempt: number): number {
  const ceiling = BASE_BACKOFF_MS * Math.pow(2, attempt);
  return Math.floor(Math.random() * ceiling);
}

/** One attempt's outcome: the parsed body, or the HTTP failure worth retrying. */
type FetchAttempt =
  | { kind: 'ok'; data: any; status: number }
  | { kind: 'http'; status: number; body: string };

/**
 * fetch + JSON with a deadline and bounded retries on retryable failures.
 * Returns the parsed body plus the HTTP status; throws `ApiHttpError` for
 * non-retryable HTTP errors after the retries are spent.
 *
 * The deadline covers the whole attempt — the request AND the body read, because
 * the model's answer is the body — and it is carried into `fetch` as
 * `init.signal` composed with the deadline's own controller. So an attempt that
 * crosses its deadline is aborted at the transport before the loop moves on, and
 * a retry is never a second concurrent copy of the call it is retrying.
 */
export async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; label: string }
): Promise<{ data: any; status: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      aiMetrics.recordRetry();
      await new Promise((r) => setTimeout(r, backoffDelay(attempt - 1)));
    }
    try {
      // A fresh controller per attempt; `init.signal` (when the caller had one)
      // is composed with the deadline's, so a cancel and a timeout both reach
      // the transport through the signal `fetch` is given.
      const external = init.signal ?? undefined;
      const outcome = await withTimeout<FetchAttempt>(
        async (signal: AbortSignal): Promise<FetchAttempt> => {
          const res = await fetch(url, { ...init, signal });
          if (res.ok) return { kind: 'ok', data: await res.json(), status: res.status };
          return { kind: 'http', status: res.status, body: await res.text().catch(() => '') };
        },
        opts.timeoutMs,
        opts.label,
        external
      );
      if (outcome.kind === 'ok') return { data: outcome.data, status: outcome.status };
      if (isRetryableStatus(outcome.status) && attempt < MAX_RETRIES) {
        lastErr = new Error(`${opts.label} error (${outcome.status}): ${outcome.body.slice(0, 200)}`);
        continue;
      }
      throw new ApiHttpError(outcome.status, outcome.body, opts.label);
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiHttpError) throw err;
      if (isRetryableError(err) && attempt < MAX_RETRIES) continue;
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${opts.label} failed.`);
}

/** Non-retryable HTTP failure carrying the provider's own body text. */
export class ApiHttpError extends Error {
  constructor(readonly status: number, readonly body: string, label: string) {
    super(`${label} error (${status}): ${body.slice(0, 200)}`);
    this.name = 'ApiHttpError';
  }
}

// ─── Usage / cost capture ────────────────────────────────────────────────────

/** Normalized token usage for one completed generation. */
export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Rough per-model USD price per 1M tokens (blended in/out). Personal-project
 * accuracy is fine: the analytics panel labels the figure as an estimate.
 * Keys are matched case-insensitively; anything unknown prices at 0.
 */
const MODEL_PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  'gemini-3.7-flash': { in: 0.15, out: 0.6 },
  'gemini-3.6-flash': { in: 0.15, out: 0.6 },
  'gemini-3.5-flash': { in: 0.075, out: 0.3 },
  'gemini-3.5-flash-lite': { in: 0.0375, out: 0.15 },
  'gemini-2.5-flash': { in: 0.075, out: 0.3 },
  'google/gemini-2.5-flash': { in: 0.075, out: 0.3 },
  'google/gemini-2.5-flash-lite': { in: 0.0375, out: 0.15 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
};

/** Estimate USD cost from usage, using the table above (0 when unknown). */
export function estimateCostUsd(model: string, usage: AiUsage): number {
  const key = Object.keys(MODEL_PRICE_PER_MTOK).find((k) => k.toLowerCase() === model.toLowerCase());
  if (!key) return 0;
  const price = MODEL_PRICE_PER_MTOK[key];
  const inTok = usage.promptTokens ?? 0;
  const outTok = usage.completionTokens ?? usage.totalTokens ?? 0;
  // When only a total is known, charge it at the input rate (conservative).
  if (usage.completionTokens == null && usage.totalTokens != null) {
    return (usage.totalTokens / 1_000_000) * price.in;
  }
  return (inTok / 1_000_000) * price.in + (outTok / 1_000_000) * price.out;
}

/** Extracts a usage object from any provider payload (Gemini REST, OpenAI). */
export function extractUsage(payload: any): AiUsage {
  const u = payload?.usage ?? payload?.usageMetadata;
  if (!u || typeof u !== 'object') return {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = u[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    }
    return undefined;
  };
  return {
    promptTokens: pick('promptTokens', 'promptTokenCount', 'prompt_tokens', 'input_tokens'),
    completionTokens: pick('completionTokens', 'candidatesTokenCount', 'completion_tokens', 'output_tokens'),
    totalTokens: pick('totalTokens', 'totalTokenCount', 'total_tokens'),
  };
}

/**
 * Records one completed model call's usage into the persisted usage stats.
 * Safe in non-browser contexts (server routes) — a no-op there.
 */
export function recordUsage(model: string, usage: AiUsage): void {
  if (typeof window === 'undefined') return;
  recordTokenUsage(model, { ...usage, costUsd: estimateCostUsd(model, usage) });
}

// ─── Repair / fallback metrics ───────────────────────────────────────────────

interface AiMetrics {
  /** Responses that only parsed after the JSON repair ladder ran. */
  repairsApplied: number;
  /** Repair layer that won last (`via` from lib/json-repair). */
  lastRepairLayer: string | null;
  /** Total repair layers traversed (sum across calls). */
  repairLayersUsed: number;
  /** Calls that fell back to a fallback model after a malformed/failed primary. */
  modelFallbacks: number;
  /** Provider-level retries executed by fetchJsonWithRetry. */
  retries: number;
  /** Calls that hit their deadline. */
  timeouts: number;
}

const metrics: AiMetrics = {
  repairsApplied: 0,
  lastRepairLayer: null,
  repairLayersUsed: 0,
  modelFallbacks: 0,
  retries: 0,
  timeouts: 0,
};

/** Observable counters for the AI pipeline. Process-local (resets on reload). */
export const aiMetrics = {
  get repairsApplied() { return metrics.repairsApplied; },
  get lastRepairLayer() { return metrics.lastRepairLayer; },
  get repairLayersUsed() { return metrics.repairLayersUsed; },
  get modelFallbacks() { return metrics.modelFallbacks; },
  get retries() { return metrics.retries; },
  get timeouts() { return metrics.timeouts; },
  /** Record that `safeParseJson` only succeeded via the repair ladder. */
  recordRepair(via: string) {
    metrics.repairsApplied++;
    metrics.lastRepairLayer = via;
    metrics.repairLayersUsed++;
  },
  /** Record a clean parse (no repair) so totals can be compared. */
  recordCleanParse() {
    metrics.lastRepairLayer = null;
  },
  recordModelFallback() {
    metrics.modelFallbacks++;
  },
  recordRetry() {
    metrics.retries++;
  },
  recordTimeout() {
    metrics.timeouts++;
  },
  snapshot() {
    return { ...metrics };
  },
  /** Test hook. */
  __reset() {
    metrics.repairsApplied = 0;
    metrics.lastRepairLayer = null;
    metrics.repairLayersUsed = 0;
    metrics.modelFallbacks = 0;
    metrics.retries = 0;
    metrics.timeouts = 0;
  },
} as const;
