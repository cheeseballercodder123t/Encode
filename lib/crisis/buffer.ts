// ─── The executive-function emergency triage buffer ─────────────────────────
//
// This is the module for the night everything is due at once. Twelve days
// behind, seven makeup quizzes, and a college deadline that outranks all of it:
// the failure mode is not laziness, it is that the whole backlog is loaded into
// working memory simultaneously and nothing can be started at all.
//
// Two operations fix that, and both are arithmetic rather than encouragement:
//
//   1. FREEZE. A backlog is only overwhelming while every item in it is still
//      live. "Freezing Gothic Lit and Care of Athletes for 48 hours" is a real
//      state change — the items stop competing — and it is only honest when the
//      marginal grade risk can actually be shown to be negligible, which is why
//      this module computes it or refuses to freeze.
//   2. DISMANTLE THE PANIC WITH THE WEIGHTING. A grade is a weighted average,
//      so a 4/5 on a quiz worth 2% of the semester moves the final number by
//      0.4 points — not by the 20% the learner is feeling. That subtraction is
//      the entire intervention: the catastrophe is a number, and the number is
//      small.
//
// The refusal is the load-bearing part. A task with no stated weight is NOT
// frozen, because "this is low-leverage" is a claim that needs a number behind
// it and inventing one would spend the learner's trust on the night they have
// the least of it to spare. The only tasks frozen without a weight are the ones
// the dump itself marks as ungraded — those are provably zero-risk, because
// nothing attaches a grade to them.
//
// Everything here is pure. The model's only job (in `app/api/crisis/route.ts`)
// is to READ the dump — to pull task titles, weights and deadlines out of
// messy prose — and every number it reports is checked here before it is used.

/** The single-task focus runway the plan specifies. */
export const RUNWAY_MINUTES = 90;

/** How soon a deadline counts as imminent when the runway is chosen. */
export const IMMINENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** How long a frozen item stays frozen. */
export const FREEZE_HOURS = 48;

/** Below this marginal grade risk, a weighted task is worth freezing. */
export const FREEZE_RISK_PCT = 0.5;

/** The score a task is assumed to land when nothing better is known. */
export const ASSUMED_SCORE_PCT = 80;

export interface CrisisTask {
  id: string;
  title: string;
  /** Parsed deadline, in ms. `null` when the dump did not state one. */
  dueAt: number | null;
  /** The deadline exactly as it was written, so the UI never invents a date. */
  dueLabel: string;
  /** Share of the final grade, in percent. `null` when unstated. */
  weightPct: number | null;
  /** True when the dump itself says this carries no grade. */
  ungraded: boolean;
}

export interface FrozenTask {
  task: CrisisTask;
  /** Marginal shift of the final grade, in points. 0 for an ungraded task. */
  riskPct: number;
  /** The sentence the freeze is stated in. */
  line: string;
}

export interface TriagePlan {
  tasks: CrisisTask[];
  frozen: FrozenTask[];
  /** The single next action. Nothing else is rendered beside it. */
  focus: CrisisTask | null;
  /** The arithmetic that dismantles the panic, one line each. */
  panicLines: string[];
  /** Tasks that could not be shown to be low-leverage, and why. */
  withheld: { task: CrisisTask; reason: string }[];
  runwayMinutes: number;
}

// ─── Reading the dump ───────────────────────────────────────────────────────

/**
 * Splits a raw crisis dump into candidate items.
 *
 * Deliberately blunt: newlines, semicolons and numbered/lettered list markers
 * are the structure a panicking person actually types. A line that carries no
 * letter or digit is dropped, and a line that is one long paragraph is kept
 * whole rather than guessed at — the model's read runs over these exact strings,
 * so the deterministic split is what keeps its verdicts attached to real text.
 */
