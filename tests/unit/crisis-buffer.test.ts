import { describe, it, expect } from 'vitest';
import {
  buildPanicLines,
  buildTriagePlan,
  decodeTriageResume,
  encodeTriageResume,
  FREEZE_HOURS,
  FREEZE_RISK_PCT,
  gradeRiskPct,
  mergeCrisisReads,
  parseCrisisDump,
  parseCrisisTask,
  parseDeadline,
  resumeRemainingMs,
  runwayAction,
  RUNWAY_MINUTES,
  splitCrisisItems,
  type TriagePlan,
  type TriageResumeState,
} from '../../lib/crisis/buffer';

/**
 * This is the module for the night everything is due at once. Two operations
 * matter, and both are arithmetic rather than encouragement: freezing the items
 * that can be PROVEN to be low-leverage, and showing that a weighted grade moves
 * by the item's weight rather than by the score on the item.
 *
 * The refusal is load-bearing. A task with no stated weight is never frozen,
 * because "this is low-leverage" is a claim that needs a number — and the night
 * is not the moment to spend the learner's trust on a guess.
 */

const NOW = new Date(2026, 9, 7, 12, 0, 0).getTime(); // 7 Oct 2026, noon

describe('splitCrisisItems — one item per line, in any format', () => {
  it('splits on newlines and semicolons and strips list markers', () => {
    expect(splitCrisisItems('Chem quiz\nGothic essay; Care quiz\n1. Practice set')).toEqual([
      'Chem quiz',
      'Gothic essay',
      'Care quiz',
      'Practice set',
    ]);
  });

  it('drops fragments that carry nothing', () => {
    expect(splitCrisisItems('\n  \n---\nreal task\n')).toEqual(['real task']);
  });

  it('returns nothing for an empty dump', () => {
    expect(splitCrisisItems('')).toEqual([]);
    expect(splitCrisisItems('   \n  ')).toEqual([]);
  });
});

describe('parseDeadline — a small vocabulary, because a false deadline is worse than none', () => {
  it('reads the phrases a panicking person actually writes', () => {
    expect(new Date(parseDeadline('due tomorrow', NOW)!).getDate()).toBe(8);
    expect(new Date(parseDeadline('due tonight', NOW)!).getDate()).toBe(7);
    expect(new Date(parseDeadline('in 3 days', NOW)!).getDate()).toBe(10);
    expect(new Date(parseDeadline('next week', NOW)!).getDate()).toBe(14);
  });

  it('reads a month and a day', () => {
    const due = new Date(parseDeadline('Gothic Lit essay — Oct 14', NOW)!);
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(14);
  });

  it('reads a numeric date and rolls an already-passed one to next year', () => {
    expect(new Date(parseDeadline('10/14', NOW)!).getDate()).toBe(14);
    // 9/1 has already happened this year, so an unspecified year means next year.
    const rolled = new Date(parseDeadline('9/1', NOW)!);
    expect(rolled.getFullYear()).toBe(2027);
  });

  it('reads a bare weekday as the next occurrence of it', () => {
    const friday = new Date(parseDeadline('Care of Athletes quiz — Friday', NOW)!);
    expect(friday.getDay()).toBe(5);
    expect(friday.getTime()).toBeGreaterThan(NOW);
  });

  it('returns null rather than guessing', () => {
    expect(parseDeadline('sometime soon', NOW)).toBeNull();
    expect(parseDeadline('', NOW)).toBeNull();
  });
});

