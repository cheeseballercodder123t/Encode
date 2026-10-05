import { test, expect } from '@playwright/test';
import { MOCK_NOTES } from './helpers/fixtures';
import { mockAiApis, confirmReadiness, expectStage, startEncodeFromNotes } from './helpers/mocks';

for (const width of [1440, 768, 390, 320]) {
  test(`the cognitive studio is usable at ${width}px`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await mockAiApis(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Less re-reading/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your encoding workbench' })).toBeVisible();
    const notes = page.getByLabel('Study notes (optional when a file is attached)');
    const build = page.getByRole('button', { name: /Build cognitive schema/ });
    await expect(build).toBeDisabled();

    // Screenshots retain the rendered desktop/tablet/mobile layouts for review.
    await page.screenshot({ path: testInfo.outputPath(`studio-${width}.png`), fullPage: true });
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      background: getComputedStyle(document.body).backgroundColor,
      heroSize: parseFloat(getComputedStyle(document.querySelector('#studio-headline')!).fontSize),
    }));
    expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.background).toBe('rgb(11, 12, 17)');
    expect(geometry.heroSize).toBeGreaterThanOrEqual(36);

    await page.getByRole('button', { name: /BIO-01/ }).click();
    await expect(notes).toHaveValue(/Neurobiology: The Action Potential/);
    await expect(build).toBeEnabled();
    await expect(page.getByText(/words · ready to encode/)).toBeVisible();

    const express = page.getByRole('button', { name: /G1 Express Forge/ });
    await express.click();
    await expect(express).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/The AI pulls out the mechanism/)).toBeVisible();

    const research = page.getByRole('button', { name: /Deep research/ });
    await expect(research).toBeHidden();
    await page.locator('.studio-tuning-details summary').click();
    await expect(research).toBeVisible();
    await research.click();
    await expect(research).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'YouTube URL', exact: true }).click();
    const video = page.getByRole('textbox', { name: 'YouTube video URL' });
    await expect(video).toBeVisible();
    await expect(build).toBeDisabled();
    await video.fill('https://www.youtube.com/watch?v=aircAruvnKk');
    await expect(build).toBeEnabled();
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(notes).toHaveValue(/Neurobiology/);

    await notes.focus();
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText(/01\/02/)).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });
}

/**
 * The 3-zone studio, once a stage is open.
 *
 * A stage is routinely 1500–2500px tall while the window is ~800px, and the
 * layout has to stay honest across that gap:
 *
 *  - nothing may spill past the right edge (the shell clips horizontal
 *    overflow, and a clipped column is exactly what "cut off" looks like),
 *  - the two side rails must follow the reader instead of ending early and
 *    leaving the rest of their column empty,
 *  - nothing may float over the answer fields — a bottom-pinned action bar in
 *    a card this tall parks itself on top of whatever you are typing — and
 *  - no panel may hide its own text behind a horizontal scrollbar, which is
 *    how a 140-character unbreakable token in the source (a share URL, a hash)
 *    used to clip the 240px source dock at its right edge.
 *
 * The rails are why this test exists: `.studio-shell` used to carry
 * `overflow-x-hidden`, and `hidden` on one axis silently forces the other to
 * `auto`, which made the shell a (non-scrolling) scroll container and thereby
 * made every `position: sticky` inside it inert — so `lg:sticky` on the two
 * side rails was dead CSS.
 */
test('the workbench columns stay inside the viewport and beside the reader', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockAiApis(page);
  // Include one token with no break opportunity in it.
  await startEncodeFromNotes(page, `${MOCK_NOTES}\nhttps://university.example.edu/${'C'.repeat(140)}/notes`);
  await confirmReadiness(page);
  await expectStage(page, 1);

  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);

  // The stage card is taller than the window, so the page really does scroll.
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(scrollable).toBeGreaterThan(300);

  await page.evaluate(() => window.scrollTo(0, 600));
  await expect
    .poll(async () =>
      page.getByTestId('workbench-zone-examiner').evaluate((node) => Math.round(node.getBoundingClientRect().top)),
    )
    .toBeLessThan(40);
  await expect
    .poll(async () =>
      page.getByTestId('workbench-zone-source').evaluate((node) => Math.round(node.getBoundingClientRect().top)),
    )
    .toBeLessThan(40);

  // No panel may hide text behind a horizontal scrollbar.
  const panes = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid^="workbench-zone-"] .overflow-y-auto, [data-testid^="workbench-zone-"] .overflow-auto',
      ),
    ).map((el) => ({ cls: el.className.slice(0, 46), scrollW: el.scrollWidth, clientW: el.clientWidth })),
  );
  expect(panes.length).toBeGreaterThan(0);
  for (const pane of panes) {
    expect(pane.scrollW, `${pane.cls} overflows sideways`).toBeLessThanOrEqual(pane.clientW + 1);
  }

  // No sticky/fixed layer may sit on top of a field the learner is writing in.
  const covered = await page.evaluate(() => {
    const fields = Array.from(document.querySelectorAll<HTMLElement>('[data-dg-field]'));
    const hit: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const position = getComputedStyle(el).position;
      if (position !== 'sticky' && position !== 'fixed') continue;
      if (el.closest('[data-dg-field]')) continue;
      const a = el.getBoundingClientRect();
      if (a.width === 0 || a.height === 0) continue;
      for (const field of fields) {
        const b = field.getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          hit.push(field.getAttribute('data-dg-field') || 'field');
        }
      }
    }
    return hit;
  });
  expect(covered).toEqual([]);
});

test('reduced-motion preference stops decorative motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.locator('.orbit-pulse').evaluate((node) =>
    parseFloat(getComputedStyle(node).animationDuration),
  );
  expect(duration).toBeLessThan(0.001);
  for (const satellite of await page.locator('.orbit-traveler').all()) {
    const animation = await satellite.evaluate((node) => getComputedStyle(node).animationName);
    expect(animation).toBe('none');
  }
});

for (const width of [1440, 390]) {
  test(`the armillary diagram is contained and animated at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const diagram = page.locator('.cognitive-orbit');
    await expect(diagram).toBeVisible();
    await expect(diagram).toHaveAttribute('aria-hidden', 'true');
    await expect(diagram.locator('.orbit-dial path')).toHaveCount(72);
    await expect(diagram.locator('.orbit-labels')).toContainText('MECHANISM');

    const traveler = diagram.locator('.orbit-traveler-source');
    const initial = await traveler.evaluate((node) => getComputedStyle(node).transform);
    await expect.poll(() => traveler.evaluate((node) => getComputedStyle(node).transform)).not.toBe(initial);

    // Sample a complete revolution without waiting for the animation clock.
    const contained = await page.locator('.orbit-drawing').evaluate((svg) => {
      const bounds = svg.getBoundingClientRect();
      return Array.from(svg.querySelectorAll<SVGGraphicsElement>('.orbit-traveler')).every((node) => {
        const animation = node.getAnimations()[0];
        if (!animation?.effect) return false;
        animation.pause();
        const duration = Number(animation.effect.getComputedTiming().duration);
        const delay = animation.effect.getTiming().delay ?? 0;
        return Array.from({ length: 12 }, (_, index) => {
          animation.currentTime = delay + duration * index / 12;
          const rect = node.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right &&
            rect.top >= bounds.top && rect.bottom <= bounds.bottom;
        }).every(Boolean);
      });
    });
    expect(contained).toBe(true);
    await diagram.screenshot({ path: testInfo.outputPath(`orbit-${width}.png`) });
  });
}
