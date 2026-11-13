'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { money } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { errorMessage, useCan, useRealtime } from '@/lib/admin/hooks';
import type { AdminProduct, Paged } from '@/lib/admin/types';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog, FilterSelect, PageHeader, Pagination, SearchBox, StatusChip, StockFlag, TableEmpty, TableSkeleton, TableWrap, Td, Th } from '@/components/admin/ui';

type Status = '' | 'draft' | 'published' | 'archived';
type Dept = '' | 'clothing' | 'footwear' | 'accessories';
type Stock = '' | 'low' | 'out' | 'in';
type Sort = 'newest' | 'name' | 'price_asc' | 'price_desc' | 'stock_asc' | 'best_selling';

export default function ProductsPage() {
  const qc = useQueryClient();
  const canWrite = useCan('products:write');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('');
  const [department, setDepartment] = useState<Dept>('');
  const [stock, setStock] = useState<Stock>('');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<AdminProduct | null>(null);
  const dq = useDebounced(q, 300);
  useEffect(() => setPage(1), [dq, status, department, stock, sort]);

  const query = useQuery({
    queryKey: ['admin', 'products', { dq, status, department, stock, sort, page }],
    queryFn: () => api<Paged<AdminProduct>>('/admin/products', { query: { q: dq || undefined, status: status || undefined, department: department || undefined, stock: stock || undefined, sort, page } }),
    placeholderData: keepPreviousData,
  });
  useRealtime(['product:changed', 'inventory:changed'], () => qc.invalidateQueries({ queryKey: ['admin', 'products'] }));

  const setProductStatus = useMutation({
    mutationFn: ({ id, status: s }: { id: string; status: Exclude<Status, ''> }) => api(`/admin/products/${id}/status`, { method: 'PATCH', body: { status: s } }),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'published' ? 'Published — now live on the storefront' : v.status === 'archived' ? 'Archived' : 'Unpublished');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Product deleted');
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const data = query.data;
  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Every change is saved to MongoDB and pushed to the storefront instantly."
        actions={
          canWrite && (
            <ButtonLink href="/admin/products/new" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />}>
              New product
            </ButtonLink>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Name, brand, SKU…" label="Search products" className="basis-full sm:basis-auto" />
        <FilterSelect<Status> label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Active (not archived)' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }]} />
        <FilterSelect<Dept> label="Department" value={department} onChange={setDepartment} options={[{ value: '', label: 'All' }, { value: 'clothing', label: 'Clothing' }, { value: 'footwear', label: 'Footwear' }, { value: 'accessories', label: 'Accessories' }]} />
        <FilterSelect<Stock> label="Stock" value={stock} onChange={setStock} options={[{ value: '', label: 'Any' }, { value: 'in', label: 'In stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} />
        <FilterSelect<Sort> label="Sort" value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'name', label: 'Name A–Z' }, { value: 'price_asc', label: 'Price low–high' }, { value: 'price_desc', label: 'Price high–low' }, { value: 'stock_asc', label: 'Lowest stock' }, { value: 'best_selling', label: 'Best selling' }]} />
      </div>

      <TableWrap className={query.isFetching && data ? 'opacity-70 transition-opacity' : ''}>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Status</Th>
            <Th align="right">Price</Th>
            <Th align="right">On hand</Th>
            <Th>Availability</Th>
            <Th align="right">Sold</Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {query.isLoading && <TableSkeleton cols={7} />}
          {data?.items.map((p) => {
            const minAvail = p.variants.length ? Math.min(...p.variants.filter((v) => v.isActive).map((v) => v.available)) : 0;
            const outVariants = p.variants.filter((v) => v.isActive && v.available <= 0).length;
            return (
              <tr key={p._id} className="transition-colors hover:bg-sand/40">
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-11 shrink-0 overflow-hidden bg-sand">
                      {p.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl(p.images[0].sm)} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/admin/products/${p._id}`} className="block max-w-[280px] truncate font-medium text-ink hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-[12px] text-muted">
                        {p.brandName} · {p.categoryName} · {p.variants.length} variant{p.variants.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <StatusChip status={p.status} />
                  {p.images.length === 0 && <span className="mt-1 block text-[11px] text-warning">No images</span>}
                </Td>
                <Td align="right">
                  {p.salePrice != null && p.salePrice < p.price ? (
                    <>
                      <span className="text-sale">{money(p.salePrice)}</span>
                      <s className="block text-[12px] text-muted">{money(p.price)}</s>
                    </>
                  ) : (
                    money(p.price)
                  )}
                </Td>
                <Td align="right">{p.totalStock}</Td>
                <Td>
                  {p.totalAvailable <= 0 ? (
                    <StockFlag available={0} threshold={p.lowStockThreshold} />
                  ) : minAvail <= p.lowStockThreshold ? (
                    <span className="flex flex-col">
                      <StockFlag available={Math.max(minAvail, 0)} threshold={p.lowStockThreshold} />
                      <span className="text-[11px] text-muted">
                        {p.totalAvailable} total{outVariants ? ` · ${outVariants} sold out` : ''}
                      </span>
                    </span>
                  ) : (
                    <StockFlag available={p.totalAvailable} threshold={p.lowStockThreshold} />
                  )}
                </Td>
                <Td align="right">{p.soldCount}</Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/admin/products/${p._id}`} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Edit ${p.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                    {canWrite && (
                      <>
                        {p.status === 'published' ? (
                          <button type="button" onClick={() => setProductStatus.mutate({ id: p._id, status: 'draft' })} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Unpublish ${p.name}`} title="Unpublish">
                            <EyeOff className="h-4 w-4" />
                          </button>
                        ) : (
                          <button type="button" onClick={() => setProductStatus.mutate({ id: p._id, status: 'published' })} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Publish ${p.name}`} title="Publish">
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {p.status !== 'archived' && (
                          <button type="button" onClick={() => setProductStatus.mutate({ id: p._id, status: 'archived' })} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Archive ${p.name}`} title="Archive">
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                        <button type="button" onClick={() => setConfirmDelete(p)} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-[#fbeeee] hover:text-danger" aria-label={`Delete ${p.name}`} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
          {data && data.items.length === 0 && <TableEmpty colSpan={7} title="No products found" body="Adjust the filters or create a new product." />}
        </tbody>
      </TableWrap>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="products" />}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete._id)}
        loading={remove.isPending}
        destructive
        title="Delete product?"
        confirmLabel="Delete permanently"
        body={
          <>
            <strong>{confirmDelete?.name}</strong> and its images will be removed from the store, carts and wishlists. Past orders keep their own record. Consider archiving instead if you may sell it again.
          </>
        }
      />
    </>
  );
}
