import { z } from 'zod';
import { BookingStatus } from '../../utils/constants.ts';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const partyDetailsSchema = z.object({
  name: z.string().min(2, 'Name is required').max(140).trim(),
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(160).trim().optional(),
  contactPerson: z.string().min(2, 'Contact person must be at least 2 characters').max(120).trim().optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number'),
  address: z.string().min(5, 'Address is required').max(400).trim(),
  state: z.string().min(2, 'State must be at least 2 characters').max(100).trim().optional(),
  city: z.string().min(2, 'City is required').max(100).trim(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  gstin: z
    .union([z.string(), z.null()])
    .transform((v) => {
      if (typeof v !== 'string') return undefined;
      const trimmed = v.trim().toUpperCase();
      return trimmed === '' ? undefined : trimmed;
    })
    .refine((v) => v === undefined || gstinRegex.test(v), {
      message: 'Invalid 15-character GSTIN format',
    })
    .optional(),
});

const parcelDetailsSchema = z.object({
  description: z.string().min(2, 'Parcel description is required').max(300).trim(),
  actualWeightKg: z.coerce.number().positive('Actual weight must be greater than 0').max(50000),
  lengthCm: z.coerce.number().positive('Length must be greater than 0').max(1000),
  widthCm: z.coerce.number().positive('Width must be greater than 0').max(1000),
  heightCm: z.coerce.number().positive('Height must be greater than 0').max(1000),
  numberOfPackages: z.coerce.number().int().min(1, 'At least 1 package is required').max(10000),
});

export const createBookingSchema = z.object({
  routeId: z.string().regex(objectIdRegex, 'Invalid route ID'),
  transporterId: z.string().regex(objectIdRegex, 'Invalid transporter ID'),
  rateId: z.string().regex(objectIdRegex, 'Invalid rate ID'),
  pickupAddressId: z.string().regex(objectIdRegex, 'Invalid pickup address ID').optional().nullable(),
  idempotencyKey: z.string().min(8).max(128).trim().optional(),
  paymentMode: z.enum(['INVOICE', 'WALLET']).default('WALLET'),
  ewayBillNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || /^\d{12}$/.test(v), {
      message: 'E-Way Bill number must be exactly 12 digits',
    }),
  ewayBillValidUpto: z
    .union([z.coerce.date(), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  sender: partyDetailsSchema,
  receiver: partyDetailsSchema,
  parcel: parcelDetailsSchema,
  whatsappOptIn: z.boolean().optional().default(true),
});

export const updateBookingStatusSchema = z.object({
  status: z.nativeEnum(BookingStatus),
  location: z.string().min(2, 'Location is required').max(160).trim(),
  remarks: z.string().max(400).trim().optional(),
});

export const listBookingsQuerySchema = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  bookingSource: z.enum(['PLATFORM', 'TRANSPORTER_SELF']).optional(),
  lrNumber: z.string().max(80).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const calculateTransporterBookingSchema = z.object({
  rateId: z.string().regex(objectIdRegex, 'Invalid route/rate ID'),
  actualWeightKg: z.coerce.number().positive('Actual weight must be greater than 0').max(50000),
  lengthCm: z.coerce.number().positive('Length must be greater than 0').max(1000),
  widthCm: z.coerce.number().positive('Width must be greater than 0').max(1000),
  heightCm: z.coerce.number().positive('Height must be greater than 0').max(1000),
  numberOfPackages: z.coerce.number().int().min(1, 'At least 1 package is required').max(10000).default(1),
});

export const createTransporterPersonalBookingSchema = z.object({
  routeId: z.string().regex(objectIdRegex, 'Invalid route ID').optional(),
  rateId: z.string().regex(objectIdRegex, 'Invalid route/rate ID'),
  idempotencyKey: z.string().min(8).max(128).trim().optional(),
  paymentMode: z.enum(['CASH', 'TO_PAY', 'INVOICE']).default('CASH'),
  ewayBillNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || /^\d{12}$/.test(v), {
      message: 'E-Way Bill number must be exactly 12 digits',
    }),
  ewayBillValidUpto: z
    .union([z.coerce.date(), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  sender: partyDetailsSchema,
  receiver: partyDetailsSchema,
  parcel: parcelDetailsSchema,
  whatsappOptIn: z.boolean().optional().default(true),
});

export const bookingIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid booking ID'),
});

export const scanCartonSchema = z.object({
  cartonCode: z.string().trim().min(3).max(60).optional(),
  cartonNumber: z.coerce.number().int().min(1).max(10000).optional(),
  location: z.string().trim().max(160).optional(),
});

export const globalScanCartonSchema = z.object({
  cartonCode: z.string().trim().min(4, 'Scan or enter a valid carton barcode').max(60),
  location: z.string().trim().max(160).optional(),
});

export const cartonBarcodeParamSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid booking ID'),
  cartonNumber: z.coerce.number().int().min(1).max(10000),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(4, 'Cancellation reason must be at least 4 characters').max(400),
});

