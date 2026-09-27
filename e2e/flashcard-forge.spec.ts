import { test, expect, type Page } from '@playwright/test';
import {
  FORGE_CONFLICT_RESPONSE,
  FORGE_MEDIA_RESPONSE,
  FORGE_RESPONSE,
} from './helpers/fixtures';
import { mockAiApis } from './helpers/mocks';

/**
 * Flashcards Only: the path for when you do not want a workout.
 *
 * Every other entry point teaches first. This one takes many sources (notes,
 * PDFs, YouTube lectures, a lecture recording), merges them into one deduped
 * deck, and hands that deck to the export surface the learner picked — with no
 * stages, no paradoxes and no examiner anywhere in the loop.
 *
 * The four things a REPEAT ingest needs are covered here too: a video with no
 * captions is transcribed instead of dropped, two sources that disagree become
 * one explicit conflict card, cards the topic already exported are counted as
 * such, and the whole setup can be saved and re-run as a recipe.
 */

async function mockForge(page: Page, payload: unknown = FORGE_RESPONSE) {
  await mockAiApis(page);
  await page.route('**/api/forge', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  );
}

/** Launchpad -> Forge, ready for sources to be added. */
async function openForge(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /flashcards only/i }).click();
  await expect(page.getByText('Flashcard Forge · no encoding')).toBeVisible();
}

async function addTextSource(page: Page, text: string) {
  await page.getByPlaceholder(/Paste a topic's notes/).fill(text);
  await page.getByRole('button', { name: /add text source/i }).click();
}

/** Launchpad -> Forge -> two sources (notes + a lecture) -> deck forged. */
async function forgeDeck(page: Page) {
  await openForge(page);
  await addTextSource(page, 'Loop of Henle countercurrent multiplication.');

  await page.getByPlaceholder('https://www.youtube.com/watch?v=…').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: /add videos/i }).click();

  await expect(page.getByText('Sources (2/12)')).toBeVisible();
  await page.getByTestId('forge-run').click();
  await expect(page.getByTestId('forge-result')).toBeVisible();
}

test.describe('Flashcards Only (the Forge)', () => {
  test('a video without captions is transcribed instead of dropped', async ({ page }) => {
    await mockForge(page, FORGE_MEDIA_RESPONSE);
    await openForge(page);

    // A lecture recording is a source like any other: the server transcribes
    // it, which is the half of the feature that always works.
    await page.getByLabel('Add source files').setInputFiles({
      name: 'lecture-recording.m4a',
      mimeType: 'audio/mp4',
      buffer: Buffer.from('not really audio, but the route is mocked'),
    });
    await expect(page.getByText('[ AUDIO ]')).toBeVisible();
    await expect(page.getByText('transcribed', { exact: true })).toBeVisible();

    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    // The log names the provenance instead of leaving you to guess.
    await expect(page.getByText('[ OK ] lecture-recording.m4a')).toBeVisible();
    await expect(page.getByText('transcribed from the uploaded recording')).toBeVisible();
  });

  test('sources that disagree ship one conflict card instead of quietly picking one', async ({ page }) => {
    await mockForge(page, FORGE_CONFLICT_RESPONSE);
    await openForge(page);
    await addTextSource(page, 'The half-life of the drug is 4 h.');
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    // Both claims are quoted with the source that made them.
    const conflicts = page.getByTestId('forge-conflicts');
    await expect(conflicts).toBeVisible();
    await expect(conflicts).toContainText('1 source conflict');
    await expect(conflicts).toContainText('different quantity · 4 h vs 6 h');
    await expect(conflicts).toContainText('The half-life of the drug is 4 h. — Lecture 4 slides');
    await expect(conflicts).toContainText('The half-life of the drug is 6 h. — handout.pdf');

    // The deck carries ONE card, and it is the conflict.
    await expect(page.getByText('1 facts · 0 mechanisms · 0 drills · 0 examples')).toBeVisible();
    await expect(page.getByText('1 claim merged into a conflict card').first()).toBeVisible();
  });

  test('a re-forge says what is already in the deck and can ship only the new cards', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // Exporting is what makes the deck "yours": it is remembered from here on.
    await page.getByTestId('forge-export-primary').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    await page.getByRole('button', { name: /close export modal/i }).click();

    // Next Monday: same sources, same deck, nothing new in it.
    await openForge(page);
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    const memory = page.getByTestId('forge-memory');
    await expect(memory).toContainText('0 new · 5 already in your deck');
    await expect(page.getByTestId('forge-skip-known')).toContainText('SHIPPING NEW CARDS ONLY');
    // Nothing new to ship: the export is held until the learner says otherwise.
    await expect(page.getByTestId('forge-export-primary')).toBeDisabled();

    await page.getByTestId('forge-skip-known').click();
    await expect(page.getByTestId('forge-skip-known')).toContainText('SHIPPING THE WHOLE DECK');
    await expect(page.getByTestId('forge-export-primary')).toBeEnabled();
  });

  test('a saved recipe re-runs the whole setup, and survives a reload', async ({ page }) => {
    await mockForge(page);
    await openForge(page);
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByRole('button', { name: /^\[ REMNOTE \]/ }).click();

    await page.getByTestId('forge-recipes-toggle').click();
    await page.getByLabel('Recipe name').fill('Monday lectures');
    await page.getByTestId('forge-save-recipe').click();
    await expect(page.getByTestId('forge-recipes')).toContainText('Saved "Monday lectures"');
    await expect(page.getByTestId('forge-recipe-recipe-monday-lectures')).toContainText('REMNOTE');

    // Throw the setup away, then run the recipe: sources, sections and target
    // all come back, and it forges immediately.
    await page.getByRole('button', { name: /Remove source Loop of Henle/ }).click();
    await expect(page.getByText('Sources (0/12)')).toBeVisible();
    await page.getByTestId('forge-run-recipe-recipe-monday-lectures').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();
    await expect(page.getByTestId('forge-export-primary')).toContainText('EXPORT TO REMNOTE');

    // And it is still there after a reload.
    await page.reload();
    await openForge(page);
    await page.getByTestId('forge-recipes-toggle').click();
    await expect(page.getByTestId('forge-recipe-recipe-monday-lectures')).toContainText('Monday lectures');
  });

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
    await openForge(page);
    await addTextSource(page, 'Anything at all.');
    await addTextSource(page, 'A second passage that still has no video captions.');
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
    await openForge(page);

    // The target is chosen before forging; the result panel then offers both
    // surfaces regardless.
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
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
