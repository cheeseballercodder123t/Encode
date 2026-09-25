import { test, expect } from '@playwright/test';
import { MOCK_NOTES, SEQUENCE_RESPONSE } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * Scrambled causal ordering (Parsons problem).
 *
 * Zero typing: every step is on screen, in the wrong order, and the learner has
 * to reconstruct the order the physics forces. The drill never receives the
 * canonical order as visible DOM — it is graded positionally — and the chain
 * only lands in the stage answer once it is right.
 */

const canonical = SEQUENCE_RESPONSE.steps.map((s) => s.text);

async function openDrill(page: import('@playwright/test').Page) {
  await mockAiApis(page);
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);

  await page.getByRole('button', { name: 'Order the chain off' }).click();
  await page.getByTestId('sequence-build').click();
  await expect(page.getByText('Action Potential Chain')).toBeVisible();
  await expect(page.getByTestId('sequence-pool')).toContainText('Unplaced steps');
}

/** Click the tile whose text matches, wherever it currently sits in the pool. */
async function tapTile(page: import('@playwright/test').Page, text: string) {
  const pool = page.getByTestId('sequence-pool');
  await pool.locator(`button:has-text("${text}")`).first().click();
}

test.describe('Scrambled causal order', () => {
  test('grades the chain positionally and names the broken link', async ({ page }) => {
    await openDrill(page);

    // Deliberately wrong order: the last two steps swapped.
    await tapTile(page, canonical[0]);
    await tapTile(page, canonical[1]);
    await tapTile(page, canonical[3]);
    await tapTile(page, canonical[2]);

    await page.getByTestId('sequence-check').click();

    const verdict = page.getByTestId('sequence-verdict');
    await expect(verdict).toContainText('2 of 4 links in place.');
    await expect(verdict).toContainText('must come after');
    // The two misplaced slots are flagged rather than the whole chain failing.
    await expect(page.getByTestId('sequence-slot-3')).toContainText('[ wrong link ]');

    // The pivot rule is what goes on the card when the link is missing.
    await expect(page.getByText(/Examiner's necessity/)).toBeVisible();
    await page.getByTestId('sequence-rule-input').fill('The field moves S4 before any pore can open.');
    await page.getByRole('button', { name: 'Add to answer' }).click();
    await expect(page.getByPlaceholder('STAGE1_FIELD2')).toHaveValue(
      /The field moves S4 before any pore can open\./
    );
  });

  test('locks a correct chain onto the card', async ({ page }) => {
    await openDrill(page);

    for (const text of canonical) await tapTile(page, text);
    await page.getByTestId('sequence-check').click();

    await expect(page.getByTestId('sequence-verdict')).toContainText('Chain locked.');
    await expect(page.getByTestId('sequence-verdict')).toContainText(
      'Threshold opens the gates, influx spikes the voltage, K+ resets it.'
    );

    await page.getByTestId('sequence-adopt').click();
    // The canonical chain lands in the mechanism answer, numbered.
    await expect(page.getByPlaceholder('STAGE1_FIELD2')).toHaveValue(/1\) The membrane crosses -55 mV\./);
  });
});
