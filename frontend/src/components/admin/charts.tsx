'use client';

import { useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { money } from '@/lib/format';
import { useReducedMotion } from '@/lib/hooks';
import type { RevenuePoint } from '@/lib/admin/types';
import { Panel } from './ui';

/**
 * Chart tokens (validated with the dataviz palette validator against the
 * paper surface #fbf9f6: lightness band, chroma floor and ≥3:1 contrast pass).
 * One data hue — every chart here is a single series; text never wears it.
 */
export const VIZ = {
  series: '#9a6a1c',
  surface: '#fbf9f6',
  grid: '#e2dcd3',
  axis: '#cbc3b7',
  textPrimary: '#0c0a09',
  textSecondary: '#44403c',
  textMuted: '#57534e',
};

const axisTick = { fill: VIZ.textMuted, fontSize: 12, fontFamily: 'var(--font-jost)' };

function compactMoney(minor: number, currency: string) {
  const v = minor / 100;
  const sym = currency === 'USD' ? '$' : '£';
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(v) >= 10_000) return `${sym}${Math.round(v / 1000)}K`;
  return `${sym}${Math.round(v).toLocaleString('en-GB')}`;
}

export function periodLabel(period: string, granularity: string, long = false) {
  if (granularity === 'year') return period;
  if (granularity === 'month') {
    const [y, m] = period.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' });
  }
  const d = new Date(`${period}T00:00:00Z`);
  const s = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return granularity === 'week' ? (long ? `Week of ${s}` : s) : long ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : s;
}

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; key?: boolean }[] }) {
  return (
    <div className="min-w-[180px] border border-line bg-paper px-3 py-2.5 text-[13px] shadow-lg">
      <p className="mb-1.5 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-graphite">
          <span className="flex items-center gap-2">
            {r.key && <span className="inline-block h-0.5 w-3" style={{ background: VIZ.series }} aria-hidden />}
            {r.label}
          </span>
          <span className="tabular text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Card with a chart ⇄ table toggle — every chart has a table-view twin. */
export function ChartCard({ title, description, actions, chart, table, empty, emptyText, fetching }: { title: string; description?: ReactNode; actions?: ReactNode; chart: ReactNode; table: ReactNode; empty?: boolean; emptyText?: string; fetching?: boolean }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Panel
      title={title}
      description={description}
      actions={
        <>
          {actions}
          {!empty && (
            <div className="flex border border-line-strong" role="group" aria-label="Display as">
              <button type="button" onClick={() => setView('chart')} aria-pressed={view === 'chart'} className={`inline-flex h-8 w-8 items-center justify-center ${view === 'chart' ? 'bg-ink text-ivory' : 'text-graphite hover:bg-sand'}`} aria-label="Chart view">
                <BarChart3 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setView('table')} aria-pressed={view === 'table'} className={`inline-flex h-8 w-8 items-center justify-center ${view === 'table' ? 'bg-ink text-ivory' : 'text-graphite hover:bg-sand'}`} aria-label="Table view">
                <Table2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      }
    >
      <div className={`transition-opacity duration-300 ${fetching ? 'opacity-50' : 'opacity-100'}`}>
        {empty ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-2xl text-ink">No data yet</p>
            <p className="max-w-sm text-[14px] text-muted">{emptyText ?? 'Figures appear here once customers complete paid orders.'}</p>
          </div>
        ) : view === 'chart' ? (
          chart
        ) : (
          <div className="max-h-[320px] overflow-auto" data-lenis-prevent>
            {table}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} scope="col" className={`sticky top-0 border-b border-line bg-paper py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-graphite ${i ? 'text-right' : 'text-left'}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={`border-b border-line py-2 ${j ? 'tabular text-right' : 'text-left'} text-ink`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RevenueChart({ series, currency, granularity, fetching, actions }: { series: RevenuePoint[]; currency: string; granularity: string; fetching?: boolean; actions?: ReactNode }) {
  const reduced = useReducedMotion();
  const empty = series.every((p) => p.netRevenue === 0 && p.orders === 0 && p.refunds === 0);
  const total = series.reduce((s, p) => s + p.netRevenue, 0);
  return (
    <ChartCard
      title="Net revenue"
      description={`${money(total, currency)} in range · paid orders less tax and refunds, in ${currency}`}
      actions={actions}
      empty={empty}
      fetching={fetching}
      emptyText="No paid orders in this period. Net revenue is calculated only from payments verified by Stripe."
      chart={
        <div role="img" aria-label={`Net revenue by ${granularity}, total ${money(total, currency)}`}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="velora-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VIZ.series} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={VIZ.series} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={VIZ.grid} strokeWidth={1} />
              <XAxis dataKey="period" tickFormatter={(p) => periodLabel(String(p), granularity)} tick={axisTick} tickLine={false} axisLine={{ stroke: VIZ.axis }} minTickGap={24} />
              <YAxis tickFormatter={(v) => compactMoney(Number(v), currency)} tick={axisTick} tickLine={false} axisLine={false} width={64} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: VIZ.axis, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as RevenuePoint;
                  return (
                    <TooltipCard
                      title={periodLabel(p.period, granularity, true)}
                      rows={[
                        { label: 'Net revenue', value: money(p.netRevenue, currency), key: true },
                        { label: 'Orders', value: String(p.orders) },
                        { label: 'Gross sales', value: money(p.grossSales, currency) },
                        { label: 'Refunds', value: money(p.refunds, currency) },
                      ]}
                    />
                  );
                }}
              />
              <Area type="monotone" dataKey="netRevenue" name="Net revenue" stroke={VIZ.series} strokeWidth={2} fill="url(#velora-rev)" strokeLinejoin="round" strokeLinecap="round" activeDot={{ r: 5, fill: VIZ.series, stroke: VIZ.surface, strokeWidth: 2 }} dot={false} isAnimationActive={!reduced} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      }
      table={<MiniTable head={['Period', 'Orders', 'Gross sales', 'Discounts', 'Delivery', 'Tax', 'Refunds', 'Net revenue']} rows={series.map((p) => [periodLabel(p.period, granularity, true), p.orders, money(p.grossSales, currency), money(p.discounts, currency), money(p.delivery, currency), money(p.taxes, currency), money(p.refunds, currency), money(p.netRevenue, currency)])} />}
    />
  );
}

export function OrdersChart({ series, granularity, fetching }: { series: RevenuePoint[]; granularity: string; fetching?: boolean }) {
  const reduced = useReducedMotion();
  const total = series.reduce((s, p) => s + p.orders, 0);
  return (
    <ChartCard
      title="Paid orders"
      description={`${total.toLocaleString('en-GB')} in range`}
      empty={total === 0}
      fetching={fetching}
      emptyText="No paid orders in this period yet."
      chart={
        <div role="img" aria-label={`Paid orders by ${granularity}, ${total} in total`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 16, right: 8, bottom: 0, left: 4 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis dataKey="period" tickFormatter={(p) => periodLabel(String(p), granularity)} tick={axisTick} tickLine={false} axisLine={{ stroke: VIZ.axis }} minTickGap={24} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(12,10,9,0.04)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as RevenuePoint;
                  return <TooltipCard title={periodLabel(p.period, granularity, true)} rows={[{ label: 'Paid orders', value: String(p.orders), key: true }]} />;
                }}
              />
              <Bar dataKey="orders" name="Paid orders" fill={VIZ.series} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={<MiniTable head={['Period', 'Paid orders']} rows={series.map((p) => [periodLabel(p.period, granularity, true), p.orders])} />}
    />
  );
}

/** Ranked horizontal bars for nominal categories — one colour, value at the tip. */
export function RankedBars({
  title,
  description,
  data,
  valueLabel,
  format,
  emptyText,
  fetching,
}: {
  title: string;
  description?: ReactNode;
  data: { label: string; value: number; secondary?: string }[];
  valueLabel: string;
  format: (v: number) => string;
  emptyText?: string;
  fetching?: boolean;
}) {
  const reduced = useReducedMotion();
  const rows = data.slice(0, 8);
  const height = Math.max(120, rows.length * 40 + 24);
  return (
    <ChartCard
      title={title}
      description={description}
      empty={rows.length === 0 || rows.every((r) => r.value === 0)}
      emptyText={emptyText}
      fetching={fetching}
      chart={
        <div role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 0 }} barCategoryGap={12}>
              <CartesianGrid horizontal={false} stroke={VIZ.grid} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" tick={{ ...axisTick, fill: VIZ.textSecondary }} tickLine={false} axisLine={{ stroke: VIZ.axis }} width={132} interval={0} />
              <Tooltip
                cursor={{ fill: 'rgba(12,10,9,0.04)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as { label: string; value: number; secondary?: string };
                  return <TooltipCard title={r.label} rows={[{ label: valueLabel, value: format(r.value), key: true }, ...(r.secondary ? [{ label: 'Detail', value: r.secondary }] : [])]} />;
                }}
              />
              <Bar dataKey="value" name={valueLabel} fill={VIZ.series} maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={!reduced}>
                <LabelList dataKey="value" position="right" formatter={(v: unknown) => format(Number(v))} style={{ fill: VIZ.textPrimary, fontSize: 12, fontFamily: 'var(--font-jost)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={<MiniTable head={['Name', valueLabel, ...(rows.some((r) => r.secondary) ? ['Detail'] : [])]} rows={rows.map((r) => [r.label, format(r.value), ...(r.secondary ? [r.secondary] : [])])} />}
    />
  );
}
