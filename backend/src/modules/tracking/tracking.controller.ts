import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { trackShipmentByLr, trackShipmentPublicByLr } from './tracking.service.ts';

export const trackByLrController = asyncHandler(async (req: Request, res: Response) => {
  const data = await trackShipmentByLr(req.params.lrNumber, req.user!.id, req.user!.role);
  res.status(200).json({ success: true, data });
});

export const publicTrackByLrController = asyncHandler(async (req: Request, res: Response) => {
  const data = await trackShipmentPublicByLr(req.params.lrNumber);
  res.status(200).json({ success: true, data });
});
