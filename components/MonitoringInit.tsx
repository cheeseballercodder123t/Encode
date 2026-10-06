'use client';

import { useEffect } from 'react';
import { initSentry } from '@/lib/monitoring';

/**
 * Starts error monitoring once, in the browser, on the first paint.
 *
 * `lib/monitoring` is deliberately a no-op without a DSN, but it still has to
 * be *called*: a wrapper that is never initialised would swallow every captured
 * error even once someone adds SENTRY_DSN. Mounting it in the root layout means
 * client crashes, AI-provider timeouts and fallbacks land in Sentry the moment
 * a DSN exists, and cost nothing while it does not.
 */
export default function MonitoringInit() {
  useEffect(() => {
    initSentry();
  }, []);

  return null;
}
