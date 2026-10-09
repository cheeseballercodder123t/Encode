import { renderAppIconPng } from '@/lib/pwa/appIcon';

/**
 * Serves the 512x512 icon `app/manifest.ts` declares. See
 * `app/icon-192.png/route.ts` and `lib/pwa/appIcon.ts`.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const png = renderAppIconPng(512);
  return new Response(png as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