describe('parseCrisisTask — weights are weights, scores are not', () => {
  it('reads a stated weight', () => {
    const task = parseCrisisTask('Chem makeup quiz — due tomorrow, worth 5%', 0, NOW);
    expect(task.weightPct).toBe(5);
    expect(task.dueAt).not.toBeNull();
    expect(task.ungraded).toBe(false);
    expect(task.dueLabel).toContain('due tomorrow');
  });

  it('refuses to read a needed SCORE as a weight', () => {
    // "I need 80% on the final" is not "the final is worth 80%". Reading it as a
    // weight would hand the freeze decision a fabricated number.
    const task = parseCrisisTask('Chem final — I need 80% to keep an A', 0, NOW);
    expect(task.weightPct).toBeNull();
  });

  it('rejects an impossible weight instead of using it', () => {
    expect(parseCrisisTask('Something worth 140%', 0, NOW).weightPct).toBeNull();
    expect(parseCrisisTask('Something worth 0%', 0, NOW).weightPct).toBeNull();
  });

  it('treats an optional item as ungraded — but not one that states a weight', () => {
    expect(parseCrisisTask('Practice set 7 (optional)', 0, NOW).ungraded).toBe(true);
    expect(parseCrisisTask('Optional review session, worth 5%', 0, NOW).ungraded).toBe(false);
  });

  it('never treats a points total as a share of the grade', () => {
    // 10 points out of an unknown total is not 10% of the semester.
    const task = parseCrisisTask('Care of Athletes quiz — Friday, 10 points', 0, NOW);
    expect(task.weightPct).toBeNull();
    expect(task.ungraded).toBe(false);
  });
});

describe('gradeRiskPct — the number the panic is dismantled with', () => {
  it('computes the marginal shift of a weighted average', () => {
    expect(gradeRiskPct(5, 80)).toBe(1);
    expect(gradeRiskPct(2, 80)).toBe(0.4);
    expect(gradeRiskPct(30, 80)).toBe(6);
  });

  it('returns null when the weight is unknown or unusable', () => {
    expect(gradeRiskPct(null)).toBeNull();
    expect(gradeRiskPct(150)).toBeNull();
    expect(gradeRiskPct(-5)).toBeNull();
  });
});

describe('buildTriagePlan — freeze what can be proven, then focus', () => {
  it('freezes an ungraded item at zero risk and keeps everything else live', () => {
    const tasks = parseCrisisDump(
      [
        'Chem makeup quiz — due tomorrow, worth 5%',
        'Practice set 7 (optional)',
        'Gothic Lit essay, worth 30%',
      ].join('\n'),
      NOW
    );
    const plan = buildTriagePlan(tasks, { now: NOW });

    expect(plan.frozen.length).toBe(1);
    expect(plan.frozen[0].task.title).toContain('Practice set 7');
    expect(plan.frozen[0].riskPct).toBe(0);
    expect(plan.frozen[0].line).toContain(`Freezing`);
    expect(plan.frozen[0].line).toContain('0%');
  });

  it('freezes a weighted item whose marginal risk is negligible', () => {
    const tasks = parseCrisisDump('Weekly quiz, worth 1%', NOW);
    const plan = buildTriagePlan(tasks, { now: NOW, scorePct: 80 });
    // 1% × 20 points = 0.2 points, under the 0.5-point threshold.
    expect(plan.frozen.length).toBe(1);
    expect(plan.frozen[0].riskPct).toBe(0.2);
    expect(plan.frozen[0].riskPct).toBeLessThanOrEqual(FREEZE_RISK_PCT);
  });

  it('refuses to freeze an item it cannot weigh', () => {
    const tasks = parseCrisisDump('Gothic Lit essay — Oct 14', NOW);
    const plan = buildTriagePlan(tasks, { now: NOW });
    expect(plan.frozen).toEqual([]);
    expect(plan.withheld.length).toBe(1);
    expect(plan.withheld[0].reason).toContain('not frozen');
    expect(plan.withheld[0].reason).toContain('worth 5%');
  });

  it('gives the runway to what is actually due next', () => {
    // Ninety minutes on the 30% essay when a quiz is due at midnight is ninety
    // minutes on the wrong problem.
    const tasks = parseCrisisDump(
      ['Chem makeup quiz — due tomorrow, worth 5%', 'Gothic Lit essay, worth 30%'].join('\n'),
      NOW
    );
    const plan = buildTriagePlan(tasks, { now: NOW });
    expect(plan.focus?.title).toContain('Chem makeup quiz');
  });

  it('breaks a tie between two imminent items on risk', () => {
    const tasks = parseCrisisDump(
      ['Small quiz — due tomorrow, worth 5%', 'Big exam — due tomorrow, worth 30%'].join('\n'),
      NOW
    );
    const plan = buildTriagePlan(tasks, { now: NOW });
    expect(plan.focus?.title).toContain('Big exam');
  });

  it('falls back to the riskiest item when nothing is imminent', () => {
    const tasks = parseCrisisDump(
      ['Small quiz, worth 5%', 'Big essay, worth 30%'].join('\n'),
      NOW
    );
    const plan = buildTriagePlan(tasks, { now: NOW });
    expect(plan.focus?.title).toContain('Big essay');
  });

  it('names the runway length and the single action', () => {
    const tasks = parseCrisisDump('Big essay — due tomorrow, worth 30%', NOW);
    const plan = buildTriagePlan(tasks, { now: NOW });
    expect(plan.runwayMinutes).toBe(RUNWAY_MINUTES);
    const action = runwayAction(plan);
    expect(action).toContain('90 minutes');
    expect(action).toContain('Big essay');
  });

  it('states the freeze window as the plan specifies', () => {
    expect(FREEZE_HOURS).toBe(48);
  });
});

