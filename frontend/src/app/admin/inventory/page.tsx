'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, PackagePlus, SlidersHorizontal } from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { cn, dateTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { errorMessage, useCan, useRealtime } from '@/lib/admin/hooks';
import type { InventoryRow, Paged, StockMovement } from '@/lib/admin/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Dialog, Drawer, PageHeader, Pagination, SearchBox, StockFlag, TableEmpty, TableSkeleton, TableWrap, Td, Th } from '@/components/admin/ui';

type Filter = 'all' | 'low' | 'out' | 'reserved';

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

function InventoryInner() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const canWrite = useCan('inventory:write');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>((['all', 'low', 'out', 'reserved'] as const).find((f) => f === params.get('filter')) ?? 'all');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  useEffect(() => setPage(1), [dq, filter]);
  // Notification links (e.g. low-stock alerts) navigate here with ?q=SKU.
  const urlQ = params.get('q');
  const urlFilter = params.get('filter');
  useEffect(() => {
    if (urlQ !== null) setQ(urlQ);
  }, [urlQ]);
  useEffect(() => {
    const f = (['all', 'low', 'out', 'reserved'] as const).find((x) => x === urlFilter);
    if (f) setFilter(f);
  }, [urlFilter]);

  const [editing, setEditing] = useState<{ row: InventoryRow; mode: 'set' | 'restock' | 'adjust' } | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<InventoryRow | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'inventory', { dq, filter, page }],
    queryFn: () => api<Paged<InventoryRow>>('/admin/inventory', { query: { q: dq || undefined, filter, page } }),
    placeholderData: keepPreviousData,
  });
  useRealtime(['inventory:changed', 'product:changed'], () => qc.invalidateQueries({ queryKey: ['admin', 'inventory'] }));

  const movements = useQuery({
    queryKey: ['admin', 'movements', 'variant', history?.variantId],
    queryFn: () => api<Paged<StockMovement>>('/admin/inventory/movements', { query: { variantId: history!.variantId, limit: 50 } }),
    enabled: Boolean(history),
  });

  const mutate = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const n = Number.parseInt(value, 10);
      const { row, mode } = editing;
      if (mode === 'set') return api(`/admin/inventory/${row.variantId}`, { method: 'PUT', body: { stock: n, note: note || undefined } });
      if (mode === 'restock') return api('/admin/inventory/restock', { body: { variantId: row.variantId, quantity: n, note: note || undefined } });
      return api('/admin/inventory/adjust', { body: { variantId: row.variantId, delta: n, note } });
    },
    onSuccess: () => {
      toast.success('Stock updated — storefront availability refreshed');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'movements'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function open(row: InventoryRow, mode: 'set' | 'restock' | 'adjust') {
    setEditing({ row, mode });
    setValue(mode === 'set' ? String(row.stock) : '');
    setNote('');
  }

  const n = Number.parseInt(value, 10);
  const invalid =
    !editing ||
    !Number.isFinite(n) ||
    (editing.mode === 'set' && (n < 0 || n < editing.row.reserved)) ||
    (editing.mode === 'restock' && n < 1) ||
    (editing.mode === 'adjust' && (n === 0 || note.trim().length < 2 || n < -editing.row.available));

  const data = query.data;
  return (
    <>
      <PageHeader eyebrow="Stock" title="Inventory" description="On hand = physical units. Reserved = held by customers in checkout. Available = what shoppers can buy right now." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Product, brand or SKU…" label="Search inventory" />
        <div className="flex border border-line-strong bg-paper" role="group" aria-label="Filter">
          {(
            [
              ['all', 'All'],
              ['low', 'Low stock'],
              ['out', 'Out of stock'],
              ['reserved', 'Reserved'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={cn('h-10 px-4 text-[12px] uppercase tracking-[0.12em]', filter === v ? 'bg-ink text-ivory' : 'text-graphite hover:bg-sand')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <TableWrap className={query.isFetching && data ? 'opacity-70 transition-opacity' : ''}>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Variant</Th>
            <Th>SKU</Th>
            <Th align="right">On hand</Th>
            <Th align="right">Reserved</Th>
            <Th>Available</Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {query.isLoading && <TableSkeleton cols={7} />}
          {data?.items.map((r) => (
            <tr key={r.variantId} className={cn('transition-colors hover:bg-sand/40', !r.isActive && 'opacity-60')}>
              <Td>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-10 shrink-0 overflow-hidden bg-sand">
                    {r.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(r.image)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/admin/products/${r.productId}`} className="block max-w-[240px] truncate text-ink hover:underline">
                      {r.name}
                    </Link>
                    <span className="text-[12px] text-muted">{r.brandName}{r.status !== 'published' ? ` · ${r.status}` : ''}</span>
                  </div>
                </div>
              </Td>
              <Td>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 border border-line-strong" style={{ background: r.colorHex }} aria-hidden />
                  {r.color} · {r.size}
                </span>
                {!r.isActive && <span className="block text-[11px] text-muted">Inactive</span>}
              </Td>
              <Td className="font-mono text-[12px]">{r.sku}</Td>
              <Td align="right">{r.stock}</Td>
              <Td align="right">{r.reserved}</Td>
              <Td>
                <StockFlag available={r.available} threshold={r.lowStockThreshold} />
              </Td>
              <Td align="right">
                <div className="flex justify-end gap-1">
                  {canWrite && (
                    <>
                      <button type="button" onClick={() => open(r, 'set')} className="h-9 border border-line-strong px-3 text-[11px] uppercase tracking-[0.1em] hover:border-ink" aria-label={`Set stock for ${r.sku}`}>
                        Set
                      </button>
                      <button type="button" onClick={() => open(r, 'restock')} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Restock ${r.sku}`} title="Restock">
                        <PackagePlus className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => open(r, 'adjust')} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Adjust ${r.sku}`} title="Adjust with note">
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => setHistory(r)} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand hover:text-ink" aria-label={`Stock history for ${r.sku}`} title="History">
                    <History className="h-4 w-4" />
                  </button>
                </div>
              </Td>
            </tr>
          ))}
          {data && data.items.length === 0 && <TableEmpty colSpan={7} title="Nothing here" body={filter === 'all' ? 'No variants match your search.' : 'No variants match this filter — good news.'} />}
        </tbody>
      </TableWrap>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="variants" />}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'set' ? 'Set on-hand stock' : editing?.mode === 'restock' ? 'Restock' : 'Adjust stock'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => mutate.mutate()} loading={mutate.isPending} disabled={invalid}>
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!invalid) mutate.mutate();
            }}
            className="space-y-4"
          >
            <p className="text-[14px] text-graphite">
              <span className="font-medium text-ink">{editing.row.name}</span> — {editing.row.color} · {editing.row.size}
              <span className="block font-mono text-[12px] text-muted">{editing.row.sku}</span>
              <span className="tabular mt-1 block text-[13px]">
                On hand {editing.row.stock} · reserved {editing.row.reserved} · available {editing.row.available}
              </span>
            </p>
            <Input
              label={editing.mode === 'set' ? 'New on-hand quantity' : editing.mode === 'restock' ? 'Units received' : 'Change (use − to remove)'}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(editing.mode === 'adjust' ? /[^0-9-]/g : /[^0-9]/g, ''))}
              data-autofocus
              error={
                value && editing.mode === 'set' && n < editing.row.reserved
                  ? `${editing.row.reserved} unit(s) are reserved in open checkouts — stock cannot go below that.`
                  : value && editing.mode === 'adjust' && n < -editing.row.available
                    ? `Only ${editing.row.available} unreserved unit(s) can be removed.`
                    : undefined
              }
            />
            <Input label={editing.mode === 'adjust' ? 'Reason (required)' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} required={editing.mode === 'adjust'} />
            {editing.mode === 'set' && Number.isFinite(n) && n !== editing.row.stock && (
              <p className="text-[13px] text-muted">
                Recorded as {n > editing.row.stock ? `+${n - editing.row.stock}` : n - editing.row.stock} in the stock ledger. Available becomes {Math.max(0, n - editing.row.reserved)}.
              </p>
            )}
          </form>
        )}
      </Dialog>

      <Drawer open={Boolean(history)} onClose={() => setHistory(null)} title="Stock history" width="lg">
        {history && (
          <>
            <p className="mb-4 text-[14px] text-graphite">
              {history.name} — {history.color} · {history.size} <span className="font-mono text-[12px] text-muted">{history.sku}</span>
            </p>
            {movements.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-10" />
                ))}
              </div>
            ) : (
              <ol className="divide-y divide-line border-y border-line">
                {movements.data?.items.map((m) => (
                  <li key={m._id} className="flex items-start justify-between gap-4 py-3 text-[14px]">
                    <div>
                      <p className="text-ink">{MOVE_LABEL[m.type] ?? m.type}</p>
                      <p className="text-[12px] text-muted">
                        {dateTime(m.createdAt)} · {m.actor.name ?? m.actor.type}
                        {m.note ? ` · ${m.note}` : ''}
                      </p>
                    </div>
                    <div className="tabular text-right text-[13px]">
                      {m.stockDelta !== 0 && <p>On hand {m.stockDelta > 0 ? `+${m.stockDelta}` : m.stockDelta}</p>}
                      {m.reservedDelta !== 0 && <p className="text-muted">Reserved {m.reservedDelta > 0 ? `+${m.reservedDelta}` : m.reservedDelta}</p>}
                      {m.stockAfter != null && <p className="text-[12px] text-muted">→ {m.stockAfter} on hand</p>}
                    </div>
                  </li>
                ))}
                {movements.data?.items.length === 0 && <li className="py-8 text-center text-muted">No movements recorded.</li>}
              </ol>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryInner />
    </Suspense>
  );
}
