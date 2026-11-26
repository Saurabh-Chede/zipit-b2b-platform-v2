import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  replyToSupportTicket,
  updateSupportTicketStatus,
} from './support.service.ts';
import { logger } from '../../config/logger.ts';

export const createTicketController = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await createSupportTicket(req.user!.id, req.user!.role, req.body);

  logger.info({
    requestId: req.requestId,
    module: 'support',
    action: 'support_ticket_created',
    meta: {
      ticketNumber: ticket.ticketNumber,
      role: req.user!.role,
      category: ticket.category,
    },
  });

  res.status(201).json({
    success: true,
    message: `Support ticket ${ticket.ticketNumber} created.`,
    data: ticket,
  });
});

export const listTicketsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listSupportTickets(
    req.user!.id,
    req.user!.role,
    req.query as Record<string, unknown>
  );
  res.status(200).json({ success: true, data });
});

export const getTicketController = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await getSupportTicket(req.params.id as string, req.user!.id, req.user!.role);
  res.status(200).json({ success: true, data: ticket });
});

export const replyTicketController = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await replyToSupportTicket(
    req.params.id as string,
    req.user!.id,
    req.user!.role,
    req.body
  );
  res.status(200).json({
    success: true,
    message: 'Reply added to support ticket.',
    data: ticket,
  });
});

export const updateTicketStatusController = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await updateSupportTicketStatus(
    req.params.id as string,
    req.user!.id,
    req.user!.role,
    req.body
  );
  res.status(200).json({
    success: true,
    message: `Ticket marked as ${ticket.status.replace('_', ' ').toLowerCase()}.`,
    data: ticket,
  });
});
