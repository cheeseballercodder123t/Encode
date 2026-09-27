import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * The shared sheet behaviour, pinned in the browser.
 *
 * Every overlay in this app hands its close handler to `hooks/useModalA11y`,
 * which then owes the person using it three things a sheet is easy to get
 * wrong: Escape closes it, the page behind stops scrolling, and focus is
 * inside the sheet rather than left behind on the button that opened it.
 *
 * The source scan (`tests/unit/modal-a11y.test.ts`) proves every overlay asks
 * for the hook. This proves the hook actually does it once a real sheet is
 * mounted — the two failures users hit (a sheet that ignores Escape, a page
 * that scrolls underneath one) are invisible to every other test here.
 */

/** Encode a session and open the export sheet from the workbench footer. */
async function openExportSheet(page: Page) {
  await mockAiApis(page);
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);
  await page.locator('button[title^="Export .apkg Anki package"]').click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet).toBeVisible();
  return sheet;
}

const activeIsInsideSheet = () =>
  Boolean(document.activeElement && document.activeElement.closest('[role="dialog"]'));

test.describe('sheets are escapable and do not trap the page', () => {
  test('Escape closes the sheet and focus starts inside it', async ({ page }) => {
    const sheet = await openExportSheet(page);

    // Focus went into the sheet, not on the control behind it: landing back on
    // "open" is how a keyboard user dismisses what they just opened.
    expect(await page.evaluate(activeIsInsideSheet)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('the page behind stops scrolling while a sheet is open', async ({ page }) => {
    const overflow = () => page.evaluate(() => document.body.style.overflow);

    await openExportSheet(page);
    await expect.poll(overflow).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect.poll(overflow).toBe('');
  });
});