export const ndrActionSchema = z.object({
  action: z.enum(['REATTEMPT', 'INITIATE_RTO']),
  remarks: z.string().trim().min(4, 'Instructions or RTO reason must be at least 4 characters').max(400),
});

export const bulkBookingRowSchema = z.object({
  rowNumber: z.coerce.number().int().positive().optional(),
  originPincode: z.string().trim().regex(/^\d{6}$/, 'Origin pincode must be 6 digits'),
  destinationPincode: z.string().trim().regex(/^\d{6}$/, 'Destination pincode must be 6 digits'),
  transporterId: z.string().regex(objectIdRegex, 'Invalid transporter ID').optional(),
  transporterGst: z.string().trim().toUpperCase().optional(),
  transporterEmail: z.string().trim().toLowerCase().optional(),
  senderName: z.string().trim().min(2, 'Sender name is required').max(140),
  senderPhone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Sender phone must be 10 digits'),
  senderAddress: z.string().trim().min(5, 'Sender address is required').max(400),
  senderCity: z.string().trim().min(2, 'Sender city is required').max(100),
  senderPincode: z.string().trim().regex(/^\d{6}$/, 'Sender pincode must be 6 digits'),
  receiverName: z.string().trim().min(2, 'Receiver name is required').max(140),
  receiverPhone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Receiver phone must be 10 digits'),
  receiverAddress: z.string().trim().min(5, 'Receiver address is required').max(400),
  receiverCity: z.string().trim().min(2, 'Receiver city is required').max(100),
  receiverPincode: z.string().trim().regex(/^\d{6}$/, 'Receiver pincode must be 6 digits'),
  description: z.string().trim().min(2, 'Parcel description is required').max(300),
  actualWeightKg: z.coerce.number().positive('Actual weight must be > 0').max(50000),
  lengthCm: z.coerce.number().positive('Length must be > 0').max(1000),
  widthCm: z.coerce.number().positive('Width must be > 0').max(1000),
  heightCm: z.coerce.number().positive('Height must be > 0').max(1000),
  numberOfPackages: z.coerce.number().int().min(1).max(10000).default(1),
  ewayBillNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || /^\d{12}$/.test(v), {
      message: 'E-Way Bill must be 12 digits',
    }),
  ewayBillValidUpto: z
    .union([z.coerce.date(), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  whatsappOptIn: z.coerce.boolean().optional().default(true),
});

export const bulkBookingRequestSchema = z.object({
  paymentMode: z.enum(['WALLET', 'INVOICE']).default('WALLET'),
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'At least 1 row is required').max(50),
});

export const bulkLrSchema = z.object({
  bookingIds: z.array(z.string().regex(objectIdRegex, 'Invalid booking ID')).min(1).max(50),
});

export const reportWeightDiscrepancySchema = z.object({
  reportedActualWeightKg: z.coerce.number().positive('Reported weight must be > 0').max(50000),
  reportedLengthCm: z.coerce.number().positive().max(1000).optional(),
  reportedWidthCm: z.coerce.number().positive().max(1000).optional(),
  reportedHeightCm: z.coerce.number().positive().max(1000).optional(),
  remarks: z.string().trim().max(400).optional(),
});

export const respondWeightDiscrepancySchema = z.object({
  action: z.enum(['ACCEPT', 'DISPUTE']),
  reason: z.string().trim().max(400).optional(),
});

export const resolveWeightDiscrepancySchema = z.object({
  decision: z.enum(['CHARGE_SELLER', 'WAIVE']),
  notes: z.string().trim().min(4, 'Resolution notes must be at least 4 characters').max(400),
});


