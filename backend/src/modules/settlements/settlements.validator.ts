import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const transporterSettlementParamSchema = z.object({
  transporterId: z.string().regex(objectIdRegex, 'Invalid transporter ID format'),
});

export const createTransporterSettlementSchema = z.object({
  transporterId: z.string().regex(objectIdRegex, 'Invalid transporter ID format'),
  bookingIds: z
    .array(z.string().regex(objectIdRegex, 'Invalid booking ID format'))
    .min(1, 'Select at least one delivered booking to settle')
    .max(200, 'Maximum 200 bookings can be settled in one batch'),
  payoutMethod: z.enum(['NEFT', 'RTGS', 'IMPS']),
  utrNumber: z
    .string()
    .trim()
    .min(6, 'UTR / bank reference must be at least 6 characters')
    .max(50, 'UTR / bank reference cannot exceed 50 characters')
    .regex(/^[A-Za-z0-9\-/]+$/, 'UTR must contain only letters, digits, hyphens, or slashes'),
  periodLabel: z
    .string()
    .trim()
    .min(3, 'Period label must be at least 3 characters')
    .max(100, 'Period label cannot exceed 100 characters'),
  remarks: z.string().trim().max(240).optional(),
});

export type CreateTransporterSettlementInput = z.infer<typeof createTransporterSettlementSchema>;
