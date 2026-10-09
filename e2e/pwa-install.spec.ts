import { test, expect } from '@playwright/test';
import { mockAiApis } from './helpers/mocks';

/**
 * Installability, and the offline shell (defect 45) - in a real browser.
 *
 * The unit suite (`tests/unit/pwa-install.test.ts`) pins the icon bytes, the
 * manifest's agreement with what is on disk, and the worker's strategy at the
 * source. None of that proves the browser is satisfied, and the browser is the
 * only authority on both claims here:
 *
 *   - Chromium refuses to offer installation unless the manifest's declared
 *     raster icons actually load at the size they declare and a service worker
 *     with a `fetch` handler is registered. The unit tests can only say the
 *     files exist; this says they resolve, over HTTP, with the right pixels.
 *   - A cold offline load is the behaviour the worker exists for, and it is
 *     exactly the case the app used to lose: the shell needs nothing from the
 *     network, but with no worker a reload handed the learner the browser's own
 *     error page.
 *
 * The mocked routes in `helpers/mocks.ts` are all POSTs; the worker declines
 * every non-GET, so nothing here is answered from a cache online. That is why
 * these specs can run alongside the rest of the suite unchanged.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads the dimensions the way a decoder does: out of the IHDR chunk. */
function dimensionsOf(body: Buffer): string {
  expect(body.subarray(0, 8).equals(PNG_SIGNATURE), 'not a PNG').toBe(true);
  expect(body.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return `${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`;
}

test('every icon the manifest declares loads, at the size it declares', async ({ page, request }) => {
  await page.goto('/');

  // Next injects the link from app/manifest.ts; a manifest the page never links
  // is ignored entirely.
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const manifestResponse = await request.get(href!);
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');

  // The whole defect in one loop: both paths used to answer 404.
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), `${icon.src} must not 404`).toBe(200);
    expect(response.headers()['content-type'], icon.src).toContain('image/png');
    // Chromium compares these against what it decodes and rejects on a mismatch,
    // so a file at the right path with the wrong dimensions is still a failure.
    expect(dimensionsOf(await response.body()), icon.src).toBe(icon.sizes);
  }
});

test('a worker with a fetch handler registers and takes control of the page', async ({ page }) => {
  await page.goto('/');

  // Registration is deferred to the browser's `load` event, then the worker has
  // to install (which fetches the shell) and activate, so everything below is
  // polled rather than sampled once: an instantaneous read catches it mid-flight.
  await expect
    .poll(
      () =>
        page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
      { timeout: 60_000 }
    )
    .toBeGreaterThan(0);

  await expect
    .poll(
      async () => {
        const state = await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return {
            script: registration.active?.scriptURL ?? null,
            state: registration.active?.state ?? null,
            scope: registration.scope,
          };
        });
        return `${state.script}|${state.state}`;
      },
      { timeout: 60_000 }
    )
    .toContain('/sw.js|activated');

  // Control is the part installability actually rests on, and `clients.claim()`
  // in the worker's activate handler is what grants it to the page that
  // registered the worker - rather than the visit after it.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 60_000,
    })
    .toBe(true);
});

test('a cold reload with the network gone still paints the studio shell', async ({
  page,
  context,
}) => {
  await mockAiApis(page);
  await page.goto('/');
  await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible();

  // Take control. Installing fetches the shell, so the cache fill and the
  // activation are both polled rather than assumed.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 60_000,
    })
    .toBe(true);

  // The worker really did record the shell while it had a network. Checked on
  // its own so a failure says which half broke: the navigation below cannot be
  // served offline if this is false, and the reason would otherwise be opaque.
  await expect
    .poll(() => page.evaluate(() => caches.match('/').then((cached) => cached !== undefined)), {
      timeout: 30_000,
    })
    .toBe(true);

  await context.setOffline(true);
  try {
    await page.reload();
    // The claim under test. Without the worker this is Chromium's offline error
    // page; with it, the launchpad renders exactly as it does online.
    await expect(page.getByPlaceholder(/Paste study material/)).toBeVisible({ timeout: 30_000 });
    // And it is genuinely offline, so the reload above was not quietly served
    // by a still-reachable network.
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  } finally {
    await context.setOffline(false);
  }
});
