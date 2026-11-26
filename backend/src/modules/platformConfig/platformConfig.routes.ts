import { Router } from 'express';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { UserRole } from '../../utils/constants.ts';
import {
  getPlatformConfigController,
  updatePlatformConfigController,
} from './platformConfig.controller.ts';
import { updatePlatformConfigSchema } from './platformConfig.validator.ts';

const platformConfigRouter = Router();

platformConfigRouter.use(authenticate);

platformConfigRouter.get(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  getPlatformConfigController
);

platformConfigRouter.put(
  '/',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: updatePlatformConfigSchema }),
  updatePlatformConfigController
);

export { platformConfigRouter };
