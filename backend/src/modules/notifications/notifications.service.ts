import mongoose from 'mongoose';
import { Notification, NotificationCategory } from '../../models/Notification.ts';
import { User } from '../../models/User.ts';
import { AppError } from '../../utils/AppError.ts';
import { UserRole } from '../../utils/constants.ts';
import { buildPaginatedResponse, parsePagination } from '../../utils/pagination.ts';
import { pushNotificationEventToUser } from '../../services/notificationRealtime.ts';

export interface CreateNotificationInput {
  recipientUserId: string;
  recipientRole: UserRole;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

export async function createAndPushNotification(input: CreateNotificationInput) {
  if (mongoose.connection.readyState !== 1) return null;

  try {
    const doc = await Notification.create({
      recipientUserId: input.recipientUserId,
      recipientRole: input.recipientRole,
      category: input.category,
      title: input.title,
      message: input.message,
      link: input.link,
      entityType: input.entityType,
      entityId: input.entityId,
      isRead: false,
    });

    const json = doc.toJSON();
    pushNotificationEventToUser(input.recipientUserId, {
      type: 'notification:new',
      notification: json,
    });
    return json;
  } catch {
    // Notifications must never break core transactional business actions
    return null;
  }
}

export async function notifyAllAdmins(
  input: Omit<CreateNotificationInput, 'recipientUserId' | 'recipientRole'>
) {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const admins = await User.find({ role: UserRole.ADMIN, isActive: true }).select('_id').lean();
    if (admins.length === 0) return;

    await Promise.all(
      admins.map((admin) =>
        createAndPushNotification({
          ...input,
          recipientUserId: admin._id.toString(),
          recipientRole: UserRole.ADMIN,
        })
      )
    );
  } catch {
    // Non-blocking
  }
}

export async function listNotificationsForUser(userId: string, query: Record<string, unknown>) {
  const pagination = parsePagination(query, 20, 100);
  const filter: Record<string, unknown> = { recipientUserId: userId };

  if (query.unreadOnly === true || query.unreadOnly === 'true') {
    filter.isRead = false;
  }

  if (
    typeof query.category === 'string' &&
    Object.values(NotificationCategory).includes(query.category as NotificationCategory)
  ) {
    filter.category = query.category;
  }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientUserId: userId, isRead: false }),
  ]);

  return {
    ...buildPaginatedResponse(items, total, pagination),
    unreadCount,
  };
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new AppError('Notification not found.', 404, 'NOTIFICATION_NOT_FOUND');
  }
  if (notification.recipientUserId.toString() !== userId) {
    throw new AppError('You are not authorized to access this notification.', 403, 'NOTIFICATION_FORBIDDEN');
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  pushNotificationEventToUser(userId, {
    type: 'notification:read',
    notificationId: notification._id.toString(),
  });

  return notification.toJSON();
}

export async function markAllNotificationsRead(userId: string) {
  const now = new Date();
  const result = await Notification.updateMany(
    { recipientUserId: userId, isRead: false },
    { $set: { isRead: true, readAt: now } }
  );

  pushNotificationEventToUser(userId, {
    type: 'notification:read_all',
  });

  return { modifiedCount: result.modifiedCount };
}

export async function clearReadNotifications(userId: string) {
  const result = await Notification.deleteMany({ recipientUserId: userId, isRead: true });

  pushNotificationEventToUser(userId, {
    type: 'notification:cleared_read',
  });

  return { deletedCount: result.deletedCount };
}
