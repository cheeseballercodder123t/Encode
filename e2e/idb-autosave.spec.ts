import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES, P1_FIELD1, P1_FIELD2, P2_FIELD1, P2_FIELD2 } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * The debounced IndexedDB write, and the page it must not outlive (defect 38).
 *
 * `saveSchemaToHistory` writes the localStorage mirror synchronously and queues
 * the IndexedDB hop behind `IDB_AUTOSAVE_DELAY_MS`, flushing it on
 * `pagehide`/hidden. The failure this spec exists to catch is a save still in the
 * queue when the document is torn down.
 *
 * A reload alone can NOT prove that flush, and this file was rewritten because of
 * it. The app boots `initIndexedDB`, which migrates a non-empty mirror into an
 * empty `schemas` store - so after a reload the row is there whether the flush ran
 * or not. Probed, not assumed: the first draft of this spec passed with the
 * `pagehide` binding removed. The flush is therefore proven by *when* the row
 * appears, measured in one clock - the page's own, against the `timestamp` the app
 * stamped the save with:
 *
 *   - the row is absent right after the save (the debounce, observed in the real
 *     store rather than inferred from a timer);
 *   - a real `pagehide` event is dispatched;
 *   - the row appears with LESS than `IDB_AUTOSAVE_DELAY_MS` elapsed since the
 *     save was stamped, so the debounce timer cannot be what wrote it.
 *
 * The second test covers the learner-visible outcome: a session finished moments
 * before a refresh loses nothing - both stores hold it and the library lists it.
 */

const DB_NAME = 'deepencode_indexeddb_v1';
const MIRROR_KEY = 'deepencode_saved_schemas_v2';
const TOPIC = 'Action Potentials';
const AUTOSAVE_WINDOW_MS = 1000;

/**
 * The newest schema in the localStorage mirror - the record the completion save
 * just wrote, with the `timestamp` the app stamped it with.
 */
function newestMirrorRecord(page: Page): Promise<{ id: string; savedAt: number } | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const newest = Array.isArray(list) ? list[0] : null;
    if (!newest || typeof newest.id !== 'string') return null;
    return {
      id: newest.id,
      savedAt: typeof newest.timestamp === 'number' ? newest.timestamp : Date.now(),
    };
  }, MIRROR_KEY);
}

/**
 * The schema's row in the app's own IndexedDB store, plus the page's clock at the
 * moment it was read - the window is compared on the page's clock, not this
 * process's, so the two cannot drift apart.
 */
function readIndexedDBRow(page: Page, id: string): Promise<{ present: boolean; now: number }> {
  return page.evaluate(
    ({ dbName, schemaId }) =>
      new Promise<{ present: boolean; now: number }>((resolve) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => resolve({ present: false, now: Date.now() });
        request.onsuccess = () => {
          const db = request.result;
          try {
            const get = db.transaction('schemas', 'readonly').objectStore('schemas').get(schemaId);
            get.onsuccess = () => {
              resolve({ present: Boolean(get.result), now: Date.now() });
              db.close();
            };
            get.onerror = () => {
              resolve({ present: false, now: Date.now() });
              db.close();
            };
          } catch {
            resolve({ present: false, now: Date.now() });
            db.close();
          }
        };
      }),
    { dbName: DB_NAME, schemaId: id }
  );
}

/** Walk the mocked two-stage workout to FINISH, leaving the completion save to land. */
async function finishWorkout(page: Page) {
  await mockAiApis(page);
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);

  await page.getByPlaceholder(P1_FIELD1).fill('Sodium rushes in through voltage-gated channels.');
  await page.getByPlaceholder(P1_FIELD2).fill('The membrane crossed threshold, so gates open.');
  await page.getByRole('button', { name: 'Check' }).click();
  await page.getByText('Good mechanism : tighten the threshold detail.').waitFor();
  await page.getByRole('button', { name: 'NEXT →' }).click();

  await expectStage(page, 2);
  await page.getByPlaceholder(P2_FIELD1).fill('Channels inactivate and potassium leaves.');
  await page.getByPlaceholder(P2_FIELD2).fill('To restore the resting charge for the next spike.');
  await page.getByRole('button', { name: /FINISH/ }).click();
}

test.describe('the debounced IndexedDB write', () => {
  test('is still queued after a save, and a pagehide writes it before the timer would', async ({ page }) => {
    await finishWorkout(page);

    // The readout opens only after the save has been awaited, so the mirror holds
    // the schema by now and the IndexedDB hop is queued behind the window.
    await expect(page.getByText('SESSION READOUT')).toBeVisible();
    const record = await newestMirrorRecord(page);
    expect(record, 'the completion save reached the localStorage mirror').not.toBeNull();

    // The debounce, observed in the real store.
    const before = await readIndexedDBRow(page, record!.id);
    expect(before.present, 'the IndexedDB write is still queued - that is the debounce').toBe(false);

    // The page going away, dispatched for real: the same event a reload or a close
    // fires, and the one the flush is bound to.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

    // Wait for the write, but only inside the debounce window: while less than
    // `AUTOSAVE_WINDOW_MS` has passed since the save was stamped, the timer cannot
    // be the writer.
    let after = await readIndexedDBRow(page, record!.id);
    while (!after.present && after.now - record!.savedAt < AUTOSAVE_WINDOW_MS) {
      after = await readIndexedDBRow(page, record!.id);
    }

    expect(after.present, 'pagehide flushed the queued write').toBe(true);
    expect(
      after.now - record!.savedAt,
      'the row appeared inside the debounce window, so the timer cannot have written it'
    ).toBeLessThan(AUTOSAVE_WINDOW_MS);
  });

  test('a session finished moments before a reload is in both stores, and the library still lists it', async ({ page }) => {
    await finishWorkout(page);
    await expect(page.getByText('SESSION READOUT')).toBeVisible();

    const record = await newestMirrorRecord(page);
    expect(record, 'the completion save reached the localStorage mirror').not.toBeNull();

    // The refresh lands inside (or just after) the window: either the flush wrote
    // the row on the way out or the boot migration carried it over. What must not
    // happen is the record going missing from the fuller store.
    await page.reload();

    const afterReload = await readIndexedDBRow(page, record!.id);
    expect(afterReload.present, 'the schema is in IndexedDB after the reload').toBe(true);

    await page.locator('button[title^="View Saved Schemas History"]').click();
    await expect(page.getByText(TOPIC).first()).toBeVisible();
  });
});
