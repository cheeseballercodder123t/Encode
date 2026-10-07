import { test, expect } from '@playwright/test';
import { makeActivity, P1_FIELD1, P1_FIELD2, P2_FIELD1, P2_FIELD2 } from './helpers/fixtures';
import {
  ENCODE_ROUTE,
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
} from './helpers/mocks';

/**
 * The registry is only worth having if a stage's `templateType` is what decides
 * which visual draws it, end to end.
 *
 * `StageVisualRenderer` used to hold its own id → component table beside the
 * registry; it now dispatches through `TEMPLATE_COMPONENTS`. This spec pins the
 * consequence a unit test cannot see: a workout whose stages name two different
 * templates really renders two different diagrams in the browser — and neither
 * of them silently falls back to the first-principles chart, which is exactly
 * what a broken dispatch looks like from the learner's side (every stage the
 * same shape, still "working").
 */

const PALACE_CHROME = '[ CASTLE ]';
const PALACE_TITLE = 'Method of Loci & Spatial Architectural Journey';
const ANALOGY_CHROME = '[ COMPARE ]';
const ANALOGY_TITLE = 'Gentner Structure-Mapping & Generation Bridge';
const FIRST_PRINCIPLES_TITLE = 'Axiomatic Causal Reduction & Causal Dominoes';

const WORKOUT = {
  topicSummary: 'Renal Physiology',
  activities: [
    makeActivity({
      id: 'tpl-1',
      stageNumber: 1,
      title: 'Place the Countercurrent Chain',
      templateType: 'memory_palace',
      scaffold: {
        field1Label: 'Room',
        field1Placeholder: P1_FIELD1,
        field2Label: 'Bizarre Image',
        field2Placeholder: P1_FIELD2,
        exampleAnswer: 'The kitchen kettle screams 1,200 mOsm.',
      },
      visualData: {
        // This stage's own challenge, carrying the ladder's rungs: three ordered
        // scaffolds, weakest first, none of which states the answer.
        generationChallenge: {
          premisePrompt: 'Which part of the tubule is doing the work, and in which direction?',
          clue: 'One sentence is all this stage used to carry.',
          clues: [
            'Start at the vessel that feeds the loop.',
            'Follow the limb whose wall lets water leave.',
            'Now name the two limbs whose filtrate flows in opposite directions.',
          ],
          missingRoleOrTarget: 'the countercurrent multiplier',
          expertCompletion: 'The descending limb loses water; the ascending limb pumps solute.',
        },
        palaceTheme: 'Childhood Home',
        palaceRooms: [
          {
            roomName: 'Kitchen Kettle',
            locusNumber: 1,
            itemPlaced: 'The 1,200 mOsm hairpin',
            vividSensoryHook: 'The kettle screams its mOsm reading at you.',
          },
        ],
      },
    }),
    makeActivity({
      id: 'tpl-2',
      stageNumber: 2,
      title: 'Separate Multiplication from Exchange',
      templateType: 'analogy_matrix',
      scaffold: {
        field1Label: 'Familiar Side',
        field1Placeholder: P2_FIELD1,
        field2Label: 'Target Side',
        field2Placeholder: P2_FIELD2,
        exampleAnswer: 'A staircase that keeps getting steeper.',
      },
      visualData: {
        sourceDomainName: 'Watering a terraced garden',
        targetDomainName: 'Countercurrent multiplication',
        analogyMappings: [
          {
            sourceElement: 'Each terrace holds water higher up',
            targetElement: 'Each loop level holds a steeper gradient',
          },
        ],
        whereAnalogyBreaks: 'A garden loses water downhill; the loop is a closed countercurrent system.',
      },
    }),
  ],
  researchContexts: [],
};

test.describe('Stage template dispatch', () => {
  test('each stage draws the visual its template names, never the fallback', async ({ page }) => {
    await mockAiApis(page);
    // The mocked encoder returns this two-stage workout instead of the default.
    await page.route(ENCODE_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WORKOUT) })
    );

    await startEncodeFromNotes(page, 'Loop of Henle: countercurrent multiplication and exchange.');
    await confirmReadiness(page);
    await expectStage(page, 1);

    // Stage 1 is a memory palace, drawn by MemoryPalaceVisual.
    await expect(page.getByText(PALACE_CHROME, { exact: true })).toBeVisible();
    await expect(page.getByText(PALACE_TITLE)).toBeVisible();
    await expect(page.getByText('Kitchen Kettle', { exact: true })).toBeVisible();
    // Not the first-principles chart: that is what a dead dispatch renders.
    await expect(page.getByText(FIRST_PRINCIPLES_TITLE)).toHaveCount(0);

    await page.getByPlaceholder(P1_FIELD1).fill('The kitchen, where the kettle lives.');
    await page.getByPlaceholder(P1_FIELD2).fill('A kettle screaming its salt reading at me.');
    await page.getByRole('button', { name: 'Check' }).click();
    await page.getByRole('button', { name: 'NEXT →' }).click();

    // Stage 2 is an analogy matrix, drawn by AnalogyMatrixVisual.
    await expectStage(page, 2);
    await expect(page.getByText(ANALOGY_CHROME, { exact: true })).toBeVisible();
    await expect(page.getByText(ANALOGY_TITLE)).toBeVisible();
    // The analogy matrix's own two-sided mapping row, drawn from the stage payload.
    await expect(page.getByText('Familiar Source Anchor').first()).toBeVisible();
    await expect(page.getByText('Target Science Concept').first()).toBeVisible();
    await expect(page.getByText(FIRST_PRINCIPLES_TITLE)).toHaveCount(0);
  });

  test('the clue ladder hands over one rung at a time and never reveals the answer', async ({ page }) => {
    await mockAiApis(page);
    await page.route(ENCODE_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WORKOUT) })
    );

    await startEncodeFromNotes(page, 'Loop of Henle: countercurrent multiplication and exchange.');
    await confirmReadiness(page);
    await expectStage(page, 1);

    const clueButton = page.getByTestId('clue-ladder-button');
    // Nothing is given away up front: a hint the learner never asked for
    // replaces their recall attempt instead of rescuing it.
    await expect(page.getByTestId('clue-rung-1')).toHaveCount(0);

    await clueButton.click();
    await expect(page.getByTestId('clue-rung-1')).toBeVisible();
    await expect(page.getByTestId('clue-rung-2')).toHaveCount(0);

    await clueButton.click();
    await expect(page.getByTestId('clue-rung-2')).toBeVisible();
    await expect(page.getByTestId('clue-rung-3')).toHaveCount(0);

    // The last click is the end of the ladder. It stops at the strongest
    // scaffold and says so rather than revealing the answer, because a
    // revealed answer ends the attempt and the attempt is what encodes.
    await clueButton.click();
    await expect(page.getByTestId('clue-rung-3')).toBeVisible();
    await expect(page.getByTestId('clue-ladder-no-answer')).toBeVisible();
    await expect(clueButton).toBeDisabled();
  });
});
