'use client';

import { useEffect, useState } from 'react';

/**
 * Phases shown in the loading view. Cycled on a timer because the /api/encode
 * route streams nothing back yet : this gives the user a sense of the
 * pipeline moving instead of a frozen spinner on long generations.
 */
const PHASES = [
  'Parsing source material…',
  'Auditing prerequisite foundations…',
  'Mapping cognitive scaffolds…',
  'Selecting visual templates…',
  'Wiring generation challenges…',
  'Sealing boundary contrasts…',
];

/**
 * Tracks elapsed generation time and cycles pipeline phase messages.
 * `startedAt === null` resets everything (generation finished / cancelled).
 */
export function useGenerationProgress(startedAt: number | null) {
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

  // Asymptotic fill: ~50% at 14s, ~90% by 45s. Never hits 100 before done so
  // a stuck request doesn't show a lying complete bar.
  const pct = startedAt == null ? 0 : Math.min(90, Math.round(90 * (1 - Math.exp(-elapsed / 20))));

  return { elapsed, phase: PHASES[phaseIndex], pct };
}