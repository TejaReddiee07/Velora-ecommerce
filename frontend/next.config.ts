import type { NextConfig } from 'next';

/**
 * Same-site API proxy (see src/lib/config.ts): the browser calls this site's own /api and it is forwarded to the real
 * API, so the session cookies are first-party. Safari/iOS, Brave and private windows drop cookies from another site,
 * which breaks sign-in, the bag and the owner portal when the API lives on another host.
 *  - On Vercel it is ON by default: the API is then on another host (Render, Railway, ...).
 *  - NEXT_PUBLIC_API_PROXY=1 turns it on anywhere, NEXT_PUBLIC_API_PROXY=0 turns it off.
 *  - Everywhere else (local development, one host for everything) it stays off.
 */
const flag = (process.env.NEXT_PUBLIC_API_PROXY ?? '').trim().toLowerCase();
const apiTarget = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const forcedOn = ['1', 'true', 'yes', 'on'].includes(flag);
const forcedOff = ['0', 'false', 'no', 'off'].includes(flag);
const apiProxy = forcedOn || (!forcedOff && process.env.VERCEL === '1' && apiTarget.startsWith('http'));
if (forcedOn && !apiTarget.startsWith('http')) {
  // Fail the build instead of publishing a storefront that cannot reach its API.
  throw new Error('NEXT_PUBLIC_API_PROXY=1 needs NEXT_PUBLIC_API_URL (or API_INTERNAL_URL) set to the API address, e.g. https://your-api.onrender.com');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Product images are served (already resized to WebP renditions) by the API from GridFS.
  images: { unoptimized: true },
  // The browser code reads the resolved decision from here, so it can never disagree with the rewrite below.
  env: { NEXT_PUBLIC_API_VIA_PROXY: apiProxy ? '1' : '0' },
  async rewrites() {
    return apiProxy ? [{ source: '/api/:path*', destination: `${apiTarget}/api/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // the app's offline helper (public/sw.js): always fetch the latest version
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
