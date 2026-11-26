import { Router } from 'express';
import {
  createPaymentOrderController,
  getPaymentConfigController,
  listPaymentOrdersController,
  razorpayWebhookController,
  verifyPaymentController,
} from './payments.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  createPaymentOrderSchema,
  verifyRazorpayPaymentSchema,
} from './payments.validator.ts';
import { UserRole } from '../../utils/constants.ts';

const paymentsRouter = Router();

// Server-to-server Razorpay webhook (authenticated via HMAC x-razorpay-signature)
paymentsRouter.post('/webhook', razorpayWebhookController);

paymentsRouter.use(authenticate);

paymentsRouter.get('/config', getPaymentConfigController);
paymentsRouter.get('/orders', authorizeRoles(UserRole.SELLER), listPaymentOrdersController);
paymentsRouter.post(
  '/orders',
  authorizeRoles(UserRole.SELLER),
  validateRequest({ body: createPaymentOrderSchema }),
  createPaymentOrderController
);
paymentsRouter.post(
  '/verify',
  authorizeRoles(UserRole.SELLER),
  validateRequest({ body: verifyRazorpayPaymentSchema }),
  verifyPaymentController
);

export { paymentsRouter };
