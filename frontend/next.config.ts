import type { NextConfig } from 'next';

// Defaults for Vercel, where the site and API share one domain (see /vercel.json).
// Values set in .env.local or in the Vercel dashboard always win.
const onVercel = Boolean(process.env.VERCEL);
const vercelSite = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? (onVercel ? '/' : 'http://localhost:4000'),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? vercelSite ?? 'http://localhost:3000',
    NEXT_PUBLIC_REALTIME: process.env.NEXT_PUBLIC_REALTIME ?? (onVercel ? 'off' : 'on'),
    // Vercel rejects request bodies over 4.5 MB, so uploads stay under 4 MB per request there.
    NEXT_PUBLIC_MAX_UPLOAD_MB: process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? (onVercel ? '4' : '8'),
    NEXT_PUBLIC_UPLOAD_REQUEST_MB: process.env.NEXT_PUBLIC_UPLOAD_REQUEST_MB ?? (onVercel ? '4' : ''),
  },
  // Product images are served (already resized to WebP renditions) by the API from GridFS.
  images: { unoptimized: true },
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
