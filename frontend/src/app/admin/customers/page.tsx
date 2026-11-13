'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { CustomerRow, Paged } from '@/lib/admin/types';
import { FilterSelect, PageHeader, Pagination, SearchBox, StatusChip, TableEmpty, TableSkeleton, TableWrap, Td, Th } from '@/components/admin/ui';

type Sort = 'newest' | 'spent' | 'orders';

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  useEffect(() => setPage(1), [dq, sort]);

  const query = useQuery({
    queryKey: ['admin', 'customers', { dq, sort, page }],
    queryFn: () => api<Paged<CustomerRow>>('/admin/customers', { query: { q: dq || undefined, sort, page } }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  return (
    <>
      <PageHeader eyebrow="People" title="Customers" description="Spend is net of refunds and converted to the base currency at each order's checkout rate." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Name or email…" label="Search customers" />
        <FilterSelect<Sort>
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'spent', label: 'Highest spend' },
            { value: 'orders', label: 'Most orders' },
          ]}
        />
      </div>
      <TableWrap className={query.isFetching && data ? 'opacity-70 transition-opacity' : ''}>
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>Status</Th>
            <Th>Registered</Th>
            <Th align="right">Orders</Th>
            <Th align="right">Total spent</Th>
            <Th>Last order</Th>
          </tr>
        </thead>
        <tbody>
          {query.isLoading && <TableSkeleton cols={6} />}
          {data?.items.map((c) => (
            <tr key={c._id} className="cursor-pointer transition-colors hover:bg-sand/40" onClick={() => router.push(`/admin/customers/${c._id}`)}>
              <Td>
                <Link href={`/admin/customers/${c._id}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                  {c.name}
                </Link>
                <span className="flex items-center gap-1 text-[12px] text-muted">
                  {c.email}
                  {c.emailVerified && <BadgeCheck className="h-3.5 w-3.5 text-success" aria-label="Email verified" />}
                </span>
              </Td>
              <Td>
                <StatusChip status={c.status} />
              </Td>
              <Td className="text-[13px] text-muted">{date(c.createdAt)}</Td>
              <Td align="right">{c.orderCount}</Td>
              <Td align="right">{money(c.totalSpent)}</Td>
              <Td className="text-[13px] text-muted">{c.lastOrderAt ? date(c.lastOrderAt) : '—'}</Td>
            </tr>
          ))}
          {data && data.items.length === 0 && <TableEmpty colSpan={6} title="No customers yet" body={dq ? 'No one matches that search.' : 'Customers appear here when they register.'} />}
        </tbody>
      </TableWrap>
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="customers" />}
    </>
  );
}
