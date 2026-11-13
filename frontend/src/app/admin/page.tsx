'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { api, ApiError, imageUrl, qs } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { cn, dateTime, money, statusLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { PageHeader, Panel, StatTile, StatusChip, KeyValue } from '@/components/admin/ui';
import { OrdersChart, RankedBars, RevenueChart } from '@/components/admin/charts';
import { useAdminMe, useRealtime, toDateInput } from '@/lib/admin/hooks';
import type { Overview, ProductAnalytics, RevenueResponse } from '@/lib/admin/types';

type Preset = '7d' | '30d' | '90d' | '12m' | 'custom';
type Granularity = 'day' | 'week' | 'month' | 'year';

const PRESETS: { value: Preset; label: string; days?: number; granularity: Granularity }[] = [
  { value: '7d', label: '7 days', days: 7, granularity: 'day' },
  { value: '30d', label: '30 days', days: 30, granularity: 'day' },
  { value: '90d', label: '90 days', days: 90, granularity: 'week' },
  { value: '12m', label: '12 months', days: 365, granularity: 'month' },
  { value: 'custom', label: 'Custom', granularity: 'day' },
];

function startOfDayDaysAgo(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const { data: me } = useAdminMe();
  const [preset, setPreset] = useState<Preset>('30d');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [customFrom, setCustomFrom] = useState(toDateInput(startOfDayDaysAgo(30)));
  const [customTo, setCustomTo] = useState(toDateInput(new Date()));
  const [exporting, setExporting] = useState(false);

  const range = useMemo(() => {
    if (preset === 'custom') {
      return { from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined, to: customTo ? new Date(`${customTo}T00:00:00`).toISOString() : undefined };
    }
    const p = PRESETS.find((x) => x.value === preset)!;
    return { from: startOfDayDaysAgo(p.days!).toISOString(), to: undefined as string | undefined };
  }, [preset, customFrom, customTo]);

  const canRead = me?.permissions.includes('analytics:read');

  const overview = useQuery({
    queryKey: ['admin', 'analytics', 'overview', range],
    queryFn: () => api<Overview>('/admin/analytics/overview', { query: range }),
    enabled: Boolean(canRead),
    placeholderData: keepPreviousData,
  });
  const revenue = useQuery({
    queryKey: ['admin', 'analytics', 'revenue', range, granularity],
    queryFn: () => api<RevenueResponse>('/admin/analytics/revenue', { query: { ...range, granularity } }),
    enabled: Boolean(canRead),
    placeholderData: keepPreviousData,
  });
  const products = useQuery({
    queryKey: ['admin', 'analytics', 'products', range],
    queryFn: () => api<ProductAnalytics>('/admin/analytics/products', { query: range }),
    enabled: Boolean(canRead),
    placeholderData: keepPreviousData,
  });

  useRealtime(['analytics:refresh', 'order:created', 'order:updated', 'inventory:changed'], () => {
    qc.invalidateQueries({ queryKey: ['admin', 'analytics'] });
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/analytics/export.csv${qs(range)}`, { credentials: 'include' });
      if (!res.ok) throw new ApiError(res.status, 'EXPORT', res.status === 403 ? 'You do not have permission to export.' : 'Export failed.');
      const blob = await res.blob();
      const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'velora-orders.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Orders exported');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  if (me && !canRead) {
    return (
      <>
        <PageHeader title={`Welcome, ${me.name.split(' ')[0]}`} description="Your role does not include financial analytics. Use the menu to manage orders and stock." />
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Orders" value="Open orders" href="/admin/orders" />
          <StatTile label="Inventory" value="Stock levels" href="/admin/inventory" />
        </div>
      </>
    );
  }

  const o = overview.data;
  const cur = o?.baseCurrency ?? 'GBP';
  const period = o?.period;
  const fetching = overview.isFetching || revenue.isFetching || products.isFetching;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Every figure is calculated from verified Stripe payments and live order records."
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting} icon={<Download className="h-4 w-4" aria-hidden />}>
            Export CSV
          </Button>
        }
      />

      {/* One filter row scopes every chart below */}
      <div className="mb-6 flex flex-wrap items-end gap-3" role="group" aria-label="Date range">
        <div className="flex flex-wrap border border-line-strong bg-paper">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                setPreset(p.value);
                setGranularity(p.granularity);
              }}
              aria-pressed={preset === p.value}
              className={cn('h-10 px-4 text-[12px] uppercase tracking-[0.12em] transition-colors', preset === p.value ? 'bg-ink text-ivory' : 'text-graphite hover:bg-sand')}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
              From
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 border border-line-strong bg-paper px-3 text-[14px] normal-case tracking-normal text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-muted">
              To
              <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="h-10 border border-line-strong bg-paper px-3 text-[14px] normal-case tracking-normal text-ink" />
            </label>
          </div>
        )}
        {fetching && <span className="text-[12px] text-muted" role="status">Updating…</span>}
      </div>

      {overview.isError && (
        <p role="alert" className="mb-6 border border-[#e3b4b4] bg-[#fbeeee] px-4 py-3 text-[14px] text-danger">
          Could not load analytics. <button type="button" className="underline" onClick={() => overview.refetch()}>Retry</button>
        </p>
      )}

      {/* Revenue tiles */}
      <section aria-label="Net revenue" className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {(
          [
            ['Revenue today', o?.revenue.today],
            ['This week', o?.revenue.week],
            ['This month', o?.revenue.month],
            ['This year', o?.revenue.year],
            ['All time', o?.revenue.allTime],
          ] as const
        ).map(([label, v]) => (
          <StatTile key={label} label={label} value={o ? money(v ?? 0, cur) : <span className="skeleton inline-block h-7 w-24" />} hint="Net revenue" />
        ))}
      </section>

      <section aria-label="Orders, customers and products" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatTile label="Paid orders" value={o ? o.orders.total.toLocaleString('en-GB') : '—'} href="/admin/orders" />
        <StatTile label="Awaiting fulfilment" value={o ? o.orders.awaitingFulfilment : '—'} href="/admin/orders?status=paid" tone={o && o.orders.awaitingFulfilment > 0 ? 'warning' : undefined} hint={o && o.orders.awaitingFulfilment > 0 ? 'Needs action' : undefined} />
        <StatTile label="Pending payment" value={o ? o.orders.pendingPayment : '—'} hint="Open checkouts" />
        <StatTile label="In transit" value={o ? o.orders.inTransit : '—'} />
        <StatTile label="Completed" value={o ? o.orders.completed : '—'} hint="Delivered" />
        <StatTile label="Cancelled · refunded" value={o ? `${o.orders.cancelled} · ${o.orders.refunded}` : '—'} />
        <StatTile label="Customers" value={o ? o.customers.total.toLocaleString('en-GB') : '—'} hint={o ? `${o.customers.newThisMonth} new this month` : undefined} href="/admin/customers" />
        <StatTile label="Products" value={o ? `${o.products.active} / ${o.products.total}` : '—'} hint="Active / total" href="/admin/products" />
        <StatTile label="Low stock" value={o ? o.products.lowStockVariants : '—'} hint={o ? `variants · ${o.products.lowStockProducts} products` : undefined} tone={o && o.products.lowStockVariants > 0 ? 'warning' : undefined} href="/admin/inventory?filter=low" />
        <StatTile label="Out of stock" value={o ? o.products.outOfStockVariants : '—'} hint={o ? `variants · ${o.products.outOfStock} products fully sold out` : undefined} tone={o && o.products.outOfStockVariants > 0 ? 'danger' : undefined} href="/admin/inventory?filter=out" />
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <RevenueChart
          series={revenue.data?.series ?? []}
          currency={cur}
          granularity={granularity}
          fetching={revenue.isFetching}
          actions={
            <div className="flex border border-line-strong" role="group" aria-label="Granularity">
              {(['day', 'week', 'month', 'year'] as const).map((g) => (
                <button key={g} type="button" onClick={() => setGranularity(g)} aria-pressed={granularity === g} className={cn('h-8 px-3 text-[11px] uppercase tracking-[0.1em]', granularity === g ? 'bg-ink text-ivory' : 'text-graphite hover:bg-sand')}>
                  {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : g === 'month' ? 'Monthly' : 'Yearly'}
                </button>
              ))}
            </div>
          }
        />

        <Panel title="Selected period" description={`All amounts in ${cur}`}>
          {period ? (
            <dl className="divide-y divide-line">
              <KeyValue label="Gross sales"><span className="tabular">{money(period.grossSales, cur)}</span></KeyValue>
              <KeyValue label="Discounts"><span className="tabular">−{money(period.discounts, cur)}</span></KeyValue>
              <KeyValue label="Delivery charges"><span className="tabular">{money(period.deliveryCharges, cur)}</span></KeyValue>
              <KeyValue label="Taxes collected"><span className="tabular">{money(period.taxes, cur)}</span></KeyValue>
              <KeyValue label={`Refunds (${period.refundCount})`}><span className="tabular">−{money(period.refunds, cur)}</span></KeyValue>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[14px] font-semibold text-ink">Net revenue</dt>
                <dd className="tabular text-[17px] font-semibold text-ink">{money(period.netRevenue, cur)}</dd>
              </div>
              <KeyValue label="Paid orders"><span className="tabular">{period.orders}</span></KeyValue>
              <KeyValue label="Units sold"><span className="tabular">{period.unitsSold}</span></KeyValue>
              <KeyValue label="Average order value"><span className="tabular">{money(period.averageOrderValue, cur)}</span></KeyValue>
              {period.grossProfit != null ? (
                <KeyValue label="Gross profit"><span className="tabular">{money(period.grossProfit, cur)}</span></KeyValue>
              ) : (
                <p className="py-2.5 text-[13px] text-muted">
                  Add product costs to see profit · {Math.round(period.costCoverage * 100)}% of sold lines have a cost.
                </p>
              )}
              {period.byCurrency.length > 1 && (
                <div className="pt-2.5">
                  <p className="mb-1 text-[12px] text-muted">Collected by currency (before conversion)</p>
                  {period.byCurrency.map((c) => (
                    <KeyValue key={c.currency} label={`${c.currency} · ${c.orders} orders`}><span className="tabular">{money(c.collected, c.currency)}</span></KeyValue>
                  ))}
                </div>
              )}
            </dl>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-5" />
              ))}
            </div>
          )}
          <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
            Net revenue = amount collected − tax − refunds. Only Stripe-verified payments count; amounts in other currencies use the exchange rate saved at checkout.
          </p>
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <OrdersChart series={revenue.data?.series ?? []} granularity={granularity} fetching={revenue.isFetching} />
        <RankedBars
          title="Order status"
          description="All orders, every status"
          valueLabel="Orders"
          format={(v) => v.toLocaleString('en-GB')}
          fetching={overview.isFetching}
          emptyText="No orders have been placed yet."
          data={Object.entries(o?.orders.byStatus ?? {})
            .map(([status, count]) => ({ label: statusLabel(status), value: count }))
            .sort((a, b) => b.value - a.value)}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <RankedBars
          title="Sales by category"
          description="Item revenue in the selected period"
          valueLabel="Revenue"
          format={(v) => money(v, cur, { compact: true })}
          fetching={products.isFetching}
          data={(products.data?.byCategory ?? []).map((c) => ({ label: c.category, value: c.revenue, secondary: `${c.units} units` }))}
        />
        <Panel title="Best sellers" description="By units sold in the selected period" bodyClassName="p-0">
          {products.data?.bestSellers.length ? (
            <ol className="divide-y divide-line">
              {products.data.bestSellers.slice(0, 6).map((b, i) => (
                <li key={b.productId} className="flex items-center gap-4 px-5 py-3">
                  <span className="tabular w-5 text-[13px] text-muted">{i + 1}</span>
                  <span className="h-12 w-10 shrink-0 overflow-hidden bg-sand">
                    {b.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(b.image)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/admin/products/${b.productId}`} className="block truncate text-[14px] text-ink hover:underline">
                      {b.name}
                    </Link>
                    <span className="text-[12px] text-muted">{b.units} units</span>
                  </span>
                  <span className="tabular text-[14px] text-ink">{money(b.revenue, cur)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex h-[220px] flex-col items-center justify-center gap-2 px-5 text-center">
              <p className="font-display text-2xl">No sales yet</p>
              <p className="text-[14px] text-muted">Best sellers appear once orders are paid.</p>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel title="Recent transactions" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="text-left">
                  {['Order', 'Customer', 'Status', 'Method', 'Amount', 'Date'].map((h, i) => (
                    <th key={h} scope="col" className={cn('border-b border-line bg-sand/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite', i === 4 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(o?.recentTransactions ?? []).map((t) => (
                  <tr key={t._id}>
                    <td className="border-b border-line px-4 py-3">
                      {t.orderId ? (
                        <Link href={`/admin/orders/${t.orderId}`} className="font-medium text-ink hover:underline">
                          {t.orderNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="border-b border-line px-4 py-3 text-graphite">{t.customerName ?? '—'}</td>
                    <td className="border-b border-line px-4 py-3">
                      <StatusChip status={t.status} />
                    </td>
                    <td className="border-b border-line px-4 py-3 capitalize text-graphite">{t.method ? `${t.method}${t.last4 ? ` ·· ${t.last4}` : ''}` : '—'}</td>
                    <td className="tabular border-b border-line px-4 py-3 text-right text-ink">{money(t.amount, t.currency)}</td>
                    <td className="border-b border-line px-4 py-3 text-[13px] text-muted">{dateTime(t.createdAt)}</td>
                  </tr>
                ))}
                {o && o.recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[14px] text-muted">
                      No transactions yet. Payments appear here as soon as Stripe confirms them.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Top customers" description="By net spend in the selected period" bodyClassName="p-0">
          {products.data?.topCustomers.length ? (
            <ul className="divide-y divide-line">
              {products.data.topCustomers.slice(0, 6).map((c) => (
                <li key={c.userId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <Link href={`/admin/customers/${c.userId}`} className="block truncate text-[14px] text-ink hover:underline">
                      {c.name}
                    </Link>
                    <span className="block truncate text-[12px] text-muted">
                      {c.orders} orders · {c.email}
                    </span>
                  </span>
                  <span className="tabular text-[14px]">{money(c.spent, cur)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-12 text-center text-[14px] text-muted">No paying customers in this period yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
