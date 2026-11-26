import type { Request, Response, NextFunction } from 'express';
import {
  getWhatsAppConfigView,
  listWhatsAppNotificationLogs,
  processMetaWebhookPayload,
  retryAllFailedWhatsAppNotifications,
  retryWhatsAppNotification,
  updateWhatsAppConfig,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from './whatsapp.service.ts';

export async function verifyWhatsAppWebhookController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const challenge = verifyMetaWebhookChallenge(
      req.query['hub.mode'],
      req.query['hub.verify_token'],
      req.query['hub.challenge']
    );
    res.status(200).type('text/plain').send(challenge);
  } catch (err) {
    next(err);
  }
}

export async function receiveWhatsAppWebhookController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    verifyMetaWebhookSignature(rawBody, signature);
    const result = await processMetaWebhookPayload(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getWhatsAppConfigController(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await getWhatsAppConfigView();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateWhatsAppConfigController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await updateWhatsAppConfig(req.user!.id, req.body);
    res.status(200).json({
      success: true,
      message: 'WhatsApp notification settings updated successfully.',
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function listWhatsAppLogsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await listWhatsAppNotificationLogs(req.query as Record<string, unknown>);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function retryWhatsAppLogController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await retryWhatsAppNotification(req.params.id as string);
    res.status(200).json({
      success: true,
      message: 'Notification retry executed.',
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function retryAllFailedWhatsAppController(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await retryAllFailedWhatsAppNotifications();
    res.status(200).json({
      success: true,
      message: `Queued ${data.retriedCount} failed notification(s) for retry.`,
      data,
    });
  } catch (err) {
    next(err);
  }
}
