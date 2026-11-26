import { Router } from 'express';
import {
  createAdminMasterRouteController,
  createRouteController,
  deleteAdminMasterRouteController,
  getAdminMasterRouteAuditController,
  listAdminMasterRoutesController,
  listRoutesController,
  toggleAdminMasterRouteStatusController,
  updateAdminMasterRouteController,
  updateRouteController,
} from './routes.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  adminMasterCreateRouteSchema,
  adminMasterUpdateRouteSchema,
  createRouteSchema,
  listMasterRoutesQuerySchema,
  listRoutesQuerySchema,
  routeIdParamSchema,
  toggleRouteStatusSchema,
  updateRouteSchema,
} from './routes.validator.ts';
import { UserRole } from '../../utils/constants.ts';

const routesRouter = Router();

routesRouter.use(authenticate);

// Admin Master Route + Rate Control
routesRouter.get(
  '/master',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ query: listMasterRoutesQuerySchema }),
  listAdminMasterRoutesController
);

routesRouter.post(
  '/master',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: adminMasterCreateRouteSchema }),
  createAdminMasterRouteController
);

routesRouter.patch(
  '/master/:id',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: routeIdParamSchema, body: adminMasterUpdateRouteSchema }),
  updateAdminMasterRouteController
);

routesRouter.patch(
  '/master/:id/status',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: routeIdParamSchema, body: toggleRouteStatusSchema }),
  toggleAdminMasterRouteStatusController
);

routesRouter.delete(
  '/master/:id',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: routeIdParamSchema }),
  deleteAdminMasterRouteController
);

routesRouter.get(
  '/master/:id/audit',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: routeIdParamSchema }),
  getAdminMasterRouteAuditController
);

// Existing Route Endpoints
routesRouter.post(
  '/',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ body: createRouteSchema }),
  createRouteController
);

routesRouter.get(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ query: listRoutesQuerySchema }),
  listRoutesController
);

routesRouter.patch(
  '/:id',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: routeIdParamSchema, body: updateRouteSchema }),
  updateRouteController
);

export { routesRouter };
