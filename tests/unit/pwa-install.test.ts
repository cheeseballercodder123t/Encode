import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { APP_ICON_SIZES, isAppIconSize, renderAppIconPng } from '@/lib/pwa/appIcon';

/**
 * Installability, and the offline shell it depends on (defect 45).
 *
 * `app/manifest.ts` declared `/icon-192.png` and `/icon-512.png` from the day it
 * was written. `public/` held nothing but `assets/`, so **both paths 404'd** while
 * the manifest kept promising them - which reads as "installable" to a human and
 * as "not installable" to Chromium, since a raster 192 and 512 icon is a hard
 * requirement. `beforeinstallprompt` therefore never fired, and
 * `components/PWAInstallHeader.tsx` (whose entire install affordance is gated on
 * that event) could never show its button. There was also no service worker
 * anywhere in the repo, which is the second requirement, and the reason a cold
 * offline reload handed the learner the browser's own error page.
 *
 * Three different kinds of claim are pinned here:
 *
 *   1. The BYTES. `renderAppIconPng` is checked as a real PNG - decoded with this
 *      file's own CRC and its own `inflateSync`, so a self-consistent-but-wrong
 *      encoder cannot pass by agreeing with itself.
 *   2. The AGREEMENT between what the manifest declares and what is actually on
 *      disk to serve it. This is the exact split that produced the 404s: a
 *      manifest is a promise, and nothing was checking the promise.
 *   3. The WIRING, at the source, the way `offline-fallback.test.ts` and
 *      `modal-a11y.test.ts` pin theirs. The browser behaviour is pinned end to end
 *      in `e2e/pwa-install.spec.ts`, which is also where the offline reload and
 *      the mutation probe live.
 */

const MANIFEST_SRC = readFileSync('app/manifest.ts', 'utf8');
const LAYOUT_SRC = readFileSync('app/layout.tsx', 'utf8');
const SW_SRC = readFileSync('public/sw.js', 'utf8');
const INIT_SRC = readFileSync('components/ServiceWorkerInit.tsx', 'utf8');
const HEADER_SRC = readFileSync('components/PWAInstallHeader.tsx', 'utf8');

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * CRC-32, written here bit by bit rather than through the module's own table.
 * Shares nothing with the generator, which is the point.
 */
function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface PngChunk {
  type: string;
  data: Buffer;
}

/** Walks the chunk stream, verifying every CRC independently. */
function readChunks(png: Uint8Array): PngChunk[] {
  const buf = Buffer.from(png);
  expect([...buf.subarray(0, 8)]).toEqual(PNG_SIGNATURE);

  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const body = buf.subarray(offset + 4, offset + 8 + length);
    expect(buf.readUInt32BE(offset + 8 + length), `crc of ${type}`).toBe(crc32(body));
    chunks.push({ type, data: buf.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  // The walk consumed the file exactly: no trailing bytes the decoder would snub.
  expect(offset).toBe(buf.length);
  return chunks;
}

describe('the generated icon is a real PNG, not merely a plausible one', () => {
  for (const size of APP_ICON_SIZES) {
    it(`renders a decodable ${size}x${size} truecolour image`, () => {
      const chunks = readChunks(renderAppIconPng(size));
      expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);

      const ihdr = chunks[0].data;
      expect(ihdr.readUInt32BE(0)).toBe(size); // width
      expect(ihdr.readUInt32BE(4)).toBe(size); // height
      expect(ihdr[8]).toBe(8); // bit depth
      expect(ihdr[9]).toBe(2); // colour type 2 = truecolour RGB

      // The image data is a real zlib stream, and it inflates to exactly one
      // filter byte plus three bytes per pixel on every one of the rows.
      const raw = inflateSync(chunks[1].data);
      const stride = 1 + size * 3;
      expect(raw.length).toBe(stride * size);
      const filterBytes = new Set<number>();
      for (let y = 0; y < size; y += 1) filterBytes.add(raw[y * stride]);
      expect([...filterBytes]).toEqual([0]); // filter 0 = none, on every row
    });
  }

  it('draws on the studio palette rather than a blank plate', () => {
    // A transparent or single-colour icon would technically satisfy the browser
    // and be useless. Both marks must actually be painted: the gilt bracket and
    // the plate it sits on.
    const raw = inflateSync(readChunks(renderAppIconPng(512))[1].data);
    const stride = 1 + 512 * 3;
    const seen = new Set<string>();
    for (let y = 0; y < 512; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const at = y * stride + 1 + x * 3;
        seen.add(`${raw[at]},${raw[at + 1]},${raw[at + 2]}`);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3); // plate, frame, mark
    expect(seen.has('200,120,42')).toBe(true); // the gilt mark the UI is built from
  });

  it('is deterministic, so the served bytes never shift between builds', () => {
    expect([...renderAppIconPng(192)]).toEqual([...renderAppIconPng(192)]);
  });

  it('only accepts the sizes the manifest declares', () => {
    expect(isAppIconSize(192)).toBe(true);
    expect(isAppIconSize(512)).toBe(true);
    expect(isAppIconSize(48)).toBe(false);
    expect(isAppIconSize(Number.NaN)).toBe(false);
    expect(APP_ICON_SIZES).toEqual([192, 512]);
  });
});

describe('the manifest and the filesystem finally agree', () => {
  const declared = [...MANIFEST_SRC.matchAll(/src:\s*'(\/[^']+)'/g)].map((match) => match[1]);
  const declaredSizes = [...MANIFEST_SRC.matchAll(/sizes:\s*'(\d+)x(\d+)'/g)].map(
    (match) => Number(match[1])
  );

  it('declares the two raster sizes Chromium requires, and no others', () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(declaredSizes)).toEqual(new Set(APP_ICON_SIZES));
  });

  it('has a real route handler serving every icon path it declares', () => {
    for (const src of new Set(declared)) {
      const route = `app${src}/route.ts`;
      expect(existsSync(route), `${route} must exist for manifest icon ${src}`).toBe(true);
      expect(readFileSync(route, 'utf8')).toContain('renderAppIconPng');
    }
  });

  it('renders each declared path at the size the manifest promises for it', () => {
    // The filename, the declared `sizes` and the handler behind it are three
    // separate statements about one number; a manifest is only honest when all
    // three agree.
    const pairs = [
      ...MANIFEST_SRC.matchAll(/src:\s*'(\/icon-(\d+)\.png)',\s*\n\s*sizes:\s*'(\d+)x(\d+)'/g),
    ];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, src, inName, width, height] of pairs) {
      expect(width, `${src} is not square`).toBe(height);
      expect(width, `${src} disagrees with its own filename`).toBe(inName);
      expect(
        readFileSync(`app${src}/route.ts`, 'utf8'),
        `${src} is not served at ${width}px`
      ).toContain(`renderAppIconPng(${width})`);
    }
  });

  it('gives every icon a purpose, since maskable and any are different pictures', () => {
    expect(MANIFEST_SRC).toContain("purpose: 'any'");
    expect(MANIFEST_SRC).toContain("purpose: 'maskable'");
  });
});

