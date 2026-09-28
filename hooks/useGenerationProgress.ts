'use client';

import { useEffect, useState } from 'react';
import type { StageOutlineEntry } from '@/lib/stream-schema';

/**
 * Phases shown in the loading view.
 *
 * These used to be the whole story: `/api/encode` streamed nothing back, so the
 * ticker cycled on a timer to give the user a sense of the pipeline moving.
 * Now `/api/encode/stream` reports real events — the topic title, then each
 * stage outline as the model finishes writing it — and those take precedence
 * over the timer. The ticker stays as the fallback for the callers that cannot
 * stream (a buffering proxy, a provider without stream support), because a
 * slow generation still deserves something honest to look at.
 */
const PHASES = [
  'Parsing source material…',
  'Auditing prerequisite foundations…',
  'Mapping cognitive scaffolds…',
  'Selecting visual templates…',
  'Wiring generation challenges…',
  'Sealing boundary contrasts…',
];

export interface LiveGenerationProgress {
  /** A phase reported by the stream itself, which always wins over the ticker. */
  phase?: string;
  /** Stage outlines that have already landed. */
  outlines?: StageOutlineEntry[];
}

/**
 * Tracks elapsed generation time, the current pipeline phase, and the stage
 * outlines that have arrived so far.
 * `startedAt === null` resets everything (generation finished / cancelled).
 */
export function useGenerationProgress(startedAt: number | null, live: LiveGenerationProgress = {}) {
  const [elapsed, setElapsed] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [trackedStart, setTrackedStart] = useState(startedAt);

  // Reset the counters when a new generation starts (or finishes) — done
  // during render, not in an effect, so no cascading render is triggered.
  if (trackedStart !== startedAt) {
    setTrackedStart(startedAt);
    setElapsed(0);
    setPhaseIndex(0);
  }

  useEffect(() => {
    if (startedAt == null) return;
    const tick = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    const phase = setInterval(() => {
      setPhaseIndex(i => Math.min(PHASES.length - 1, i + 1));
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(phase);
    };
  }, [startedAt]);

  const outlines = live.outlines ?? [];
  const phase = live.phase || PHASES[phaseIndex];

  // Progress is asymptotic while nothing is known (~50% at 14s, ~90% by 45s,
  // never reaching 100 before done, so a stuck request cannot show a lying
  // complete bar). A real outline is a known quantity, so the bar takes the
  // step the stream actually earned instead.
  const pct =
    startedAt == null
      ? 0
      : outlines.length > 0
        ? Math.min(92, 20 + outlines.length * 16)
        : Math.min(90, Math.round(90 * (1 - Math.exp(-elapsed / 20))));

  return { elapsed, phase, pct, outlines };
}
