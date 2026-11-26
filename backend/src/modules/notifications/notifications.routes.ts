import { Router } from 'express';
import { authenticate } from '../../middleware/auth.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  clearReadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.service.ts';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from './notifications.validator.ts';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  validateRequest({ query: listNotificationsQuerySchema }),
  async (req, res, next) => {
    try {
      const data = await listNotificationsForUser(req.user!.id, req.query as Record<string, unknown>);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

notificationsRouter.patch('/read-all', async (req, res, next) => {
  try {
    const data = await markAllNotificationsRead(req.user!.id);
    res.status(200).json({ success: true, message: 'All notifications marked as read.', data });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch(
  '/:id/read',
  validateRequest({ params: notificationIdParamSchema }),
  async (req, res, next) => {
    try {
      const data = await markNotificationRead(req.params.id, req.user!.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

notificationsRouter.delete('/read', async (req, res, next) => {
  try {
    const data = await clearReadNotifications(req.user!.id);
    res.status(200).json({ success: true, message: 'Read notifications cleared.', data });
  } catch (err) {
    next(err);
  }
});