describe('buildPanicLines — the arithmetic, not the reassurance', () => {
  it('shows the weighted-average subtraction, per item', () => {
    const tasks = parseCrisisDump('Chem makeup quiz, worth 5%', NOW);
    const lines = buildPanicLines(tasks, NOW, 80);
    expect(lines[0]).toContain('worth 5%');
    expect(lines[0]).toContain('by 1 point');
    expect(lines[0]).toContain('not by the 20');
  });

  it('totals the weighted share and names the untouched remainder', () => {
    const tasks = parseCrisisDump(
      ['Quiz one, worth 5%', 'Quiz two, worth 10%'].join('\n'),
      NOW
    );
    const lines = buildPanicLines(tasks, NOW, 80);
    expect(lines.some((line) => line.includes('15% of the grade'))).toBe(true);
    expect(lines.some((line) => line.includes('85% is unaffected'))).toBe(true);
  });

  it('says what would make the list decidable when no weights were stated', () => {
    const lines = buildPanicLines(parseCrisisDump('Gothic Lit essay\nChem quiz', NOW), NOW, 80);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Naming the weight');
  });
});

describe('mergeCrisisReads — the model reads, TypeScript computes', () => {
  const lines = ['Chem quiz — due tomorrow', 'Practice set 7 (optional)'];

  it('keeps the deterministic reading when the model says nothing', () => {
    const tasks = mergeCrisisReads(lines, [], NOW);
    expect(tasks.length).toBe(2);
    expect(tasks[0].weightPct).toBeNull();
    expect(tasks[1].ungraded).toBe(true);
  });

  it('takes a weight the model found, and a name that reads better', () => {
    const tasks = mergeCrisisReads(
      lines,
      [{ index: 0, title: 'Chem makeup quiz', weightPct: 5, dueLabel: 'due tomorrow' }],
      NOW
    );
    expect(tasks[0].title).toBe('Chem makeup quiz');
    expect(tasks[0].weightPct).toBe(5);
    expect(tasks[0].dueAt).not.toBeNull();
  });

  it('never lets the model invent an item that was not in the dump', () => {
    const tasks = mergeCrisisReads(
      lines,
      [{ index: 9, title: 'Invented task', weightPct: 50 }],
      NOW
    );
    expect(tasks.map((task) => task.title)).toEqual(lines);
  });

  it('gives the model’s deadline phrase to the same conservative parser', () => {
    // The model returns a PHRASE, never a timestamp: `parseDeadline` turns it
    // into a date here, so an unrecognised phrase leaves the deadline unknown.
    const tasks = mergeCrisisReads(lines, [{ index: 0, dueLabel: 'sometime soon' }], NOW);
    expect(tasks[0].dueAt).toBeNull();

    const readable = mergeCrisisReads(lines, [{ index: 0, dueLabel: 'due Oct 14' }], NOW);
    expect(new Date(readable[0].dueAt!).getDate()).toBe(14);
  });

  it('rejects a weight the model overstated out of range', () => {
    const tasks = mergeCrisisReads(lines, [{ index: 0, weightPct: 500 }], NOW);
    expect(tasks[0].weightPct).toBeNull();
  });

  it('cannot mark a scored item ungraded once a weight is known', () => {
    const tasks = mergeCrisisReads(lines, [{ index: 0, ungraded: true, weightPct: 40 }], NOW);
    expect(tasks[0].ungraded).toBe(false);
  });

  it('survives a malformed read payload', () => {
    expect(mergeCrisisReads(lines, 'not an array', NOW).length).toBe(2);
    expect(mergeCrisisReads(lines, [null, 42], NOW).length).toBe(2);
  });
});

