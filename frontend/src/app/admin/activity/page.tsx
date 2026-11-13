'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { ActivityEntry, Paged } from '@/lib/admin/types';
import { FilterSelect, PageHeader, Pagination, TableEmpty, TableSkeleton, TableWrap, Td, Th } from '@/components/admin/ui';

type Entity = '' | 'product' | 'variant' | 'order' | 'user' | 'coupon' | 'settings' | 'banner' | 'admin' | 'category' | 'brand' | 'review' | 'orders' | 'gridfs';

const ENTITY_LINK: Record<string, (id: string) => string> = {
  product: (id) => `/admin/products/${id}`,
  order: (id) => `/admin/orders/${id}`,
  user: (id) => `/admin/customers/${id}`,
};

export default function ActivityPage() {
  const [entity, setEntity] = useState<Entity>('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [entity]);
  const query = useQuery({
    queryKey: ['admin', 'activity', { entity, page }],
    queryFn: () => api<Paged<ActivityEntry>>('/admin/activity', { query: { entityType: entity || undefined, page } }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  return (
    <>
      <PageHeader eyebrow="Audit" title="Activity log" description="A permanent record of every important action taken in the owner portal." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterSelect<Entity>
          label="Type"
          value={entity}
          onChange={setEntity}
          options={[
            { value: '', label: 'Everything' },
            { value: 'product', label: 'Products' },
            { value: 'variant', label: 'Inventory' },
            { value: 'order', label: 'Orders' },
            { value: 'user', label: 'Customers' },
            { value: 'coupon', label: 'Promotions' },
            { value: 'settings', label: 'Settings' },
            { value: 'banner', label: 'Banners' },
            { value: 'admin', label: 'Staff & sign-ins' },
            { value: 'category', label: 'Categories' },
            { value: 'brand', label: 'Brands' },
            { value: 'orders', label: 'Exports' },
          ]}
        />
      </div>
      <TableWrap className={query.isFetching && data ? 'opacity-70 transition-opacity' : ''}>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Summary</Th>
            <Th>IP</Th>
          </tr>
        </thead>
        <tbody>
          {query.isLoading && <TableSkeleton cols={5} />}
          {data?.items.map((a) => {
            const link = a.entityId && ENTITY_LINK[a.entityType]?.(a.entityId);
            return (
              <tr key={a._id}>
                <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(a.createdAt)}</Td>
                <Td>
                  <span className="block text-ink">{a.actor.name ?? a.actor.type}</span>
                  {a.actor.email && <span className="text-[12px] text-muted">{a.actor.email}</span>}
                </Td>
                <Td className="font-mono text-[12px] text-graphite">{a.action}</Td>
                <Td>{link ? <Link href={link} className="hover:underline">{a.summary}</Link> : a.summary}</Td>
                <Td className="font-mono text-[12px] text-muted">{a.ip ?? '—'}</Td>
              </tr>
            );
          })}
          {data && data.items.length === 0 && <TableEmpty colSpan={5} title="No activity yet" />}
        </tbody>
      </TableWrap>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="entries" />}
    </>
  );
}
