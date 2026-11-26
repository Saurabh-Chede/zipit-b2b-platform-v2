import { z } from 'zod';

export const uploadDeliveryProofSchema = z.object({
  receiverName: z.string().min(2, 'Receiver name is required').max(140).trim(),
  deliveryDate: z.coerce.date({ error: 'Valid delivery date is required' }),
  remarks: z.string().max(400).trim().optional(),
  markDelivered: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type UploadDeliveryProofInput = z.infer<typeof uploadDeliveryProofSchema>;
