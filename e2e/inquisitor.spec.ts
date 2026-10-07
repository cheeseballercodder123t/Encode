import { test, expect, type Page } from '@playwright/test';
import {
  INQUISITOR_FALSE_RESPONSE,
  INQUISITOR_TRIPWIRE_RESPONSE,
} from './helpers/fixtures';
import { mockAiApis } from './helpers/mocks';

/**
 * The question-first cockpit, driven the way a learner drives it.
 *
 * What only the browser can prove here:
 *
 *  - **the verdict is on screen before the prose is**, with the claim it
 *    interrogated quoted back next to it. A verdict on a claim the learner did
 *    not make is worse than no verdict, so the echo is part of the assertion,
 *    not decoration;
 *  - **no correction renders on a true read, and no tripwire renders on a plain
 *    one** — the two blocks are mutually exclusive by verdict, and a stray
 *    third block is exactly what a mis-wired payload looks like;
 *  - **a boundary really becomes a held contradiction.** The commit is a write
 *    into the shared paradox ledger and the proof is that closing and reopening
 *    the sheet (a fresh read of localStorage through the effect) shows it open;
 *  - **a read the gate refuses is shown as a refusal.** The route answers 422
 *    with the reason, and the surface must say that rather than render a
 *    plausible verdict assembled from a payload that had no proof in it.
 */

async function openInquisitor(page: Page) {
  await mockAiApis(page);
  await page.goto('/');
  await page.getByTestId('open-inquisitor').click();
  await expect(page.getByRole('dialog', { name: 'Question-first inquisitor' })).toBeVisible();
}

test.describe('question-first inquisitor', () => {
  test('reads a claim: verdict, governing law, and the edge where it stops holding', async ({ page }) => {
    await openInquisitor(page);

    // The claim bar takes focus on open, so a learner can start typing at once.
    await expect(page.getByTestId('inquisitor-claim')).toBeFocused();

    await page
      .getByTestId('inquisitor-claim')
      .fill('Every smooth function equals its own Taylor series near the point of expansion.');
    await page.getByTestId('inquisitor-submit').click();

    const reading = page.getByTestId('inquisitor-reading');
    await expect(reading).toBeVisible();

    // The verdict, named — not a score, not a grade.
    await expect(page.getByTestId('inquisitor-verdict')).toContainText('TRUE_WITH_BOUNDARY_TRIPWIRE');
    await expect(page.getByTestId('inquisitor-verdict')).toContainText('Rigorous, with a boundary');

    // What was interrogated is on screen next to the answer.
    await expect(page.getByTestId('inquisitor-claim-echo')).toContainText(
      'Every smooth function equals its own Taylor series'
    );

    // The law, line by line.
    await expect(page.getByTestId('inquisitor-proof').locator('li')).toHaveCount(
      INQUISITOR_TRIPWIRE_RESPONSE.proof.length
    );
    await expect(page.getByTestId('inquisitor-proof')).toContainText('remainder term');

    // The boundary, which is the whole reason this verdict exists.
    await expect(page.getByTestId('inquisitor-tripwire')).toContainText('e^(-1/x^2)');
    // A true read has no correction to render.
    await expect(page.getByTestId('inquisitor-correction')).toHaveCount(0);
    // And no downgrade notice: the boundary was actually named.
    await expect(page.getByTestId('inquisitor-downgraded')).toHaveCount(0);

    // Holding it open writes a real ledger entry.
    await page.getByTestId('inquisitor-save-paradox').click();
    await expect(page.getByTestId('inquisitor-saved')).toBeVisible();

    // Close and reopen: the pre-flight reads the ledger from storage, so an
    // entry that survived is an entry that was really persisted.
    await page.getByRole('button', { name: 'Close inquisitor' }).click();
    await expect(page.getByRole('dialog', { name: 'Question-first inquisitor' })).toBeHidden();

    await page.getByTestId('open-inquisitor').click();
    const preflight = page.getByTestId('inquisitor-open-paradoxes');
    await expect(preflight).toBeVisible();
    await expect(preflight).toContainText('e^(-1/x^2)');
    await expect(preflight).toContainText('yet');
  });

  test('a false verdict shows the fix rather than a bare verdict', async ({ page }) => {
    await openInquisitor(page);
    // Registered after `mockAiApis`, so this read wins.
    await page.route('**/api/inquisitor', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(INQUISITOR_FALSE_RESPONSE),
      })
    );

    await page.getByTestId('inquisitor-claim').fill('Bond breaking releases energy.');
    await page.getByTestId('inquisitor-submit').click();

    await expect(page.getByTestId('inquisitor-verdict')).toContainText('FALSE');
    await expect(page.getByTestId('inquisitor-correction')).toContainText('COSTS energy');
    // The correction is the answer here, so no boundary block competes with it.
    await expect(page.getByTestId('inquisitor-tripwire')).toHaveCount(0);
  });

  test('a read the gate refuses is reported, never rendered as a verdict', async ({ page }) => {
    await openInquisitor(page);
    // The route's own refusal shape: a verdict arrived with no proof behind it.
    await page.route('**/api/inquisitor', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'A verdict with no proof is not an answer — nothing was shown.',
          refusal: 'noProof',
        }),
      })
    );

    await page.getByTestId('inquisitor-claim').fill('Everything is energy.');
    await page.getByTestId('inquisitor-submit').click();

    await expect(page.getByTestId('inquisitor-error')).toContainText('not an answer');
    // Nothing was rendered: no verdict block, no proof, no boundary.
    await expect(page.getByTestId('inquisitor-reading')).toHaveCount(0);
    await expect(page.getByTestId('inquisitor-verdict')).toHaveCount(0);
  });

  test('the sheet closes on Escape like every other one', async ({ page }) => {
    await openInquisitor(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Question-first inquisitor' })).toBeHidden();
  });
});
