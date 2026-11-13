import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShopListing } from '@/components/store/ShopListing';

export const metadata: Metadata = { title: 'Accessories', description: 'Leather bags, watches, scarves, belts, eyewear and caps.' };

export default function AccessoriesPage() {
  return (
    <Suspense>
      <ShopListing preset={{ department: 'accessories' }} title="Accessories" intro="The finishing touches — leather goods, timepieces and quiet details." />
    </Suspense>
  );
}
