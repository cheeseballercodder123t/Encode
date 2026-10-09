import { test, expect, type Page } from '@playwright/test';

/**
 * Defect 34 in the browser: a sheet that throws is a *sheet* that fails, not an
 * app that fails.
 *
 * The fault seeded here is a real one, not a synthetic throw. The storage
 * boundary coerces a saved record's fields but not the values inside its
 * `userResponses` map, and the library-wide stats walk dereferences every
 * response (`r.field1?.trim()`), so one null response record makes the analytics
 * sheet throw during render. That is the same shape as defect 25 (one legacy
 * record in the drawer) and defect 33 (one corrupt usage record): the payload
 * arrives through a store, and before this fix the throw propagated to the root
 * boundary in `app/error.tsx` and replaced the whole segment - workbench, stage
 * and session view included.
 *
 * What only a browser can prove is the containment: the sheet shows its own
 * fallback, the session behind it is still there and still interactive, and
 * every other sheet still opens. The boundary's own contract (retry, close,
 * reset on re-open) is pinned in `tests/unit/sheet-boundary.test.tsx`, and the
 * coverage rule - every sheet mount is wrapped - in
 * `tests/unit/sheet-boundaries.test.ts`.
 *
 * Two worlds can leave the fallback missing, and `requireContained` tells them
 * apart rather than treating both as "premise gone": if the analytics sheet
 * renders normally, a later round hardened the reader, so the spec skips with a
 * note; if the ROOT fallback is on screen, the throw escaped and this file fails
 * with that message - which is the defect, not a stale premise.
 */

const SCHEMAS_KEY = 'deepencode_saved_schemas_v2';
const PROBE_TOPIC = 'Boundary Probe Topic';

const corruptSession = () => ({
  id: 'sheet-boundary-probe',
  timestamp: Date.parse('2026-02-01T00:00:00Z'),
  topicSummary: PROBE_TOPIC,
  mode: 'conceptual',
  xpEarned: 40,
  activities: [],
  // The fault: a response record that is not a record. Validated as a map,
  // never validated inside it.
  userResponses: { 'stage-1': null },
});

async function seed(page: Page) {
  await page.addInitScript(
    ({ key, session }) => window.localStorage.setItem(key, JSON.stringify([session])),
    { key: SCHEMAS_KEY, session: corruptSession() }
  );
}

const sheetFallback = (page: Page) => page.getByTestId('sheet-error-fallback');
const openAnalytics = async (page: Page) => {
  await page.goto('/');
  await page.locator('button[title^="Metacognitive Analytics"]').click();
};

/**
 * Waits until the analytics sheet has either been contained or proved not to
 * throw, and then holds the spec to the one outcome that is the premise.
 *
 * "The fallback is not there" used to be enough to skip, and that accepted two
 * opposite worlds: a later round hardening the reader (the corruption no longer
 * reaches a render - the spec's shape needs replacing, so a skip is right) and
 * the throw escaping to `app/error.tsx` (the defect, and the one thing this file
 * exists to catch). So the root fallback is asserted AGAINST first - `toHaveCount(0)`
 * fails loudly on an escaped throw - and the skip is reserved for the world where
 * the analytics sheet renders normally because nothing throws any more.
 */
async function requireContained(page: Page) {
  await expect
    .poll(async () =>
      (await sheetFallback(page).count()) > 0 ||
      (await page.getByText('SYS.07 // ANALYTICS CORE').count()) > 0 ||
      (await page.getByText('Something in this screen failed to render.').count()) > 0
    )
    .toBe(true);

  if ((await sheetFallback(page).count()) > 0) return; // contained: the normal path

  await expect(
    page.getByText('Something in this screen failed to render.'),
    'the sheet throw escaped to the root boundary - nothing contained it'
  ).toHaveCount(0);
  await expect(page.getByText('SYS.07 // ANALYTICS CORE')).toBeVisible();
  test.skip(true, 'the seeded corruption no longer reaches the analytics render - pick a new shape');
}

test.describe('a failing sheet is contained', () => {
  test('the sheet shows its fallback, and the session and the other sheets stay usable', async ({ page }) => {
    await seed(page);
    await openAnalytics(page);

    // The premise: the analytics sheet throws during render.
    await requireContained(page);

    // The root boundary is NOT the one that caught it - that is the difference
    // between a contained sheet and a dead app.
    await expect(page.getByText('Something in this screen failed to render.')).toHaveCount(0);
    await expect(sheetFallback(page)).toBeVisible();
    await expect(sheetFallback(page)).toHaveAttribute('data-sheet', 'Analytics');
    await expect(page.getByText('The Analytics sheet failed to render.')).toBeVisible();
    // The sheet it replaced is gone, rather than rendered half-broken.
    await expect(page.getByText('SYS.07 // ANALYTICS CORE')).toHaveCount(0);

    // Closing the failure returns the learner to the session they were in.
    await page.getByTestId('sheet-error-close').click();
    await expect(sheetFallback(page)).toHaveCount(0);

    // ...and the main surface is interactive, not just present: a real keystroke
    // lands in the input it always did.
    const notes = page.getByPlaceholder(/Paste study material/);
    await expect(notes).toBeVisible();
    await notes.fill('Types still work behind a failed sheet.');
    await expect(notes).toHaveValue('Types still work behind a failed sheet.');

    // Every other sheet still opens: the history drawer lists the record whose
    // response map is the reason analytics failed.
    await page.locator('button[title^="View Saved Schemas History"]').click();
    await expect(page.getByText('Saved Schemas')).toBeVisible();
    await expect(page.getByText(PROBE_TOPIC)).toBeVisible();
    await page.getByRole('button', { name: 'Close saved schemas' }).click();
    await expect(page.getByText('Saved Schemas')).toHaveCount(0);

    // Settings opens too, so the failure is not "the sheets are broken" but
    // "this sheet is broken": its own dialog is on screen and the analytics
    // fallback did not come back with it.
    await page.locator('button[title^="Configure Models"]').click();
    await expect(page.getByText('AI Engine & API Keys')).toBeVisible();
    await expect(sheetFallback(page)).toHaveCount(0);
  });

  test('the failed sheet closes with Escape like any other sheet', async ({ page }) => {
    await seed(page);
    await openAnalytics(page);
    await requireContained(page);

    await page.keyboard.press('Escape');

    await expect(sheetFallback(page)).toHaveCount(0);
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
    await expect(page.getByText('Something in this screen failed to render.')).toHaveCount(0);
  });

  test('retrying re-renders the sheet, and failing again is still contained', async ({ page }) => {
    await seed(page);
    await openAnalytics(page);
    await requireContained(page);

    await page.getByTestId('sheet-error-retry').click();

    // The data is still corrupt, so the sheet fails again - contained again,
    // with the app still alive behind it.
    await expect(sheetFallback(page)).toBeVisible();
    await expect(page.getByText('Something in this screen failed to render.')).toHaveCount(0);
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
  });
});
