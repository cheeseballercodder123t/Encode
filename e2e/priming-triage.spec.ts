import { test, expect } from '@playwright/test';
import { MOCK_NOTES, TRIAGE_NOTE } from './helpers/fixtures';
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
 * - Priming warm-ups: one committed prediction (shape, density source, units or
 *   an extreme case) before the formula is trusted. Committing to the trap is
 *   the point; the rule then goes straight into the stage answer.
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

test.describe('Priming warm-up', () => {
  test('commits to a prediction, flags the trap, and sends the rule to the answer', async ({
    page,
  }) => {
    await mockAiApis(page);
    await startEncodeFromNotes(page, MOCK_NOTES);
    await confirmReadiness(page);
    await expectStage(page, 1);

    await page.getByRole('button', { name: 'Prime off' }).click();
    await expect(page.getByText('Priming warm-up')).toBeVisible();

    await page.getByTestId('prime-build').click();

    // The examiner chose the extremal archetype and staged the real system.
    await expect(page.getByText('Extremal check').first()).toBeVisible();
    await expect(
      page.getByText('Poiseuille flow through a vessel of radius r at a fixed pressure gradient.')
    ).toBeVisible();
    await expect(
      page.getByText('What must happen to the flow Q as the fluid viscosity tends to infinity?')
    ).toBeVisible();

    // Option B is the planted misconception, not the truth.
    await page.getByTestId('prime-choice-1').click();
    const verdict = page.getByTestId('prime-verdict');
    await expect(verdict).toContainText('That is the trap.');
    await expect(verdict).toContainText('Viscosity feels like a property of the fluid');
    await expect(verdict).toContainText('viscosity can only live under the line');

    await page.getByTestId('prime-adopt').click();
    await expect(page.getByPlaceholder('STAGE1_FIELD2')).toHaveValue(
      /doubling the radius multiplies flow 16x/
    );
  });
});
