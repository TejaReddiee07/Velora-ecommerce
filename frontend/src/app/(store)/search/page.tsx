import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShopListing } from '@/components/store/ShopListing';

export const metadata: Metadata = { title: 'Search', robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <Suspense>
      <ShopListing preset={{}} title={q ? `“${q}”` : 'Search'} intro={q ? 'Results across clothing, footwear and accessories.' : 'Use the search bar to find a piece.'} />
    </Suspense>
  );
}
