import { renderAppIconPng } from '@/lib/pwa/appIcon';

/**
 * Serves the 192x192 icon `app/manifest.ts` declares.
 *
 * The path is a real route (a dotted segment) rather than a file in `public/`
 * because the bytes are generated - see `lib/pwa/appIcon.ts` for why, and for
 * the defect this closes.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const png = renderAppIconPng(192);
  return new Response(png as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
