'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import { ProductForm } from '@/components/admin/ProductForm';
import { useCan } from '@/lib/admin/hooks';

export default function NewProductPage() {
  const canWrite = useCan('products:write');
  return (
    <>
      <Link href="/admin/products" className="mb-4 inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All products
      </Link>
      <PageHeader eyebrow="Catalogue" title="New product" description="Step 1 of 2 — details, pricing and variants. You will add images on the next screen." />
      {canWrite ? <ProductForm /> : <p className="text-muted">Your role cannot create products.</p>}
    </>
  );
}
