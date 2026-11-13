import mongoose from 'mongoose';
import { Readable } from 'node:stream';

const { GridFSBucket, ObjectId } = mongoose.mongo;

export type FileId = InstanceType<typeof ObjectId>;

let bucket: InstanceType<typeof GridFSBucket> | null = null;
let bucketDb: unknown = null;

/** Default bucket → collections `fs.files` and `fs.chunks`. */
export function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  if (!bucket || bucketDb !== db) {
    bucket = new GridFSBucket(db, { bucketName: 'fs', chunkSizeBytes: 255 * 1024 });
    bucketDb = db;
  }
  return bucket;
}

export interface StoredFileMeta {
  kind: 'product' | 'branding' | 'banner' | 'category';
  role: 'sm' | 'md' | 'lg';
  groupId: string;
  productId?: string;
  width: number;
  height: number;
  originalName?: string;
  uploadedBy?: string;
}

export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  contentType: string,
  metadata: StoredFileMeta,
): Promise<FileId> {
  const b = getBucket();
  const upload = b.openUploadStream(filename, { metadata: { ...metadata, contentType } });
  await new Promise<void>((resolve, reject) => {
    Readable.from(buffer).pipe(upload).on('error', reject).on('finish', () => resolve());
  });
  return upload.id as FileId;
}

export async function findFile(id: FileId) {
  const files = await getBucket().find({ _id: id }).limit(1).toArray();
  return files[0] ?? null;
}

export function openDownloadStream(id: FileId) {
  return getBucket().openDownloadStream(id);
}

export async function deleteFile(id: FileId) {
  try {
    await getBucket().delete(id);
    return true;
  } catch (err) {
    if (err instanceof Error && /FileNotFound|File not found/i.test(err.message)) return false;
    throw err;
  }
}

export async function deleteFiles(ids: FileId[]) {
  let deleted = 0;
  for (const id of ids) if (await deleteFile(id)) deleted += 1;
  return deleted;
}

export function toObjectId(value: string): FileId | null {
  return ObjectId.isValid(value) && String(new ObjectId(value)) === value ? new ObjectId(value) : null;
}
