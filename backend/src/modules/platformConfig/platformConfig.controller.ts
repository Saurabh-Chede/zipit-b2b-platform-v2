import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { UserRole } from '../../utils/constants.ts';
import { getPlatformConfigForUser, updatePlatformConfig } from './platformConfig.service.ts';

export const getPlatformConfigController = asyncHandler(async (req: Request, res: Response) => {
  const role = req.user?.role ?? UserRole.SELLER;
  const data = await getPlatformConfigForUser(role);
  res.status(200).json({ success: true, data });
});

export const updatePlatformConfigController = asyncHandler(async (req: Request, res: Response) => {
  const data = await updatePlatformConfig(req.body, {
    userId: req.user!.id,
    name: req.user!.name || req.user!.email,
    email: req.user!.email,
    role: req.user!.role,
  });

  res.status(200).json({
    success: true,
    message: 'Platform charge configuration saved successfully.',
    data,
  });
});
