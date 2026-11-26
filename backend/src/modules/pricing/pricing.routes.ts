import { Router } from 'express';
import {
  bulkImportRatesController,
  calculateRatesController,
  createRateController,
  exportRatesCsvController,
  listRatesController,
  updateRateController,
} from './pricing.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  bulkImportRatesSchema,
  calculateRatesSchema,
  createRateSchema,
  rateIdParamSchema,
  updateRateSchema,
} from './pricing.validator.ts';
import { UserRole } from '../../utils/constants.ts';

const pricingRouter = Router();

pricingRouter.use(authenticate);

pricingRouter.get('/export', authorizeRoles(UserRole.ADMIN), exportRatesCsvController);

pricingRouter.post(
  '/bulk-import',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: bulkImportRatesSchema }),
  bulkImportRatesController
);

pricingRouter.post(
  '/',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: createRateSchema }),
  createRateController
);

pricingRouter.get(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  listRatesController
);

pricingRouter.post(
  '/calculate',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ body: calculateRatesSchema }),
  calculateRatesController
);

pricingRouter.patch(
  '/:id',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: rateIdParamSchema, body: updateRateSchema }),
  updateRateController
);

export { pricingRouter };
