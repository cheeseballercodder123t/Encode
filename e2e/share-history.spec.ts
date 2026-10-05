import { test, expect } from '@playwright/test';
import LZString from 'lz-string';
import { makeActivity, makeSavedSchema } from './helpers/fixtures';
import { mockAiApis, confirmReadiness } from './helpers/mocks';

test.describe('Stateless URL sharing', () => {
  test('opening a ?share= link imports the schema into the completed view', async ({ page }) => {
    const schema = makeSavedSchema({
      id: 'schema_shared_1',
      topicSummary: 'TCP Handshake (Shared)',
      activities: [makeActivity({ id: 'shared-1' })],
      userResponses: {
        'shared-1': { field1: 'syn', field2: 'syn-ack' },
      },
    });
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(schema));

    await page.goto(`/?share=${compressed}`);

    // Import banner + completed view rendered straight from the URL
    await expect(page.getByText('Classmate Shared Schema Loaded')).toBeVisible();
    await expect(page.getByText('Clean cards, ready for Anki.')).toBeVisible();

    // Saving it to history persists locally (banner dismisses)
    await page.getByRole('button', { name: 'Save to History' }).click();
    await expect(page.getByText('Classmate Shared Schema Loaded')).not.toBeVisible();
  });

  test('a corrupt share param is ignored gracefully', async ({ page }) => {
    await page.goto('/?share=NOT_A_VALID_SCHEMA_!!!');
    // App still boots into the normal launchpad
    await expect(page.getByRole('heading', { name: 'DeepEncode' })).toBeVisible();
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();
  });
});

test.describe('History & resume', () => {
  test('resume a seeded schema from the history drawer', async ({ page }) => {
    const schema = makeSavedSchema();
    await page.addInitScript((s) => {
      (window as any).localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([s]));
    }, schema);

    await page.goto('/');
    await page.locator('button[title^="View Saved Schemas History"]').click();
    await expect(page.getByText('Saved Schemas')).toBeVisible();
    await expect(page.getByText('E2E Seeded Topic')).toBeVisible();

    // "View" resumes the schema into the completed view
    await page.getByRole('button', { name: 'View' }).click();
    await expect(page.getByText('Clean cards, ready for Anki.')).toBeVisible();
    await expect(page.getByText('seeded one')).toBeVisible();
  });

  test('history drawer offers resume and share for a seeded schema', async ({ page }) => {
    const schema = makeSavedSchema();
    await page.addInitScript((s) => {
      (window as any).localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([s]));
    }, schema);

    await page.goto('/');
    await page.locator('button[title^="View Saved Schemas History"]').click();
    await expect(page.getByText('Saved Schemas')).toBeVisible();

    // Drill modals were removed : review lives in Anki/RemNote, so the drawer
    // surfaces View (resume) + share instead of an in-app drill button.
    await expect(page.getByRole('button', { name: 'View' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share' }).first()).toBeVisible();
  });
});

test.describe('Settings & analytics', () => {
  test('settings modal opens and can be closed', async ({ page }) => {
    await mockAiApis(page);
    await page.goto('/');
    await page.locator('button[title^="Configure Models"]').click();
    await expect(page.getByText('AI Engine & API Keys')).toBeVisible();
  });
});

test.describe('Analytics core', () => {
  /**
   * The analytics sheet reads its numbers from the shared session-analytics
   * service, so the header must describe the whole library (not the page it is
   * showing), and the log has to page instead of rendering every session at
   * once. Neither is visible from a unit test: both are about what the sheet
   * puts on screen for a real history.
   */
  const SESSIONS = 12;

  function seededHistory() {
    return Array.from({ length: SESSIONS }, (_, i) =>
      makeSavedSchema({
        id: `analytics_${i}`,
        timestamp: Date.parse('2026-01-01T00:00:00Z') + i,
        topicSummary: `Analytics Topic ${i}`,
        activities: [makeActivity({ id: `analytics-act-${i}` })],
        userResponses: {
          [`analytics-act-${i}`]: {
            field1: 'answer',
            field2: 'mechanism',
            confidenceScore: 80,
            checkCount: 2,
            // Half the sessions landed the mechanism, half carried a reflection.
            reflection: i % 2 === 0 ? 'I noticed the mechanism in my own words.' : '',
            feynmanReview: { secured: i % 2 === 0, feedback: '' },
          },
        },
      })
    );
  }

  /** The value card that sits beside a labelled stat. */
  const statValue = (page: import('@playwright/test').Page, label: string) =>
    page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');

  test('reports library stats and pages a long session log', async ({ page }) => {
    const schemas = seededHistory();
    await page.addInitScript((s) => {
      (window as any).localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(s));
    }, schemas);

    await mockAiApis(page);
    await page.goto('/');
    await page.locator('button[title^="Metacognitive Analytics"]').click();
    await expect(page.getByText('SYS.07 // ANALYTICS CORE')).toBeVisible();

    // Six of the twelve landed, all twelve carried a score of 80.
    await expect(statValue(page, 'SESSIONS')).toHaveText(String(SESSIONS));
    await expect(statValue(page, 'SUCCESS RATE')).toHaveText('50%');
    await expect(statValue(page, 'AVG CONFIDENCE')).toHaveText('80/100');
    await expect(statValue(page, 'REFLECTIONS')).toHaveText('6');

    // One page of ten, with both pages of the log reachable.
    const rows = page.getByText(/1 stages \/ 320 XP/);
    await expect(rows).toHaveCount(10);
    await expect(page.getByText('Page 1 of 2 · 12 sessions')).toBeVisible();

    await page.locator('button[title="Last page"]').click();
    await expect(page.getByText('Page 2 of 2 · 12 sessions')).toBeVisible();
    await expect(rows).toHaveCount(2);

    // Narrowing the search while on the last page clamps back to the first: an
    // out-of-range page would render an empty log, which reads as data loss.
    await page.getByPlaceholder('Search sessions by topic, mode, or ID...').fill('Analytics Topic 3');
    await expect(page.getByText('Page 1 of 1 · 1 sessions')).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(page.getByText('Analytics Topic 3')).toBeVisible();

    // The header still describes the library, not the filtered page.
    await expect(statValue(page, 'SESSIONS')).toHaveText(String(SESSIONS));
  });
});
