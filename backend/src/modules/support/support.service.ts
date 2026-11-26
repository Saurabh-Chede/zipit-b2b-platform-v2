import crypto from 'crypto';
import mongoose from 'mongoose';
import type { z } from 'zod';
import {
  SupportTicket,
  SupportTicketStatus,
} from '../../models/SupportTicket.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { Transporter } from '../../models/Transporter.ts';
import { User } from '../../models/User.ts';
import { AppError } from '../../utils/AppError.ts';
import { UserRole } from '../../utils/constants.ts';
import { buildPaginatedResponse, parsePagination } from '../../utils/pagination.ts';
import { escapeRegex } from '../../utils/sanitize.ts';
import { sendRealtimeAlert } from '../../services/alerting.service.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import {
  createAndPushNotification,
  notifyAllAdmins,
} from '../notifications/notifications.service.ts';
import type {
  createTicketSchema,
  replyTicketSchema,
  updateTicketStatusSchema,
} from './support.validator.ts';

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ReplyTicketInput = z.infer<typeof replyTicketSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

function generateTicketNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const hex = crypto.randomBytes(2).toString('hex').toUpperCase();
  const seq = crypto.randomInt(10, 99);
  return `ZPT-SUP-${ymd}-${hex}${seq}`;
}

async function resolveActorDisplayName(userId: string, role: UserRole): Promise<string> {
  if (role === UserRole.SELLER) {
    const seller = await SellerProfile.findOne({ userId }).select('businessName ownerName').lean();
    if (seller?.businessName) return seller.businessName;
    if (seller?.ownerName) return seller.ownerName;
  } else if (role === UserRole.TRANSPORTER) {
    const transporter = await Transporter.findOne({ userId })
      .select('companyName contactPerson')
      .lean();
    if (transporter?.companyName) return transporter.companyName;
    if (transporter?.contactPerson) return transporter.contactPerson;
  }
  const user = await User.findById(userId).select('name').lean();
  return user?.name || 'ZIPIT User';
}

export async function createSupportTicket(
  userId: string,
  role: UserRole,
  input: CreateTicketInput
) {
  if (role !== UserRole.SELLER && role !== UserRole.TRANSPORTER) {
    throw new AppError(
      'Only sellers and transporters can raise support tickets.',
      403,
      'SUPPORT_ROLE_FORBIDDEN'
    );
  }

  const displayName = await resolveActorDisplayName(userId, role);
  const now = new Date();

  const ticket = await SupportTicket.create({
    ticketNumber: generateTicketNumber(),
    createdByUserId: userId,
    createdByRole: role,
    createdByName: displayName,
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    lrNumber: input.lrNumber,
    status: SupportTicketStatus.OPEN,
    lastMessageAt: now,
    messages: [
      {
        senderUserId: userId,
        senderName: displayName,
        senderRole: role,
        body: input.message,
        createdAt: now,
      },
    ],
  });

  if (input.priority === 'HIGH' || input.priority === 'URGENT') {
    void sendRealtimeAlert({
      source: 'SUPPORT',
      severity: input.priority === 'URGENT' ? 'ERROR' : 'WARN',
      errorCode: `SUPPORT_${input.priority}_${input.category}`,
      message: `${displayName} (${role}) raised ${input.priority} ticket ${ticket.ticketNumber}: ${input.subject}`,
      userId,
      userRole: role,
      meta: {
        ticketId: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        lrNumber: input.lrNumber,
      },
    }).catch(() => undefined);
  }

  void notifyAllAdmins({
    category: NotificationCategory.SUPPORT,
    title: `New ${input.priority} Ticket: ${ticket.ticketNumber}`,
    message: `${displayName} (${role}): ${input.subject}`,
    link: '/admin/support',
    entityType: 'SupportTicket',
    entityId: ticket._id.toString(),
  });

  return ticket.toJSON();
}

export async function listSupportTickets(
  userId: string,
  role: UserRole,
  query: Record<string, unknown>
) {
  const pagination = parsePagination(query, 20, 100);
  const baseScope: Record<string, unknown> =
    role === UserRole.ADMIN ? {} : { createdByUserId: userId };

  const filter: Record<string, unknown> = { ...baseScope };

  if (
    typeof query.status === 'string' &&
    Object.values(SupportTicketStatus).includes(query.status as SupportTicketStatus)
  ) {
    filter.status = query.status;
  }

  if (typeof query.category === 'string' && query.category.trim()) {
    filter.category = query.category.trim();
  }

  if (
    role === UserRole.ADMIN &&
    typeof query.role === 'string' &&
    (query.role === UserRole.SELLER || query.role === UserRole.TRANSPORTER)
  ) {
    filter.createdByRole = query.role;
  }

  if (typeof query.search === 'string' && query.search.trim()) {
    const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [
      { ticketNumber: regex },
      { subject: regex },
      { lrNumber: regex },
      { createdByName: regex },
    ];
  }

  const [items, total, openCount, inProgressCount, resolvedCount, closedCount] =
    await Promise.all([
      SupportTicket.find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      SupportTicket.countDocuments(filter),
      SupportTicket.countDocuments({ ...baseScope, status: SupportTicketStatus.OPEN }),
      SupportTicket.countDocuments({ ...baseScope, status: SupportTicketStatus.IN_PROGRESS }),
      SupportTicket.countDocuments({ ...baseScope, status: SupportTicketStatus.RESOLVED }),
      SupportTicket.countDocuments({ ...baseScope, status: SupportTicketStatus.CLOSED }),
    ]);

  return {
    ...buildPaginatedResponse(items, total, pagination),
    summary: {
      total: openCount + inProgressCount + resolvedCount + closedCount,
      open: openCount,
      inProgress: inProgressCount,
      resolved: resolvedCount,
      closed: closedCount,
    },
  };
}

