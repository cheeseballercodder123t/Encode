import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeActivity, makeSavedSchema } from './helpers/fixtures';

/**
 * The backup file is the learner's escape hatch: every session, setting and
 * side-ledger lives in this browser, so "restore" has to actually refill the
 * library rather than only report that it did.
 *
 * The unit suite owns the shape rules (malformed entries, foreign files, id
 * collisions). What only a browser can prove is the round trip through the two
 * controls in the analytics sheet: the download really lands as a DeepEncode
 * file, and feeding that same file into the hidden file input rebuilds a
 * library from nothing — the migration case the file exists for.
 */

const SCHEMAS_KEY = 'deepencode_saved_schemas_v2';
const SETTINGS_KEY = 'deepencode_ai_settings_v2';
/**
 * The deck-memory store's REAL key (`lib/deck-memory.ts` exports it as
 * `DECK_MEMORY_STORAGE_KEY`), and the fingerprint its record is filed under
 * (`memoryKeyForTopic('Backup Topic One')`).
 *
 * This spec used to seed and assert `deepencode_deck_memory_v1` — a spelling no
 * module in the app has written since the store was renamed — which is exactly
 * why the backup could drop the learner's card memory while this test stayed
 * green (defect 58). Seeding a key that nothing reads proves nothing.
 */
const DECK_MEMORY_KEY = 'encode.deck-memory.v1';
const DECK_MEMORY_TOPIC_KEY = 'backup topic one';

const seededSchemas = () => [
  makeSavedSchema({
    id: 'backup_1',
    timestamp: Date.parse('2026-02-01T00:00:00Z'),
    topicSummary: 'Backup Topic One',
  }),
  makeSavedSchema({
    id: 'backup_2',
    timestamp: Date.parse('2026-02-02T00:00:00Z'),
    topicSummary: 'Backup Topic Two',
    activities: [makeActivity({ id: 'backup-act-2' })],
    userResponses: { 'backup-act-2': { field1: 'a', field2: 'b' } },
  }),
];

const baseURL = () =>
  test.info().project.use.baseURL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4310';

async function openAnalytics(page: Page) {
  await page.goto('/');
  await page.locator('button[title^="Metacognitive Analytics"]').click();
  await expect(page.getByText('SYS.07 // ANALYTICS CORE')).toBeVisible();
}

/** The restore control is a hidden input; the multimodal uploader owns the other one. */
const restoreInput = (page: Page) => page.locator('input[type="file"][accept*="json"]');

/** The value card that sits beside a labelled stat. */
const statValue = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');

test.describe('Full backup round trip', () => {
  test('BACKUP EVERYTHING downloads a file that RESTORE BACKUP refills an empty library from', async ({
    page,
    browser,
  }) => {
    await page.addInitScript(
      ({ schemas, settings, deckMemory, deckKey }) => {
        window.localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(schemas));
        window.localStorage.setItem('deepencode_ai_settings_v2', JSON.stringify(settings));
        window.localStorage.setItem(deckKey, JSON.stringify(deckMemory));
      },
      {
        schemas: seededSchemas(),
        settings: { provider: 'gemini', model: 'gemini-2.5-flash' },
        deckKey: DECK_MEMORY_KEY,
        // The store's real shape: one record per topic fingerprint, carrying the
        // card fronts already shipped to an export surface.
        deckMemory: {
          [DECK_MEMORY_TOPIC_KEY]: {
            topic: 'Backup Topic One',
            keys: ['fp-1'],
            updatedAt: 1_770_000_000_000,
            exports: 1,
          },
        },
      }
    );
    await openAnalytics(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '[ BACKUP EVERYTHING ]' }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^deepencode-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await file.path();
    const backup = JSON.parse(readFileSync(path!, 'utf8'));

    expect(backup.app).toBe('deepencode');
    expect(backup.version).toBe(1);
    expect(backup.schemas.map((s: { id: string }) => s.id)).toEqual(['backup_1', 'backup_2']);
    expect(backup.settings).toMatchObject({ provider: 'gemini' });
    // The card memory rides in the file, keyed the way its owner keys it.
    expect(Object.keys(backup.extras[DECK_MEMORY_KEY])).toEqual([DECK_MEMORY_TOPIC_KEY]);
    expect(backup.extras[DECK_MEMORY_KEY][DECK_MEMORY_TOPIC_KEY].keys).toEqual(['fp-1']);

    // A second context is a second browser profile: empty localStorage and
    // empty IndexedDB, which is exactly the machine someone restores onto.
    const fresh = await browser.newContext({ baseURL: baseURL() });
    const device = await fresh.newPage();
    await openAnalytics(device);
    await expect(statValue(device, 'SESSIONS')).toHaveText('0');

    await restoreInput(device).setInputFiles({
      name: 'deepencode-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });

    const report = device.getByTestId('backup-report');
    await expect(report).toContainText('Restored 2 sessions');
    await expect(report).toContainText('settings');
    await expect(report).toContainText('data sets');

    // The report is a write receipt; the reload is what proves the sessions
    // were really persisted (the sheet's own list is a snapshot from open).
    await device.reload();
    await openAnalytics(device);
    await expect(statValue(device, 'SESSIONS')).toHaveText('2');
    await expect(device.getByText('Backup Topic One')).toBeVisible();
    await expect(device.getByText('Backup Topic Two')).toBeVisible();
    expect(
      await device.evaluate((key) => window.localStorage.getItem(key), SETTINGS_KEY)
    ).toContain('gemini');
    expect(await device.evaluate((key) => window.localStorage.getItem(key), SCHEMAS_KEY)).toContain(
      'backup_1'
    );
    // And the memory that used to be dropped on both halves of the trip really
    // lands on the receiving profile, under the key its module reads.
    expect(
      await device.evaluate((key) => window.localStorage.getItem(key), DECK_MEMORY_KEY)
    ).toContain('Backup Topic One');

    await fresh.close();
  });

  test('a file that is not a backup is refused with a readable reason', async ({ page }) => {
    await page.addInitScript(
      ({ schemas }) => window.localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(schemas)),
      { schemas: seededSchemas() }
    );
    await openAnalytics(page);

    await restoreInput(page).setInputFiles({
      name: 'lecture-notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"topic":"not a backup"}'),
    });

    await expect(page.getByText(/missing app marker/)).toBeVisible();
    // The library is untouched: a refused import never costs the learner data.
    await expect(page.getByTestId('backup-report')).toHaveCount(0);
    await expect(page.getByText('Backup Topic One')).toBeVisible();
  });
});
