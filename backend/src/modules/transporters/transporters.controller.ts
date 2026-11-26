import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  approveTransporter,
  createTransporter,
  getMyTransporterEarnings,
  getMyTransporterProfile,
  getTransporterById,
  importMyServiceAreas,
  listTransporters,
  registerTransporter,
  rejectTransporter,
  removeMyServiceArea,
  updateMyTransporterProfile,
  updateTransporter,
} from './transporters.service.ts';
import { UserRole } from '../../utils/constants.ts';
import { logger } from '../../config/logger.ts';

export const registerTransporterController = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerTransporter(req.body);
  logger.info({
    requestId: req.requestId,
    module: 'transporters',
    action: 'transporter_registered',
    meta: { transporterId: result.transporter._id.toString() },
  });
  res.status(201).json({
    success: true,
    message: 'Transporter registration submitted. Your account is pending admin approval.',
    data: result,
  });
});

export const createTransporterController = asyncHandler(async (req: Request, res: Response) => {
  const transporter = await createTransporter(req.body);
  logger.info({
    requestId: req.requestId,
    module: 'transporters',
    action: 'transporter_created',
    meta: { transporterId: transporter._id.toString() },
  });
  res.status(201).json({
    success: true,
    message: 'Transporter created and login credentials assigned.',
    data: transporter,
  });
});

export const listTransportersController = asyncHandler(async (req: Request, res: Response) => {
  const forceActiveOnly = req.user?.role !== UserRole.ADMIN;
  const data = await listTransporters(req.query as Record<string, unknown>, forceActiveOnly);
  res.status(200).json({ success: true, data });
});

export const getTransporterByIdController = asyncHandler(async (req: Request, res: Response) => {
  const transporter = await getTransporterById(req.params.id);
  res.status(200).json({ success: true, data: transporter });
});

export const updateTransporterController = asyncHandler(async (req: Request, res: Response) => {
  const transporter = await updateTransporter(req.params.id, req.body);
  logger.info({
    requestId: req.requestId,
    module: 'transporters',
    action: 'transporter_updated',
    meta: { transporterId: req.params.id },
  });
  res.status(200).json({
    success: true,
    message: 'Transporter updated successfully.',
    data: transporter,
  });
});

export const approveTransporterController = asyncHandler(async (req: Request, res: Response) => {
  const transporter = await approveTransporter(req.params.id, req.user!.id);
  logger.info({
    requestId: req.requestId,
    module: 'transporters',
    action: 'transporter_approved',
    meta: { transporterId: req.params.id, adminId: req.user!.id },
  });
  res.status(200).json({
    success: true,
    message: 'Transporter approved and activated.',
    data: transporter,
  });
});

export const rejectTransporterController = asyncHandler(async (req: Request, res: Response) => {
  const transporter = await rejectTransporter(
    req.params.id,
    req.user!.id,
    req.body.rejectionReason
  );
  logger.info({
    requestId: req.requestId,
    module: 'transporters',
    action: 'transporter_rejected',
    meta: { transporterId: req.params.id, adminId: req.user!.id },
  });
  res.status(200).json({
    success: true,
    message: 'Transporter application rejected.',
    data: transporter,
  });
});

export const getMyProfileController = asyncHandler(async (req: Request, res: Response) => {
  const transporter = await getMyTransporterProfile(req.user!.id);
  res.status(200).json({ success: true, data: transporter });
});

export const updateMyProfileController = asyncHandler(async (req: Request, res: Response) => {
  const transporter = await updateMyTransporterProfile(req.user!.id, req.body);
  res.status(200).json({
    success: true,
    message: 'Company profile updated successfully.',
    data: transporter,
  });
});

export const addMyServiceAreaController = asyncHandler(async (req: Request, res: Response) => {
  const result = await importMyServiceAreas(req.user!.id, [req.body]);
  res.status(201).json({
    success: true,
    message:
      result.addedCount > 0
        ? `Added service area ${req.body.city} (${req.body.pincode}).`
        : 'Service area already exists.',
    data: result,
  });
});

export const importMyServiceAreasController = asyncHandler(async (req: Request, res: Response) => {
  const result = await importMyServiceAreas(req.user!.id, req.body.serviceAreas);
  res.status(200).json({
    success: true,
    message: `Imported ${result.addedCount} new service area(s) (${result.duplicateCount} duplicate skipped).`,
    data: result,
  });
});

export const removeMyServiceAreaController = asyncHandler(async (req: Request, res: Response) => {
  const result = await removeMyServiceArea(req.user!.id, req.body);
  res.status(200).json({
    success: true,
    message: `Removed ${req.body.city} (${req.body.pincode}) from service areas.`,
    data: result,
  });
});

export const getMyEarningsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getMyTransporterEarnings(req.user!.id);
  res.status(200).json({ success: true, data });
});
