import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES, FRAME_ENCODE_RESPONSE } from './helpers/fixtures';
import { mockAiApis, confirmReadiness, startEncodeFromNotes, expectStage } from './helpers/mocks';

/**
 * Two scaffold surfaces that make the learner produce the missing link:
 *
 *  - Causal Mad-Libs: the examiner's own sentence template with blanks, instead
 *    of three unrelated answer boxes.
 *  - Interactive diagram completion: one node of the visual chain is deleted and
 *    has to be filled before the diagram shows it.
 *
 * Both write into the SAME field1/field2/field3 the examiner grades and the
 * exporter ships, so nothing here is a decorative side channel.
 */

async function encodeFrameStage(page: Page) {
  await mockAiApis(page);
  // The mocked encoder returns a stage carrying both surfaces.
  await page.route('**/api/encode', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FRAME_ENCODE_RESPONSE),
    })
  );
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);
}

test.describe('Causal Mad-Libs sentence scaffold', () => {
  test('renders the examiner sentence with blanks and writes into the stage fields', async ({ page }) => {
    await encodeFrameStage(page);

    const sentence = page.getByTestId('causal-sentence');
    await expect(sentence).toBeVisible();
    await expect(sentence).toContainText('When');
    await expect(sentence).toContainText('is physically forced');
    // The boundary contrast travels with the sentence as a read-only clause.
    await expect(page.getByText('Na+ channels inactivate; they do not simply close.')).toBeVisible();

    await page.getByTestId('causal-slot-field1').fill('the membrane crosses -55mV');
    await page.getByTestId('causal-slot-field2').fill('S4 segments are pulled outward');
    await page.getByTestId('causal-slot-field3').fill('the pore opens');

    // The blanks ARE field1/field2/field3: switching to boxes keeps every word.
    await page.getByRole('button', { name: 'Sentence scaffold' }).click();
    await expect(page.getByPlaceholder('FRAME_FIELD1')).toHaveValue('the membrane crosses -55mV');
    await expect(page.getByPlaceholder('FRAME_FIELD2')).toHaveValue('S4 segments are pulled outward');
    await expect(page.getByPlaceholder('FRAME_FIELD3')).toHaveValue('the pore opens');
  });
});

test.describe('Interactive diagram completion', () => {
  test('blanks one node of the chain and rejects a shallow answer', async ({ page }) => {
    await encodeFrameStage(page);

    await expect(page.getByTestId('diagram-blank')).toBeVisible();
    await expect(page.getByTestId('diagram-blank')).toContainText('Threshold is crossed → ? → The pore opens');
    // The blanked node's own label is NOT on screen — that is the exercise.
    await expect(page.getByText('S4 segments swing outward')).toHaveCount(0);

    await page.getByTestId('diagram-blank-input').fill('nothing much happens');
    await page.getByTestId('diagram-blank-check').click();

    const verdict = page.getByTestId('diagram-blank-verdict');
    await expect(verdict).toContainText('Not yet. The link is:');
    await expect(verdict).toContainText('S4 segments swing outward');
    await expect(verdict).toContainText('the charged helices are pulled by the field');
  });

  test('accepts the mechanism and puts it on the card', async ({ page }) => {
    await encodeFrameStage(page);

    await page.getByTestId('diagram-blank-input').fill('the S4 segments swing outward');
    await page.getByTestId('diagram-blank-check').click();

    await expect(page.getByTestId('diagram-blank-verdict')).toContainText('it just went onto your card');
    // Written into the mechanism field, i.e. exactly what the exporter ships.
    await page.getByRole('button', { name: 'Sentence scaffold' }).click();
    await expect(page.getByPlaceholder('FRAME_FIELD2')).toHaveValue(/the S4 segments swing outward/);
  });
});
