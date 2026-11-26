import { z } from 'zod';

const chargeRuleSchema = z
  .object({
    enabled: z.boolean(),
    chargeType: z.enum(['FIXED', 'PERCENTAGE']),
    value: z.coerce.number().min(0, 'Platform charge value cannot be negative'),
    applyGstOnCharge: z.boolean().default(false),
  })
  .refine((rule) => !(rule.chargeType === 'PERCENTAGE' && rule.value > 100), {
    message: 'Percentage platform charge cannot exceed 100%.',
    path: ['value'],
  });

export const updatePlatformConfigSchema = z.object({
  sellerBookingCharge: chargeRuleSchema,
  transporterBookingCharge: chargeRuleSchema,
  billingRuleNotes: z.string().max(500).trim().optional().default(''),
});
