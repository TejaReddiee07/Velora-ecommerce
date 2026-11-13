import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShopListing } from '@/components/store/ShopListing';

export const metadata: Metadata = { title: 'Sale', description: 'Selected pieces at reduced prices.' };

export default function SalePage() {
  return (
    <Suspense>
      <ShopListing preset={{ onSale: true, defaultSort: 'price_asc' }} title="Sale" intro="Selected pieces, thoughtfully reduced. While stocks last." />
    </Suspense>
  );
}
