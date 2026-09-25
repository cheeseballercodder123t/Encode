import { test, expect, type Page } from '@playwright/test';
import {
  MOCK_NOTES,
  TRIAGE_NOTE,
  PRIMING_EXTREMUM_RESPONSE,
  PRIMING_GRADIENT_RESPONSE,
  PRIMING_DIMENSIONAL_RESPONSE,
  PRIMING_SHAPE_RESPONSE,
} from './helpers/fixtures';
import {
  mockAiApis,
  startEncodeFromNotes,
  confirmReadiness,
  expectStage,
} from './helpers/mocks';

/**
 * Two friction cuts that happen before and during encoding:
 *
 * - Fluff Guillotine: the source is heatmapped into causal kernels, supporting
 *   evidence and syntactic noise, and the noise can be cut in one tap — so the
 *   encoder only ever sees the dense core.
 * - Priming warm-ups: commit to a qualitative prediction before the formula is
 *   trusted. The archetype is selectable, and each one is as long as the physics
 *   says: a 3-probe extremal sweep, a 2-probe source→sink check, a single unit
 *   puzzle, or the shape drill where you DRAW the curve before it is named.
 *   Committing to the trap is the point; the rule then goes into the stage answer.
 */

test.describe('Fluff Guillotine (pre-encoding semantic triage)', () => {
  test('heatmaps the source, flips a verdict, and strips the noise out of the notes', async ({
    page,
  }) => {
    await mockAiApis(page);
    await page.goto('/');

    const notesBox = page.getByPlaceholder(/Paste study material/);
    await notesBox.fill(TRIAGE_NOTE);

    await page.getByRole('button', { name: 'Strip noise' }).click();

    // The heatmap renders one verdict per unit, plus the examiner's summary.
    await expect(page.getByText('Fluff Guillotine')).toBeVisible();
    await expect(page.getByText('Half of this note is administrative preamble.')).toBeVisible();
    await expect(page.getByTestId('triage-unit-0')).toContainText('Causal kernel');
    await expect(page.getByTestId('triage-unit-1')).toContainText('Syntactic noise');
    await expect(page.getByTestId('triage-unit-1')).toContainText('administrative preamble');

    // Clicking a noise block restores it: the cut is always reversible.
    await page.getByTestId('triage-unit-1').click();
    await expect(page.getByRole('button', { name: 'Nothing to strip' })).toBeVisible();
    await page.getByTestId('triage-unit-1').click();
    await expect(page.getByRole('button', { name: 'Strip 1 noise block' })).toBeVisible();

    await page.getByTestId('guillotine-strip').click();

    // Only the causal core survives into the launchpad.
    await expect(notesBox).toHaveValue(/Sodium influx drives the membrane across threshold\./);
    await expect(notesBox).not.toHaveValue(/syllabus/);
  });
});

/** Opens the priming panel on stage 1 of the mocked workout. */
async function primeStage(page: Page) {
  await mockAiApis(page);
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);
  await page.getByRole('button', { name: 'Prime off' }).click();
  await expect(page.getByText('Priming warm-up')).toBeVisible();
}

