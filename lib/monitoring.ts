import * as Sentry from '@sentry/nextjs';

/**
 * Sentry wiring. Enabled only when SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is
 * present — a personal project without a DSN configured runs exactly as
 * before, no-op, zero network calls. When a DSN is set, client crashes,
 * server route errors and AI-provider failures (timeouts, fallbacks, repairs)
 * become visible in one place.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Personal project: low volume, no replay, no performance sampling.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
  });
}

/** Captures an error when Sentry is configured; never throws, never logs twice. */
export function captureAiError(err: unknown, context: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.captureException(err, { extra: context });
}
