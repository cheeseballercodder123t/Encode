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
 * The shell's two decorative layers are independent.
 *
 * Both came from separate polish passes and both first claimed
 * `.studio-shell::after` — the fixed film grain and a 1px viewport light line.
 * One pseudo-element cannot carry both: the later `height: 1px` collapsed the
 * grain to a strip that inherited its 4.5% opacity, silently cancelling both
 * effects. The grain keeps `::after`; the line rides `::before`'s atmosphere
 * stack, and this pins that split at the computed-style level.
 */
test('the shell keeps both the film grain and the viewport light line', async ({ page }) => {
  await mockAiApis(page);
  await page.goto('/');

  const layers = await page.evaluate(() => {
    const shell = document.querySelector('.studio-shell');
    if (!shell) return null;
    const grain = getComputedStyle(shell, '::after');
    const atmosphere = getComputedStyle(shell, '::before');
    return {
      grainPosition: grain.position,
      grainImage: grain.backgroundImage,
      grainOpacity: Number(grain.opacity),
      atmosphereImage: atmosphere.backgroundImage,
    };
  });

  expect(layers).not.toBeNull();
  // The grain owns ::after at viewport scale, with its own low opacity.
  expect(layers!.grainPosition).toBe('fixed');
  expect(layers!.grainImage).toContain('url(');
  expect(layers!.grainOpacity).toBeLessThan(0.1);
  // The light line and the vignette share ::before as two background layers.
  expect(layers!.atmosphereImage).toContain('linear-gradient');
  expect(layers!.atmosphereImage).toContain('radial-gradient');
});

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

  // The RemNote staging preview is the panel this contract was written for: it
  // lives in the narrow examiner column and used to widen past it (text hidden
  // behind a horizontal scrollbar) as soon as a markdown line carried a long
  // unbreakable token. Pin it by name, not only through the generic sweep
  // above, so a regression here fails with the panel's own name in the output.
  const staging = await page.getByTestId('remnote-staging').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
    };
  });
  expect(staging.scrollW, 'RemNote staging overflows sideways').toBeLessThanOrEqual(
    staging.clientW + 1,
  );
  // The two declarations that make the wrap possible: without pre-wrap the
  // markdown's newlines collapse, and without break-word one long token wins.
  expect(staging.whiteSpace).toBe('pre-wrap');
  expect(staging.overflowWrap).toBe('break-word');

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

/**
 * The gold leaf: the one piece of motion on the page that never stops on its
 * own. Three things have to hold for it to read as gilt rather than as a
 * border that flickers — the conic gradient must be there, the mask must
 * punch it down to a 1px rim (an unmasked conic fills the whole element),
 * and `--leaf-angle` must actually interpolate. That last one is why the
 * custom property is registered with `@property`: unregistered, it is a
 * token and the sweep snaps between stops instead of turning.
 *
 * The console spends both its pseudo-elements on corner brackets, so its
 * leaf rides a child; the audit plates have a free ::after and use the
 * element form. Both entry points are checked here.
 */
test('the gold leaf is masked to a rim and actually turns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockAiApis(page);
  await page.goto('/');

  const plate = page.locator('.leaf-frame').first();
  await expect(plate).toBeAttached();
  const leaf = await plate.evaluate((node) => {
    const style = getComputedStyle(node, '::after');
    return {
      background: style.backgroundImage,
      padding: style.paddingTop,
      maskComposite: style.maskComposite || style.webkitMaskComposite,
      animationName: style.animationName,
      pointerEvents: style.pointerEvents,
      angle: style.getPropertyValue('--leaf-angle'),
    };
  });
  expect(leaf.background).toContain('conic-gradient');
  // Unmasked this paints the whole plate in a rotating gradient.
  expect(leaf.maskComposite).toContain('exclude');
  // 1px of padding is the rim; a raw fill would have none.
  expect(parseFloat(leaf.padding)).toBe(1);
  expect(leaf.animationName).toBe('leaf-turn');
  // It must never eat a click on the console underneath it.
  expect(leaf.pointerEvents).toBe('none');
  expect(leaf.angle).toMatch(/\d/);

  // The angle has to advance between reads — that is the whole claim. Polled
  // rather than read twice because two round-trips can land inside one
  // animation frame; the poll only passes when the value genuinely changes.
  await expect
    .poll(
      async () =>
        plate.evaluate(
          (node) => getComputedStyle(node, '::after').getPropertyValue('--leaf-angle'),
        ),
      { timeout: 5_000 },
    )
    .not.toBe(leaf.angle);

  // The element form, on a plate whose ::after is free.
  const audit = await page.locator('.leaf-edge').first().evaluate((node) => {
    const style = getComputedStyle(node, '::after');
    return { background: style.backgroundImage, animationName: style.animationName };
  });
  expect(audit.background).toContain('conic-gradient');
  expect(audit.animationName).toBe('leaf-turn');
});

