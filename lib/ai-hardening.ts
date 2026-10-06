/**
 * AI-call hardening: timeouts, retry with backoff, usage/cost capture and
 * observable metrics for the model fallback + JSON repair layers.
 *
 * Everything here is provider-agnostic so all three paths in ai-client
 * (Gemini SDK, OpenRouter, OpenAI-compatible) share one implementation:
 *
 *  - `fetchJsonWithRetry` — fetch + parse with a hard deadline and bounded
 *    retries on 429/5xx/network errors, exponential backoff with jitter.
 *  - `withTimeout`       — wraps any promise (incl. the Gemini SDK call) in an
 *    AbortSignal-backed deadline that rejects instead of hanging.
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

/** Wraps a promise in a deadline. Rejects with a tagged Error on timeout. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'AI call'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AiTimeoutError(`${label} timed out after ${Math.round(ms / 1000)}s.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
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
  return RETRYABLE_STATUS.has(status);
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof AiTimeoutError) return true;
  const msg = String((err as any)?.message || err).toLowerCase();
  // Gemini SDK surfaces quota/rate errors as messages, not statuses.
  if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) return true;
  if (msg.includes('rate limit') || msg.includes('rate_limit')) return true;
  if (msg.includes('overloaded') || msg.includes('timeout') || msg.includes('timed out')) return true;
  if (msg.includes('fetch failed') || msg.includes('networkerror') || msg.includes('econnreset')) return true;
  return false;
}

/** Full-jitter exponential backoff: 0.7s ±, 1.4s ± … */
export function backoffDelay(attempt: number): number {
  const ceiling = BASE_BACKOFF_MS * Math.pow(2, attempt);
  return Math.floor(Math.random() * ceiling);
}

/**
 * fetch + JSON with a deadline and bounded retries on retryable failures.
 * Returns the parsed body plus the HTTP status; throws `ApiHttpError` for
 * non-retryable HTTP errors after the retries are spent.
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
      const res = await withTimeout(fetch(url, init), opts.timeoutMs, opts.label);
      if (res.ok) {
        const data = await res.json();
        return { data, status: res.status };
      }
      const body = await res.text().catch(() => '');
      if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
        lastErr = new Error(`${opts.label} error (${res.status}): ${body.slice(0, 200)}`);
        continue;
      }
      throw new ApiHttpError(res.status, body, opts.label);
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
