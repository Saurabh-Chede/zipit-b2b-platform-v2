import { z } from 'zod';
import { WhatsAppEventType } from '../../utils/constants.ts';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const eventTemplateConfigSchema = z.object({
  eventType: z.nativeEnum(WhatsAppEventType),
  enabled: z.boolean(),
  templateName: z
    .string()
    .trim()
    .min(2, 'Template name is required')
    .max(120)
    .regex(/^[a-z0-9_]+$/i, 'Meta template name must contain letters, numbers, or underscores'),
  languageCode: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid language code'),
  statusLabel: z.string().trim().min(2).max(80),
  updateSummaryTemplate: z.string().trim().min(4).max(280),
});

export const updateWhatsAppConfigSchema = z.object({
  enabled: z.boolean(),
  apiVersion: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/, 'API version must look like v21.0'),
  phoneNumberId: z
    .string()
    .trim()
    .max(64)
    .refine((v) => v === '' || /^[0-9]+$/.test(v), 'Phone Number ID must contain digits only'),
  businessAccountId: z
    .string()
    .trim()
    .max(64)
    .refine((v) => v === '' || /^[0-9]+$/.test(v), 'Business Account ID must contain digits only'),
  defaultCountryCode: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'Country code must be 1 to 4 digits (e.g. 91)'),
  requireCustomerOptIn: z.boolean(),
  recipients: z
    .object({
      sendToReceiver: z.boolean(),
      sendToSender: z.boolean(),
      sendToSeller: z.boolean(),
    })
    .refine((r) => r.sendToReceiver || r.sendToSender || r.sendToSeller, {
      message: 'Select at least one recipient group for WhatsApp notifications.',
    }),
  retryPolicy: z.object({
    maxRetries: z.coerce.number().int().min(0).max(5),
    backoffSeconds: z.coerce.number().int().min(5).max(300),
  }),
  events: z.array(eventTemplateConfigSchema).min(1),
});

export const listWhatsAppLogsQuerySchema = z.object({
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED']).optional(),
  eventType: z.nativeEnum(WhatsAppEventType).optional(),
  bookingSource: z.enum(['PLATFORM', 'TRANSPORTER_SELF']).optional(),
  errorsOnly: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const whatsappLogIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid notification log ID'),
});

export type UpdateWhatsAppConfigInput = z.infer<typeof updateWhatsAppConfigSchema>;
