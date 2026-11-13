'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Media';
import { Banner, PageHeader, Panel, StatusChip } from '@/components/admin/ui';
import { ProductForm } from '@/components/admin/ProductForm';
import { ImageManager } from '@/components/admin/ImageManager';
import { errorMessage, useCan, useRealtime } from '@/lib/admin/hooks';
import type { AdminProduct, Paged, StockMovement } from '@/lib/admin/types';

const MOVE_LABEL: Record<string, string> = {
  initial: 'Initial stock',
  restock: 'Restock',
  adjustment: 'Adjustment',
  reservation: 'Reserved at checkout',
  release: 'Reservation released',
  sale: 'Sold',
  refund_restock: 'Returned (refund)',
  variant_removed: 'Variant removed',
};

function EditProductInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const qc = useQueryClient();
  const canWrite = useCan('products:write');
  const key = ['admin', 'product', id];
  const { data: product, isLoading, isError } = useQuery({ queryKey: key, queryFn: async () => (await api<{ product: AdminProduct }>(`/admin/products/${id}`)).product });
  const movements = useQuery({
    queryKey: ['admin', 'movements', id],
    queryFn: () => api<Paged<StockMovement>>('/admin/inventory/movements', { query: { productId: id, limit: 30 } }),
  });

  useRealtime(['inventory:changed', 'product:changed'], (_e, payload) => {
    if ((payload as { productId?: string }).productId === id) {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['admin', 'movements', id] });
    }
  });

  const setStatus = useMutation({
    mutationFn: (status: 'published' | 'draft' | 'archived') => api<{ product: AdminProduct }>(`/admin/products/${id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (d) => {
      qc.setQueryData(key, d.product);
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.success(d.product.status === 'published' ? 'Published — live on the storefront now' : d.product.status === 'archived' ? 'Archived' : 'Unpublished');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  if (isError || !product) return <p className="py-24 text-center text-muted">Product not found.</p>;

  return (
    <>
      <Link href="/admin/products" className="mb-4 inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All products
      </Link>
      <PageHeader
        eyebrow={`${product.brandName} · ${product.categoryName}`}
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={product.status} /> {product.totalAvailable} available · {product.soldCount} sold · updated {dateTime(product.updatedAt)}
          </span>
        }
        actions={
          <>
            {product.status === 'published' && (
              <a href={`/product/${product.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 border border-line-strong px-4 text-[11px] uppercase tracking-[0.16em] text-ink hover:border-ink">
                View live <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            {canWrite &&
              (product.status === 'published' ? (
                <Button size="sm" variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate('draft')}>
                  Unpublish
                </Button>
              ) : (
                <Button size="sm" loading={setStatus.isPending} onClick={() => setStatus.mutate('published')} disabled={product.images.length === 0} title={product.images.length === 0 ? 'Add at least one image first' : undefined}>
                  Publish
                </Button>
              ))}
          </>
        }
      />

      {params.get('created') && product.images.length === 0 && (
        <Banner tone="info">Draft saved. Step 2: upload images below, then press Publish to put it live on the storefront.</Banner>
      )}

      <div className="space-y-6">
        {canWrite && <ImageManager product={product} />}
        {canWrite ? <ProductForm key={product._id} product={product} /> : <p className="text-muted">You have read-only access to products.</p>}

        <Panel title="Stock history" description="Every change to on-hand and reserved units, newest first." bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-left">
                  {['When', 'SKU', 'Movement', 'On hand Δ', 'Reserved Δ', 'On hand after', 'By', 'Note'].map((h) => (
                    <th key={h} scope="col" className="border-b border-line bg-sand/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.data?.items.map((m) => (
                  <tr key={m._id}>
                    <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-muted">{dateTime(m.createdAt)}</td>
                    <td className="border-b border-line px-4 py-2.5 font-mono text-[11px]">{m.sku}</td>
                    <td className="border-b border-line px-4 py-2.5">{MOVE_LABEL[m.type] ?? m.type}</td>
                    <td className="tabular border-b border-line px-4 py-2.5">{m.stockDelta > 0 ? `+${m.stockDelta}` : m.stockDelta}</td>
                    <td className="tabular border-b border-line px-4 py-2.5">{m.reservedDelta > 0 ? `+${m.reservedDelta}` : m.reservedDelta}</td>
                    <td className="tabular border-b border-line px-4 py-2.5">{m.stockAfter ?? '—'}</td>
                    <td className="border-b border-line px-4 py-2.5 text-graphite">{m.actor.name ?? m.actor.type}</td>
                    <td className="border-b border-line px-4 py-2.5 text-muted">{m.note ?? ''}</td>
                  </tr>
                ))}
                {movements.data && movements.data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted">
                      No stock movements yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

export default function EditProductPage() {
  return (
    <Suspense>
      <EditProductInner />
    </Suspense>
  );
}
