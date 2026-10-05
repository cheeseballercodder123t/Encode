import { test, expect, type Page } from '@playwright/test';
import { mockAiApis } from './helpers/mocks';

/**
 * The interactive pathway builder.
 *
 * These specs drive the real surface the learner uses: chips are selected and
 * dropped into sockets (by click and by drag), and the verdict has to come from
 * the declared chemistry — a decoy has to be called out by name, flow has to
 * stop at the first incomplete step, and the product only appears once every
 * step is catalytically complete.
 */

async function openBuilder(page: Page) {
  await mockAiApis(page);
  await page.goto('/');
  await page.getByTestId('open-pathway-builder').click();
  const builder = page.getByTestId('pathway-builder');
  await expect(builder).toBeVisible();
  return builder;
}

const socket = (page: Page, step: string, kind: 'enzyme' | 'cofactor') => page.locator(`[data-socket-step="${step}"][data-socket-kind="${kind}"]`);
const piece = (page: Page, id: string) => page.locator(`[data-piece-id="${id}"]`);

async function place(page: Page, pieceId: string, step: string, kind: 'enzyme' | 'cofactor') {
  await piece(page, pieceId).click();
  await socket(page, step, kind).click();
}

test('the builder grades declared chemistry: decoys are named, flow is sequential, product is earned', async ({ page }) => {
  await openBuilder(page);

  const status = page.getByTestId('pathway-status');
  await expect(status).toContainText('NO FLOW');
  await expect(page.getByTestId('pathway-yield')).toHaveText('—');

  // Step 1 by click: the oxidation needs its dehydrogenase and NAD+.
  await place(page, 'gapdh', 'oxidation', 'enzyme');
  await place(page, 'nad', 'oxidation', 'cofactor');
  await expect(status).toContainText('FLOW BLOCKED AT STEP 2');
  await expect(page.getByTestId('pathway-yield')).toHaveText('2 NADH');

  // Step 2 by dragging the chip onto the socket.
  const chip = piece(page, 'pgk');
  const target = socket(page, 'first-atp', 'enzyme');
  const from = (await chip.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(target).toHaveAttribute('data-filled', 'true');
  await expect(target).toContainText('Phosphoglycerate kinase');
  await place(page, 'adp', 'first-atp', 'cofactor');
  await expect(status).toContainText('FLOW BLOCKED AT STEP 3');
  await expect(page.getByTestId('pathway-yield')).toHaveText('2 NADH · 2 ATP');

  // An investment-phase enzyme is not the final kinase, and the builder says why.
  await place(page, 'hexokinase', 'second-atp', 'enzyme');
  await expect(page.locator('[data-socket-step="second-atp"][data-socket-kind="enzyme"]')).toHaveClass(/is-wrong/);
  await expect(page.getByTestId('pathway-blockers')).toContainText('Hexokinase');
  await expect(page.getByTestId('pathway-blockers')).toContainText('investment phase');
  await expect(status).toContainText('FLOW BLOCKED AT STEP 3');

  // A socket can be emptied and refilled with the right piece.
  await page.locator('[data-socket-step="second-atp"][data-socket-kind="enzyme"] ~ [data-testid="pathway-clear"]').click();
  await place(page, 'pyruvate-kinase', 'second-atp', 'enzyme');
  await place(page, 'adp', 'second-atp', 'cofactor');

  await expect(status).toContainText('PRODUCT FORMED');
  const verdict = page.getByTestId('pathway-verdict');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText('Pyruvate is formed');
  await expect(verdict).toContainText('is oxidized to 1,3-bisphosphoglycerate by glyceraldehyde-3-phosphate dehydrogenase');
  await expect(page.getByTestId('pathway-yield')).toHaveText('2 NADH · 2 ATP · 2 ATP');

  // Reset returns the board to nothing placed.
  await page.getByTestId('pathway-reset').click();
  await expect(status).toContainText('NO FLOW');
  await expect(page.getByTestId('pathway-verdict')).toHaveCount(0);
});

test('the declared chain and its source grounding are one click away, and the sheet is escapable', async ({ page }) => {
  await openBuilder(page);

  await page.getByTestId('pathway-evidence-toggle').click();
  const evidence = page.getByTestId('pathway-evidence');
  await expect(evidence).toContainText('NAD+ and ADP are the cofactors consumed');
  await expect(evidence).toContainText('is deliberately out of scope');

  await page.getByTestId('pathway-solve').click();
  await expect(page.getByTestId('pathway-status')).toContainText('PRODUCT FORMED');
  await expect(page.getByTestId('pathway-piece').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pathway-builder')).toHaveCount(0);
});