/**
 * The hero is the app's first impression, so its two new devices are pinned
 * here: the manuscript initial and the engraved ledger.
 *
 * The initial is floated for looks, not extracted from the sentence — if the
 * letter ever left the reading order the paragraph would silently announce
 * "urn what you study", so the accessible name is asserted directly.
 */
test('the hero opens with an illuminated initial and an engraved ledger', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockAiApis(page);
  await page.goto('/');

  const initial = page.locator('.illuminated-initial');
  await expect(initial).toBeVisible();
  await expect(initial).toHaveText('T');

  // Reading order is unchanged: it is still "Turn what you study…".
  await expect(page.locator('.studio-intro-description')).toHaveText(/^Turn what you study into/);

  const rows = page.locator('.studio-ledger li');
  await expect(rows).toHaveCount(3);
  // Each row is ruled: index, leader, label.
  for (const row of await rows.all()) {
    await expect(row.locator('.studio-ledger-index')).toHaveText(/0[123]/);
    await expect(row.locator('.studio-ledger-label')).toBeVisible();
    await expect
      .poll(() =>
        row
          .locator('.studio-ledger-rule')
          .evaluate((node) => parseFloat(getComputedStyle(node).borderBottomWidth)),
      )
      .toBeGreaterThan(0);
  }

  // The ruler is decoration, so it stays out of the accessibility tree.
  const eyebrow = page.locator('.studio-eyebrow');
  await expect(eyebrow.locator('.studio-ruler')).toHaveAttribute('aria-hidden', 'true');
  await expect(eyebrow).toContainText('PLATE 00');

  // The floated initial must not push the paragraph past its column.
  const overflow = await page.locator('.studio-intro-description').evaluate((node) => ({
    scrollW: node.scrollWidth,
    clientW: node.clientWidth,
  }));
  expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW + 1);
});

/**
 * Grid items stretch to the tallest sibling by default, so the two bench
 * plates shared a height: the export list is ~580px of real content, and the
 * audit panel — four short cards — got dragged out to match it, leaving 402px
 * of void under its last card that read as a rendering failure rather than as
 * whitespace. Each plate now sizes to its own content (`lg:items-start`).
 *
 * Measured, not eyeballed: 402px of dead space before, 21px after, which is
 * the panel's own bottom padding.
 */
test('no bench plate is stretched far past its own content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockAiApis(page);
  await page.goto('/');

  const panels = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.studio-bench > div')).map((panel) => {
      const box = panel.getBoundingClientRect();
      const last = panel.lastElementChild as HTMLElement | null;
      const contentBottom = last ? last.getBoundingClientRect().bottom : box.top;
      return {
        cls: panel.className.split(' ').slice(0, 2).join(' '),
        dead: Math.round(box.bottom - contentBottom),
      };
    }),
  );
  expect(panels.length).toBeGreaterThanOrEqual(2);
  for (const panel of panels) {
    // Comfortably clear of the 21px of panel padding, far below the bug.
    expect(panel.dead, `${panel.cls} has ${panel.dead}px of dead space`).toBeLessThan(64);
  }
});

/**
 * The sheet treatment: a modal is the hall's other furniture, so it carries
 * the console's instrument language — machined corner brackets and the
 * travelling gilt.
 *
 * The brackets are asserted as a *count*, because that is the whole trick:
 * four corners drawn as eight 1px gradient segments on ONE pseudo-element is
 * what leaves ::after free for the leaf. A refactor back to one pseudo per
 * corner would silently steal the leaf's slot and still look correct here.
 */
