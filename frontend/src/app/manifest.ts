import type { MetadataRoute } from 'next';

/**
 * Makes VELORA installable as an app: "Install app" in Chrome/Edge (Android, Windows, Mac) and
 * "Add to Home Screen" in Safari on iPhone/iPad. Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'VELORA',
    short_name: 'VELORA',
    description: 'Considered clothing, footwear and accessories. Tailoring, knitwear, leather and sneakers from the VELORA studio.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#0c0a09',
    categories: ['shopping', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
