import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES, ENCODE_RESPONSE } from './helpers/fixtures';
import {
  ENCODE_ROUTE,
  mockAiApis,
  startEncodeFromNotes,
  completeWorkout,
} from './helpers/mocks';

/**
 * Two tabs, one library.
 *
 * The saved-schema list was memoized in a module-level cache that nothing ever
 * invalidated (`invalidateSchemaCache()` had zero callers and no `storage`
 * listener existed), and every write built its replacement list from that cache
 * rather than from what was actually on disk. So a second tab's save wrote a
 * stale list: the first tab's schema could be dropped from the mirror, a schema
 * the other tab deleted could be resurrected, and the first tab's screen never
 * moved at all.
 *
 * This spec drives the real app twice, in two tabs of one browser context (so
 * they share storage exactly as two real tabs do), and then proves the outcome
 * three ways: the first tab reflects the second tab's save without a reload, a
 * brand new tab sees both, and the persisted list itself names both.
 *
 * `completeWorkout` is the shared walk through the mocked workout; the second
 * tab answers the encode call with a different topic so the two records are
 * unmistakable on screen.
 */
const FIRST_TOPIC = 'Action Potentials';
const SECOND_TOPIC = 'Saltatory Conduction';

/** Encode a mocked workout in this tab and let it autosave to the library. */
async function completeAndSave(page: Page, topic?: string) {
  await mockAiApis(page);
  if (topic) {
    // Registered after `mockAiApis`, so it wins for this tab only.
    await page.route(ENCODE_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...ENCODE_RESPONSE, topicSummary: topic }),
      })
    );
  }
  await startEncodeFromNotes(page, MOCK_NOTES);
  await completeWorkout(page);
}

/**
 * The drawer, not the page: the session behind it names its own topic, so a
 * document-wide `getByText(topic)` would answer for the completed workout rather
 * than for the library this spec is about.
 */
async function openLibrary(page: Page) {
  await page.locator('button[title^="View Saved Schemas History"]').click();
  const drawer = page.getByRole('dialog', { name: 'Saved schemas' });
  await expect(drawer).toBeVisible();
  return drawer;
}

const storedTopics = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('deepencode_saved_schemas_v2') || '[]').map(
      (s: { topicSummary?: string }) => s.topicSummary
    )
  );

test.describe('the schema library is consistent across tabs', () => {
  test('a save in a second tab is reflected in the first, and neither schema is lost', async ({ context }) => {
    const tabA = await context.newPage();
    await completeAndSave(tabA);

    // Tab A holds the library in memory from here on: it has already hydrated.
    const drawerA = await openLibrary(tabA);
    await expect(drawerA.getByText(FIRST_TOPIC).first()).toBeVisible();
    await tabA.keyboard.press('Escape');

    const tabB = await context.newPage();
    await completeAndSave(tabB, SECOND_TOPIC);

    // 1. The first tab reflects the second tab's save without a reload - and
    //    before the drawer is even opened, because the masthead count is the
    //    library's own size. It is the subscription that has to have moved.
    await expect(tabA.getByRole('button', { name: /Library · 2/ })).toBeVisible();

    const drawerAAgain = await openLibrary(tabA);
    await expect(drawerAAgain.getByText(SECOND_TOPIC).first()).toBeVisible();
    await expect(drawerAAgain.getByText(FIRST_TOPIC).first()).toBeVisible();

    // 2. A fresh tab sees both: the first tab's schema survived the second
    //    tab's write.
    const tabC = await context.newPage();
    await tabC.goto('/');
    const drawerC = await openLibrary(tabC);
    await expect(drawerC.getByText(SECOND_TOPIC).first()).toBeVisible();
    await expect(drawerC.getByText(FIRST_TOPIC).first()).toBeVisible();

    // 3. And the persisted list itself names both - the store a reader with no
    //    IndexedDB (or a stale cache) falls back to.
    const topics = await storedTopics(tabC);
    expect(topics).toContain(FIRST_TOPIC);
    expect(topics).toContain(SECOND_TOPIC);
  });

  test('a delete in one tab is not undone by the other tab saving', async ({ context }) => {
    // Same shape as the save above, from the other side: the stale-cache bug
    // resurrected a deleted schema, because the deleting tab rebuilt the list
    // from a cache that still contained it.
    const tabA = await context.newPage();
    await completeAndSave(tabA);
    const tabB = await context.newPage();
    await completeAndSave(tabB, SECOND_TOPIC);

    // Tab A deletes its own schema; tab A's list is now the second tab's only.
    const drawerA = await openLibrary(tabA);
    await tabA.getByLabel(`Delete schema ${FIRST_TOPIC}`).click();
    await expect(drawerA.getByText(FIRST_TOPIC)).toHaveCount(0);
    await expect(drawerA.getByText(SECOND_TOPIC).first()).toBeVisible();

    // The fresh tab must agree: deleted means deleted.
    const tabC = await context.newPage();
    await tabC.goto('/');
    const drawerC = await openLibrary(tabC);
    await expect(drawerC.getByText(SECOND_TOPIC).first()).toBeVisible();
    await expect(drawerC.getByText(FIRST_TOPIC)).toHaveCount(0);

    const topics = await storedTopics(tabC);
    expect(topics).not.toContain(FIRST_TOPIC);
    expect(topics).toContain(SECOND_TOPIC);
  });
});