test('an open sheet carries machined corner brackets and the leaf', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockAiApis(page);
  await page.goto('/');

  await page.locator('button[title^="Configure Models"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Hand-rolled sheets keep role="dialog" on the overlay and render the plate
  // as its child; only the panel carries the treatment.
  const sheet = page.getByRole('dialog').locator('.sheet-plate');
  await expect(sheet).toBeVisible();

  const style = await sheet.evaluate((node) => {
    const brackets = getComputedStyle(node, '::before');
    const leaf = getComputedStyle(node, '::after');
    return {
      bracketLayers: brackets.backgroundImage.split('linear-gradient').length - 1,
      bracketInset: brackets.top,
      bracketPointer: brackets.pointerEvents,
      leafBackground: leaf.backgroundImage,
      leafAnimation: leaf.animationName,
    };
  });

  // Four corners = eight segments, one horizontal plus one vertical each.
  expect(style.bracketLayers).toBe(8);
  expect(style.bracketInset).not.toBe('auto');
  // Purely decorative: it must never eat a click meant for the sheet.
  expect(style.bracketPointer).toBe('none');
  expect(style.leafBackground).toContain('conic-gradient');
  expect(style.leafAnimation).toBe('leaf-turn');
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
  // The gilt stops turning, but it is parked at the angle where it is
  // brightest — a still plate should read as gilded, not as switched off.
  const leaf = await page.locator('.leaf-frame').first().evaluate((node) => {
    const style = getComputedStyle(node, '::after');
    return {
      animationName: style.animationName,
      angle: parseFloat(style.getPropertyValue('--leaf-angle')),
    };
  });
  expect(leaf.animationName).toBe('none');
  expect(leaf.angle).toBeGreaterThan(0);

  // The rail seal's dial is caught by the same base rule rather than being
  // exempted from it: at a 0.001ms duration it lands a full turn later, which
  // is where it started, so a visitor who asked for stillness gets an engraved
  // plate instead of one creeping round under the note.
  const dial = await page.locator('.brand-scale').evaluate((node) =>
    parseFloat(getComputedStyle(node).animationDuration),
  );
  expect(dial).toBeLessThan(0.001);
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

/**
 * The two brand accents are drawn metal, not a font glyph.
 *
 * Both used to be `✳` — the superscript after "DeepEncode" in the masthead and
 * a 36px mark above the launchpad rail's tagline. IBM Plex Mono does not carry
 * that character, so each one rendered through whatever fallback the browser
 * picked: a `vertical-align: top` glyph floating beside the wordmark, and a
 * heavy asterisk over a serif line in the rail. They are now one piece of drawn
 * brass (`components/BrandMark.tsx`) — the wordmark's spark, and that same spark
 * struck at 56% inside the rail's engraved seal — so the mark is decided here
 * rather than by whichever font the visitor's machine falls back to.
 *
 * Pinned here because a decorative mark is exactly the kind of thing that comes
 * back quietly. The first assertion fails if the glyph reappears anywhere in the
 * page — text or markup — at either width. The rest pins the two properties
 * that were actually wrong before: the fill is a brass *gradient* rather than a
 * flat tint (the facet and the melt from leaf to ochre are the difference
 * between gilt and a shape painted gold), and the spark is solid through its
 * centre. A mark rebuilt as four tapered rays converging on the middle — which
 * is what the previous version was, and what reads as a scatter of thin spikes
 * at 16px — passes every other assertion here, so the ray count is asserted as
 * the single star path it replaced.
 *
 * The rail's absence on a phone stays the existing responsive rule
 * (`max-width: 640px`) rather than a broken element.
 */
for (const width of [1440, 390]) {
  test(`the brand accents are cut brass at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockAiApis(page);
    await page.goto('/');

    // No asterisk family anywhere in the rendered page.
    const asterisks = await page.evaluate(() => {
      const markup = document.body.innerHTML;
      return ['\u2733', '\u2731', '\u2732'].filter((mark) => markup.includes(mark));
    });
    expect(asterisks).toEqual([]);

    const brand = await page.locator('.studio-brand-mark').evaluate((node) => {
      const svg = node as unknown as SVGSVGElement;
      const box = node.getBoundingClientRect();
      const spark = svg.querySelector('path')!;
      return {
        tag: svg.tagName.toLowerCase(),
        text: (node.textContent || '').trim(),
        viewBox: svg.getAttribute('viewBox'),
        shapes: svg.querySelectorAll('path').length,
        gradient: svg.querySelector('linearGradient')?.getAttribute('id') ?? '',
        fill: getComputedStyle(spark).fill,
        filter: getComputedStyle(node).filter,
        color: getComputedStyle(node).color,
        width: box.width,
        height: box.height,
        wordmarkHeight: node.parentElement!.getBoundingClientRect().height,
      };
    });
    // An SVG drawing its own shapes: no text, so it cannot be a glyph that fell
    // back. Three paths are the whole spark — the star, its hairline rim and the
    // lit core — and one of them is the star, not four rays meeting at a point.
    expect(brand.tag).toBe('svg');
    expect(brand.text).toBe('');
    expect(brand.viewBox).toBe('0 0 48 48');
    expect(brand.shapes).toBe(3);
    expect(brand.gradient).toBe('brand-gilt-spark');
    expect(brand.fill).toMatch(/url\(.*brand-gilt-spark.*\)/);
    expect(brand.filter).toContain('drop-shadow');
    expect(brand.color).toBe('rgb(227, 194, 133)');
    expect(brand.width).toBeGreaterThan(10);
    expect(brand.height).toBeGreaterThan(10);
    // It rides the wordmark's line box instead of stretching it.
    expect(brand.wordmarkHeight).toBeLessThan(40);

    const railNote = page.locator('.studio-rail-note');
    if (width > 640) {
      await expect(railNote).toBeVisible();
      const rail = await page.locator('.studio-rail-symbol').evaluate((node) => {
        const svg = node as unknown as SVGSVGElement;
        const box = node.getBoundingClientRect();
        const seal = node.closest('.studio-rail-medallion')!;
        const leaf = getComputedStyle(seal, '::after');
        return {
          tag: svg.tagName.toLowerCase(),
          text: (node.textContent || '').trim(),
          viewBox: svg.getAttribute('viewBox'),
          // Eight teeth + the spark's star and rim + its core.
          paths: svg.querySelectorAll('path').length,
          // The pool of light, the rim, the creeping scale, the inner hairline.
          circles: svg.querySelectorAll('circle').length,
          scaleDash: svg.querySelector('.brand-scale circle')?.getAttribute('stroke-dasharray') ?? '',
          scaleTurn: getComputedStyle(svg.querySelector('.brand-scale')!).animationName,
          coreGlint: getComputedStyle(svg.querySelector('.brand-core-glint')!).animationName,
          sealRadius: getComputedStyle(seal).borderRadius,
          leafBackground: leaf.backgroundImage,
          leafMask: leaf.maskComposite || leaf.webkitMaskComposite,
          leafAnimation: leaf.animationName,
          color: getComputedStyle(node).color,
          width: box.width,
          height: box.height,
        };
      });
      // The same spark struck inside an engraved plate: rim, dashed minute
      // scale, eighth-tooth edge, and the star itself at 56%.
      expect(rail.tag).toBe('svg');
      expect(rail.text).toBe('');
      expect(rail.viewBox).toBe('0 0 48 48');
      expect(rail.paths).toBe(11);
      expect(rail.circles).toBe(4);
      expect(rail.scaleDash).not.toBe('');
      // The dial actually turns and the core actually glints — the two pieces of
      // motion that make the seal an instrument rather than a badge.
      expect(rail.scaleTurn).toBe('brand-scale-turn');
      expect(rail.coreGlint).toBe('brand-glint');
      // It is a circle, which is what lets the page's gold leaf rim it.
      expect(rail.sealRadius).toBe('50%');
      expect(rail.leafBackground).toContain('conic-gradient');
      expect(rail.leafMask).toContain('exclude');
      expect(rail.leafAnimation).toBe('leaf-turn');
      expect(rail.color).toBe('rgb(210, 164, 85)');
      expect(rail.width).toBeGreaterThan(40);
      expect(rail.height).toBe(rail.width);
    } else {
      // The rail's note is hidden under 640px by the layout's own rule, so the
      // mark must not be what is keeping it on screen.
      await expect(railNote).toBeHidden();
    }
  });
}
