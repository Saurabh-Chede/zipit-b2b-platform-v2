import { Router } from 'express';
import {
  createTransporterSettlementController,
  getSettlementsOverviewController,
  getTransporterPendingBookingsController,
} from './settlements.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  createTransporterSettlementSchema,
  transporterSettlementParamSchema,
} from './settlements.validator.ts';
import { UserRole } from '../../utils/constants.ts';

const settlementsRouter = Router();

settlementsRouter.use(authenticate, authorizeRoles(UserRole.ADMIN));

settlementsRouter.get('/', getSettlementsOverviewController);

settlementsRouter.get(
  '/transporters/:transporterId/pending',
  validateRequest({ params: transporterSettlementParamSchema }),
  getTransporterPendingBookingsController
);

settlementsRouter.post(
  '/',
  validateRequest({ body: createTransporterSettlementSchema }),
  createTransporterSettlementController
);

export { settlementsRouter };