export function splitCrisisItems(dump: string): string[] {
  if (!dump) return [];
  const normalized = dump.replace(/\r\n?/g, '\n');
  const chunks = normalized
    .split(/\n|;|(?:^|\s)[•·](?=\s)/g)
    .map((chunk) => chunk.replace(/^\s*(?:\d+[.)]|[a-z][.)]|[-*–—]+)\s*/i, '').trim())
    .filter((chunk) => /[a-z0-9]/i.test(chunk));
  return chunks;
}

const UNGRADED = /optional|ungraded|not graded|no points|no grade|practice (?:set|problems?|quiz)|review (?:sheet|session|guide)|for (?:fun|practice)|extra credit|participation/i;

/** `worth 15%`, `15% of the grade`, `weighted at 20%`. */
const WEIGHT_PCT = /(?:worth|weight(?:ed)?(?:\s+at)?|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent|per cent)/i;

/**
 * Phrases that make a percentage a SCORE, not a weight.
 *
 * "I need 80% on the final" is not "the final is worth 80%", and reading it as
 * one would hand the freeze decision a fabricated number — the exact failure
 * this module refuses everywhere else. The guard looks at the run of words
 * immediately before the match, because that is where the verb sits.
 */
const SCORE_CONTEXT = /(score|scored|scoring|needs?|needing|got|getting|earn|earned|aim|want|wanting|above|below|over|under|at least|minimum|highest|average|avg|currently|sitting at|grade of|percentile)\s*(?:(?:a|an|the|of)\s*)?$/i;
const POINTS = /([0-9]+(?:\.[0-9]+)?)\s*(?:points?|pts?|marks?)\b/i;

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** End of the day a deadline lands on, so "due today" is not already past. */
function endOfDay(date: Date): number {
  const copy = new Date(date.getTime());
  copy.setHours(23, 59, 0, 0);
  return copy.getTime();
}

/**
 * Reads a deadline out of a phrase, or returns null.
 *
 * Runs on a small, explicit vocabulary on purpose — `today`, `tomorrow`,
 * `in N days`, `next week`, `MM/DD`, `Mon DD`, `Month DD` — because a "flexible"
 * date parser that guesses wrong gives the learner a false deadline, and a false
 * deadline is worse than none at all. Anything it does not recognise returns
 * null and the UI shows the words as written.
 */
