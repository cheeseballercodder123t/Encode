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
        'shared-1': { field1: 'syn', field2: 'syn-ack', readinessConfirmed: true },
      },
    });
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(schema));

    await page.goto(`/?share=${compressed}`);

    // Import banner + completed view rendered straight from the URL
    await expect(page.getByText('Classmate Shared Schema Loaded')).toBeVisible();
    await expect(page.getByText('Cognitive Encoding Workout Complete!')).toBeVisible();

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

test.describe('History & drills', () => {
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
    await expect(page.getByText('Cognitive Encoding Workout Complete!')).toBeVisible();
    await expect(page.getByText('seeded one')).toBeVisible();
  });

  test('launch a drill from the history drawer', async ({ page }) => {
    const schema = makeSavedSchema();
    await page.addInitScript((s) => {
      (window as any).localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([s]));
    }, schema);

    await page.goto('/');
    await page.locator('button[title^="View Saved Schemas History"]').click();
    await page.getByRole('button', { name: 'Drill', exact: true }).click();
    await expect(page.getByText('Active Retrieval Drill')).toBeVisible();
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
