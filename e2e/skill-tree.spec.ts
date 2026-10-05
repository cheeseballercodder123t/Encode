import { test, expect, type Page } from '@playwright/test';
import { TOY_EXAMPLES, activityForToyExample } from '../lib/toy-models/examples';
import { mockAiApis } from './helpers/mocks';
import type { PrerequisitesReport, SavedSchema, StageResponse } from '../lib/types';

/**
 * Course-level prerequisite skill tree.
 *
 * The graph is only honest if its colours mean exactly one thing: a finished
 * course is green, a course in flight is amber, and a foundation that nothing
 * in the library covers is locked. These specs seed a real library into
 * localStorage (what the app itself reads) and drive the actual modal — no
 * model call is involved in building the tree.
 */

const firstStage = activityForToyExample(TOY_EXAMPLES[0]);
const secondStage = activityForToyExample(TOY_EXAMPLES[1]);
const answered: StageResponse = { field1: 'I wrote the mechanism out', field2: 'because the coupling forces it' };

function schema(fields: Pick<SavedSchema, 'id' | 'topicSummary' | 'activities'> & Partial<SavedSchema>): SavedSchema {
  return { timestamp: Date.now(), mode: 'conceptual', xpEarned: 0, userResponses: {}, ...fields };
}

/** Ohm's law names two foundations; only one of them exists in the library. */
const audit: PrerequisitesReport = {
  isReadyToEncode: false,
  topicTitle: 'Ohm’s law',
  prerequisites: [
    { id: 'p1', name: 'Voltage divider networks', importance: 'Every series branch is one.', primerSummary: 'A divider splits voltage in proportion to resistance.' },
    { id: 'p2', name: 'Charge carriers', importance: 'Current is their flow.', primerSummary: 'Charge carriers drift under a field; current counts them per second.' },
  ],
};

const library: SavedSchema[] = [
  schema({ id: 'course-ohm', topicSummary: 'Ohm’s law', activities: [firstStage], userResponses: { [firstStage.id]: answered }, prerequisites: audit, timestamp: 20 }),
  schema({ id: 'course-divider', topicSummary: 'Voltage divider networks', activities: [firstStage, secondStage], userResponses: { [firstStage.id]: answered }, timestamp: 10 }),
];

async function seedLibrary(page: Page, schemas: SavedSchema[]) {
  await mockAiApis(page);
  await page.addInitScript((value) => {
    window.localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(value));
  }, schemas);
  await page.goto('/');
}

test('the skill tree colours encoded, in-progress and locked foundations from the library', async ({ page }) => {
  await seedLibrary(page, library);

  const opener = page.getByRole('button', { name: /Skill tree/ });
  await expect(opener).toBeVisible();
  await expect(opener).toContainText('1 locked');
  await opener.click();

  const modal = page.getByTestId('skill-tree');
  await expect(modal).toBeVisible();
  await expect(page.getByTestId('skill-gaps')).toContainText('1 locked foundation');

  await expect(page.getByTestId('skill-node')).toHaveCount(3);
  const mastered = page.locator('[data-testid="skill-node"][data-state="mastered"]');
  await expect(mastered).toHaveCount(1);
  await expect(mastered).toContainText('Ohm’s law');
  await expect(mastered).toContainText('1 of 1 stages encoded');
  await expect(page.locator('[data-testid="skill-node"][data-state="in-progress"]')).toContainText('1 of 2 stages encoded');

  const locked = page.locator('[data-testid="skill-node"][data-state="locked"]');
  await expect(locked).toContainText('Charge carriers');

  // The covered foundation is an EDGE to the real course, never a duplicate node
  // standing next to it.
  await expect(mastered).toContainText('Voltage divider networks');
  // The gap carries the audit's own primer, so it can be closed from here.
  await locked.getByText('30-second primer').click();
  await expect(locked).toContainText('Charge carriers drift under a field');

  // Two layers: foundations first, the topic that needs them above.
  await expect(page.getByTestId('skill-column')).toHaveCount(2);
  await expect(modal).not.toContainText('NaN');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('skill-tree')).toHaveCount(0);
});

test('an empty or audit-less library is told the truth instead of being padded', async ({ page }) => {
  await seedLibrary(page, []);
  await page.getByRole('button', { name: /Skill tree/ }).click();
  await expect(page.getByTestId('skill-tree')).toContainText('No encoded topics yet');
  await page.keyboard.press('Escape');

  await seedLibrary(page, [schema({ id: 'plain', topicSummary: 'Plain topic', activities: [firstStage], userResponses: { [firstStage.id]: answered } })]);
  await page.getByRole('button', { name: /Skill tree/ }).click();
  await expect(page.getByTestId('skill-node')).toHaveCount(1);
  await expect(page.getByTestId('skill-node')).toHaveAttribute('data-state', 'mastered');
  await expect(page.getByTestId('skill-tree')).toContainText('No prerequisite audits are attached');
});
