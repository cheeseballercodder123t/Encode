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
 * One topic, compared the way this codebase compares scopes everywhere else:
 * trimmed, case-folded, whitespace collapsed. Kept local rather than imported
 * from `lib/mr-m/ledger.ts` so the escalation layer does not reach into the Mr
 * M module for a three-line string rule.
 */
function sameTopic(a: string, b: string): boolean {
  const key = (value: string) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const left = key(a);
  return left.length > 0 && left === key(b);
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
 *
 * `topic` SCOPES the streak, and that is the whole point of the parameter: the
 * finding is about ONE chapter getting too easy, and a clean win on a different
 * chapter is evidence about that chapter instead. Counting across topics made
 * one win in Genetics plus one in Thermochemistry escalate the next sprint on
 * either of them — the escalation fired on a claim the log never made. The
 * writer already scopes every attempt by topic (see the call site in
 * `app/page.tsx`, where the stage's own title is the scope); this is the reader
 * honouring it. With no topic the whole log is read, which is what a caller
 * with no chapter in hand actually wants.
 */
export function cleanWinStreak(history: FrictionEntry[], topic?: string): number {
  const scoped = (topic || '').trim() ? history.filter((entry) => sameTopic(entry.topic, topic || '')) : history;
  let streak = 0;
  for (const entry of scoped) {
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
 *
 * The sentence claims what the governor actually does — the load is raised —
 * and NOT what the fusion table may or may not be able to do with this topic.
 * It used to end "the next one collides two chapters", which is false for every
 * chapter with no row in the hand-written fusion matrix: those are re-aimed
 * deeper inside the same chapter by the routes, and the crucible renders that
 * measured reason beside this one, so the two lines disagreed on screen. A
 * collision is a claim that needs the material to be measured before it can be
 * made, and this module never reads the material.
 */
export function governorDecision(
  history: FrictionEntry[] = loadFrictionHistory(),
  topic?: string
): GovernorDecision {
  const scope = (topic || '').trim();
  const streak = cleanWinStreak(history, scope);
  // The stored spelling of the scope when the log has one — a learner who typed
  // "thermochemistry" still sees the chapter named the way their own record
  // spells it — falling back to what was asked about when the log is empty.
  const named = scope
    ? history.find((entry) => sameTopic(entry.topic, scope))?.topic || scope
    : history.length > 0
      ? history[0].topic
      : '';
  const boss = streak >= ESCALATION_STREAK;

  const level: EscalationLevel = boss ? 'boss' : 'siloed';
  const reason = boss
    ? `${streak} clean wins in a row${named ? ` on ${named}` : ''} with no clue rung requested — single-chapter problems have stopped costing you anything, so the next one is written harder.`
    : streak === 1
      ? 'One clean win logged. One more without a clue rung and the next problem is raised a level.'
      : 'No running clean streak. Problems stay single-topic until one is showing.';

  return { level, streak, topic: named, reason };
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
