'use client';

import { useEffect } from 'react';

/**
 * The app's last line of defence.
 *
 * Without this file, a throw anywhere below the layout was handed to Next's
 * default client-error page: a full-page `Application error: a client-side
 * exception has occurred while loading …` with no way back in. That is how
 * defect 25 ended - one legacy record whose `topicSummary` was missing, read
 * during a render in the history drawer, produced a screen the learner could not
 * leave, and the control that would have cleared the bad data (`clear all`, in
 * the drawer) lived inside the surface that had just died.
 *
 * The boundary does not fix anything; it converts an unrecoverable blank app
 * into a screen that says what happened and offers the two moves that can help:
 * re-render the segment (`reset`), or reload the page. The error is also logged,
 * because this is the one place that knows a render threw.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('DeepEncode render error:', error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-chassis px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-edge/70 bg-deck shadow-panel p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rotate-45 bg-gradient-to-br from-hazard-400 to-hazard-600" aria-hidden />
          <span className="font-mono text-[10px] tracking-[0.2em] text-hazard-300">[ ERROR ]</span>
        </div>

        <h1 className="font-display text-[26px] leading-tight text-bone">
          Something in this screen failed to render.
        </h1>

        <p className="text-xs text-solder italic leading-relaxed">
          Your saved work is still on this device - nothing was deleted. Retrying re-renders the
          screen; if it fails again, a reload starts from the studio with the same library.
        </p>

        {error?.message && (
          <p className="font-mono text-[11px] text-solder bg-inset border border-edge/70 rounded-md p-3 break-words">
            {error.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={reset}
            className="px-5 py-2.5 text-xs font-semibold rounded-full bg-gradient-to-b from-amber-400 to-amber-600 border border-amber-600/80 text-inset shadow-gilt transition-colors duration-150 cursor-pointer hover:from-amber-300 hover:to-amber-500"
          >
            Try again
          </button>
          {/* Deliberately a real navigation, not `next/link`: client-side routing
              keeps the React tree that just threw, which is the one thing this
              screen exists to get away from. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a hard reload is the point of the escape hatch */}
          <a
            href="/"
            className="px-4 py-2.5 text-xs text-solder bg-inset border border-edge/70 rounded-full hover:text-bone hover:border-gilt/40 transition-colors duration-150"
          >
            Reload the studio
          </a>
        </div>
      </div>
    </main>
  );
}
