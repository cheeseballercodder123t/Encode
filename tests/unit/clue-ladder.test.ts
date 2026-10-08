import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clueRungs,
  MAX_CLUE_RUNGS,
  markRungRevealed,
  resetRungsRevealed,
  rungsRevealed,
} from '../../lib/clue-ladder';
import { validateEncodedSchema } from '../../lib/ai-output-validation';

/**
 * The stage used to carry exactly one hint behind a toggle, which is a coin
 * flip: it either gives the answer away or leaves the learner stuck, and which
 * one it is depends on how stuck they already were. The ladder replaces that
 * with rungs handed over one at a time.
 *
 * Three things are pinned here, and the third is the one that rots silently:
 *   1. the rungs resolve from either encoding (the new `clues` array or the
 *      legacy single `clue`) without ever showing one sentence twice;
 *   2. the model is asked for scaffolding that makes the answer derivable, and
 *      is forbidden from stating it — a "clue" that spells the answer turns the
 *      recall attempt into reading, which is the failure this whole feature
 *      exists to avoid;
 *   3. the rungs survive validation, because a field the model fills and the
 *      validator drops is a ladder that is always one rung tall.
 *
 * The staging itself (one rung per click, the strongest-rung dead end) is a
 * browser behaviour and lives in `e2e/stage-templates.spec.ts`.
 */

describe('clueRungs — the ladder a stage hands over, weakest first', () => {
  it('renders a legacy single hint as rung 1 of 1, and marks it strongest', () => {
    // Every stage encoded before the ladder existed carries exactly this shape,
    // so this is the case that decides whether old payloads still work.
    const rungs = clueRungs('Anchor the primary actor in the center.', undefined);

    expect(rungs).toHaveLength(1);
    expect(rungs[0]).toMatchObject({ index: 1, isStrongest: true });
    expect(rungs[0].text).toBe('Anchor the primary actor in the center.');
  });

  it('keeps the payload order rather than sorting, and marks only the last rung strongest', () => {
    const rungs = clueRungs(undefined, ['a nudge', 'a narrower hint', 'the strongest scaffold']);

    expect(rungs.map((rung) => rung.text)).toEqual([
      'a nudge',
      'a narrower hint',
      'the strongest scaffold',
    ]);
    expect(rungs.map((rung) => rung.isStrongest)).toEqual([false, false, true]);
    expect(rungs.map((rung) => rung.index)).toEqual([1, 2, 3]);
  });

  it('caps the ladder, keeping the strongest rung of those it can show', () => {
    const rungs = clueRungs(undefined, ['one', 'two', 'three', 'four']);

    expect(rungs).toHaveLength(MAX_CLUE_RUNGS);
    expect(rungs.map((rung) => rung.text)).toEqual(['one', 'two', 'three']);
    expect(rungs[rungs.length - 1].isStrongest).toBe(true);
  });

  it('never stages the same sentence twice when the legacy hint repeats a rung', () => {
    // Dedupe is case- and whitespace-insensitive: the model writes the same
    // idea into both fields with different spacing more reliably than it
    // notices it already said it.
    const rungs = clueRungs('Normal force is perpendicular.', [
      'Try the free-body diagram',
      'normal force   is PERPENDICULAR.',
    ]);

    expect(rungs.map((rung) => rung.text)).toEqual([
      'Try the free-body diagram',
      'normal force is PERPENDICULAR.',
    ]);
  });

  it('drops blank rungs instead of handing over an empty one', () => {
    expect(clueRungs('   ', ['', '   '])).toEqual([]);
  });

  it('yields no ladder at all when the stage carries no hint', () => {
    // The control renders nothing in this case; a button that answers nothing
    // is worse than no button.
    expect(clueRungs()).toEqual([]);
    expect(clueRungs(undefined, [])).toEqual([]);
  });

  it('survives a malformed clues value rather than throwing mid-stage', () => {
    const rungs = clueRungs('only hint', 'not an array' as unknown as string[]);

    expect(rungs.map((rung) => rung.text)).toEqual(['only hint']);
  });
});

