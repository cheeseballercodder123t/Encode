// ─── The ZPD friction governor ──────────────────────────────────────────────
//
// Steady difficulty is not neutral, it is a slow leak. A learner who solves two
// problems in a row without asking for a single clue rung is not being
// challenged any more — they are running at 20% CPU, and for this learner that
// is the state that collapses into boredom and executive dysfunction rather
// than into flow. The governor exists to notice that specific moment.
//
// The trigger is the plan's: two consecutive CLEAN wins — solved, and solved
// without touching the clue ladder. The ladder is what makes the signal honest.
// "Got it right" alone is a weak measure; the learner can get anything right
// after three rungs of scaffolding. "Got it right with no scaffolding" is the
// one reading that says the mechanism is actually held.
//
// Two things this module deliberately does NOT do:
//
//   * It does not make the decision invisible. `governorDecision` returns the
//     streak and a sentence, and the surface that escalates shows them. A
//     difficulty knob the learner cannot see is indistinguishable from a bug,
//     and this learner in particular will not tolerate a system that raises the
//     stakes without saying why.
//   * It does not escalate on incomplete telemetry. Attempts with no rung count
//     are still recorded (a check that never ran is information), but the streak
//     only counts attempts where the ladder was actually available to be used.
//
// localStorage, matching the other short ordered lists in this codebase: the
// governor is read synchronously at render time, and the streak has to be right
// on the first paint of the stage that escalates.

import type { EscalationLevel, FrictionEntry, GovernorDecision } from './types';

const STORAGE_KEY = 'deepencode_friction_log_v1';

/** Attempts past this fall off the end; the streak never needs them. */
const MAX_ENTRIES = 120;

/** The plan's trigger: two consecutive clean wins. */
export const ESCALATION_STREAK = 2;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/** Every recorded attempt, newest first. Never throws. */
export function loadFrictionHistory(): FrictionEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is FrictionEntry =>
        !!entry &&
        typeof entry.id === 'string' &&
        typeof entry.at === 'number' &&
        typeof entry.secured === 'boolean' &&
        typeof entry.rungsUsed === 'number'
    );
  } catch {
    return [];
  }
}

function save(entries: FrictionEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* best-effort: a full quota must never block the stage */
  }
}

/**
 * Records one attempt. `rungsUsed` is clamped at zero and a negative or
 * non-finite value is read as zero rungs rather than dropped: the attempt
 * happened, and losing it would break a streak for the wrong reason.
 */
export function recordAttempt(
  input: Omit<FrictionEntry, 'id' | 'at'>,
  now: number = Date.now()
): FrictionEntry {
  const entry: FrictionEntry = {
    id: `friction-${now}-${Math.random().toString(36).slice(2, 8)}`,
    topic: (input.topic || '').trim() || 'Untitled',
    at: now,
    secured: input.secured === true,
    rungsUsed: Number.isFinite(input.rungsUsed) ? Math.max(0, Math.floor(input.rungsUsed)) : 0,
    elapsedMs: Number.isFinite(input.elapsedMs) && input.elapsedMs > 0 ? input.elapsedMs : 0,
    expectedMs: Number.isFinite(input.expectedMs) && input.expectedMs > 0 ? input.expectedMs : 0,
  };
  save([entry, ...loadFrictionHistory()]);
  return entry;
}

export function clearFrictionHistory(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Consecutive clean wins, newest first, counting only attempts where the clue
 * ladder was available (an unrecorded rung count is read as zero by
 * `recordAttempt`, so a stage with no ladder still counts — it simply could not
 * have been scaffolded, which is a clean win by construction).
 *
 * A miss does not merely pause the count, it zeroes it: take-one-away is a
 * worse read of a failure than stop, because the point of the number is "this
 * is too easy right now", and a failed attempt is direct evidence that it is
 * not. A rung taken is different — the mechanism was needed for that problem,
 * which ends the run but says nothing about the level being wrong.
 */
export function cleanWinStreak(history: FrictionEntry[]): number {
  let streak = 0;
  for (const entry of history) {
    if (!entry.secured) return 0;
    if (entry.rungsUsed > 0) break;
    streak += 1;
  }
  return streak;
}

/**
 * The governor's decision. Escalation is a one-way read of the log: the level
 * is `boss` exactly when the current streak has reached the threshold, so
 * de-escalation happens automatically the moment a miss lands and no separate
 * reset path is needed.
 */
export function governorDecision(history: FrictionEntry[] = loadFrictionHistory()): GovernorDecision {
  const streak = cleanWinStreak(history);
  const topic = history.length > 0 ? history[0].topic : '';
  const boss = streak >= ESCALATION_STREAK;

  const level: EscalationLevel = boss ? 'boss' : 'siloed';
  const reason = boss
    ? `${streak} clean wins in a row${topic ? ` on ${topic}` : ''} with no clue rung requested — single-chapter problems have stopped costing you anything, so the next one collides two chapters.`
    : streak === 1
      ? 'One clean win logged. One more without a clue rung and the next problem becomes a cross-chapter collision.'
      : 'No running clean streak. Problems stay single-topic until one is showing.';

  return { level, streak, topic, reason };
}

/**
 * How far ahead of the stage's own estimate the learner is running, when both
 * numbers exist. Returns null rather than guessing when either is missing —
 * "faster than expected" is a claim that needs two numbers to make.
 */
export function pacingRatio(entry: FrictionEntry): number | null {
  if (!entry.elapsedMs || !entry.expectedMs) return null;
  return entry.elapsedMs / entry.expectedMs;
}
