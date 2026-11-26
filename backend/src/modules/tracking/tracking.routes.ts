import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { publicTrackByLrController, trackByLrController } from './tracking.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { trackByLrParamSchema } from './tracking.validator.ts';
import { UserRole } from '../../utils/constants.ts';
import { env } from '../../config/env.ts';

const trackingRouter = Router();
const publicTrackingRouter = Router();

const publicTrackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 500 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many tracking requests. Please wait a few minutes before retrying.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
});

trackingRouter.get(
  '/:lrNumber',
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: trackByLrParamSchema }),
  trackByLrController
);

publicTrackingRouter.get(
  '/:lrNumber',
  publicTrackingLimiter,
  validateRequest({ params: trackByLrParamSchema }),
  publicTrackByLrController
);

export { trackingRouter, publicTrackingRouter };