export function parseDeadline(text: string, now: number = Date.now()): number | null {
  const body = (text || '').toLowerCase();
  if (!body.trim()) return null;
  const base = new Date(now);

  if (/\btoday\b|\btonight\b/.test(body)) return endOfDay(base);
  if (/\btomorrow\b/.test(body)) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return endOfDay(next);
  }
  if (/\bnext week\b/.test(body)) {
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    return endOfDay(next);
  }

  const inDays = body.match(/\b(?:in|within)\s+([0-9]{1,2})\s+days?\b/);
  if (inDays) {
    const next = new Date(now);
    next.setDate(next.getDate() + Number(inDays[1]));
    return endOfDay(next);
  }

  // 10/14 or 10-14 (month/day — the order the plan's dumps use).
  const numeric = body.match(/\b([0-9]{1,2})[/-]([0-9]{1,2})(?:[/-]([0-9]{2,4}))?\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = numeric[3]
        ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
        : base.getFullYear();
      const candidate = new Date(year, month - 1, day);
      // A date already behind us in an unspecified year is next year's.
      if (!numeric[3] && candidate.getTime() < now) candidate.setFullYear(year + 1);
      return endOfDay(candidate);
    }
  }

  // Oct 14 / October 14.
  const monthName = body.match(
    new RegExp(`\\b(${MONTHS.map((m) => m.slice(0, 3)).join('|')})[a-z]*\\.?\\s+([0-9]{1,2})\\b`)
  );
  if (monthName) {
    const month = MONTHS.findIndex((m) => m.startsWith(monthName[1]));
    const day = Number(monthName[2]);
    if (month >= 0 && day >= 1 && day <= 31) {
      const candidate = new Date(base.getFullYear(), month, day);
      if (candidate.getTime() < now) candidate.setFullYear(base.getFullYear() + 1);
      return endOfDay(candidate);
    }
  }

  // A bare weekday: the next occurrence of it.
  const weekday = body.match(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`));
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const next = new Date(now);
    const delta = (target - next.getDay() + 7) % 7 || 7;
    next.setDate(next.getDate() + delta);
    return endOfDay(next);
  }

  return null;
}

/** The deadline phrase as written, so the UI can echo it verbatim. */
export function deadlineLabel(text: string): string {
  const body = (text || '').replace(/\s+/g, ' ');
  const match = body.match(
    /\b(?:due|by|before|deadline(?: is| on)?)\b[^,.;]*/i
  );
  return match ? match[0].trim().slice(0, 80) : '';
}

/** The deterministic reading of one dump line. Every field is optional. */
export function parseCrisisTask(line: string, index: number, now: number = Date.now()): CrisisTask {
  const text = (line || '').trim();
  const weightMatch = text.match(WEIGHT_PCT);
  const pointsMatch = text.match(POINTS);

  /** True when the percentage just matched is actually a score. */
  const isScoreNotWeight = (match: RegExpMatchArray): boolean => {
    const before = text.slice(0, match.index ?? 0);
    return SCORE_CONTEXT.test(before.slice(-40));
  };

  // A stated point value is NOT a percentage: ten points out of an unknown
  // total is not a share of the grade, and reading it as 10% would invent the
  // one number the freeze decision depends on.
  const weightPct = weightMatch && !isScoreNotWeight(weightMatch) ? Number(weightMatch[1]) : null;

  return {
    id: `crisis-${index + 1}`,
    title: text.length > 140 ? `${text.slice(0, 137)}…` : text,
    dueAt: parseDeadline(text, now),
    dueLabel: deadlineLabel(text),
    weightPct: weightPct !== null && weightPct > 0 && weightPct <= 100 ? weightPct : null,
    // A statement of POINTS is not a share of the grade, and an item the dump
    // calls optional is ungraded only if it also states no percentage.
    ungraded: UNGRADED.test(text) && weightPct === null && !pointsMatch,
  };
}

/** Reads the whole dump deterministically, one task per item. */
export function parseCrisisDump(dump: string, now: number = Date.now()): CrisisTask[] {
  return splitCrisisItems(dump).map((line, index) => parseCrisisTask(line, index, now));
}

/** One item as the model read it. Every field is optional — nothing is required. */
export interface CrisisRead {
  index: number;
  title?: string;
  weightPct?: number | null;
  dueLabel?: string;
  ungraded?: boolean;
}

/**
 * Merges the model's reading onto the deterministic segmentation.
 *
 * The model's whole job is to READ — to find a task's name, its weight and its
 * deadline inside messy prose. It cannot invent an item (an index that is not in
 * the split is dropped), cannot overwrite a line with nothing (a missing field
 * keeps the deterministic reading), and cannot supply a timestamp: it returns a
 * DEADLINE PHRASE and `parseDeadline` turns it into a date here. So every number
 * in the resulting plan was either measured in this file or checked by it.
 */
export function mergeCrisisReads(
  lines: string[],
  reads: unknown,
  now: number = Date.now()
): CrisisTask[] {
  const tasks = lines.map((line, index) => parseCrisisTask(line, index, now));
  if (!Array.isArray(reads)) return tasks;

  const byIndex = new Map<number, CrisisRead>();
  for (const raw of reads) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, any>;
    const index = Number(entry.index);
    if (!Number.isInteger(index) || index < 0 || index >= tasks.length) continue;
    byIndex.set(index, {
      index,
      title: typeof entry.title === 'string' ? entry.title.trim() : undefined,
      weightPct: typeof entry.weightPct === 'number' && Number.isFinite(entry.weightPct)
        ? entry.weightPct
        : undefined,
      dueLabel: typeof entry.dueLabel === 'string' ? entry.dueLabel.trim() : undefined,
      ungraded: typeof entry.ungraded === 'boolean' ? entry.ungraded : undefined,
    });
  }

  return tasks.map((task, index) => {
    const read = byIndex.get(index);
    if (!read) return task;

    const weightPct =
      read.weightPct !== undefined &&
      read.weightPct !== null &&
      read.weightPct > 0 &&
      read.weightPct <= 100
        ? read.weightPct
        : task.weightPct;

    const dueLabel = read.dueLabel || task.dueLabel;
    // A phrase the model supplied is parsed HERE, by the same conservative
    // parser the deterministic pass used, and it REPLACES the line's own
    // reading rather than falling back to it: the model read the same text and
    // named the deadline, so keeping the older number would silently answer a
    // question the model already answered differently. A phrase nobody
    // recognises therefore leaves the deadline unknown, which the UI shows as
    // the words themselves.
    const dueAt = read.dueLabel ? parseDeadline(read.dueLabel, now) : task.dueAt;

    return {
      ...task,
      // The model may name the item better than a truncated dump line can, but
      // an empty name is not a name.
      title: read.title ? (read.title.length > 140 ? `${read.title.slice(0, 137)}…` : read.title) : task.title,
      weightPct,
      dueLabel,
      dueAt,
      ungraded:
        weightPct !== null
          ? false
          : read.ungraded !== undefined
            ? read.ungraded
            : task.ungraded,
    };
  });
}

// ─── The arithmetic ─────────────────────────────────────────────────────────

/**
 * The marginal shift of the final grade from scoring `scorePct` on a task worth
 * `weightPct` of the semester.
 *
 * A weighted average moves by `weight × (100 − score) / 100` when a component
 * assumed at 100 is actually scored lower. That is the whole calculation, and
 * it is done here rather than asked of a model because the entire intervention
 * is that this number is small and the learner can check it.
 *
 * Returns null when the weight is unknown: the claim cannot be made.
 */
export function gradeRiskPct(
  weightPct: number | null,
  scorePct: number = ASSUMED_SCORE_PCT
): number | null {
  if (weightPct === null || !Number.isFinite(weightPct)) return null;
  if (weightPct < 0 || weightPct > 100) return null;
  const score = Math.min(100, Math.max(0, Number.isFinite(scorePct) ? scorePct : ASSUMED_SCORE_PCT));
  return Number(((weightPct * (100 - score)) / 100).toFixed(2));
}

/**
 * Builds the plan: what gets frozen, what gets the runway, and the arithmetic
 * that makes the freeze defensible.
 *
 * The focus is the highest-risk task with the nearest deadline — deliberately
 * not the highest-risk task overall, because the runway is ninety minutes of
 * work and work that is due later is not the work that has to happen now.
 */
export function buildTriagePlan(
  tasks: CrisisTask[],
  options: { now?: number; scorePct?: number } = {}
): TriagePlan {
  const now = options.now ?? Date.now();
  const score = options.scorePct ?? ASSUMED_SCORE_PCT;

  const riskOf = (task: CrisisTask): number => {
    if (task.ungraded) return 0;
    return gradeRiskPct(task.weightPct, score) ?? 0;
  };

  const frozen: FrozenTask[] = [];
  const withheld: { task: CrisisTask; reason: string }[] = [];

  for (const task of tasks) {
    if (task.ungraded) {
      frozen.push({
        task,
        riskPct: 0,
        line: `Freezing ${shortTitle(task)} for ${FREEZE_HOURS} hours. Marginal grade risk: 0% — nothing in your list attaches a grade to it.`,
      });
      continue;
    }
    const risk = gradeRiskPct(task.weightPct, score);
    if (risk === null) {
      withheld.push({
        task,
        reason:
          'No weight is stated for this one, so it cannot be shown to be low-leverage — it is not frozen. Add its weight (e.g. "worth 5%") and it becomes decidable.',
      });
      continue;
    }
    if (risk <= FREEZE_RISK_PCT) {
      frozen.push({
        task,
        riskPct: risk,
        line: `Freezing ${shortTitle(task)} for ${FREEZE_HOURS} hours. Marginal grade risk: ${risk}%.`,
      });
    }
  }

  const live = tasks.filter((task) => !frozen.some((entry) => entry.task.id === task.id));
  const pool = live.length > 0 ? live : tasks;

  // The runway goes to what is actually due next — but only among the items
  // ALREADY imminent. A 5%-weighted quiz due tomorrow outranks a 30% essay with
  // no stated date, because ninety minutes spent on the essay when the quiz is
  // due at midnight is ninety minutes spent on the wrong problem. When two
  // imminent items compete, the riskier one wins; when nothing is imminent, the
  // riskiest item overall does.
  const imminent = pool.filter(
    (task) => task.dueAt !== null && task.dueAt - now <= IMMINENT_WINDOW_MS
  );
  const candidates = imminent.length > 0 ? imminent : pool;
  const focus =
    [...candidates].sort(
      (a, b) => riskOf(b) - riskOf(a) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
    )[0] ?? null;

  const panicLines = buildPanicLines(tasks, now, score);

  return {
    tasks,
    frozen,
    focus,
    panicLines,
    withheld,
    runwayMinutes: RUNWAY_MINUTES,
  };
}

function shortTitle(task: CrisisTask): string {
  const first = task.title.split(/[,.]/)[0].trim();
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/**
 * The panic-dismantling arithmetic, one line per weighted task plus the general
 * rule.
 *
 * The general line is the one that does the work: it states the transformation
 * ("the grade is a weighted average, so this item is worth at most its weight")
 * rather than the reassurance ("don't worry"), because the reassurance is what
 * every system that has already failed this learner says.
 */
export function buildPanicLines(
  tasks: CrisisTask[],
  _now: number = Date.now(),
  score: number = ASSUMED_SCORE_PCT
): string[] {
  const lines: string[] = [];
  const weighted = tasks.filter((task) => !task.ungraded && task.weightPct !== null);

  for (const task of weighted.slice(0, 6)) {
    const risk = gradeRiskPct(task.weightPct, score);
    if (risk === null) continue;
    lines.push(
      `${shortTitle(task)} is worth ${task.weightPct}% of the semester. Even scoring ${score}% on it moves the final grade by ${risk} point${risk === 1 ? '' : 's'}, not by the ${100 - score} the item itself suggests.`
    );
  }

  if (weighted.length > 0) {
    const total = weighted.reduce((acc, task) => acc + (task.weightPct ?? 0), 0);
    lines.push(
      `Those items add up to ${Number(total.toFixed(2))}% of the grade. The other ${Number((100 - total).toFixed(2))}% is unaffected by any of tonight's work — which is why nothing here is worth the whole semester's panic.`
    );
  } else {
    lines.push(
      'No weights are stated anywhere in this list, so no marginal risk can be computed yet. Naming the weight of each item ("worth 5%") is the first move — it turns a pile into a ranking.'
    );
  }

  return lines;
}

/**
 * The runway's single next action, as one sentence.
 *
 * It names the task and the first physical move, because "study for chemistry"
 * is not an action and a blocked learner needs the next physical step.
 */
export function runwayAction(plan: TriagePlan): string {
  const focus = plan.focus;
  if (!focus) return 'Nothing is left to sequence — the dump is empty.';
  const due = focus.dueAt !== null
    ? ` It is due ${new Date(focus.dueAt).toLocaleDateString()}.`
    : '';
  return `${plan.runwayMinutes} minutes, one task, everything else hidden: ${focus.title}.${due}`;
}
