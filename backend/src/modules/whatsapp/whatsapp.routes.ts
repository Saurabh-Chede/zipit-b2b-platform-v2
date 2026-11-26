import { Router } from 'express';
import {
  getWhatsAppConfigController,
  listWhatsAppLogsController,
  receiveWhatsAppWebhookController,
  retryAllFailedWhatsAppController,
  retryWhatsAppLogController,
  updateWhatsAppConfigController,
  verifyWhatsAppWebhookController,
} from './whatsapp.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { UserRole } from '../../utils/constants.ts';
import {
  listWhatsAppLogsQuerySchema,
  updateWhatsAppConfigSchema,
  whatsappLogIdParamSchema,
} from './whatsapp.validator.ts';

const whatsappRouter = Router();

// Meta WhatsApp Cloud API Webhook (verified by challenge token / X-Hub-Signature-256 HMAC)
whatsappRouter.get('/webhook', verifyWhatsAppWebhookController);
whatsappRouter.post('/webhook', receiveWhatsAppWebhookController);

// Admin WhatsApp Management
whatsappRouter.use(authenticate, authorizeRoles(UserRole.ADMIN));

whatsappRouter.get('/config', getWhatsAppConfigController);
whatsappRouter.put(
  '/config',
  validateRequest({ body: updateWhatsAppConfigSchema }),
  updateWhatsAppConfigController
);
whatsappRouter.get(
  '/logs',
  validateRequest({ query: listWhatsAppLogsQuerySchema }),
  listWhatsAppLogsController
);
whatsappRouter.post('/logs/retry-failed', retryAllFailedWhatsAppController);
whatsappRouter.post(
  '/logs/:id/retry',
  validateRequest({ params: whatsappLogIdParamSchema }),
  retryWhatsAppLogController
);

export { whatsappRouter };
