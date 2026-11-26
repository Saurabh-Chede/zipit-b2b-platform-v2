import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  calculateTransporterBookingController,
  createTransporterPersonalBookingController,
  listTransporterBookingsController,
  scanGlobalCartonController,
} from '../bookings/bookings.controller.ts';
import {
  addMyServiceAreaController,
  getMyEarningsController,
  getMyProfileController,
  importMyServiceAreasController,
  removeMyServiceAreaController,
  updateMyProfileController,
} from './transporters.controller.ts';
import {
  createTransporterRouteWithRate,
  deleteTransporterRoute,
  getTransporterRouteAudit,
  listTransporterRoutesWithRates,
  toggleTransporterRouteStatus,
  updateTransporterRouteWithRate,
} from '../routes/routes.service.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  calculateTransporterBookingSchema,
  createTransporterPersonalBookingSchema,
  globalScanCartonSchema,
  listBookingsQuerySchema,
} from '../bookings/bookings.validator.ts';
import {
  integratedRouteRateSchema,
  listMasterRoutesQuerySchema,
  routeIdParamSchema,
  toggleRouteStatusSchema,
  updateIntegratedRouteRateSchema,
} from '../routes/routes.validator.ts';
import {
  addServiceAreaSchema,
  deleteServiceAreaSchema,
  importServiceAreasSchema,
  updateOwnTransporterProfileSchema,
} from './transporters.validator.ts';
import { UserRole } from '../../utils/constants.ts';

function getActor(req: Request) {
  return {
    userId: req.user!.id,
    name: req.user!.name || req.user!.email,
    email: req.user!.email,
    role: req.user!.role,
  };
}

const transporterOpsRouter = Router();

transporterOpsRouter.use(authenticate, authorizeRoles(UserRole.TRANSPORTER));

// Transporter Integrated Routes & Rates
transporterOpsRouter.get(
  '/routes',
  validateRequest({ query: listMasterRoutesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await listTransporterRoutesWithRates(
      req.user!.id,
      req.query as Record<string, unknown>
    );
    res.status(200).json({ success: true, data });
  })
);

transporterOpsRouter.post(
  '/routes',
  validateRequest({ body: integratedRouteRateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const created = await createTransporterRouteWithRate(req.user!.id, getActor(req), req.body);
    res.status(201).json({
      success: true,
      message: 'Route and rate configuration created successfully.',
      data: created,
    });
  })
);

transporterOpsRouter.patch(
  '/routes/:id',
  validateRequest({ params: routeIdParamSchema, body: updateIntegratedRouteRateSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await updateTransporterRouteWithRate(
      req.user!.id,
      getActor(req),
      req.params.id,
      req.body
    );
    res.status(200).json({
      success: true,
      message: 'Route and rate configuration updated successfully.',
      data: updated,
    });
  })
);

transporterOpsRouter.patch(
  '/routes/:id/status',
  validateRequest({ params: routeIdParamSchema, body: toggleRouteStatusSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await toggleTransporterRouteStatus(
      req.user!.id,
      getActor(req),
      req.params.id,
      req.body.isActive
    );
    res.status(200).json({
      success: true,
      message: `Route ${updated.isActive ? 'activated' : 'deactivated'} successfully.`,
      data: updated,
    });
  })
);

transporterOpsRouter.delete(
  '/routes/:id',
  validateRequest({ params: routeIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await deleteTransporterRoute(req.user!.id, getActor(req), req.params.id);
    res.status(200).json({
      success: true,
      message: 'Route deleted successfully.',
      data: result,
    });
  })
);

transporterOpsRouter.get(
  '/routes/:id/audit',
  validateRequest({ params: routeIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const logs = await getTransporterRouteAudit(req.user!.id, req.params.id);
    res.status(200).json({ success: true, data: logs });
  })
);

// Transporter Bookings (Order Panel + Personal Booking + Booked Orders Panel)
transporterOpsRouter.get(
  '/bookings',
  validateRequest({ query: listBookingsQuerySchema }),
  listTransporterBookingsController
);

transporterOpsRouter.post(
  '/bookings/calculate',
  validateRequest({ body: calculateTransporterBookingSchema }),
  calculateTransporterBookingController
);

transporterOpsRouter.post(
  '/bookings',
  validateRequest({ body: createTransporterPersonalBookingSchema }),
  createTransporterPersonalBookingController
);

transporterOpsRouter.post(
  '/cartons/scan',
  validateRequest({ body: globalScanCartonSchema }),
  scanGlobalCartonController
);

transporterOpsRouter.get('/profile', getMyProfileController);
transporterOpsRouter.patch(
  '/profile',
  validateRequest({ body: updateOwnTransporterProfileSchema }),
  updateMyProfileController
);

transporterOpsRouter.post(
  '/service-areas',
  validateRequest({ body: addServiceAreaSchema }),
  addMyServiceAreaController
);
transporterOpsRouter.post(
  '/service-areas/import',
  validateRequest({ body: importServiceAreasSchema }),
  importMyServiceAreasController
);
transporterOpsRouter.delete(
  '/service-areas',
  validateRequest({ body: deleteServiceAreaSchema }),
  removeMyServiceAreaController
);

transporterOpsRouter.get('/earnings', getMyEarningsController);

export { transporterOpsRouter };
