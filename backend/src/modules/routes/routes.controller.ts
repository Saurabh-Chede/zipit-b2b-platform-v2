import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  createAdminMasterRoute,
  createRoute,
  deleteAdminMasterRoute,
  getAdminMasterRouteAudit,
  listAdminMasterRoutes,
  listRoutes,
  toggleAdminMasterRouteStatus,
  updateAdminMasterRoute,
  updateRoute,
} from './routes.service.ts';
import { UserRole } from '../../utils/constants.ts';
import { logger } from '../../config/logger.ts';
import type { AuditActor } from '../platformConfig/platformConfig.service.ts';

function getActor(req: Request): AuditActor {
  return {
    userId: req.user!.id,
    name: req.user!.name || req.user!.email,
    email: req.user!.email,
    role: req.user!.role,
  };
}

export const createRouteController = asyncHandler(async (req: Request, res: Response) => {
  const route = await createRoute(req.body, getActor(req));
  logger.info({
    requestId: req.requestId,
    module: 'routes',
    action: 'route_created',
    meta: { routeId: route._id.toString() },
  });
  res.status(201).json({
    success: true,
    message: 'Transport route created successfully.',
    data: route,
  });
});

export const listRoutesController = asyncHandler(async (req: Request, res: Response) => {
  const forceActiveOnly = req.user?.role !== UserRole.ADMIN;
  const deduplicateByCorridor = req.user?.role === UserRole.SELLER;
  const data = await listRoutes(
    req.query as Record<string, unknown>,
    forceActiveOnly,
    deduplicateByCorridor
  );
  res.status(200).json({ success: true, data });
});

export const updateRouteController = asyncHandler(async (req: Request, res: Response) => {
  const route = await updateRoute(req.params.id, req.body, getActor(req));
  logger.info({
    requestId: req.requestId,
    module: 'routes',
    action: 'route_updated',
    meta: { routeId: req.params.id },
  });
  res.status(200).json({
    success: true,
    message: 'Transport route updated successfully.',
    data: route,
  });
});

export const listAdminMasterRoutesController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listAdminMasterRoutes(req.query as Record<string, unknown>);
  res.status(200).json({ success: true, data });
});

export const createAdminMasterRouteController = asyncHandler(async (req: Request, res: Response) => {
  const created = await createAdminMasterRoute(getActor(req), req.body);
  logger.info({
    requestId: req.requestId,
    module: 'routes',
    action: 'admin_master_route_created',
    meta: { rateId: created.rateId, routeId: created.routeId, transporterId: created.transporterId },
  });
  res.status(201).json({
    success: true,
    message: 'Transporter route and rate created successfully.',
    data: created,
  });
});

export const updateAdminMasterRouteController = asyncHandler(async (req: Request, res: Response) => {
  const updated = await updateAdminMasterRoute(req.params.id, getActor(req), req.body);
  logger.info({
    requestId: req.requestId,
    module: 'routes',
    action: 'admin_master_route_updated',
    meta: { rateId: updated.rateId, routeId: updated.routeId },
  });
  res.status(200).json({
    success: true,
    message: 'Transporter route and rate updated successfully.',
    data: updated,
  });
});

export const toggleAdminMasterRouteStatusController = asyncHandler(async (req: Request, res: Response) => {
  const updated = await toggleAdminMasterRouteStatus(req.params.id, req.body.isActive, getActor(req));
  res.status(200).json({
    success: true,
    message: `Route ${updated.isActive ? 'activated' : 'deactivated'} successfully.`,
    data: updated,
  });
});

export const deleteAdminMasterRouteController = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteAdminMasterRoute(req.params.id, getActor(req));
  res.status(200).json({
    success: true,
    message: 'Route deleted successfully.',
    data: result,
  });
});

export const getAdminMasterRouteAuditController = asyncHandler(async (req: Request, res: Response) => {
  const logs = await getAdminMasterRouteAudit(req.params.id);
  res.status(200).json({ success: true, data: logs });
});
