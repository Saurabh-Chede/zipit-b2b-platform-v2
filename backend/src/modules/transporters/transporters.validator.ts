import { z } from 'zod';
import { EntityStatus, TransporterApprovalStatus } from '../../utils/constants.ts';

const serviceAreaSchema = z.object({
  city: z.string().min(2, 'City is required').max(100).trim(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
});

export const registerTransporterSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(160).trim(),
  contactPerson: z.string().min(2, 'Contact person name must be at least 2 characters').max(120).trim(),
  email: z.string().email('Valid email address is required').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number'),
  gstNumber: z
    .string()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid 15-character GSTIN format'),
  address: z.string().min(5, 'Head office / hub address is required').max(400).trim(),
  city: z.string().min(2, 'Primary hub city is required').max(100).trim(),
  pincode: z.string().regex(/^\d{6}$/, 'Primary hub pincode must be 6 digits'),
});

export const rejectTransporterSchema = z.object({
  rejectionReason: z.string().min(5, 'Please provide a clear rejection reason (min 5 chars)').max(500).trim(),
});

export const createTransporterSchema = z.object({
  companyName: z.string().min(2).max(160).trim(),
  contactPerson: z.string().min(2).max(120).trim(),
  email: z.string().email('Valid email is required').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number'),
  gstNumber: z
    .string()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid 15-character GSTIN format'),
  address: z.string().min(5).max(400).trim(),
  serviceAreas: z.array(serviceAreaSchema).min(1, 'At least one service area is required'),
  status: z.nativeEnum(EntityStatus).optional().default(EntityStatus.ACTIVE),
});

export const updateTransporterSchema = z.object({
  companyName: z.string().min(2).max(160).trim().optional(),
  contactPerson: z.string().min(2).max(120).trim().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number').optional(),
  address: z.string().min(5).max(400).trim().optional(),
  serviceAreas: z.array(serviceAreaSchema).min(1).optional(),
  status: z.nativeEnum(EntityStatus).optional(),
  newPassword: z.string().min(8).max(100).optional(),
});

export const listTransportersQuerySchema = z.object({
  status: z.nativeEnum(EntityStatus).optional(),
  approvalStatus: z.nativeEnum(TransporterApprovalStatus).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const transporterIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid transporter ID'),
});

export const updateOwnTransporterProfileSchema = z.object({
  companyName: z.string().min(2).max(160).trim().optional(),
  contactPerson: z.string().min(2).max(120).trim().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number').optional(),
  address: z.string().min(5).max(400).trim().optional(),
});

export const addServiceAreaSchema = serviceAreaSchema;

export const importServiceAreasSchema = z.object({
  serviceAreas: z
    .array(serviceAreaSchema)
    .min(1, 'Provide at least one valid service area (city + 6-digit pincode).')
    .max(500, 'Maximum 500 service areas can be imported at once.'),
});

export const deleteServiceAreaSchema = serviceAreaSchema;

