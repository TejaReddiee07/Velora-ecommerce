'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eraser } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Media';
import { ConfirmDialog, PageHeader, Panel, Tabs } from '@/components/admin/ui';
import { StoreSettingsForm } from '@/components/admin/StoreSettingsForm';
import { BannersManager } from '@/components/admin/BannersManager';
import { StaffManager } from '@/components/admin/StaffManager';
import { errorMessage, useCan } from '@/lib/admin/hooks';
import type { StoreSettingsDoc } from '@/lib/admin/types';

type Tab = 'store' | 'commerce' | 'content' | 'banners' | 'team' | 'maintenance';

export default function SettingsPage() {
  const canWrite = useCan('settings:write');
  const canStaff = useCan('staff:manage');
  const [tab, setTab] = useState<Tab>('store');
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: async () => (await api<{ settings: StoreSettingsDoc }>('/admin/settings')).settings });

  const cleanup = useMutation({
    mutationFn: () => api<{ removed: number }>('/admin/maintenance/cleanup-images', { method: 'POST' }),
    onSuccess: (d) => {
      setConfirmCleanup(false);
      toast.success(d.removed ? `Removed ${d.removed} orphaned file${d.removed === 1 ? '' : 's'}` : 'No orphaned files found');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tabs: { value: Tab; label: string }[] = [
    { value: 'store', label: 'Store' },
    { value: 'commerce', label: 'Currency, tax & delivery' },
    { value: 'content', label: 'Content' },
    { value: 'banners', label: 'Banners' },
    ...(canStaff ? [{ value: 'team' as Tab, label: 'Team' }] : []),
    ...(canWrite ? [{ value: 'maintenance' as Tab, label: 'Maintenance' }] : []),
  ];

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" description="Changes are pushed to every open storefront tab in real time." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {isLoading || !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          {(tab === 'store' || tab === 'commerce' || tab === 'content') && <StoreSettingsForm settings={data} section={tab} canWrite={canWrite} />}
          {tab === 'banners' && <BannersManager banners={data.banners} canWrite={canWrite} />}
          {tab === 'team' && canStaff && <StaffManager />}
          {tab === 'maintenance' && canWrite && (
            <Panel title="Image storage" description="Product, banner and logo images live in MongoDB GridFS (fs.files / fs.chunks).">
              <p className="mb-4 max-w-2xl text-[14px] text-graphite">
                Remove files that no product, banner, logo or past order references — for example, uploads interrupted part-way. This also runs automatically every six hours.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setConfirmCleanup(true)} icon={<Eraser className="h-4 w-4" aria-hidden />}>
                Clean up orphaned images
              </Button>
            </Panel>
          )}
        </>
      )}
      <ConfirmDialog open={confirmCleanup} onClose={() => setConfirmCleanup(false)} onConfirm={() => cleanup.mutate()} loading={cleanup.isPending} title="Clean up image storage?" confirmLabel="Run clean-up" body="Only files that nothing references are deleted. Images in use are never touched." />
    </>
  );
}
