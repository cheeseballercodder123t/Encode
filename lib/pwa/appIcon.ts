/**
 * The app icon, generated in code (defect 45).
 *
 * `app/manifest.ts` has always declared `/icon-192.png` and `/icon-512.png`, and
 * Chromium refuses to offer installation - and never fires
 * `beforeinstallprompt`, which is the only thing `components/PWAInstallHeader.tsx`
 * listens for - without a raster 192x192 and 512x512 icon that actually loads.
 * Both paths returned **404**: `public/` held nothing but `assets/`. So the
 * manifest described an installable app whose required icons did not exist, and
 * the install affordance in the masthead could never appear.
 *
 * The bytes are built here rather than committed as binaries for the same reason
 * `lib/anki-sqlite-writer.ts` builds its sqlite file here: the format is small,
 * fully specified, and generating it keeps the drawing reviewable as code instead
 * of as an opaque blob. `renderAppIconPng` is deterministic, so the same size
 * always yields the same bytes, and the route handlers that serve it are static.
 *
 * Format: PNG, 8-bit truecolour RGB, one IDAT, no interlacing - the minimum a
 * decoder needs.
 */

import { deflateSync } from 'node:zlib';

/** The 8-byte PNG signature every decoder checks first. */
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The sizes the manifest declares, and the only ones this module will render. */
export const APP_ICON_SIZES = [192, 512] as const;
export type AppIconSize = (typeof APP_ICON_SIZES)[number];

/** Whether a requested size is one the manifest declares. */
export function isAppIconSize(value: number): value is AppIconSize {
  return (APP_ICON_SIZES as readonly number[]).includes(value);
}

// ─── PNG primitives ──────────────────────────────────────────────────────────

/** The CRC-32 table PNG chunks are checksummed with (polynomial 0xEDB88320). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** `length | type | data | crc32(type + data)`, exactly as the spec lays it out. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// ─── The artwork ─────────────────────────────────────────────────────────────
//
// The studio's chassis palette: a near-black plate, a dim gold frame, and the
// bracket token the whole UI is built out of - `[ ▮ ]`, the app's own voice.
// Every rectangle is in 0..1 space, so one description renders at any size.

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Rgb = readonly [number, number, number];

const PLATE: Rgb = [20, 21, 23]; // #141517 - chassis
const FRAME: Rgb = [83, 56, 30]; // #141517 dimmed toward the gilt
const GILT: Rgb = [200, 120, 42]; // #C8782A
const GLOW: Rgb = [208, 132, 48]; // #D08430

const FRAME_RECTS: Rect[] = [
  { x0: 0.06, y0: 0.06, x1: 0.94, y1: 0.115 },
  { x0: 0.06, y0: 0.885, x1: 0.94, y1: 0.94 },
  { x0: 0.06, y0: 0.06, x1: 0.115, y1: 0.94 },
  { x0: 0.885, y0: 0.06, x1: 0.94, y1: 0.94 },
];

const BRACKET_RECTS: Rect[] = [
  // "["
  { x0: 0.3, y0: 0.3, x1: 0.375, y1: 0.7 },
  { x0: 0.3, y0: 0.3, x1: 0.44, y1: 0.375 },
  { x0: 0.3, y0: 0.625, x1: 0.44, y1: 0.7 },
  // "]"
  { x0: 0.625, y0: 0.3, x1: 0.7, y1: 0.7 },
  { x0: 0.56, y0: 0.3, x1: 0.7, y1: 0.375 },
  { x0: 0.56, y0: 0.625, x1: 0.7, y1: 0.7 },
];

const CORE_RECTS: Rect[] = [{ x0: 0.45, y0: 0.435, x1: 0.55, y1: 0.565 }];

function within(rects: Rect[], x: number, y: number): boolean {
  for (const rect of rects) {
    if (x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1) return true;
  }
  return false;
}

/**
 * One pixel, as the topmost layer that claims it: the bracket mark over the
 * core bar over the frame over the plate.
 */
function pixelAt(x: number, y: number): Rgb {
  if (within(BRACKET_RECTS, x, y)) return GILT;
  if (within(CORE_RECTS, x, y)) return GLOW;
  if (within(FRAME_RECTS, x, y)) return FRAME;
  return PLATE;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

const cache = new Map<AppIconSize, Uint8Array>();

/**
 * The complete PNG for `size`, byte for byte. Memoised: the drawing is pure and
 * a route handler answers the same size on every request.
 */
export function renderAppIconPng(size: AppIconSize): Uint8Array {
  const cached = cache.get(size);
  if (cached) return cached;

  // Raw image data: every scanline is prefixed with its filter byte (0 = none),
  // and every pixel is three bytes of RGB.
  const stride = 1 + size * 3;
  const raw = new Uint8Array(stride * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixelAt((x + 0.5) / size, (y + 0.5) / size);
      const at = rowStart + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }

  // IHDR: width, height, 8 bits per channel, colour type 2 (truecolour), then
  // the three zero bytes for deflate / adaptive filtering / no interlace.
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, size);
  ihdrView.setUint32(4, size);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }

  cache.set(size, png);
  return png;
}
