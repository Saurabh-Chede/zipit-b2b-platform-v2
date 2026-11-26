import { z } from 'zod';
import { SellerApprovalStatus } from '../../utils/constants.ts';

export const registerSellerSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(160).trim(),
  ownerName: z.string().min(2, 'Owner name must be at least 2 characters').max(120).trim(),
  email: z.string().email('Valid email address is required').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number'),
  gstNumber: z
    .string()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid 15-character GSTIN format'),
  businessAddress: z.string().min(5, 'Business address is required').max(400).trim(),
  city: z.string().min(2, 'City is required').max(100).trim(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
});

export const rejectSellerSchema = z.object({
  rejectionReason: z.string().min(5, 'Please provide a clear rejection reason (min 5 chars)').max(500).trim(),
});

export const listSellersQuerySchema = z.object({
  status: z.nativeEnum(SellerApprovalStatus).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const sellerIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid seller ID format'),
});

export const adjustSellerWalletSchema = z.object({
  type: z.enum(['CREDIT', 'DEBIT']),
  amount: z.coerce
    .number({ error: 'Adjustment amount must be a valid number' })
    .positive('Amount must be greater than 0')
    .max(1000000, 'Single adjustment cannot exceed INR 10,00,000'),
  reason: z.string().trim().min(5, 'Audit reason must be at least 5 characters').max(200),
  referenceNote: z.string().trim().max(100).optional(),
});

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const savedAddressBaseSchema = z
  .object({
    label: z.string().trim().min(2, 'Label must be at least 2 characters').max(80).optional(),
    addressType: z.enum(['PICKUP', 'DELIVERY', 'BOTH']).default('PICKUP'),
    companyName: z
      .string()
      .trim()
      .min(2, 'Company / Business name must be at least 2 characters')
      .max(160)
      .optional(),
    contactPerson: z
      .string()
      .trim()
      .min(2, 'Contact person name must be at least 2 characters')
      .max(120)
      .optional(),
    name: z.string().trim().min(2, 'Contact / Company name is required').max(140).optional(),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Mobile number must be a valid 10-digit Indian number'),
    address: z.string().trim().min(5, 'Complete address must be at least 5 characters').max(400),
    state: z.string().trim().min(2, 'State is required').max(100).optional(),
    city: z.string().trim().min(2, 'City is required').max(100),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .nullable()
      .transform((v) => (v === '' || v === null ? undefined : v))
      .refine((v) => v === undefined || gstinRegex.test(v), {
        message: 'Invalid 15-character GSTIN format',
      }),
    isDefault: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.companyName && !data.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Company / Business name is required',
        path: ['companyName'],
      });
    }
    if (data.companyName && !data.name) {
      if (!data.contactPerson) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Contact person name is required',
          path: ['contactPerson'],
        });
      }
      if (!data.state) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'State is required',
          path: ['state'],
        });
      }
    }
  });

export const createSavedAddressSchema = savedAddressBaseSchema;
export const updateSavedAddressSchema = savedAddressBaseSchema;

export const addressIdParamSchema = z.object({
  addressId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid address ID format'),
});

