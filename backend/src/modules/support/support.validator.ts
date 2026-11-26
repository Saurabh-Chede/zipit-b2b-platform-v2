import { z } from 'zod';
import {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../../models/SupportTicket.ts';

export const createTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(4, 'Subject must be at least 4 characters.')
    .max(160, 'Subject cannot exceed 160 characters.'),
  category: z.nativeEnum(SupportTicketCategory),
  priority: z.nativeEnum(SupportTicketPriority).default(SupportTicketPriority.MEDIUM),
  lrNumber: z
    .string()
    .trim()
    .max(40, 'LR number is too long.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : undefined)),
  message: z
    .string()
    .trim()
    .min(10, 'Please describe your issue in at least 10 characters.')
    .max(2000, 'Description cannot exceed 2000 characters.'),
});

export const replyTicketSchema = z.object({
  message: z
    .string()
    .trim()
    .min(2, 'Reply cannot be empty.')
    .max(2000, 'Reply cannot exceed 2000 characters.'),
});

export const updateTicketStatusSchema = z.object({
  status: z.nativeEnum(SupportTicketStatus),
});
