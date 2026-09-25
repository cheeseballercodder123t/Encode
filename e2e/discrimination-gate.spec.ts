import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES, GATE_ENCODE_RESPONSE, DISCRIMINATION_RESPONSE } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * The 10-second discrimination gate in front of every export path.
 *
 * Cards fail in review because a neighbour answers for them, and self-graded
 * review cannot see that. These tests drive the real modal: the gate has to
 * appear before the download, the clock has to run, a miss has to be reported as
 * unstable, and the learner's own rule has to come back as a card that leads the
 * deck.
 */

async function sessionWithPair(page: Page) {
  await mockAiApis(page);
  await page.route('**/api/encode', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(GATE_ENCODE_RESPONSE),
    })
  );
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);
  await page.getByPlaceholder('STAGE1_FIELD1_PLACEHOLDER').fill('Threshold opens the Na+ gates.');
  await page.getByPlaceholder('STAGE1_FIELD2_PLACEHOLDER').fill('Na+ conductance leads the rise.');
  await page.locator('button[title^="Export .apkg Anki package"]').click();
  await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
}

test.describe('10-second discrimination gate', () => {
  test('blocks the export until both blind vignettes are classified', async ({ page }) => {
    await sessionWithPair(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download .apkg Package/ }).click();

    // The gate opens in front of the export, quoting both sides of the pair.
    await expect(page.getByTestId('discrimination-gate')).toBeVisible();
    await expect(page.getByText('Depolarisation vs Repolarisation')).toBeVisible();
    await expect(page.getByTestId('discrimination-clock')).toContainText('question 1 of 2');

    // Figuring out which vignette is which must be immediate: classify both.
    // The vignettes never name either label — only the observables differ.
    const [conceptVignette, lookalikeVignette] = DISCRIMINATION_RESPONSE.questions;
    await expect(page.getByText(conceptVignette.vignette)).toBeVisible();
    await expect(page.getByText(lookalikeVignette.vignette)).toHaveCount(0);
    await page.getByTestId('discrimination-concept').click();

    await expect(page.getByTestId('discrimination-clock')).toContainText('question 2 of 2');
    await expect(page.getByText(lookalikeVignette.vignette)).toBeVisible();
    await page.getByTestId('discrimination-lookalike').click();

    await expect(page.getByTestId('discrimination-verdict')).toContainText('Both separated, on the clock.');
    await expect(page.getByTestId('discrimination-verdict')).toContainText('2/2 separated');

    await page.getByTestId('discrimination-continue').click();
    await download;

    // Passed once this session: the deck is not unstable and export unlocked.
    await expect(page.getByTestId('discrimination-passed')).toBeVisible();
    await expect(page.getByTestId('discrimination-flag')).toHaveCount(0);
  });

  test('a miss flags the pair unstable and turns the rule into a leading card', async ({ page }) => {
    await sessionWithPair(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download .apkg Package/ }).click();
    await expect(page.getByTestId('discrimination-gate')).toBeVisible();

    // Confuse the two: classify the depolarisation vignette as the lookalike.
    await page.getByTestId('discrimination-lookalike').click();
    await page.getByTestId('discrimination-lookalike').click();

    const verdict = page.getByTestId('discrimination-verdict');
    await expect(verdict).toContainText('flagged unstable');
    await expect(verdict).toContainText('confused');

    // The rule is what unlocks the export, and it is saved as a trap card.
    const saveRule = page.getByTestId('discrimination-save-rule');
    await expect(saveRule).toBeDisabled();
    await page
      .getByTestId('discrimination-rule-input')
      .fill('Follow the sign of dV/dt, not the absolute voltage.');
    await saveRule.click();
    await download;

    await expect(page.getByTestId('discrimination-flag')).toContainText('DiscriminationUnstable');

    // Reopening the deck proves the rule became a card that leads it.
    await page.getByRole('button', { name: '[ X ]' }).click();
    await page.locator('button[title^="Export .apkg Anki package"]').click();
    await expect(page.getByText(DISCRIMINATION_RESPONSE.cardFront)).toBeVisible();
  });

  test('running out of the 10-second clock counts as unstable, not as a guess', async ({ page }) => {
    await sessionWithPair(page);

    await page.getByRole('button', { name: /Download .apkg Package/ }).click();
    await expect(page.getByTestId('discrimination-gate')).toBeVisible();

    // Deliberate deliberation: let the clock expire on the first vignette.
    await expect(page.getByTestId('discrimination-clock')).toContainText('question 1 of 2');
    await expect(page.getByTestId('discrimination-clock')).toContainText('question 2 of 2', {
      timeout: 15_000,
    });

    // The question it timed out on is recorded as a timeout, with its tell.
    await page.getByTestId('discrimination-concept').click();
    const verdict = page.getByTestId('discrimination-verdict');
    await expect(verdict).toContainText('flagged unstable');
    await expect(verdict).toContainText('[ TIMEOUT ]');
    await expect(verdict).toContainText('10s clock');

    // The honest escape exists, and it is explicitly flagged rather than silent.
    await page.getByTestId('discrimination-export-anyway').click();
    await expect(page.getByTestId('discrimination-flag')).toBeVisible();
  });
});
