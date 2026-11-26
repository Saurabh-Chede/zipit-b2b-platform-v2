import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { getBackendHealth, getDashboardStats } from './dashboard.service.ts';

export const getDashboardStatsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getDashboardStats(req.user!.id, req.user!.role);
  res.status(200).json({ success: true, data });
});

export const getBackendHealthController = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getBackendHealth();
  res.status(200).json({ success: true, data });
});
