import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShopListing } from '@/components/store/ShopListing';

export const metadata: Metadata = { title: 'New arrivals', description: 'The latest pieces from the VELORA studio.' };

export default function NewArrivalsPage() {
  return (
    <Suspense>
      <ShopListing preset={{ newArrival: true, defaultSort: 'newest' }} title="New arrivals" intro="Fresh from the studio — the season's newest silhouettes." />
    </Suspense>
  );
}
