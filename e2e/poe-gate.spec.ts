import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis } from './helpers/mocks';

/**
 * Predict–Observe–Explain gate.
 *
 * The learner commits to a confidence tier and a concrete prediction BEFORE
 * seeing the truth. Getting it wrong while "betting your life" is the
 * Hypercorrection Effect — the strongest encoding signal available — so that
 * case is hazard-red, forces a one-sentence explanation of the physical flaw,
 * and is captured as an interference trap card that ships at the front of the
 * Anki deck.
 */

test.describe('Blind prediction gate', () => {
  test('welcomes a confident wrong answer with a hypercorrection sting and a trap card', async ({
    page,
  }) => {
    await mockAiApis(page);
    await page.goto('/');
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: /Pre-test drill/ }).click();

    await expect(page.getByText(/Blind Prediction Gate/)).toBeVisible();
    await expect(page.getByText('How confident are you?')).toBeVisible();
    // Nothing is revealed before committing.
    await expect(page.getByText(/fourth power of radius/)).not.toBeVisible();

    // Commit: bet your life, then click the intuitive (wrong) prediction.
    await page.getByTestId('tier-pq-1-bet').click();
    await page.getByTestId('option-pq-1-b').click();

    await expect(page.getByText(/\[ HYPERCORRECTION \] You bet your life and it was the trap/)).toBeVisible();
    await expect(page.getByText(/fourth power of radius/)).toBeVisible();
    await expect(page.getByText(/Why the trap feels true/)).toBeVisible();

    // The forced explanation is required before the card can be saved.
    const saveButton = page.getByTestId('save-trap-pq-1');
    await expect(saveButton).toBeDisabled();
    await page.getByTestId('flaw-pq-1').fill('Resistance falls with the fourth power of radius.');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByRole('button', { name: 'Trap card saved' })).toBeVisible();

    // Close the gate and open the exporter: the trap leads the deck. This is the
    // end-to-end proof that the store feeds the export funnel.
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.locator('button[title^="Export .apkg Anki package"]').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    await expect(page.getByText('1 Flashcards')).toBeVisible();
    await expect(page.getByText('InterferenceTrap')).toBeVisible();
    await expect(
      page.getByText(/Why does doubling a vessel radius raise flow 16x rather than 4x\?/)
    ).toBeVisible();
  });

  test('a right call is rewarded instead of punished', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');
    await page.getByPlaceholder(/Paste study material/).fill(MOCK_NOTES);
    await page.getByRole('button', { name: /Pre-test drill/ }).click();

    await page.getByTestId('tier-pq-1-half').click();
    await page.getByTestId('option-pq-1-c').click();

    await expect(page.getByText(/\[ OK \] Called it/)).toBeVisible();
    await expect(page.getByText(/HYPERCORRECTION/)).not.toBeVisible();
    await expect(page.getByText(/1 of 1 predictions committed/)).toBeVisible();
  });
});
