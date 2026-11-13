'use client';

import { API_URL } from '@/lib/config';
import { ApiError } from '@/lib/api';

/**
 * Multipart upload with progress (fetch cannot report upload progress).
 * Sends the admin cookie; the API validates and stores files in GridFS.
 */
export function uploadForm<T>(path: string, form: FormData, opts: { method?: 'POST' | 'PUT'; onProgress?: (pct: number) => void } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method ?? 'POST', `${API_URL}/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { error?: { code?: string; message?: string; fields?: { path: string; message: string }[] } } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, data?.error?.code ?? 'UPLOAD_FAILED', data?.error?.message ?? 'Upload failed.', data?.error?.fields));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Upload failed — check your connection.'));
    xhr.send(form);
  });
}
