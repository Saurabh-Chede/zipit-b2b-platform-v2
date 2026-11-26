import multer from 'multer';
import { AppError } from '../utils/AppError.ts';
import {
  ALLOWED_DELIVERY_PROOF_MIMES,
  ALLOWED_KYC_DOC_MIMES,
  MAX_DELIVERY_PROOF_BYTES,
  MAX_KYC_DOC_BYTES,
} from '../utils/constants.ts';

export const deliveryProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DELIVERY_PROOF_BYTES,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_DELIVERY_PROOF_MIMES.includes(file.mimetype)) {
      cb(
        new AppError(
          'Invalid file type. Only JPEG, PNG, and WebP images are permitted.',
          400,
          'INVALID_FILE_TYPE'
        )
      );
      return;
    }
    cb(null, true);
  },
});

export const kycDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_KYC_DOC_BYTES,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_KYC_DOC_MIMES.includes(file.mimetype)) {
      cb(
        new AppError(
          'Invalid KYC document type. Only JPEG, PNG, WebP images or PDF files up to 5 MB are permitted.',
          400,
          'INVALID_KYC_FILE_TYPE'
        )
      );
      return;
    }
    cb(null, true);
  },
});

