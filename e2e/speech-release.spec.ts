import { test, expect, type Page } from '@playwright/test';
import { MOCK_NOTES, P1_FIELD1, P1_FIELD2, P2_FIELD1, P2_FIELD2 } from './helpers/fixtures';
import { mockAiApis, startEncodeFromNotes, confirmReadiness, expectStage } from './helpers/mocks';

/**
 * The microphone is released when the learner leaves the stage.
 *
 * `SpeechRecognition` is a browser object holding the mic, not a DOM node: it
 * does not stop because the component that started it went away. With
 * `continuous = true` it kept transcribing after the learner moved on, so the
 * tab's recording indicator stayed lit with nothing on screen saying so, and
 * every `onresult` appended its transcript to `field2` — which by then belonged
 * to the NEXT stage, putting the learner's speech one stage behind their voice.
 *
 * A real recogniser needs a microphone and a speech service, so this spec
 * installs a stub before the app boots and counts what the app does to it. That
 * makes the release observable rather than assumed: `stop()` must be called when
 * the stage changes, and again when the workbench unmounts at the end of the
 * workout, whatever the learner does with the toggle.
 */
const STUB_KEY = '__speechStub';

async function installStubRecognition(page: Page) {
  await page.addInitScript((key: string) => {
    const calls = { started: 0, stopped: 0 };
    (window as any)[key] = calls;
    class StubRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart: null | (() => void) = null;
      onresult: null | ((e: unknown) => void) = null;
      onerror: null | (() => void) = null;
      onend: null | (() => void) = null;
      start() {
        calls.started += 1;
        this.onstart?.();
      }
      stop() {
        calls.stopped += 1;
        this.onend?.();
      }
      abort() {
        calls.stopped += 1;
        this.onend?.();
      }
    }
    (window as any).SpeechRecognition = StubRecognition;
    (window as any).webkitSpeechRecognition = StubRecognition;
  }, STUB_KEY);
}

const calls = (page: Page) => page.evaluate((key: string) => (window as any)[key], STUB_KEY);
const mic = (page: Page) => page.getByTitle('Speak your explanation out loud');
const listening = (page: Page) => page.getByText('● Listening');

/** Stage 1 with its two fields filled, which is what the NEXT control requires. */
async function stageOneReady(page: Page) {
  await mockAiApis(page);
  await startEncodeFromNotes(page, MOCK_NOTES);
  await confirmReadiness(page);
  await expectStage(page, 1);
  await page.getByPlaceholder(P1_FIELD1).fill('Sodium rushes in through voltage-gated channels.');
  await page.getByPlaceholder(P1_FIELD2).fill('The membrane crossed threshold, so gates open.');
}

test.describe('the speech recogniser is released', () => {
  test('leaving the stage stops it, and the control stops claiming to listen', async ({ page }) => {
    await installStubRecognition(page);
    await stageOneReady(page);

    await mic(page).click();
    await expect(listening(page)).toBeVisible();
    expect((await calls(page)).started).toBe(1);
    // Nothing has been stopped yet: the recogniser is live and holding the mic.
    expect((await calls(page)).stopped).toBe(0);

    await page.getByRole('button', { name: 'Check' }).click();
    await page.getByText('Good mechanism : tighten the threshold detail.').waitFor();
    await page.getByRole('button', { name: 'NEXT →' }).click();

    await expect.poll(async () => (await calls(page)).stopped, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(listening(page)).toHaveCount(0);
  });

  test('finishing the workout releases it, because the workbench is gone', async ({ page }) => {
    await installStubRecognition(page);
    await stageOneReady(page);

    // Walk stage 1 without the mic, so the count below belongs to stage 2 alone.
    await page.getByRole('button', { name: 'Check' }).click();
    await page.getByText('Good mechanism : tighten the threshold detail.').waitFor();
    await page.getByRole('button', { name: 'NEXT →' }).click();
    await confirmReadiness(page);
    await expectStage(page, 2);
    await page.getByPlaceholder(P2_FIELD1).fill('Channels inactivate and potassium leaves.');
    await page.getByPlaceholder(P2_FIELD2).fill('To restore the resting charge for the next spike.');

    // Listen on the last stage, then finish: the workbench unmounts while the
    // recogniser is still running, which is the path nothing used to clean up.
    await mic(page).click();
    await expect(listening(page)).toBeVisible();
    const beforeFinish = await calls(page);
    // Nothing was listening on stage 1, so nothing was released: the release
    // only happens when there is a recogniser to release.
    expect(beforeFinish.stopped).toBe(0);

    await page.getByRole('button', { name: /FINISH/ }).click();
    await expect(page.getByText('Clean cards, ready for Anki.')).toBeVisible();

    await expect
      .poll(async () => (await calls(page)).stopped, { timeout: 5000 })
      .toBeGreaterThan(beforeFinish.stopped);
    await expect(listening(page)).toHaveCount(0);
  });
});
