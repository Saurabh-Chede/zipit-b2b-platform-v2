import { z } from 'zod';
import {
  KycDocumentType,
  KycEntityType,
  KycVerificationStatus,
} from '../../utils/constants.ts';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid profile ID format');

export const updateKycDetailsSchema = z.object({
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'PAN must match 10-character format (e.g. ABCDE1234F)'),
  bankAccountHolder: z
    .string()
    .trim()
    .min(2, 'Account holder name must be at least 2 characters')
    .max(140),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, 'Bank account number must contain 9 to 18 digits'),
  ifscCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC code must match format (e.g. HDFC0001234)'),
  bankName: z
    .string()
    .trim()
    .min(2, 'Bank name must be at least 2 characters')
    .max(120),
});

export const uploadKycDocBodySchema = z.object({
  docType: z.nativeEnum(KycDocumentType),
});

export const listKycQueueQuerySchema = z.object({
  entityType: z.nativeEnum(KycEntityType).optional(),
  status: z.nativeEnum(KycVerificationStatus).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const kycReviewParamSchema = z.object({
  entityType: z.nativeEnum(KycEntityType),
  profileId: objectIdSchema,
});

export const kycReviewBodySchema = z
  .object({
    status: z.enum([KycVerificationStatus.VERIFIED, KycVerificationStatus.REJECTED]),
    rejectionReason: z.string().trim().max(500).optional(),
    alsoApproveSeller: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.status === KycVerificationStatus.REJECTED &&
      (!data.rejectionReason || data.rejectionReason.trim().length < 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'Rejection reason must be at least 5 characters when rejecting KYC.',
      });
    }
  });

export const kycDocParamSchema = z.object({
  entityType: z.nativeEnum(KycEntityType),
  profileId: objectIdSchema,
  docType: z.nativeEnum(KycDocumentType),
});
