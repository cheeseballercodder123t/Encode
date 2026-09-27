import { test, expect, type Page } from '@playwright/test';
import { FORGE_RESPONSE } from './helpers/fixtures';
import { mockAiApis } from './helpers/mocks';

/**
 * Flashcards Only: the path for when you do not want a workout.
 *
 * Every other entry point teaches first. This one takes many sources (notes,
 * PDFs, YouTube lectures), merges them into one deduped deck, and hands that
 * deck to the export surface the learner picked — with no stages, no paradoxes
 * and no examiner anywhere in the loop.
 */

async function mockForge(page: Page) {
  await mockAiApis(page);
  await page.route('**/api/forge', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FORGE_RESPONSE),
    })
  );
}

/** Launchpad -> Forge -> two sources (notes + a lecture) -> deck forged. */
async function forgeDeck(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /flashcards only/i }).click();
  await expect(page.getByText('Flashcard Forge · no encoding')).toBeVisible();

  await page.getByPlaceholder(/Paste a topic's notes/).fill('Loop of Henle countercurrent multiplication.');
  await page.getByRole('button', { name: /add text source/i }).click();

  await page.getByPlaceholder('https://www.youtube.com/watch?v=…').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: /add videos/i }).click();

  await expect(page.getByText('Sources (2/12)')).toBeVisible();
  await page.getByTestId('forge-run').click();
  await expect(page.getByTestId('forge-result')).toBeVisible();
}

test.describe('Flashcards Only (the Forge)', () => {
  test('skips encoding entirely: many sources in, one deduped deck out', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // Every source is accounted for, including what the merge dropped.
    await expect(page.getByText(/5 cards forged · 4 duplicates dropped/)).toBeVisible();
    await expect(page.getByText('2 facts · 1 mechanisms · 1 drills · 1 examples')).toBeVisible();
    await expect(page.getByText('Lecture 4 slides')).toBeVisible();
    await expect(page.getByText('youtube:renal')).toBeVisible();

    // No encoding happened anywhere: the session never left the input view, so
    // there is no stage counter and the launchpad is still the screen behind.
    await expect(page.getByText('01/02')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /build cognitive schema/i })).toBeVisible();
  });

  test('a source with no captions is reported instead of inventing cards', async ({ page }) => {
    await mockForge(page);
    await page.goto('/');
    await page.getByRole('button', { name: /flashcards only/i }).click();

    await page.getByPlaceholder(/Paste a topic's notes/).fill('Anything at all.');
    await page.getByRole('button', { name: /add text source/i }).click();
    await page.getByPlaceholder(/Paste a topic's notes/).fill('A second passage that still has no video captions.');
    await page.getByRole('button', { name: /add text source/i }).click();
    await expect(page.getByText('Sources (2/12)')).toBeVisible();
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    // The fixture's YouTube source failed: the deck still ships, and the log
    // says exactly why that one source contributed nothing.
    await expect(page.getByText('[ ! ] youtube:renal')).toBeVisible();
  });

  test('the chosen export target opens with the forged deck', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // Default target is Anki, so the primary action is the Anki export.
    await expect(page.getByTestId('forge-export-primary')).toContainText('EXPORT TO ANKI');
    await page.getByTestId('forge-export-primary').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    // Deck name and cards come from the merged report, not from a schema.
    await expect(page.locator('input[type="text"]').first()).toHaveValue('DeepEncode::Renal_Physiology');
    await expect(page.getByText('1,200 mOsm').first()).toBeVisible();
  });

  test('the RemNote target renders the forged cards as RemNote cards', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // The secondary surface is always one click away too.
    await page.getByTestId('forge-open-remnote').click();
    await expect(page.getByText('RemNote Hierarchical & Feynman Engine')).toBeVisible();
    await expect(page.getByText('Deconstruction: Renal Physiology')).toBeVisible();

    // The cloze fact survives as a RemNote cloze card (its deletion intact).
    await page.getByRole('button', { name: /RemNote Markdown/i }).click();
    const markdown = page.locator('textarea[readonly]');
    await expect(markdown).toContainText('The loop of Henle reaches {{1,200 mOsm}} at the hairpin.');
    await expect(markdown).toContainText('Countercurrent multiplication ::');
  });

  test('target BOTH stacks RemNote behind Anki instead of opening two modals', async ({ page }) => {
    await mockForge(page);
    await page.goto('/');
    await page.getByRole('button', { name: /flashcards only/i }).click();

    // The target is chosen before forging; the result panel then offers both
    // surfaces regardless.
    await page.getByPlaceholder(/Paste a topic's notes/).fill('Loop of Henle countercurrent multiplication.');
    await page.getByRole('button', { name: /add text source/i }).click();
    await page.getByRole('button', { name: 'BOTH' }).click();
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    await expect(page.getByTestId('forge-export-primary')).toContainText('ANKI, THEN REMNOTE');
    await page.getByTestId('forge-export-primary').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    // RemNote is queued, not stacked on top of the Anki modal.
    await expect(page.getByText('RemNote Hierarchical & Feynman Engine')).toHaveCount(0);

    await page.getByRole('button', { name: /close export modal/i }).click();
    await expect(page.getByText('RemNote Hierarchical & Feynman Engine')).toBeVisible();
  });
});
