import { test, expect } from '@playwright/test';
import { mockAiApis } from './helpers/mocks';

/**
 * A legacy record in the learner's own history must not brick the app.
 *
 * `SavedSchema.topicSummary` is a required field *now*, but every persisted
 * record is read with an unvalidated `JSON.parse(...) as SavedSchema[]` — the
 * one-time localStorage migration (`lib/db.ts`) puts old records into
 * IndexedDB exactly as it finds them, and the Firestore list is remote data.
 * The history drawer then dereferenced `s.topicSummary.toLowerCase()` while
 * filtering, and there is no error boundary above it, so React unmounted the
 * whole tree: the app answered with
 * `Application error: a client-side exception has occurred while loading …`.
 *
 * That failure is not recoverable from the UI — "clear all data" lives inside
 * the drawer that crashes — so the learner's only exit is clearing site data.
 * This spec pins the two things that matter: the launchpad still hydrates, and
 * the drawer opens and names the record instead of dying on it.
 */
const LEGACY_RECORD = {
  id: 'legacy-1',
  timestamp: 1_700_000_000_000,
  mode: 'conceptual',
  activities: [],
  userResponses: {},
  // No topicSummary: the shape an older release wrote.
};

async function seedLegacyHistory(page: import('@playwright/test').Page) {
  await page.addInitScript((record: unknown) => {
    window.localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([record]));
  }, LEGACY_RECORD);
}

test.describe('a malformed history record cannot brick the app', () => {
  test('the drawer opens on a record with no topic instead of taking the app down', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await mockAiApis(page);
    await seedLegacyHistory(page);
    await page.goto('/');

    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();

    // Opening the drawer is what used to kill the app.
    await page.getByTitle('View Saved Schemas History').click();
    await expect(page.getByRole('dialog', { name: 'Saved schemas' })).toBeVisible();

    // The record is still listed (it is the learner's work), just unnamed.
    await expect(page.getByText('Untitled topic').first()).toBeVisible();

    // And nothing threw: no React error boundary page, no uncaught exception.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Application error');
    expect(errors, `uncaught: ${errors.join(' | ')}`).toHaveLength(0);

    // The drawer stays usable: search must not throw on the unnamed record.
    await page.getByLabel('Search saved schemas').fill('anything');
    await expect(page.getByRole('dialog', { name: 'Saved schemas' })).toBeVisible();
  });

  test('a record whose activities are missing still renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await mockAiApis(page);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deepencode_saved_schemas_v2',
        JSON.stringify([{ id: 'legacy-2', timestamp: 1, topicSummary: 'Partial save' }])
      );
    });
    await page.goto('/');

    await page.getByTitle('View Saved Schemas History').click();
    await expect(page.getByRole('dialog', { name: 'Saved schemas' })).toBeVisible();
    await expect(page.getByText('Partial save')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
    expect(errors, `uncaught: ${errors.join(' | ')}`).toHaveLength(0);
  });
});
