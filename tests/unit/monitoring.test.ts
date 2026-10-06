import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { initSentry, captureAiError } from '../../lib/monitoring';

/**
 * The monitoring wrapper is deliberately silent until a DSN exists — a personal
 * project must not start shipping data anywhere because a dependency was added.
 * What is worth pinning is the other half: once a DSN IS present the SDK is
 * actually initialised and failures are actually reported. A wrapper that is
 * never initialised looks identical to a healthy one from the outside and
 * silently swallows every error, so both branches are asserted here.
 */
vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe('Sentry wiring', () => {
  beforeEach(() => {
    vi.mocked(Sentry.init).mockClear();
    vi.mocked(Sentry.captureException).mockClear();
    vi.unstubAllEnvs();
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays inert when no DSN is configured', () => {
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();

    captureAiError(new Error('provider 500'), { route: '/api/encode' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('initialises the SDK with the configured DSN and no sampling overhead', () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o1.ingest.sentry.io/1');

    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@o1.ingest.sentry.io/1',
        tracesSampleRate: 0,
      })
    );
  });

  it('accepts the public DSN for client-side configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/2');

    initSentry();

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@o1.ingest.sentry.io/2' })
    );
  });

  it('reports an AI failure together with the context that identifies it', () => {
    vi.stubEnv('SENTRY_DSN', 'https://key@o1.ingest.sentry.io/1');
    const err = new Error('gemini timed out after 45s');

    captureAiError(err, { provider: 'gemini', model: 'gemini-2.5-flash', reason: 'timeout' });

    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      extra: { provider: 'gemini', model: 'gemini-2.5-flash', reason: 'timeout' },
    });
  });
});
