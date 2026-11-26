import { z } from 'zod';

export const trackByLrParamSchema = z.object({
  lrNumber: z.string().min(4, 'Valid LR number is required').max(60).trim(),
});
