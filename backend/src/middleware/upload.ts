import multer from 'multer';
import { env } from '../config/env.js';
import { ALLOWED_MIME } from '../services/image.service.js';
import { AppError } from '../utils/errors.js';

/**
 * Files are held in memory only long enough to validate/resize them; nothing
 * touches local disk. The declared MIME type is a first filter — the real
 * check decodes the image with sharp in image.service.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 10, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new AppError(400, 'UNSUPPORTED_FILE', 'Only JPEG, PNG, WebP or AVIF images are allowed.'));
    }
    cb(null, true);
  },
});
