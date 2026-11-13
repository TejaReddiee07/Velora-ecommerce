import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductView } from '@/components/store/ProductView';
import { currentCurrency, serverApi } from '@/lib/server-api';
import { imageUrl } from '@/lib/api';
import type { ProductCard, ProductDetail } from '@/lib/types';

type Payload = { product: ProductDetail; related: ProductCard[] };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await serverApi<Payload>(`/products/${slug}`);
  if (!data) return { title: 'Product not found' };
  const p = data.product;
  return {
    title: p.name,
    description: p.shortDescription ?? p.description.slice(0, 160),
    openGraph: { title: p.name, images: p.images[0] ? [{ url: imageUrl(p.images[0].lg) }] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const currency = await currentCurrency();
  const data = await serverApi<Payload>(`/products/${slug}`, { currency });
  if (!data) notFound();
  const p = data.product;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    brand: { '@type': 'Brand', name: p.brandName },
    description: p.description,
    image: p.images.map((i) => imageUrl(i.lg)),
    sku: p.variants[0]?.sku,
    offers: {
      '@type': 'Offer',
      priceCurrency: p.currency,
      price: (p.price / 100).toFixed(2),
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
    ...(p.ratingCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.ratingAvg, reviewCount: p.ratingCount } } : {}),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ProductView slug={slug} initial={data} />
    </>
  );
}
