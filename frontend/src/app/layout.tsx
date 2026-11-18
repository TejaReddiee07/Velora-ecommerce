import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Jost } from 'next/font/google';
import { Providers } from '@/components/providers/Providers';
import { ServiceWorker } from '@/components/providers/ServiceWorker';
import { SITE_URL } from '@/lib/config';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jost',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'VELORA — Modern luxury, made to move', template: '%s · VELORA' },
  description: 'Considered clothing, footwear and accessories. Tailoring, knitwear, leather and sneakers from the VELORA studio.',
  openGraph: { type: 'website', siteName: 'VELORA', title: 'VELORA — Modern luxury, made to move' },
  // Installable app (manifest in app/manifest.ts): app name and icons for home screens, the iPhone title and status bar
  applicationName: 'VELORA',
  appleWebApp: { capable: true, title: 'VELORA', statusBarStyle: 'black' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c0a09',
};

// Applies the shopper's saved dark mode before the first paint, so the page never flashes light first
// (see components/store/ThemeToggle.tsx). Light is the default when nothing is saved.
const THEME_SCRIPT = `(function(){try{if(localStorage.getItem('velora_theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${cormorant.variable} ${jost.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
