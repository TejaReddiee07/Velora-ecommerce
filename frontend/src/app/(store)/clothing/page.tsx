import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ShopListing } from '@/components/store/ShopListing';

export const metadata: Metadata = {
  title: 'Clothing',
  description: "Men's, women's and unisex clothing — tailoring, knitwear, denim, dresses, outerwear and streetwear.",
};

export default function ClothingPage() {
  return (
    <Suspense>
      <ShopListing preset={{ department: 'clothing' }} title="Clothing" intro="Tailoring, knitwear, denim and outerwear — cut to last and made to move." />
    </Suspense>
  );
}
