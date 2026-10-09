import { test, expect, type Page } from '@playwright/test';

/**
 * The usage ledger's three periods, read off the panel that shows them.
 *
 * The unit suite owns the roll arithmetic (tests/unit/storage.test.ts). What only
 * a browser can prove is that the number on screen is the number the record
 * holds: this sheet reads the ledger on every render, and a read that rolls the
 * record is exactly where a figure labelled LIFETIME can quietly become zero.
 */

const USAGE_KEY = 'deepencode_usage_stats_v1';

async function openAnalytics(page: Page) {
  await page.goto('/');
  await page.locator('button[title^="Metacognitive Analytics"]').click();
  await expect(page.getByText('SYS.07 // ANALYTICS CORE')).toBeVisible();
}

/** The value card that sits beside a labelled stat. */
const statValue = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');

const storedUsage = (page: Page) =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) as string), USAGE_KEY);

/** A record from a stale day, in a week that has since turned. */
const lastYearsRecord = () => ({
  date: 'Mon Jan 01 2001',
  weekStart: '2000-12-25',
  callsByModel: { 'gemini-3.7-flash': 4 },
  weeklyCallsByModel: { 'gemini-3.7-flash': 9 },
  tokensByModel: { 'gemini-3.7-flash': 1_500 },
  costUsdByModel: { 'gemini-3.7-flash': 0.42 },
});

test.describe('usage ledger across the day and week rolls', () => {
  test('LIFETIME tokens and spend survive the first open of a new day', async ({ page }) => {
    await page.addInitScript(
      ({ key, record }) => window.localStorage.setItem(key, JSON.stringify(record)),
      { key: USAGE_KEY, record: lastYearsRecord() }
    );

    await openAnalytics(page);

    // The two figures the panel calls LIFETIME are exactly the two the old
    // daily roll rebuilt the record without.
    await expect(statValue(page, 'TOKENS (LIFETIME)')).toContainText('1.5k');
    await expect(statValue(page, 'EST. SPEND (LIFETIME)')).toContainText('$0.42');

    // ...while the periods that did end have started over.
    await expect(statValue(page, 'TODAY')).toContainText('0');
    await expect(statValue(page, 'THIS WEEK')).toContainText('0');

    // And the record on disk is the one that was displayed: the next reader -
    // and a backup taken from here - sees the same lifetime numbers.
    const stored = await storedUsage(page);
    expect(stored.tokensByModel).toEqual({ 'gemini-3.7-flash': 1_500 });
    expect(stored.costUsdByModel['gemini-3.7-flash']).toBeCloseTo(0.42);
    expect(stored.callsByModel).toEqual({});
    expect(stored.weeklyCallsByModel).toEqual({});
  });

  test('THIS WEEK counts this week, not every call ever made', async ({ page }) => {
    const today = new Date().toDateString();
    await page.addInitScript(
      ({ key, record }) => window.localStorage.setItem(key, JSON.stringify(record)),
      {
        key: USAGE_KEY,
        record: {
          date: today,
          weekStart: '2000-12-25',
          callsByModel: { 'gemini-3.7-flash': 5 },
          weeklyCallsByModel: { 'gemini-3.7-flash': 137 },
        },
      }
    );

    await openAnalytics(page);

    // Today's own count is untouched: only the week ended.
    await expect(statValue(page, 'TODAY')).toContainText('5');
    await expect(statValue(page, 'THIS WEEK')).toContainText('0');
  });

  test('a record of the wrong shape does not take the sheet down', async ({ page }) => {
    // A today-dated record with no counters at all: the shape an older version
    // of this key can leave behind.
    await page.addInitScript(
      ({ key, date }) => window.localStorage.setItem(key, JSON.stringify({ date })),
      { key: USAGE_KEY, date: new Date().toDateString() }
    );

    await openAnalytics(page);

    await expect(page.getByText('MODEL USAGE')).toBeVisible();
    await expect(statValue(page, 'TOKENS (LIFETIME)')).toContainText('0');
    await expect(statValue(page, 'TODAY')).toContainText('0');
  });
});
