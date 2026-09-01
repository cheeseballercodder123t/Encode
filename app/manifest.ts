import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'DeepEncode — Cognitive Science Learning Studio',
    short_name: 'DeepEncode',
    description: 'First-principles cognitive encoding, Feynman drills, concept segregation, and RemNote knowledge base exporter.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#090a0f',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      }
    ],
  };
}
