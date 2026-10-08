// ─── The timed crucible: the time-budget model ──────────────────────────────
//
// A countdown clock is a single number, and a single number cannot tell a
// learner WHERE the time went. That is the whole reason exam-time panic is
// uninformative: the clock says four minutes are gone and nothing says which
// step ate them, so the only available response is adrenaline.
//
// This module is the other half. A crucible problem is a small state machine —
// system demand → system supply → the stoichiometric bridge — and the clock is
// ALLOCATED across those states before the problem starts. The HUD then shows,
// per state, what was planned against what has actually elapsed, and paces it:
//
//   ahead    the state finished under 80% of its budget
//   on pace  within the band
//   lagging  past 120% of its budget
//
// That converts "I am behind" into "state 3 is costing me twice what it should,
// and states 1 and 2 are already banked" — which is actionable, and which is
// what stops the next state from being rushed for the wrong reason.
//
// Everything here is pure arithmetic on integers of seconds, so the HUD can
// never show a figure that disagrees with the model. The band is deliberately
// wide (±20%): a pacing flag that fires on every wobble is noise, and this
// learner will stop reading a signal that cries wolf.

/**
 * The stress-inoculation read: what the clock cost, and whether the landing was
 * recovered in the state after it. A sprint that overran and then recovered is
 * a better rep than one that never overran, because recovery under load is the
 * skill — so this is measured separately from the pacing summary.
 */
export interface StressInoculationSpec {
  laggingStates: number;
  recoveredStates: number;
  worstStateLabel: string;
  worstDriftPct: number;
  note: string;
}

export const CRUCIBLE_MINUTES = 12;
export const CRUCIBLE_PROBLEMS = 3;

/** Beyond this a "state machine" is a paper, not a HUD. */
const MAX_STATES = 6;
/** Beyond this the constraint list stops being readable mid-sprint. */
const MAX_CONSTRAINTS = 6;

/** One state of one problem, with the clock it has been granted. */
export interface CrucibleState {
  id: string;
  label: string;
  /** Seconds granted to this state. */
  targetSec: number;
}

export interface CrucibleProblem {
  id: string;
  title: string;
  domain: string;
  states: CrucibleState[];
  constraints: string[];
  ask: string;
}

export interface CruciblePlan {
  /** Total sprint length, in minutes. */
  minutes: number;
  problems: CrucibleProblem[];
}

/**
 * Splits a clock across weights by the largest-remainder method.
 *
 * Rounding a percentage of 720 seconds naively loses or invents seconds, and a
 * HUD whose states do not add up to the clock is a HUD the learner stops
 * trusting. Largest-remainder keeps every state on a whole second AND makes the
 * parts sum to exactly the whole.
 */
export function allocateSeconds(totalSeconds: number, weights: number[]): number[] {
  // A clock that is not a finite number is not a clock. `Math.max(0, NaN)` is
  // NaN, so an unusable reading used to flow through the arithmetic below and
  // come out as a `[NaN, NaN]` allocation.
  const total = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const clean = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 1
  );
  const rawSum = clean.reduce((acc, weight) => acc + weight, 0);
  // Weights big enough to overflow (two 1e308s) sum to Infinity, which makes
  // every `weight / sum` zero: the largest-remainder pass below can then only
  // hand out one second per state, and a 720-second sprint is published as
  // `[1, 1]`. Fall back to equal shares, so the parts still sum to the whole.
  const evenly = !Number.isFinite(rawSum);
  const sum = evenly ? clean.length : rawSum;
  if (sum <= 0) return clean.map(() => 0);

  const exact = clean.map((weight) => ((evenly ? 1 : weight) / sum) * total);
  const floors = exact.map((value) => Math.floor(value));
  let remaining = total - floors.reduce((acc, value) => acc + value, 0);

  // Hand the leftover seconds to the states with the largest fractional parts,
  // ties broken by position so the result is deterministic.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => (b.fraction - a.fraction) || (a.index - b.index));

  const out = [...floors];
  for (const { index } of order) {
    if (remaining <= 0) break;
    out[index] += 1;
    remaining -= 1;
  }
  return out;
}