describe('the resume record — the plan and the runway survive a reload', () => {
  // Forty-five minutes into a ninety-minute runway is exactly the state that
  // used to be destroyed by closing the sheet or reloading the page.
  const DUMP = 'Chem makeup quiz — due tomorrow, worth 5%\nGothic Lit essay — Oct 14, worth 30%';
  const plan = buildTriagePlan(parseCrisisDump(DUMP, NOW), { now: NOW });
  const state: TriageResumeState = {
    dump: DUMP,
    plan,
    runwayStartedAt: NOW,
    runwayDurationMs: RUNWAY_MINUTES * 60 * 1000,
    savedAt: NOW,
  };

  it('round-trips the dump, the plan and the runway’s start', () => {
    const raw = encodeTriageResume(state);
    expect(typeof raw).toBe('string');

    const back = decodeTriageResume(raw);
    expect(back?.dump).toBe(DUMP);
    expect(back?.plan.tasks.length).toBe(plan.tasks.length);
    expect(back?.plan.focus?.title).toBe(plan.focus?.title);
    expect(back?.plan.frozen.length).toBe(plan.frozen.length);
    expect(back?.plan.withheld.length).toBe(plan.withheld.length);
    expect(back?.plan.panicLines).toEqual(plan.panicLines);
    expect(back?.runwayStartedAt).toBe(NOW);
    expect(back?.runwayDurationMs).toBe(RUNWAY_MINUTES * 60 * 1000);
  });

  it('counts the time already spent, and never runs past zero', () => {
    const full = RUNWAY_MINUTES * 60 * 1000;
    expect(resumeRemainingMs(state, NOW + 45 * 60 * 1000)).toBe(full - 45 * 60 * 1000);
    expect(resumeRemainingMs(state, NOW + full)).toBe(0);
    // An hour past the end is still zero: the clock is spent, not negative, and
    // an expired runway is reported as spent rather than reset.
    expect(resumeRemainingMs(state, NOW + full + 60 * 60 * 1000)).toBe(0);
    // A plan saved before the runway ever started holds no runway at all.
    expect(resumeRemainingMs({ ...state, runwayStartedAt: 0 }, NOW)).toBe(0);
  });

  it('reads nothing out of a record it cannot trust', () => {
    expect(decodeTriageResume(null)).toBeNull();
    expect(decodeTriageResume(undefined)).toBeNull();
    expect(decodeTriageResume('')).toBeNull();
    expect(decodeTriageResume('   ')).toBeNull();
    expect(decodeTriageResume('not json')).toBeNull();
    expect(decodeTriageResume('{}')).toBeNull();
    expect(decodeTriageResume('[]')).toBeNull();
    // A plan that is not a plan — the sheet must come back empty rather than
    // render a focus task that is not a task.
    expect(
      decodeTriageResume(JSON.stringify({ ...state, plan: { tasks: 'nope' } }))
    ).toBeNull();
    expect(
      decodeTriageResume(
        JSON.stringify({
          ...state,
          plan: { ...plan, tasks: [{ id: 'crisis-1' }], frozen: [], panicLines: [], withheld: [] },
        })
      )
    ).toBeNull();
    // A runway length that is not a length, and a record with no dump.
    expect(
      decodeTriageResume(JSON.stringify({ ...state, runwayDurationMs: 'ninety minutes' }))
    ).toBeNull();
    expect(decodeTriageResume(JSON.stringify({ ...state, dump: 42 }))).toBeNull();
  });

  it('refuses to encode a plan it could not read back', () => {
    expect(encodeTriageResume({ ...state, plan: null as unknown as TriagePlan })).toBeNull();
  });
});