describe('the service worker is registered, and is safe to register', () => {
  it('the app-shell service worker exists and handles fetches over a cache', () => {
    expect(SW_SRC).toContain("self.addEventListener('install'");
    // The requirement Chromium actually checks for installability.
    expect(SW_SRC).toContain("self.addEventListener('fetch'");
    expect(SW_SRC).toContain('event.respondWith(');
    expect(SW_SRC).toContain("caches.open(CACHE)");
  });

  it('is network-first, so online nothing can be served stale', () => {
    // Order matters and is the whole safety argument: the network is consulted
    // first and the cache is only the fallback.
    const network = SW_SRC.indexOf('fetch(request)');
    const cache = SW_SRC.indexOf('caches.match(request)');
    expect(network).toBeGreaterThan(-1);
    expect(cache).toBeGreaterThan(-1);
    expect(network).toBeLessThan(cache);
  });

  it('never touches a POST or anything off-origin', () => {
    // Generations are streamed POSTs and provider calls are cross-origin: replay
    // either from a cache and the app breaks in a way no test would forgive.
    expect(SW_SRC).toContain("if (request.method !== 'GET') return;");
    expect(SW_SRC).toContain('if (url.origin !== self.location.origin) return;');
  });

  it('pre-caches the shell and its own icons', () => {
    expect(SW_SRC).toMatch(/const SHELL = \[[^\]]*'\/'/);
    expect(SW_SRC).toContain("'/icon-192.png'");
    expect(SW_SRC).toContain("'/icon-512.png'");
  });

  it('claims the page and clears superseded caches, so an update is not stuck', () => {
    expect(SW_SRC).toContain('self.skipWaiting()');
    expect(SW_SRC).toContain('self.clients.claim()');
    expect(SW_SRC).toContain('caches.delete');
  });
});

describe('the wiring, at the source', () => {
  it('a client component registers the worker at the root path', () => {
    expect(INIT_SRC).toContain("'use client'");
    expect(INIT_SRC).toContain("navigator.serviceWorker.register('/sw.js')");
    // Registration is failure-tolerant: a private window must not break the app.
    expect(INIT_SRC).toMatch(/register\('\/sw\.js'\)\.catch\(/);
  });

  it('the root layout mounts it, beside the other browser-only init', () => {
    expect(LAYOUT_SRC).toContain("import ServiceWorkerInit from '@/components/ServiceWorkerInit'");
    expect(LAYOUT_SRC).toContain('<ServiceWorkerInit />');
  });

  it('the install affordance still waits on the event the worker makes possible', () => {
    // The button's only trigger. If this listener ever goes, the icons and the
    // worker become dead weight and nobody would notice from a screenshot.
    expect(HEADER_SRC).toContain("window.addEventListener('beforeinstallprompt', handleBeforeInstall)");
    expect(HEADER_SRC).toContain('[ INSTALL APP: PWA ]');
    expect(HEADER_SRC).toContain('{!isInstalled && (deferredPrompt || isIOS) && (');
  });
});
