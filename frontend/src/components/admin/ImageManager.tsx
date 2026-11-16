'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, ImagePlus, RefreshCw, Star, Trash2, UploadCloud } from 'lucide-react';
import { api, imageUrl } from '@/lib/api';
import { cn } from '@/lib/format';
import { errorMessage } from '@/lib/admin/hooks';
import { uploadForm } from '@/lib/admin/upload';
import { MAX_UPLOAD_MB, UPLOAD_REQUEST_MB } from '@/lib/config';
import type { AdminProduct } from '@/lib/admin/types';
import type { ImageRef } from '@/lib/types';
import { ConfirmDialog, Panel } from './ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';
const MAX_MB = MAX_UPLOAD_MB;

export function ImageManager({ product }: { product: AdminProduct }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<ImageRef | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadColor, setUploadColor] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ImageRef | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const images = product.images;
  const colors = [...new Set(product.variants.map((v) => v.color))];

  const apply = (p: AdminProduct) => {
    qc.setQueryData(['admin', 'product', p._id], p);
    qc.invalidateQueries({ queryKey: ['admin', 'products'] });
  };

  function validate(files: File[]) {
    const ok: File[] = [];
    for (const f of files) {
      if (!ACCEPT.split(',').includes(f.type)) toast.error(`${f.name}: use JPEG, PNG, WebP or AVIF.`);
      else if (f.size > MAX_MB * 1024 * 1024) toast.error(`${f.name}: larger than ${MAX_MB} MB.`);
      else ok.push(f);
    }
    return ok;
  }

  async function upload(list: FileList | File[]) {
    const files = validate(Array.from(list));
    if (!files.length) return;
    if (images.length + files.length > 12) {
      toast.error('A product can have up to 12 images.');
      return;
    }
    // Group files so no single request exceeds the host's body limit (Vercel: 4.5 MB).
    const limit = UPLOAD_REQUEST_MB * 1024 * 1024;
    const batches: File[][] = [];
    for (const f of files) {
      const last = batches[batches.length - 1];
      if (last && last.reduce((n, x) => n + x.size, 0) + f.size <= limit) last.push(f);
      else batches.push([f]);
    }
    setProgress(0);
    try {
      let done = 0;
      for (const batch of batches) {
        const form = new FormData();
        batch.forEach((f) => form.append('images', f));
        if (uploadColor) form.append('color', uploadColor);
        form.append('alt', product.name);
        const res = await uploadForm<{ product: AdminProduct }>(`/admin/products/${product._id}/images`, form, {
          onProgress: (pct) => setProgress(Math.round(((done + pct / 100) / batches.length) * 100)),
        });
        apply(res.product);
        done++;
      }
      toast.success(`${files.length} image${files.length === 1 ? '' : 's'} stored in MongoDB GridFS`);
    } catch (err) {
      toast.error(errorMessage(err, 'Upload failed.'));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function replace(file: File) {
    const target = replaceTarget;
    if (!target) return;
    const [ok] = validate([file]);
    if (!ok) return;
    const form = new FormData();
    form.append('image', ok);
    setBusyId(target.id);
    try {
      const res = await uploadForm<{ product: AdminProduct }>(`/admin/products/${product._id}/images/${target.id}`, form, { method: 'PUT' });
      apply(res.product);
      toast.success('Image replaced — the new file is live');
    } catch (err) {
      toast.error(errorMessage(err, 'Replace failed.'));
    } finally {
      setBusyId(null);
      setReplaceTarget(null);
      if (replaceRef.current) replaceRef.current.value = '';
    }
  }

  const patchImage = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { alt?: string; color?: string } }) => api<{ product: AdminProduct }>(`/admin/products/${product._id}/images/${id}`, { method: 'PATCH', body }),
    onSuccess: (d) => {
      apply(d.product);
      toast.success('Image details saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<{ product: AdminProduct }>(`/admin/products/${product._id}/images/${id}`, { method: 'DELETE' }),
    onSuccess: (d) => {
      apply(d.product);
      setConfirmDelete(null);
      toast.success('Image deleted from GridFS');
    },
    onError: (e) => {
      setConfirmDelete(null);
      toast.error(errorMessage(e));
    },
  });

  const reorder = useMutation({
    mutationFn: (order: string[]) => api<{ product: AdminProduct }>(`/admin/products/${product._id}/images-order`, { method: 'PATCH', body: { order } }),
    onMutate: (order) => {
      const byId = new Map(images.map((i) => [i.id, i]));
      qc.setQueryData(['admin', 'product', product._id], { ...product, images: order.map((id) => byId.get(id)!).filter(Boolean) });
    },
    onSuccess: (d) => apply(d.product),
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ['admin', 'product', product._id] });
    },
  });

  function move(index: number, delta: number) {
    const next = [...images];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    reorder.mutate(next.map((i) => i.id));
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = images.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorder.mutate(ids);
    setDragId(null);
  }

  return (
    <Panel title={`Images (${images.length}/12)`} description="Files are validated, compressed to WebP in three sizes and stored in MongoDB GridFS. The first image is the cover.">
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn('mb-5 flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-8 text-center transition-colors', dragOver ? 'border-gold-deep bg-[#fbf5ea]' : 'border-line-strong bg-ivory/50')}
      >
        <UploadCloud className="h-8 w-8 text-gold-deep" aria-hidden />
        <p className="text-[15px] text-ink">Drag images here, or</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={progress !== null} className="inline-flex h-10 items-center gap-2 border border-ink px-4 text-[12px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-ivory disabled:opacity-50">
            <ImagePlus className="h-4 w-4" aria-hidden /> Choose files
          </button>
          {colors.length > 0 && (
            <label className="flex items-center gap-2 text-[13px] text-graphite">
              Colour
              <select value={uploadColor} onChange={(e) => setUploadColor(e.target.value)} className="h-10 border border-line-strong bg-paper px-2 text-[14px]">
                <option value="">All colours</option>
                {colors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="text-[12px] text-muted">JPEG, PNG, WebP or AVIF · up to {MAX_MB} MB each · min 200×200px</p>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => e.target.files && upload(e.target.files)} aria-label="Upload product images" />
        {progress !== null && (
          <div className="w-full max-w-sm" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <div className="h-1 w-full bg-sand">
              <div className="h-1 bg-gold-deep transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-muted">{progress < 100 ? `Uploading ${progress}%` : 'Processing and storing in GridFS…'}</p>
          </div>
        )}
      </div>

      <input ref={replaceRef} type="file" accept={ACCEPT} className="sr-only" aria-label="Replacement image" onChange={(e) => e.target.files?.[0] && replace(e.target.files[0])} />

      {images.length === 0 ? (
        <p className="text-center text-[14px] text-muted">No images yet. A product needs at least one image before it can be published.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {images.map((img, i) => (
            <li
              key={img.id}
              draggable
              onDragStart={() => setDragId(img.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => dragId && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(img.id);
              }}
              className={cn('group border bg-paper transition-shadow', dragId === img.id ? 'border-gold-deep opacity-60' : 'border-line', busyId === img.id && 'animate-pulse')}
            >
              <div className="relative aspect-[4/5] cursor-grab overflow-hidden bg-sand active:cursor-grabbing">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(img.md)} alt={img.alt || product.name} className="h-full w-full object-cover" loading="lazy" draggable={false} />
                {i === 0 && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 bg-ink/85 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-ivory">
                    <Star className="h-3 w-3" aria-hidden /> Cover
                  </span>
                )}
                <span className="absolute bottom-2 right-2 bg-paper/90 px-1.5 text-[11px] text-graphite">
                  {img.width}×{img.height}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-muted">
                  Alt text
                  <input
                    defaultValue={img.alt}
                    onBlur={(e) => e.target.value !== img.alt && patchImage.mutate({ id: img.id, body: { alt: e.target.value } })}
                    className="mt-1 h-9 w-full border border-line-strong bg-paper px-2 text-[13px] normal-case tracking-normal text-ink"
                  />
                </label>
                {colors.length > 0 && (
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-muted">
                    Colour
                    <select value={img.color ?? ''} onChange={(e) => patchImage.mutate({ id: img.id, body: { color: e.target.value } })} className="mt-1 h-9 w-full border border-line-strong bg-paper px-2 text-[13px] normal-case tracking-normal text-ink">
                      <option value="">All colours</option>
                      {colors.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand disabled:opacity-30" aria-label={`Move image ${i + 1} earlier`}>
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1 || reorder.isPending} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand disabled:opacity-30" aria-label={`Move image ${i + 1} later`}>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => {
                        setReplaceTarget(img);
                        replaceRef.current?.click();
                      }}
                      disabled={busyId !== null}
                      className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-sand disabled:opacity-30"
                      aria-label={`Replace image ${i + 1}`}
                      title="Replace"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(img)} className="inline-flex h-9 w-9 items-center justify-center text-graphite hover:bg-[#fbeeee] hover:text-danger" aria-label={`Delete image ${i + 1}`} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
        loading={remove.isPending}
        destructive
        title="Delete this image?"
        confirmLabel="Delete image"
        body="The file is removed from GridFS (copies referenced by past orders are kept for their records)."
      />
    </Panel>
  );
}
