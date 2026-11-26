import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createRateSchema = z.object({
  transporterId: z.string().regex(objectIdRegex, 'Invalid transporter ID'),
  routeId: z.string().regex(objectIdRegex, 'Invalid route ID'),
  minimumFreight: z.coerce.number().min(0, 'Minimum freight cannot be negative'),
  ratePerKg: z.coerce.number().positive('Rate per kg must be greater than 0'),
  volumetricDivisor: z.coerce.number().positive('Volumetric divisor must be positive').default(5000),
  rtoCharges: z.coerce.number().min(0, 'RTO charges cannot be negative').default(0),
  additionalCharges: z.coerce.number().min(0, 'Additional charges cannot be negative').default(0),
  gstApplicable: z.boolean().default(true),
  gstRatePercent: z.coerce.number().min(0).max(28).default(18),
  estimatedDeliveryTime: z.string().min(2).max(80).trim(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
  isSampleData: z.boolean().optional().default(false),
});

export const updateRateSchema = createRateSchema.partial();

export const calculateRatesSchema = z
  .object({
    routeId: z.string().regex(objectIdRegex, 'Invalid route ID').optional(),
    originPincode: z.string().regex(/^\d{6}$/, 'Origin pincode must be 6 digits').optional(),
    destinationPincode: z.string().regex(/^\d{6}$/, 'Destination pincode must be 6 digits').optional(),
    actualWeightKg: z.coerce
      .number({ error: 'Actual weight must be a number' })
      .positive('Actual weight must be greater than 0')
      .max(50000, 'Actual weight exceeds maximum supported limit'),
    lengthCm: z.coerce
      .number({ error: 'Length must be a number' })
      .positive('Length must be greater than 0')
      .max(1000, 'Length exceeds maximum supported limit'),
    widthCm: z.coerce
      .number({ error: 'Width must be a number' })
      .positive('Width must be greater than 0')
      .max(1000, 'Width exceeds maximum supported limit'),
    heightCm: z.coerce
      .number({ error: 'Height must be a number' })
      .positive('Height must be greater than 0')
      .max(1000, 'Height exceeds maximum supported limit'),
    numberOfPackages: z.coerce.number().int().min(1, 'At least 1 package is required').default(1),
  })
  .refine(
    (data) => Boolean(data.routeId) || (Boolean(data.originPincode) && Boolean(data.destinationPincode)),
    {
      message: 'Provide either routeId or both originPincode and destinationPincode.',
      path: ['routeId'],
    }
  );

export const rateIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid rate ID'),
});

export const bulkRateRowSchema = z
  .object({
    rowNumber: z.coerce.number().int().positive().optional(),
    transporterId: z.string().regex(objectIdRegex, 'Invalid transporter ID').optional(),
    transporterGst: z.string().trim().toUpperCase().optional(),
    transporterEmail: z.string().trim().toLowerCase().optional(),
    originPincode: z.string().trim().regex(/^\d{6}$/, 'Origin pincode must be 6 digits'),
    destinationPincode: z.string().trim().regex(/^\d{6}$/, 'Destination pincode must be 6 digits'),
    minimumFreight: z.coerce.number().min(0, 'Minimum freight cannot be negative'),
    ratePerKg: z.coerce.number().positive('Rate per kg must be greater than 0'),
    volumetricDivisor: z.coerce.number().positive('Volumetric divisor must be positive').default(5000),
    rtoCharges: z.coerce.number().min(0, 'RTO charges cannot be negative').default(0),
    additionalCharges: z.coerce.number().min(0, 'Additional charges cannot be negative').default(0),
    gstApplicable: z
      .union([z.boolean(), z.string()])
      .optional()
      .default(true)
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        const normalized = val.trim().toLowerCase();
        return !['false', '0', 'no', 'n'].includes(normalized);
      }),
    gstRatePercent: z.coerce.number().min(0).max(28).default(18),
    estimatedDeliveryTime: z.string().trim().min(2, 'ETA is required').max(80),
    effectiveFrom: z.coerce.date().optional().default(() => new Date()),
    effectiveTo: z.coerce.date().nullable().optional(),
    isActive: z
      .union([z.boolean(), z.string()])
      .optional()
      .default(true)
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        const normalized = val.trim().toLowerCase();
        return !['false', '0', 'no', 'inactive', 'n'].includes(normalized);
      }),
  })
  .refine(
    (d) => Boolean(d.transporterId || d.transporterGst || d.transporterEmail),
    { message: 'Provide transporterId, transporterGst, or transporterEmail' }
  );

export const bulkImportRatesSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'At least 1 row is required').max(500),
});
