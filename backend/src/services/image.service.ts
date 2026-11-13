import sharp from 'sharp';
import { Types } from 'mongoose';
import { uploadBuffer, deleteFiles, type StoredFileMeta, type FileId } from '../db/gridfs.js';
import { badRequest } from '../utils/errors.js';

sharp.cache(false);

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const RENDITIONS = { sm: 480, md: 960, lg: 1800 } as const;

export interface StoredImage {
  files: { sm: Types.ObjectId; md: Types.ObjectId; lg: Types.ObjectId };
  width: number;
  height: number;
}

/**
 * Validates an uploaded image by decoding it (not by trusting the extension or
 * the client's MIME type), strips metadata, auto-rotates and stores three WebP
 * renditions in GridFS. Returns the GridFS ids.
 */
export async function storeImage(
  buffer: Buffer,
  meta: { kind: StoredFileMeta['kind']; productId?: string; originalName?: string; uploadedBy?: string },
): Promise<StoredImage> {
  let info: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    info = await sharp(buffer, { limitInputPixels: 50_000_000, failOn: 'error' }).metadata();
  } catch {
    throw badRequest('The file is not a valid image.');
  }
  if (!info.format || !ALLOWED_FORMATS.has(info.format)) {
    throw badRequest('Unsupported image format. Use JPEG, PNG, WebP or AVIF.');
  }
  if (!info.width || !info.height || info.width < 200 || info.height < 200) {
    throw badRequest('Image is too small. Minimum size is 200×200 pixels.');
  }

  const groupId = new Types.ObjectId().toHexString();
  const created: FileId[] = [];
  try {
    const out: Partial<StoredImage['files']> = {};
    let lgSize = { width: 0, height: 0 };
    for (const [role, width] of Object.entries(RENDITIONS) as [keyof typeof RENDITIONS, number][]) {
      const { data, info: o } = await sharp(buffer, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: role === 'sm' ? 72 : 80, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      const id = await uploadBuffer(data, `${groupId}-${role}.webp`, 'image/webp', {
        kind: meta.kind,
        role,
        groupId,
        productId: meta.productId,
        width: o.width,
        height: o.height,
        originalName: meta.originalName?.slice(0, 120),
        uploadedBy: meta.uploadedBy,
      });
      created.push(id);
      out[role] = id as unknown as Types.ObjectId;
      if (role === 'lg') lgSize = { width: o.width, height: o.height };
    }
    return { files: out as StoredImage['files'], width: lgSize.width, height: lgSize.height };
  } catch (err) {
    await deleteFiles(created);
    throw err;
  }
}

export async function deleteStoredImage(files: { sm?: unknown; md?: unknown; lg?: unknown } | null | undefined) {
  if (!files) return 0;
  const ids = [files.sm, files.md, files.lg].filter(Boolean) as FileId[];
  return deleteFiles(ids);
}
