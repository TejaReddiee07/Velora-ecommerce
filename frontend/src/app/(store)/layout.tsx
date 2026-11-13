import { Header } from '@/components/store/Header';
import { Footer } from '@/components/store/Footer';
import { CartDrawer } from '@/components/store/CartDrawer';
import { SearchOverlay } from '@/components/store/SearchOverlay';
import { FlyToBag } from '@/components/store/FlyToBag';
import { SmoothScroll } from '@/components/store/SmoothScroll';
import { IntroLoader } from '@/components/store/IntroLoader';
import { serverApi } from '@/lib/server-api';
import type { PublicSettings } from '@/lib/types';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await serverApi<PublicSettings>('/settings/public');
  return (
    <>
      <IntroLoader />
      <SmoothScroll />
      <Header initialSettings={settings} />
      <main id="main" tabIndex={-1} className="min-h-[70vh] outline-none">
        {children}
      </main>
      <Footer initialSettings={settings} />
      <CartDrawer />
      <SearchOverlay />
      <FlyToBag />
    </>
  );
}