test.describe('Priming warm-up', () => {
  test('an extremal sweep asks each extreme in turn and names the one you missed', async ({
    page,
  }) => {
    await primeStage(page);

    await page.getByTestId('prime-build').click();

    // The examiner's own archetype: three probes, one per extreme.
    await expect(page.getByText('Extremal check').first()).toBeVisible();
    await expect(page.getByTestId('prime-progress')).toContainText('probe 1 / 3');
    await expect(page.getByText(PRIMING_EXTREMUM_RESPONSE.steps[0].prompt)).toBeVisible();

    // Probe 1 · double the radius. "Flow doubles" is the linear extrapolation.
    await page.getByTestId('prime-choice-1').click();
    const verdict = page.getByTestId('prime-verdict');
    await expect(verdict).toContainText('That is the trap.');
    await expect(verdict).toContainText('scale with the pipe');
    await page.getByTestId('prime-next').click();

    // Probe 2 is a different extreme, not a restatement of probe 1.
    await expect(page.getByTestId('prime-progress')).toContainText('probe 2 / 3');
    await expect(page.getByText(PRIMING_EXTREMUM_RESPONSE.steps[1].prompt)).toBeVisible();
    await page.getByTestId('prime-choice-0').click();
    await page.getByTestId('prime-next').click();

    // Probe 3 · the length going to zero, which pins L as a numerator term.
    await expect(page.getByTestId('prime-progress')).toContainText('probe 3 / 3');
    await expect(page.getByText(PRIMING_EXTREMUM_RESPONSE.steps[2].prompt)).toBeVisible();
    await page.getByTestId('prime-choice-0').click();
    await page.getByTestId('prime-next').click();

    // Two of three were forced from first principles; the miss is in the tally.
    const summary = page.getByTestId('prime-summary');
    await expect(summary).toContainText('2/3 forced by the physics');
    await expect(summary).toContainText('1 trap');

    await page.getByTestId('prime-adopt').click();
    await expect(page.getByPlaceholder('STAGE1_FIELD2')).toHaveValue(
      /doubling the radius multiplies flow 16x/
    );
  });

  test('selecting the source→sink archetype runs the two-step polarity check', async ({ page }) => {
    await primeStage(page);

    // The learner demands the drill instead of taking the examiner's pick; the
    // mock serves whatever archetype was actually requested, so a wrong
    // archetype here would fail on the payload shape below.
    await page.getByTestId('prime-kind-gradient').click();
    await expect(page.getByTestId('prime-kind-gradient')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('prime-build').click();

    await expect(page.getByText('Source → sink').first()).toBeVisible();
    await expect(
      page.getByText('Nucleophilic attack on the carbonyl carbon of an acyl chloride.')
    ).toBeVisible();

    // Exactly two commitments: the density source, then the electron-poor sink.
    await expect(page.getByTestId('prime-progress')).toContainText('probe 1 / 2');
    await expect(page.getByText(PRIMING_GRADIENT_RESPONSE.steps[0].prompt)).toBeVisible();
    await page.getByTestId('prime-choice-0').click();
    await page.getByTestId('prime-next').click();

    await expect(page.getByTestId('prime-progress')).toContainText('probe 2 / 2');
    await expect(page.getByText(PRIMING_GRADIENT_RESPONSE.steps[1].prompt)).toBeVisible();
    await page.getByTestId('prime-choice-0').click();
    await page.getByTestId('prime-next').click();

    await expect(page.getByTestId('prime-summary')).toContainText('2/2 forced by the physics');
  });

  test('the unit puzzle stays a single probe and shows no counter', async ({ page }) => {
    await primeStage(page);

    await page.getByTestId('prime-kind-dimensional').click();
    await page.getByTestId('prime-build').click();

    await expect(page.getByText('Unit puzzle').first()).toBeVisible();
    await expect(page.getByText(PRIMING_DIMENSIONAL_RESPONSE.steps[0].prompt)).toBeVisible();
    // One commitment is a question, not a sequence.
    await expect(page.getByTestId('prime-progress')).toHaveCount(0);

    await page.getByTestId('prime-choice-1').click();
    await expect(page.getByTestId('prime-verdict')).toContainText('scale with speed');
    await page.getByTestId('prime-next').click();

    await expect(page.getByTestId('prime-summary')).toContainText('0/1 forced by the physics');
  });

  test('the shape drill makes you draw the curve before the shape is named', async ({ page }) => {
    await primeStage(page);

    await page.getByTestId('prime-kind-shape').click();
    await page.getByTestId('prime-build').click();

    // The canvas replaces the question: the hand commits before the algebra.
    const sketch = page.getByTestId('prime-sketch');
    await expect(sketch).toBeVisible();
    await expect(sketch).toContainText(PRIMING_SHAPE_RESPONSE.sketch.prompt);
    await expect(sketch).toContainText(PRIMING_SHAPE_RESPONSE.sketch.axes);
    // Neither the probe nor the expected shape is on screen yet.
    await expect(page.getByTestId('prime-choice-0')).toHaveCount(0);
    await expect(page.getByText(PRIMING_SHAPE_RESPONSE.sketch.shapeLabel)).toHaveCount(0);

    await page.getByTestId('prime-sketch-commit').click();

    await expect(page.getByText(PRIMING_SHAPE_RESPONSE.steps[0].prompt)).toBeVisible();
    await page.getByTestId('prime-choice-0').click();
    await page.getByTestId('prime-next').click();

    // The drawing is now compared against the shape it had to have.
    await expect(page.getByTestId('prime-shape-reveal')).toContainText(
      PRIMING_SHAPE_RESPONSE.sketch.shapeLabel
    );
    await expect(page.getByTestId('prime-shape-reveal')).toContainText(
      PRIMING_SHAPE_RESPONSE.sketch.shapeHint
    );
    await expect(page.getByTestId('prime-summary')).toContainText('1/1 forced by the physics');
  });
});
