import { test, expect, type Page } from '@playwright/test';
import { mockAiApis } from './helpers/mocks';
import { TOY_EXAMPLES } from '../lib/toy-models/examples';
import { buildToyChallenge } from '../lib/toy-models/engine';

/**
 * RemNote-native embeds (docs/remnote-native-architecture.md, Phase 3).
 *
 * The embed route is what a pasted RemNote bullet unfurls: one interactive lab,
 * no navigation chrome, no API key, and nothing invented when the id is wrong.
 * These specs drive the real page the way RemNote's iframe would see it.
 */

const EXAMPLE = TOY_EXAMPLES.find((example) => example.id === 'ohm')!;

/** The lab's range input, driven through the native value setter. */
async function setRange(page: Page, label: string, value: number) {
  const range = page.getByRole('slider', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await range.evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('a teaching-example embed renders one chrome-free, no-key lab', async ({ page }) => {
  await page.goto('/embed/toy-models/ohm');

  const page_ = page.getByTestId('toy-embed-page');
  await expect(page_).toHaveAttribute('data-embed-kind', 'example');

  // The lab itself, with its instrument and prediction gate.
  const lab = page.getByTestId('toy-model-lab');
  await expect(lab).toBeVisible();
  await expect(lab).toHaveAttribute('data-archetype', EXAMPLE.config.type);
  await expect(page.getByRole('heading', { name: 'Ohm’s law · current you can feel' })).toBeVisible();

  // Chrome-free: no studio masthead, nav, or footer made it onto the page.
  await expect(page.locator('.studio-masthead')).toHaveCount(0);
  await expect(page.locator('.studio-nav')).toHaveCount(0);
  await expect(page.locator('.studio-footer')).toHaveCount(0);

  // It is a real, working instrument: commit the prediction, move the slider,
  // and the reveal arrives — no API key and no studio session involved.
  const challenge = buildToyChallenge(EXAMPLE.config);
  const choice = challenge.choices.find((item) => item.id === challenge.correctId)!;
  await lab.getByRole('button', { name: choice.label, exact: true }).click();
  await expect(lab.getByRole('slider').first()).toBeEnabled();
  const variable = EXAMPLE.config.type === 'ratio_scaling' ? EXAMPLE.config.denominator : EXAMPLE.config.primaryVar;
  await setRange(page, variable.label, EXAMPLE.config.prediction.target);
  await expect(page.getByTestId('toy-reveal')).toContainText('Prediction confirmed.');
  await expect(lab).not.toContainText('NaN');
});

test('an unknown embed id says so honestly instead of inventing a lab', async ({ page }) => {
  await page.goto('/embed/toy-models/not-a-real-lab');

  await expect(page.getByTestId('toy-embed-page')).toHaveAttribute('data-embed-kind', 'library');
  const missing = page.getByTestId('toy-embed-missing');
  await expect(missing).toBeVisible();
  await expect(missing).toContainText('No interactive lab');
  // And the empty browser has no lab to fall back on either.
  await expect(page.getByTestId('toy-model-lab')).toHaveCount(0);
});

test('the lab offers a copyable RemNote embed bullet', async ({ page, context }) => {
  // Clipboard is a browser permission; grant it so the write resolves.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/embed/toy-models/ohm');

  const button = page.getByTestId('toy-embed-copy');
  await expect(button).toBeVisible();
  await button.click();

  await expect(button).toContainText('RemNote embed copied');
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  const origin = new URL(page.url()).origin;
  expect(markdown).toContain('- Interactive Lab: Ohm’s law · current you can feel #[[Extra Card Detail]]');
  // The URL round-trips: the embed id the button emits is exactly what this
  // page itself resolved, so a pasted bullet unfurls the same lab again.
  expect(markdown).toBe(`- Interactive Lab: Ohm’s law · current you can feel #[[Extra Card Detail]]\n    - ${origin}/embed/toy-models/ohm`);
});
