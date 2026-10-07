import { describe, it, expect } from 'vitest';
import {
  allocateSeconds,
  allocateStates,
  classifyPacing,
  CRUCIBLE_MINUTES,
  flattenStates,
  formatClock,
  formatMinutes,
  pacingFor,
  pacingTable,
  stressInoculationRead,
  summarizeSprint,
  validateCruciblePlan,
} from '../../lib/crucible/budget';

/**
 * The HUD this model drives is a claim about the learner's own pacing, so the
 * numbers it prints have to be exact and the parts have to sum to the whole. A
 * pacing flag that fires on every wobble is noise, and a clock whose states do
 * not add up to the clock is a signal the learner stops reading.
 */

describe('allocateSeconds — the clock splits exactly, in whole seconds', () => {
  it('splits evenly when the weights are even', () => {
    expect(allocateSeconds(720, [1, 1, 1])).toEqual([240, 240, 240]);
  });

  it('hands the leftover seconds to the largest remainders, never losing one', () => {
    const split = allocateSeconds(100, [1, 1, 1]);
    expect(split.reduce((a, b) => a + b, 0)).toBe(100);
    expect(split.every((value) => value >= 33)).toBe(true);
  });

  it('is deterministic on ties — the same plan always allocates the same way', () => {
    expect(allocateSeconds(10, [3, 1])).toEqual(allocateSeconds(10, [3, 1]));
    expect(allocateSeconds(10, [3, 1]).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('refuses to invent time out of a zero-length sprint', () => {
    expect(allocateSeconds(0, [1, 1])).toEqual([0, 0]);
  });

  it('treats a non-positive weight as a real share rather than dropping the state', () => {
    const split = allocateSeconds(60, [0, 1]);
    expect(split).toEqual([30, 30]);
  });
});

describe('classifyPacing — a wide band, so the flag means something', () => {
  it('calls a state ahead only under 80% of its budget', () => {
    expect(classifyPacing(70, 100)).toBe('ahead');
    expect(classifyPacing(80, 100)).toBe('on-pace');
  });

  it('calls a state lagging only past 120% of its budget', () => {
    expect(classifyPacing(120, 100)).toBe('on-pace');
    expect(classifyPacing(121, 100)).toBe('lagging');
  });

  it('never calls a state lagging when there is no budget to compare against', () => {
    // With no allocation the claim would be invented, not measured.
    expect(classifyPacing(500, 0)).toBe('on-pace');
  });

  it('reports the drift as a whole percent of the budget', () => {
    const pacing = pacingFor({ id: 'state-1', label: 'Demand', targetSec: 120 }, 200);
    expect(pacing.status).toBe('lagging');
    expect(pacing.driftPct).toBe(67);
  });

  it('treats a missing elapsed reading as zero rather than as a negative', () => {
    expect(pacingTable([{ id: 's', label: 'l', targetSec: 60 }]).at(0)?.elapsedSec).toBe(0);
  });
});

describe('summarizeSprint — pacing, never a verdict on the person', () => {
  const states = [
    { id: 'state-1', label: 'System demand', targetSec: 100 },
    { id: 'state-2', label: 'Boundary work', targetSec: 100 },
    { id: 'state-3', label: 'Energy balance', targetSec: 100 },
  ];

  it('counts each band and names where the clock went', () => {
    const summary = summarizeSprint(pacingTable(states, [50, 200, 100]));
    expect(summary.states).toBe(3);
    expect(summary.ahead).toBe(1);
    expect(summary.lagging).toBe(1);
    expect(summary.onPace).toBe(1);
    expect(summary.verdict).toContain('2 of 3 states held their budget');
    expect(summary.verdict).toContain('Boundary work');
  });

  it('says the budget held when nothing overran', () => {
    const summary = summarizeSprint(pacingTable(states, [90, 95, 60]));
    expect(summary.lagging).toBe(0);
    expect(summary.verdict).toContain('All 3 states held their budget');
    expect(summary.verdict).not.toContain('went into');
  });

  it('totals the allocation and the spend', () => {
    const summary = summarizeSprint(pacingTable(states, [50, 200, 100]));
    expect(summary.targetSec).toBe(300);
    expect(summary.elapsedSec).toBe(350);
  });

  it('handles an empty sprint without dividing by zero', () => {
    expect(summarizeSprint([]).verdict).toBe('No states were recorded.');
  });
});

describe('stressInoculationRead — recovery is the skill, so it is measured', () => {
  it('counts an overrun the next state absorbed as recovered', () => {
    const table = pacingTable(
      [
        { id: 's1', label: 'Demand', targetSec: 100 },
        { id: 's2', label: 'Supply', targetSec: 100 },
      ],
      [200, 50]
    );
    const read = stressInoculationRead(table);
    expect(read.laggingStates).toBe(1);
    expect(read.recoveredStates).toBe(1);
    expect(read.worstStateLabel).toBe('Demand');
    expect(read.worstDriftPct).toBe(100);
    expect(read.note).toContain('recovered');
  });

  it('reports honestly when nothing was recovered', () => {
    const table = pacingTable(
      [
        { id: 's1', label: 'Demand', targetSec: 100 },
        { id: 's2', label: 'Supply', targetSec: 100 },
      ],
      [200, 300]
    );
    const read = stressInoculationRead(table);
    expect(read.recoveredStates).toBe(0);
    expect(read.note).toContain('No overrun was recovered');
  });

  it('says so when nothing overran at all', () => {
    const read = stressInoculationRead(pacingTable([{ id: 's1', label: 'x', targetSec: 100 }], [60]));
    expect(read.note).toContain('Nothing overran');
  });
});

describe('formatting', () => {
  it('prints a clock face, never a negative', () => {
    expect(formatClock(719)).toBe('11:59');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
  });

  it('prints pacing minutes at one decimal', () => {
    expect(formatMinutes(84)).toBe('1.4m');
    expect(formatMinutes(0)).toBe('0.0m');
  });
});

describe('validateCruciblePlan — a state machine or nothing', () => {
  const problem = (title: string, states: unknown[]) => ({
    title,
    domain: 'Thermochemistry',
    constraints: ['The piston is frictionless.'],
    ask: 'What is ΔE?',
    states,
  });

  it('drops a problem that is not actually decomposed into states', () => {
    // A "state machine" with one state cannot be paced, and the HUD would be
    // showing a plan it cannot compare against anything.
    expect(validateCruciblePlan({ problems: [problem('One state', [{ label: 'only' }])] })).toBeNull();
  });

  it('keeps a problem with two or more states and splits the clock across them', () => {
    const plan = validateCruciblePlan(
      { problems: [problem('Piston', [{ label: 'Demand' }, { label: 'Work' }])] },
      12
    )!;
    expect(plan.problems.length).toBe(1);
    expect(plan.minutes).toBe(12);
    const total = plan.problems[0].states.reduce((acc, state) => acc + state.targetSec, 0);
    expect(total).toBe(720);
  });

  it('caps the sprint at three problems and gives each its own share of the clock', () => {
    const plan = validateCruciblePlan(
      {
        problems: [
          problem('One', [{ label: 'a' }, { label: 'b' }]),
          problem('Two', [{ label: 'a' }, { label: 'b' }]),
          problem('Three', [{ label: 'a' }, { label: 'b' }]),
          problem('Four', [{ label: 'a' }, { label: 'b' }]),
        ],
      },
      12
    )!;
    expect(plan.problems.length).toBe(3);
    expect(
      plan.problems[0].states.reduce((acc, state) => acc + state.targetSec, 0)
    ).toBe(240);
  });

  it('drops a state that carries no label instead of showing a blank row', () => {
    const plan = validateCruciblePlan(
      { problems: [problem('Mixed', [{ label: 'Kept' }, { label: '   ' }, { label: 'Also kept' }])] },
      12
    )!;
    expect(plan.problems[0].states.map((state) => state.label)).toEqual(['Kept', 'Also kept']);
  });

  it('returns null rather than an empty cockpit', () => {
    expect(validateCruciblePlan({ problems: [] })).toBeNull();
    expect(validateCruciblePlan(null)).toBeNull();
    expect(validateCruciblePlan({})).toBeNull();
  });

  it('flattens to the state list the HUD paces, in problem order', () => {
    const plan = validateCruciblePlan(
      {
        problems: [
          problem('One', [{ label: 'a' }, { label: 'b' }]),
          problem('Two', [{ label: 'c' }, { label: 'd' }]),
        ],
      },
      12
    )!;
    expect(flattenStates(plan).map((state) => state.label)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('defaults the sprint length to the plan\'s own twelve minutes', () => {
    expect(CRUCIBLE_MINUTES).toBe(12);
    expect(allocateStates(120, [{ label: 'a' }, { label: 'b' }])).toEqual([
      { id: 'state-1', label: 'a', targetSec: 60 },
      { id: 'state-2', label: 'b', targetSec: 60 },
    ]);
  });
});
