import { z } from 'zod';

export const clientErrorReportSchema = z.object({
  severity: z.enum(['WARN', 'ERROR', 'FATAL']).default('ERROR'),
  errorCode: z.string().trim().min(1).max(100).default('UI_RUNTIME_ERROR'),
  message: z.string().trim().min(1).max(1000),
  route: z.string().trim().max(300).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
  stack: z.string().max(2500).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const listAlertsQuerySchema = z.object({
  severity: z.enum(['WARN', 'ERROR', 'FATAL']).optional(),
  source: z.enum(['BACKEND_API', 'FRONTEND_UI', 'DATABASE', 'PROCESS', 'SUPPORT']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const testAlertSchema = z.object({
  message: z.string().trim().min(3).max(400).optional(),
});
