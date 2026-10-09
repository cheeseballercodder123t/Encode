import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, completeWorkout } from './helpers/mocks';

/**
 * The cloud badge's own number, in the browser.
 *
 * `pendingLocalCount` - the only signal that local work has not reached the
 * account - was a `useMemo` over `[user, cloudSchemas, hydrated]` that read
 * `loadSavedSchemas()`, a module-level cache none of those dependencies move
 * with. Saving a schema therefore left the badge on the number it captured at
 * mount, which reads as "nothing pending" exactly when something is; and it was
 * buried in the button's tooltip, so nobody could have seen it update either way
 * (defect 39).
 *
 * These specs drive the real app with no account - every schema on the device is
 * then un-backed-up work - and assert the badge's face as the library changes
 * under it, with no reload, no sign-in and no other interaction.
 */

/** The masthead's cloud button, addressed by the name it announces. */
const cloudBadge = (page: Page) => page.getByRole('button', { name: /^Cloud:/ });

/** The library button, whose count is the library's own size. */
const libraryButton = (page: Page) => page.getByRole('button', { name: /^Library/ });

const openLibrary = async (page: Page) => {
  await page.locator('button[title^="View Saved Schemas History"]').click();
  const drawer = page.getByRole('dialog', { name: 'Saved schemas' });
  await expect(drawer).toBeVisible();
  return drawer;
};

test.describe('the pending-sync badge counts the library, live', () => {
  test('a saved schema appears on the badge, and deleting it takes the count back down', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');

    // Signed out on an empty device: there is nothing un-backed-up yet, and the
    // badge says so rather than carrying a number from anywhere else.
    await expect(cloudBadge(page)).toHaveText('Cloud: OFF');
    await expect(libraryButton(page)).toHaveText('Library');

    await startEncodeFromNotes(page, MOCK_NOTES);
    await completeWorkout(page);

    // The workout just saved itself: one schema, local only, and the badge is
    // the place that says so - with no reload and no navigation in between.
    await expect(cloudBadge(page)).toHaveText('Cloud: OFF · 1 local');
    await expect(libraryButton(page)).toHaveText('Library · 1');

    // Removing the schema removes the pending work: the badge follows the
    // library down as well as up.
    const drawer = await openLibrary(page);
    await page.getByLabel(/^Delete schema /).first().click();
    await expect(drawer.getByLabel(/^Delete schema /)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    await expect(cloudBadge(page)).toHaveText('Cloud: OFF');
    await expect(libraryButton(page)).toHaveText('Library');
  });

  test('a returning device shows the work it already holds, and counts what is added to it', async ({ page }) => {
    await mockAiApis(page);

    // A device that comes back with two local schemas already on it (the
    // localStorage mirror the app reads synchronously).
    await page.addInitScript((schemas) => {
      window.localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(schemas));
    }, [
      {
        id: 'renal-physiology',
        timestamp: 1_700_000_000_000,
        topicSummary: 'Renal Physiology',
        mode: 'text',
        xpEarned: 40,
        activities: [],
        userResponses: {},
      },
      {
        id: 'saltatory-conduction',
        timestamp: 1_700_000_100_000,
        topicSummary: 'Saltatory Conduction',
        mode: 'text',
        xpEarned: 35,
        activities: [],
        userResponses: {},
      },
    ]);

    await page.goto('/');
    await expect(cloudBadge(page)).toHaveText('Cloud: OFF · 2 local');
    await expect(libraryButton(page)).toHaveText('Library · 2');

    await startEncodeFromNotes(page, MOCK_NOTES);
    await completeWorkout(page);

    // The new schema is counted on top of what the device already held.
    await expect(cloudBadge(page)).toHaveText('Cloud: OFF · 3 local');
    await expect(libraryButton(page)).toHaveText('Library · 3');
  });
});
