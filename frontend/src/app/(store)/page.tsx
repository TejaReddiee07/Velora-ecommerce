import { Hero } from '@/components/home/Hero';
import { ShowroomTeaser } from '@/components/home/ShowroomTeaser';
import { BestSellers, BrandStory, ClothingSection, CollectionTiles, EditRail, FootwearShowcase, Marquee, NewsletterSection, PromoBanner, SpecialOffers } from '@/components/home/Sections';
import { currentCurrency, serverApi } from '@/lib/server-api';
import type { ProductList, PublicSettings } from '@/lib/types';

export default async function HomePage() {
  const currency = await currentCurrency();
  const list = (q: Record<string, string | number | boolean>) => serverApi<ProductList>('/products', { ...q, currency });
  const [settings, featured, clothing, footwear, best, sale] = await Promise.all([
    serverApi<PublicSettings>('/settings/public'),
    list({ featured: true, limit: 10, sort: 'featured' }),
    list({ department: 'clothing', limit: 8, sort: 'newest' }),
    list({ department: 'footwear', limit: 10, sort: 'featured' }),
    list({ bestSeller: true, limit: 8, sort: 'best_selling' }),
    list({ onSale: true, limit: 4, sort: 'price_desc' }),
  ]);
  const banners = settings?.banners ?? [];
  return (
    <>
      <Hero banners={banners} />
      <Marquee />
      <CollectionTiles banners={banners} />
      <EditRail initial={featured?.items} />
      <ClothingSection initial={clothing?.items} />
      <ShowroomTeaser />
      <FootwearShowcase initial={footwear?.items} />
      <BestSellers initial={best?.items} />
      <PromoBanner banners={banners} />
      <SpecialOffers initial={sale?.items} />
      <BrandStory banners={banners} />
      <NewsletterSection />
    </>
  );
}
