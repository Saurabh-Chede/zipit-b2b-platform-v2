import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  approveTransporterController,
  createTransporterController,
  getTransporterByIdController,
  listTransportersController,
  registerTransporterController,
  rejectTransporterController,
  updateTransporterController,
} from './transporters.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  createTransporterSchema,
  listTransportersQuerySchema,
  registerTransporterSchema,
  rejectTransporterSchema,
  transporterIdParamSchema,
  updateTransporterSchema,
} from './transporters.validator.ts';
import { UserRole } from '../../utils/constants.ts';
import { env } from '../../config/env.ts';

const transportersRouter = Router();

const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 500 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many registration attempts. Please wait 15 minutes before retrying.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
});

transportersRouter.post(
  '/register',
  registerRateLimiter,
  validateRequest({ body: registerTransporterSchema }),
  registerTransporterController
);

transportersRouter.use(authenticate);

transportersRouter.post(
  '/',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: createTransporterSchema }),
  createTransporterController
);

transportersRouter.get(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER),
  validateRequest({ query: listTransportersQuerySchema }),
  listTransportersController
);

transportersRouter.get(
  '/:id',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER),
  validateRequest({ params: transporterIdParamSchema }),
  getTransporterByIdController
);

transportersRouter.patch(
  '/:id',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: transporterIdParamSchema, body: updateTransporterSchema }),
  updateTransporterController
);

transportersRouter.patch(
  '/:id/approve',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: transporterIdParamSchema }),
  approveTransporterController
);

transportersRouter.patch(
  '/:id/reject',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: transporterIdParamSchema, body: rejectTransporterSchema }),
  rejectTransporterController
);

export { transportersRouter };