describe('the encode contract that produces the rungs', () => {
  const source = readFileSync(join('app', 'api', 'encode', 'route.ts'), 'utf8');

  it('declares the rungs as an ordered array on the generation challenge', () => {
    expect(source).toContain('clues: { type: Type.ARRAY, items: { type: Type.STRING }');
    expect(source).toContain('2-3 ordered Socratic rungs, weakest first');
  });

  it('forbids a rung that states the answer, by naming the cheap tricks', () => {
    expect(source).toContain('must never state the answer');
    expect(source).toContain('no spelling counts');
    expect(source).toContain("no 'starts with M'");
    expect(source).toContain('no restatement of the target');
  });

  it('keeps the legacy single clue, so old and new payloads both render', () => {
    expect(source).toContain('clue: { type: Type.STRING, description: "Socratic hint');
  });
});

describe('the rungs survive validation on their way to the stage', () => {
  it('carries an ordered clues array through validateEncodedSchema untouched', () => {
    const raw = {
      topicSummary: 'Baroreceptor reflex',
      activities: [
        {
          id: 'a1',
          title: 'Trace the reflex loop',
          templateType: 'cause_effect',
          scaffold: { field1Label: 'Variable', field2Label: 'Effect', exampleAnswer: 'e' },
          visualData: {
            generationChallenge: {
              premisePrompt: 'P',
              clue: 'legacy hint',
              clues: ['rung one', 'rung two'],
              missingRoleOrTarget: 'm',
              expertCompletion: 'e',
            },
          },
        },
      ],
    };

    const out = validateEncodedSchema(raw, 'conceptual');
    const visual = out.activities[0].visualData as unknown as {
      generationChallenge?: { clue?: string; clues?: string[] };
    };

    expect(visual.generationChallenge?.clues).toEqual(['rung one', 'rung two']);
    // And the rungs still resolve as a ladder downstream, legacy hint included.
    expect(clueRungs(visual.generationChallenge?.clue, visual.generationChallenge?.clues)).toHaveLength(3);
  });
});

/**
 * The reveal counter the friction governor reads.
 *
 * `rungsRevealed()` is module-level state on purpose: the ladder is rendered
 * inside fifteen stage templates, so no component can pass the count up the
 * tree. That makes the RESET the load-bearing half. If the count survives an
 * attempt boundary, a clean solve is recorded as scaffolded, and "solved with
 * no rung" — the one reading that says the mechanism is held, and the signal
 * the escalation governor runs on — never arrives.
 */
describe('the reveal counter the friction governor reads', () => {
  beforeEach(() => resetRungsRevealed());

  it('starts an attempt at zero', () => {
    expect(rungsRevealed()).toBe(0);
  });

  it('counts one rung per hand-over', () => {
    markRungRevealed();
    expect(rungsRevealed()).toBe(1);
    markRungRevealed();
    markRungRevealed();
    expect(rungsRevealed()).toBe(3);
  });

  it('drops the whole attempt on reset rather than decrementing it', () => {
    markRungRevealed();
    markRungRevealed();
    resetRungsRevealed();
    expect(rungsRevealed()).toBe(0);
  });

  it('is idempotent: a second reset cannot go below zero', () => {
    resetRungsRevealed();
    resetRungsRevealed();
    expect(rungsRevealed()).toBe(0);
  });
});

/**
 * The boundary that counter is reset on.
 *
 * The bug this pins: the reset effect depended on the activity INDEX alone, so
 * a Guided Path module switch — which swaps the activities and lands back on
 * index 0 while `appState` stays `'encoding'`, leaving the workbench mounted —
 * never reset the count. The new module's opening stage then inherited the
 * previous module's rungs.
 *
 * A source scan rather than a rendered assertion because the repo has no
 * @testing-library/react: the wiring is pinned here, and the browser behaviour
 * belongs in `e2e/stage-templates.spec.ts`.
 */
describe('the workbench resets the counter on the whole attempt boundary', () => {
  const source = readFileSync(join('components', 'workbench', 'StudioWorkbench.tsx'), 'utf8');

  it('resets on the stage set as well as the activity index', () => {
    const effect = source.match(/useEffect\(\(\) => \{\s*resetRungsRevealed\(\);\s*\}, \[([^\]]*)\]\)/);
    expect(effect).not.toBeNull();
    const deps = effect![1];
    expect(deps).toContain('currentActivityIndex');
    // The stage SET is the other half of an attempt's identity: an index-only
    // dependency cannot see a module switch that lands back on index 0.
    expect(deps).toContain('activities');
  });

  it('still resets at all, so the assertion above can never pass vacuously', () => {
    expect(source).toContain('resetRungsRevealed();');
  });
});