/** A state's share of its own problem's clock, from its declared weight. */
export function allocateStates(
  totalSeconds: number,
  specs: { label: string; weight?: number }[]
): CrucibleState[] {
  const seconds = allocateSeconds(totalSeconds, specs.map((spec) => spec.weight ?? 1));
  return specs.map((spec, index) => ({
    id: `state-${index + 1}`,
    label: spec.label,
    targetSec: seconds[index],
  }));
}

// ─── Pacing ─────────────────────────────────────────────────────────────────

export type Pacing = 'ahead' | 'on-pace' | 'lagging';

/** How far off budget a state may drift before it is called. */
export const PACING_BAND = 0.2;

/**
 * The band's edges as whole percents.
 *
 * Compared on integers because `1 - 0.2` is 0.8000000000000000444 in binary
 * floating point, and 100 × that is greater than 80 — so a state landing exactly
 * on its 80% boundary would flicker between 'ahead' and 'on-pace'. A pacing flag
 * that disagrees with the arithmetic it prints is worse than no flag.
 */
const AHEAD_BELOW_PCT = Math.round((1 - PACING_BAND) * 100);
const LAGGING_ABOVE_PCT = Math.round((1 + PACING_BAND) * 100);

/**
 * Classifies one state's elapsed time against its budget.
 *
 * A state with no budget is never called lagging: with nothing to compare
 * against, "lagging" would be an invented claim about the learner's pace.
 */
export function classifyPacing(elapsedSec: number, targetSec: number): Pacing {
  if (!Number.isFinite(targetSec) || targetSec <= 0) return 'on-pace';
  const elapsed = Math.max(0, elapsedSec);
  const scaled = elapsed * 100;
  if (scaled < targetSec * AHEAD_BELOW_PCT) return 'ahead';
  if (scaled <= targetSec * LAGGING_ABOVE_PCT) return 'on-pace';
  return 'lagging';
}

export interface StatePacing {
  state: CrucibleState;
  elapsedSec: number;
  status: Pacing;
  /** Whole-percent overrun/underrun against the state's budget. */
  driftPct: number;
}

export function pacingFor(state: CrucibleState, elapsedSec: number): StatePacing {
  const elapsed = Math.max(0, elapsedSec);
  const driftPct =
    state.targetSec > 0 ? Math.round(((elapsed - state.targetSec) / state.targetSec) * 100) : 0;
  return { state, elapsedSec: elapsed, status: classifyPacing(elapsed, state.targetSec), driftPct };
}

export function pacingTable(
  states: CrucibleState[],
  elapsedSec: number[] = []
): StatePacing[] {
  return states.map((state, index) => pacingFor(state, elapsedSec[index] ?? 0));
}

export interface SprintSummary {
  states: number;
  ahead: number;
  onPace: number;
  lagging: number;
  targetSec: number;
  elapsedSec: number;
  /** One line the learner can act on, with no verdict about their ability. */
  verdict: string;
}

/**
 * The post-sprint read. It reports pacing, never "you were too slow": the point
 * of a stress-inoculation rep is the recovery, and a summary that grades the
 * person instead of the pacing teaches them to avoid the rep.
 */
export function summarizeSprint(table: StatePacing[]): SprintSummary {
  const ahead = table.filter((entry) => entry.status === 'ahead').length;
  const lagging = table.filter((entry) => entry.status === 'lagging').length;
  const onPace = table.length - ahead - lagging;
  const targetSec = table.reduce((acc, entry) => acc + entry.state.targetSec, 0);
  const elapsedSec = table.reduce((acc, entry) => acc + entry.elapsedSec, 0);

  const laggingLabels = table
    .filter((entry) => entry.status === 'lagging')
    .map((entry) => entry.state.label);

  const verdict =
    table.length === 0
      ? 'No states were recorded.'
      : lagging === 0
        ? `All ${table.length} states held their budget${ahead > 0 ? `, ${ahead} under it` : ''}.`
        : `${table.length - lagging} of ${table.length} states held their budget. The time went into: ${laggingLabels.join(', ')}.`;

  return { states: table.length, ahead, onPace, lagging, targetSec, elapsedSec, verdict };
}

