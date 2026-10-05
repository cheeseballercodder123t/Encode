import { test, expect, type Page } from '@playwright/test';
import { TOY_EXAMPLES, activityForToyExample } from '../lib/toy-models/examples';
import { buildToyChallenge } from '../lib/toy-models/engine';
import { mockAiApis, ENCODE_ROUTE } from './helpers/mocks';

async function setRange(page: Page, label: string, value: number) {
  const range = page.getByRole('slider', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await range.evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(element, String(next));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function openExample(page: Page, index: number) {
  await page.goto('/');
  await page.getByRole('group', { name: 'Try an interactive laboratory' }).getByRole('button', { name: TOY_EXAMPLES[index].label }).click();
  await expect(page.getByTestId('toy-model-lab')).toBeVisible();
}
for (let index = 0; index < TOY_EXAMPLES.length; index++) {
  const example = TOY_EXAMPLES[index];
  test(`${example.label}: prediction → manipulation → reveal → persisted trap`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: index % 2 ? 390 : 1280, height: 1000 });
    await openExample(page, index);
    const lab = page.getByTestId('toy-model-lab');
    await expect(lab).toHaveAttribute('data-archetype', example.config.type);
    for (const slider of await lab.getByRole('slider').all()) await expect(slider).toBeDisabled();
    await expect(page.getByTestId('toy-reveal')).toHaveCount(0);
    const challenge = buildToyChallenge(example.config);
    const choice = challenge.choices.find((item) => item.id === challenge.correctId)!;
    await lab.getByRole('button', { name: choice.label, exact: true }).click();
    await expect(lab.getByRole('slider').first()).toBeEnabled();
    await expect(page.getByTestId('toy-reveal')).toHaveCount(0);
    const variable = example.config.prediction.variableKey === example.config.primaryVar.key ? example.config.primaryVar : example.config.type === 'ratio_scaling' ? example.config.denominator : undefined;
    if (!variable) throw Error('Fixture target variable');
    await setRange(page, variable.label, example.config.prediction.target);
    if (example.config.type === 'phase_plane' && example.config.prediction.targetY !== undefined) {
      // The phase-plane question moves BOTH coordinates, and the reveal
      // verifies the engine's exact target configuration, so the second
      // slider has to land on targetY too.
      await setRange(page, example.config.secondVar.label, example.config.prediction.targetY);
    }
    await expect(page.getByTestId('toy-reveal')).toContainText('Prediction confirmed.');
    await expect(page.getByTestId('toy-reveal')).toContainText(example.config.takeaway);
    await expect(lab).not.toContainText('NaN');
    await expect(lab).not.toContainText('Infinity');
    await lab.locator('.toy-evidence summary').click();
    await expect(lab.locator('.toy-evidence')).toContainText(example.config.evidence[0].quote);
    await expect(lab.locator('.toy-evidence')).toContainText('illustrative');
    await page.getByRole('button', { name: 'Use this boundary rule' }).click();
    await expect(page.getByPlaceholder('Which assumption stops holding?')).toHaveValue(example.config.takeaway);
    await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem('deepencode_toy_progress_v1') || '{}')[id]?.revealed, `lab-${example.id}`)).toBe(true);
    await lab.screenshot({ path: testInfo.outputPath(`lab-${example.id}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.reload();
    await page.getByRole('group', { name: 'Try an interactive laboratory' }).getByRole('button', { name: example.label }).click();
    await expect(page.getByTestId('toy-reveal')).toContainText(example.config.takeaway);
    await page.getByRole('button', { name: 'Reset hypothesis' }).click();
    await expect(page.getByTestId('toy-reveal')).toHaveCount(0);
    await expect(page.getByTestId('toy-model-lab').getByRole('slider').first()).toBeDisabled();
    expect(errors).toEqual([]);
  });
}
test('completed lab exports its trap in Anki text and checkpoints into the library', async ({ page }) => {
  await openExample(page, 0);
  await page.getByRole('button', { name: 'Decreases', exact: true }).click();
  await setRange(page, 'Resistance', 8);
  await expect(page.getByTestId('toy-reveal')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('deepencode_saved_schemas_v2') || '[]').some((schema: { userResponses?: Record<string, { toyModelProgress?: { revealed?: boolean } }> }) => Object.values(schema.userResponses || {}).some((response) => response.toyModelProgress?.revealed)))).toBe(true);
  await page.locator('button[title^="Export .apkg Anki package"]').first().click();
  await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download.*\.txt/i }).click();
  const artifact = await download;
  const stream = await artifact.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text).toContain('InterferenceTrap');
  expect(text).toContain('Doubling resistance halves current only when voltage is held fixed.');
});

test('wrong prediction is corrected; altered secondary input cannot falsely reveal the target', async ({ page }) => {
  await openExample(page, 0);
  await page.getByRole('button', { name: 'Increases', exact: true }).click();
  await setRange(page, 'Voltage', 6);
  await setRange(page, 'Resistance', 8);
  await expect(page.getByTestId('toy-output')).toHaveText('0.75');
  await expect(page.getByTestId('toy-reveal')).toHaveCount(0);
  await setRange(page, 'Voltage', 12);
  await expect(page.getByTestId('toy-reveal')).toContainText('A better model than your first guess.');
  await expect(page.getByTestId('toy-output')).toHaveText('1.5');
});
test('native sliders respond to keyboard and pointer input', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await openExample(page, 0);
  await page.getByRole('button', { name: 'Decreases', exact: true }).click();
  const resistance = page.getByRole('slider', { name: /Resistance/ });
  await resistance.focus();
  await page.keyboard.press('ArrowRight');
  await expect(resistance).toHaveValue('4.1');
  await expect(page.getByTestId('toy-output')).toHaveText('2.927');
  const bounds = await resistance.boundingBox();
  if (!bounds) throw Error('Visible range bounds');
  await page.mouse.click(bounds.x + bounds.width * 0.75, bounds.y + bounds.height / 2);
  await expect.poll(async () => Number(await resistance.inputValue())).toBeGreaterThan(8);
  await expect(page.getByTestId('toy-output')).not.toHaveText('2.927');
});

test('threshold and counter-model demonstrate collapse rather than saturation', async ({ page }) => {
  await openExample(page, 4);
  await page.getByRole('button', { name: 'DENATURED', exact: true }).click();
  await setRange(page, 'Temperature', 37);
  await expect(page.getByTestId('toy-output')).toHaveText('100');
  await page.getByRole('button', { name: 'Flaw hunter: compare models' }).click();
  await expect(page.locator('.toy-counter-note')).toContainText('ignores denaturation');
  await setRange(page, 'Temperature', 45);
  await expect(page.getByTestId('toy-output')).toHaveText('0');
  await expect(page.getByTestId('toy-model-lab')).toHaveClass(/toy-lab-critical/);
  await expect(page.locator('.toy-domino-chain')).toHaveClass(/is-critical/);
});
test('cycle steps, scrubs and auto-plays; equilibrium relaxes while conserving material', async ({ page }) => {
  await openExample(page, 3);
  await page.getByRole('button', { name: 'Refractory recovery', exact: true }).click();
  await page.getByRole('button', { name: 'Next state →' }).click();
  await expect(page.locator('.toy-cycle-states .is-active')).toContainText('Depolarization');
  await page.getByRole('button', { name: 'Auto-play' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('slider', { name: /Reaction progress/ }).inputValue()).not.toBe('17');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await setRange(page, 'Reaction progress', 75);
  await expect(page.locator('.toy-cycle-states .is-active')).toContainText('Refractory recovery');

  await openExample(page, 2);
  await page.getByRole('button', { name: 'Increases', exact: true }).click();
  await page.getByRole('button', { name: 'Release to equilibrium' }).click();
  await expect(page.getByTestId('toy-output')).toHaveText('0', { timeout: 15000 });
  await expect(page.locator('.toy-telemetry')).toContainText('EQUILIBRIUM');
});
test('reduced motion freezes particle flow and disables autoplay without disabling the lesson', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openExample(page, 0);
  const animations = await page.locator('.toy-flow-particle').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName));
  expect(animations.every((name) => name === 'none')).toBe(true);
  await openExample(page, 3);
  await page.getByRole('button', { name: 'Refractory recovery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Auto-play' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next state →' })).toBeEnabled();
});
test('valid streamed AI configs render in the existing encode flow, malformed configs retain the original stage', async ({ page }) => {
  await mockAiApis(page);
  const activity = activityForToyExample(TOY_EXAMPLES[0]);
  await page.route(ENCODE_ROUTE, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ topicSummary: 'Ohm', activities: [activity] }) }));
  await page.goto('/');
  await page.getByPlaceholder(/Paste study material/).fill(TOY_EXAMPLES[0].notes);
  await page.getByRole('button', { name: 'Build cognitive schema', exact: true }).click();
  await expect(page.getByTestId('toy-model-lab')).toBeVisible();

  await page.route(ENCODE_ROUTE, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ topicSummary: 'Broken lab', activities: [{ ...activity, toyModel: { type: 'unknown' } }] }) }));
  await page.goto('/');
  await page.getByPlaceholder(/Paste study material/).fill('Ohm’s law');
  await page.getByRole('button', { name: 'Build cognitive schema', exact: true }).click();
  await expect(page.getByText(/Interactive model unavailable/)).toBeVisible();
  await expect(page.getByTestId('toy-model-lab')).toHaveCount(0);
  await expect(page.getByPlaceholder('What physically changed?')).toBeVisible();
});

const predpreyIndex = TOY_EXAMPLES.findIndex((example) => example.id === 'predprey');

/**
 * The Devil's Advocate duel.
 *
 * The claim is rhetoric; the refutation has to be earned on the instrument.
 * These specs pin the rules the engine enforces: dragging the phase-plane puck
 * writes real state, silence cannot refute anything, only the refutation
 * configuration flips the verdict, the verdict survives a reload, and moving
 * away un-earns it live.
 */
test('devil’s advocate duel: the claim stands until the instrument refutes it', async ({ page }) => {
  await openExample(page, predpreyIndex);
  const lab = page.getByTestId('toy-model-lab');
  const challenge = buildToyChallenge(TOY_EXAMPLES[predpreyIndex].config);
  const correct = challenge.choices.find((item) => item.id === challenge.correctId)!;
  await lab.getByRole('button', { name: correct.label, exact: true }).click();

  const duel = page.getByTestId('toy-duel');
  await expect(duel).toBeVisible();
  await expect(duel).toContainText('wiped out and never come back');

  // Dragging the puck manipulates the same state the sliders write. The
  // instrument has to be in the viewport first — mouse coordinates are viewport
  // coordinates, and a box measured below the fold drags nothing.
  const plane = page.getByTestId('phase-plane-svg');
  await plane.scrollIntoViewIfNeeded();
  const bounds = await plane.boundingBox();
  if (!bounds) throw Error('Visible phase plane');
  const predator = page.getByRole('slider', { name: /Predator population/ });
  const before = await predator.inputValue();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => predator.inputValue()).not.toBe(before);

  // The claim has not been heard yet: the instrument cannot refute silence.
  await expect(page.getByTestId('toy-duel-verdict')).toHaveCount(0);
  await page.getByRole('button', { name: 'Take the claim seriously' }).click();
  await expect(duel).toContainText('predator population to 7.5 tens');
  await expect(page.getByTestId('phase-duel-marker')).toBeVisible();

  // A configuration that is not the refutation point leaves the claim standing.
  await setRange(page, 'Predator population', 5);
  await expect(page.getByTestId('toy-duel-verdict')).toHaveCount(0);
  await setRange(page, 'Predator population', 7.5);
  await expect(page.getByTestId('toy-duel-verdict')).toContainText('orbits');
  await expect(page.getByTestId('phase-duel-marker')).toHaveCount(0);

  // The refutation survives a reload, and moving off it un-earns it live.
  await page.reload();
  await page.getByRole('group', { name: 'Try an interactive laboratory' }).getByRole('button', { name: TOY_EXAMPLES[predpreyIndex].label }).click();
  await expect(page.getByTestId('toy-duel-verdict')).toContainText('orbits');
  await setRange(page, 'Predator population', 2);
  await expect(page.getByTestId('toy-duel-verdict')).toHaveCount(0);
  await expect(page.getByTestId('toy-model-lab')).not.toContainText('NaN');
});

test('a refuted duel ships its Devil’s Advocate card in the Anki export', async ({ page }) => {
  await openExample(page, predpreyIndex);
  const challenge = buildToyChallenge(TOY_EXAMPLES[predpreyIndex].config);
  const correct = challenge.choices.find((item) => item.id === challenge.correctId)!;
  await page.getByTestId('toy-model-lab').getByRole('button', { name: correct.label, exact: true }).click();
  await page.getByRole('button', { name: 'Take the claim seriously' }).click();
  // Reveal first (both coordinates on the question's target), then refute.
  await setRange(page, 'Prey population', 1.2);
  await setRange(page, 'Predator population', 4.5);
  await expect(page.getByTestId('toy-reveal')).toContainText('Prediction confirmed.');
  await setRange(page, 'Predator population', 7.5);
  await expect(page.getByTestId('toy-duel-verdict')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('deepencode_saved_schemas_v2') || '[]').some((schema: { userResponses?: Record<string, { toyModelProgress?: { duelRefuted?: boolean } }> }) => Object.values(schema.userResponses || {}).some((response) => response.toyModelProgress?.duelRefuted)))).toBe(true);
  await page.locator('button[title^="Export .apkg Anki package"]').first().click();
  await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download.*\.txt/i }).click();
  const artifact = await download;
  const stream = await artifact.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text).toContain('DevilsAdvocate');
  expect(text).toContain('Maya claims');
  expect(text).toContain('Refuted by setting predator');
});
