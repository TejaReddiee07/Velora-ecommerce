'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, imageUrl } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Select, fieldErrors } from '@/components/ui/Field';
import { errorMessage } from '@/lib/admin/hooks';
import { uploadForm } from '@/lib/admin/upload';
import type { AdminBanner } from '@/lib/admin/types';
import { ConfirmDialog, Drawer, Panel, StatusChip, Switch } from './ui';

interface BannerForm {
  placement: AdminBanner['placement'];
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  isActive: boolean;
  sortOrder: string;
}

const EMPTY: BannerForm = { placement: 'hero', eyebrow: '', title: '', subtitle: '', ctaLabel: '', ctaHref: '', isActive: true, sortOrder: '0' };
const PLACEMENT: Record<AdminBanner['placement'], string> = { hero: 'Homepage hero', promo: 'Promotion strip', collection: 'Collection tile' };

export function BannersManager({ banners, canWrite }: { banners: AdminBanner[]; canWrite: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminBanner | 'new' | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminBanner | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = [...banners].sort((a, b) => (a.placement === b.placement ? a.sortOrder - b.sortOrder : a.placement.localeCompare(b.placement)));

  function open(b: AdminBanner | 'new') {
    setErrors({});
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setEditing(b);
    setForm(b === 'new' ? EMPTY : { placement: b.placement, eyebrow: b.eyebrow ?? '', title: b.title, subtitle: b.subtitle ?? '', ctaLabel: b.ctaLabel ?? '', ctaHref: b.ctaHref ?? '', isActive: b.isActive, sortOrder: String(b.sortOrder) });
  }

  async function save() {
    const fd = new FormData();
    fd.append('placement', form.placement);
    fd.append('title', form.title.trim());
    if (form.eyebrow.trim()) fd.append('eyebrow', form.eyebrow.trim());
    if (form.subtitle.trim()) fd.append('subtitle', form.subtitle.trim());
    if (form.ctaLabel.trim()) fd.append('ctaLabel', form.ctaLabel.trim());
    fd.append('ctaHref', form.ctaHref.trim());
    fd.append('isActive', String(form.isActive));
    fd.append('sortOrder', String(Number.parseInt(form.sortOrder, 10) || 0));
    if (file) fd.append('image', file);
    setProgress(0);
    try {
      if (editing === 'new') await uploadForm('/admin/banners', fd, { onProgress: setProgress });
      else if (editing) await uploadForm(`/admin/banners/${editing._id}`, fd, { method: 'PUT', onProgress: setProgress });
      toast.success('Banner saved — homepage updated');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    } catch (err) {
      if (err instanceof ApiError) setErrors(fieldErrors(err.fields));
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/banners/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Banner deleted');
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const existingImage = editing && editing !== 'new' ? editing.image : null;

  return (
    <Panel
      title="Homepage banners"
      description="Hero slides, promotion strips and collection tiles. Images are stored in GridFS."
      actions={
        canWrite && (
          <Button size="sm" onClick={() => open('new')} icon={<Plus className="h-4 w-4" aria-hidden />}>
            New banner
          </Button>
        )
      }
    >
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-muted">No banners yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((b) => (
            <li key={b._id} className="border border-line bg-paper">
              <div className="relative aspect-[16/9] overflow-hidden bg-sand">
                {b.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(b.image.md)} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[13px] text-muted">No image</div>
                )}
                <span className="absolute left-2 top-2 bg-ink/85 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ivory">{PLACEMENT[b.placement]}</span>
              </div>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  {b.eyebrow && <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{b.eyebrow}</p>}
                  <p className="truncate font-display text-xl">{b.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    <StatusChip status={b.isActive ? 'active' : 'disabled'} label={b.isActive ? 'Visible' : 'Hidden'} />
                    Order {b.sortOrder}
                    {b.ctaHref && <span className="font-mono">{b.ctaHref}</span>}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0">
                    <button type="button" onClick={() => open(b)} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand" aria-label={`Edit banner ${b.title}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(b)} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-[#fbeeee] hover:text-danger" aria-label={`Delete banner ${b.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New banner' : 'Edit banner'}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={progress !== null} disabled={form.title.trim().length < 2}>
              Save banner
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <p className="mb-2 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-graphite">Image</p>
            <div className="relative aspect-[16/9] overflow-hidden border border-line bg-sand">
              {preview || existingImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview ?? imageUrl(existingImage!.md)} alt="Banner preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-[13px] text-muted">No image selected</div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} icon={<ImagePlus className="h-4 w-4" aria-hidden />}>
                {preview || existingImage ? 'Change image' : 'Choose image'}
              </Button>
              <span className="text-[12px] text-muted">Landscape, at least 1600px wide</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              aria-label="Banner image"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (preview) URL.revokeObjectURL(preview);
                setFile(f);
                setPreview(URL.createObjectURL(f));
              }}
            />
            {progress !== null && <p className="mt-2 text-[12px] text-muted">{progress < 100 ? `Uploading ${progress}%` : 'Storing in GridFS…'}</p>}
          </div>
          <Select label="Placement" value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value as BannerForm['placement'] })} options={Object.entries(PLACEMENT).map(([value, label]) => ({ value, label }))} />
          <Input label="Eyebrow" value={form.eyebrow} onChange={(e) => setForm({ ...form, eyebrow: e.target.value })} maxLength={60} />
          <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} maxLength={120} data-autofocus />
          <Input label="Subtitle" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} maxLength={240} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Button label" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} maxLength={40} />
            <Input label="Button link" value={form.ctaHref} onChange={(e) => setForm({ ...form, ctaHref: e.target.value })} placeholder="/clothing" error={errors.ctaHref} hint="A site path starting with /" />
          </div>
          <Input label="Display order" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value.replace(/[^0-9]/g, '') })} wrapperClassName="max-w-[160px]" />
          <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label="Visible on storefront" />
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete._id)}
        loading={remove.isPending}
        destructive
        title="Delete banner?"
        confirmLabel="Delete"
        body={`“${confirmDelete?.title}” and its image will be removed from the homepage.`}
      />
    </Panel>
  );
}
