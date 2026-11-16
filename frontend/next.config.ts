import type { NextConfig } from 'next';

// Same-site API (NEXT_PUBLIC_API_PROXY=1, see src/lib/config.ts): /api/* on this site is forwarded to the real API.
const apiProxy = process.env.NEXT_PUBLIC_API_PROXY === '1';
const apiTarget = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
if (apiProxy && !apiTarget.startsWith('http')) {
  // Fail the build instead of publishing a storefront that cannot reach its API.
  throw new Error('NEXT_PUBLIC_API_PROXY=1 needs NEXT_PUBLIC_API_URL (or API_INTERNAL_URL) set to the API address, e.g. https://your-api.onrender.com');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Product images are served (already resized to WebP renditions) by the API from GridFS.
  images: { unoptimized: true },
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
    ];
  },
};

export default nextConfig;