async function assertTicketAccess(ticketId: string, userId: string, role: UserRole) {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket) {
    throw new AppError('Support ticket not found.', 404, 'TICKET_NOT_FOUND');
  }
  if (role !== UserRole.ADMIN && ticket.createdByUserId.toString() !== userId) {
    throw new AppError('You are not authorized to access this ticket.', 403, 'TICKET_FORBIDDEN');
  }
  return ticket;
}

export async function getSupportTicket(ticketId: string, userId: string, role: UserRole) {
  const ticket = await assertTicketAccess(ticketId, userId, role);
  return ticket.toJSON();
}

export async function replyToSupportTicket(
  ticketId: string,
  userId: string,
  role: UserRole,
  input: ReplyTicketInput
) {
  const ticket = await assertTicketAccess(ticketId, userId, role);
  const senderName = await resolveActorDisplayName(userId, role);
  const now = new Date();

  ticket.messages.push({
    senderUserId: new mongoose.Types.ObjectId(userId),
    senderName,
    senderRole: role,
    body: input.message,
    createdAt: now,
  });
  ticket.lastMessageAt = now;

  if (role === UserRole.ADMIN && ticket.status === SupportTicketStatus.OPEN) {
    ticket.status = SupportTicketStatus.IN_PROGRESS;
  } else if (
    role !== UserRole.ADMIN &&
    (ticket.status === SupportTicketStatus.RESOLVED || ticket.status === SupportTicketStatus.CLOSED)
  ) {
    ticket.status = SupportTicketStatus.OPEN;
    ticket.resolvedAt = null;
  }

  await ticket.save();

  if (role === UserRole.ADMIN) {
    void createAndPushNotification({
      recipientUserId: ticket.createdByUserId.toString(),
      recipientRole: ticket.createdByRole,
      category: NotificationCategory.SUPPORT,
      title: `Support Reply on ${ticket.ticketNumber}`,
      message: `${senderName}: ${input.message.slice(0, 140)}`,
      link: ticket.createdByRole === UserRole.SELLER ? '/seller/support' : '/transporter/support',
      entityType: 'SupportTicket',
      entityId: ticket._id.toString(),
    });
  } else {
    void notifyAllAdmins({
      category: NotificationCategory.SUPPORT,
      title: `Ticket Reply: ${ticket.ticketNumber}`,
      message: `${senderName} replied on "${ticket.subject}".`,
      link: '/admin/support',
      entityType: 'SupportTicket',
      entityId: ticket._id.toString(),
    });
  }

  return ticket.toJSON();
}

export async function updateSupportTicketStatus(
  ticketId: string,
  userId: string,
  role: UserRole,
  input: UpdateTicketStatusInput
) {
  const ticket = await assertTicketAccess(ticketId, userId, role);

  if (
    role !== UserRole.ADMIN &&
    input.status !== SupportTicketStatus.CLOSED &&
    input.status !== SupportTicketStatus.OPEN
  ) {
    throw new AppError(
      'You can only close or reopen your own support ticket.',
      403,
      'TICKET_STATUS_FORBIDDEN'
    );
  }

  ticket.status = input.status;
  if (input.status === SupportTicketStatus.RESOLVED || input.status === SupportTicketStatus.CLOSED) {
    ticket.resolvedAt = new Date();
  } else {
    ticket.resolvedAt = null;
  }

  await ticket.save();

  if (role === UserRole.ADMIN) {
    void createAndPushNotification({
      recipientUserId: ticket.createdByUserId.toString(),
      recipientRole: ticket.createdByRole,
      category: NotificationCategory.SUPPORT,
      title: `Ticket ${ticket.ticketNumber} ${input.status}`,
      message: `Admin updated "${ticket.subject}" status to ${input.status}.`,
      link: ticket.createdByRole === UserRole.SELLER ? '/seller/support' : '/transporter/support',
      entityType: 'SupportTicket',
      entityId: ticket._id.toString(),
    });
  }

  return ticket.toJSON();
}