/** `11:59` — clock face, always two digits, never a negative sign. */
export function formatClock(seconds: number): string {
  // The face is two digits, so a reading that is not a finite number has none
  // to print: `Infinity` used to print `Infinity:NaN`, and `NaN` printed
  // `NaN:NaN`, which is not a clock face at all.
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** `1.4m` — the pacing readout's own unit, one decimal place. */
export function formatMinutes(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${(safe / 60).toFixed(1)}m`;
}

// ─── Coercion ───────────────────────────────────────────────────────────────

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/**
 * Coerces a generated sprint into its contract and splits the clock.
 *
 * A problem with fewer than two states is DROPPED: a state machine with one
 * state is not a state machine, and the HUD would be showing a plan it cannot
 * pace. A sprint with no surviving problems returns null, and the caller says
 * so rather than showing an empty cockpit.
 */
export function validateCruciblePlan(raw: unknown, minutes: number = CRUCIBLE_MINUTES): CruciblePlan | null {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const rawProblems = Array.isArray(data.problems) ? data.problems : [];
  if (rawProblems.length === 0) return null;

  const kept = rawProblems.slice(0, CRUCIBLE_PROBLEMS);
  const perProblemSeconds = Math.floor((Math.max(1, minutes) * 60) / Math.max(1, kept.length));

  const problems: CrucibleProblem[] = [];
  kept.forEach((rawProblem: any, index: number) => {
    const entry = (rawProblem && typeof rawProblem === 'object' ? rawProblem : {}) as Record<string, any>;
    const rawStates = Array.isArray(entry.states) ? entry.states.slice(0, MAX_STATES) : [];
    const specs = rawStates
      .map((state: any) => {
        const item = (state && typeof state === 'object' ? state : {}) as Record<string, any>;
        const label = asString(item.label);
        const weight = Number(item.weight);
        if (!label) return null;
        return { label, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 };
      })
      .filter((spec: { label: string; weight: number } | null): spec is { label: string; weight: number } => spec !== null);

    if (specs.length < 2) return;

    const constraints = (Array.isArray(entry.constraints) ? entry.constraints : [])
      .map((constraint: any) => (typeof constraint === 'string' ? constraint.replace(/\s+/g, ' ').trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_CONSTRAINTS);

    problems.push({
      id: `crucible-${index + 1}`,
      title: asString(entry.title, `Problem ${index + 1}`),
      domain: asString(entry.domain, ''),
      states: allocateStates(perProblemSeconds, specs),
      constraints,
      ask: asString(entry.ask, ''),
    });
  });

  if (problems.length === 0) return null;
  return { minutes: Math.max(1, minutes), problems };
}

/** Flattens a plan into the state list the HUD paces, problem by problem. */
export function flattenStates(plan: CruciblePlan): CrucibleState[] {
  return plan.problems.flatMap((problem) => problem.states);
}

/**
 * The stress-inoculation read the plan asks for, expressed as measurements
 * rather than as a score: how much of the clock went into which state, and how
 * much of the overrun was recovered afterwards.
 *
 * Kept separate from `SprintSummary` because "did they recover" and "were they
 * on pace" are different questions, and merging them would produce a single
 * number that answers neither.
 */
export function stressInoculationRead(table: StatePacing[]): StressInoculationSpec {
  const laggingIndexes = table
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.status === 'lagging')
    .map(({ index }) => index);

  const recovered = laggingIndexes.filter((index) =>
    table.slice(index + 1).some((entry) => entry.status !== 'lagging')
  ).length;

  const worst = table.reduce<StatePacing | null>(
    (acc, entry) => (!acc || entry.driftPct > acc.driftPct ? entry : acc),
    null
  );

  return {
    laggingStates: laggingIndexes.length,
    recoveredStates: recovered,
    worstStateLabel: worst && worst.driftPct > 0 ? worst.state.label : '',
    worstDriftPct: worst && worst.driftPct > 0 ? worst.driftPct : 0,
    note:
      laggingIndexes.length === 0
        ? 'Nothing overran its budget. The pacing held under the clock.'
        : recovered > 0
          ? `${recovered} of the ${laggingIndexes.length} overruns were recovered in the following state — that recovery is the skill this rep trains.`
          : 'No overrun was recovered within the sprint. The pacing read above names where the clock went.',
  };
}
