import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShopListing } from '@/components/store/ShopListing';

export const metadata: Metadata = {
  title: 'Footwear',
  description: 'Sneakers, sports shoes, loafers, formal shoes, boots and sandals for men and women.',
};

export default function FootwearPage() {
  return (
    <Suspense>
      <ShopListing preset={{ department: 'footwear' }} title="Footwear" intro="From court classics to Goodyear-welted boots — every pair built on craft and comfort." />
    </Suspense>
  );
}
