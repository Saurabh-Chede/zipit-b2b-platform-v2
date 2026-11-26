import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  bulkImportRates,
  calculateAvailableQuotes,
  createRate,
  exportRatesCsv,
  listRates,
  updateRate,
} from './pricing.service.ts';
import { logger } from '../../config/logger.ts';

export const createRateController = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user
    ? {
        userId: req.user.id,
        name: req.user.name || req.user.email,
        email: req.user.email,
        role: req.user.role,
      }
    : undefined;
  const rate = await createRate(req.body, actor);
  logger.info({
    requestId: req.requestId,
    module: 'pricing',
    action: 'rate_created',
    meta: { rateId: rate._id.toString() },
  });
  res.status(201).json({
    success: true,
    message: 'Transport rate created successfully.',
    data: rate,
  });
});

export const listRatesController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listRates(req.query as Record<string, unknown>);
  res.status(200).json({ success: true, data });
});

export const updateRateController = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user
    ? {
        userId: req.user.id,
        name: req.user.name || req.user.email,
        email: req.user.email,
        role: req.user.role,
      }
    : undefined;
  const rate = await updateRate(req.params.id, req.body, actor);
  logger.info({
    requestId: req.requestId,
    module: 'pricing',
    action: 'rate_updated',
    meta: { rateId: req.params.id },
  });
  res.status(200).json({
    success: true,
    message: 'Transport rate updated successfully.',
    data: rate,
  });
});

export const calculateRatesController = asyncHandler(async (req: Request, res: Response) => {
  const data = await calculateAvailableQuotes(req.body);
  res.status(200).json({
    success: true,
    data,
  });
});

export const exportRatesCsvController = asyncHandler(async (_req: Request, res: Response) => {
  const csv = await exportRatesCsv();
  const ymd = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="zipit-rate-matrix-${ymd}.csv"`);
  res.status(200).send(csv);
});

export const bulkImportRatesController = asyncHandler(async (req: Request, res: Response) => {
  const result = await bulkImportRates(req.body.rows);
  logger.info({
    requestId: req.requestId,
    module: 'pricing',
    action: 'rates_bulk_imported',
    meta: {
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      failedCount: result.failedCount,
    },
  });
  res.status(200).json({
    success: true,
    message: `Imported ${result.createdCount} new rate(s) and updated ${result.updatedCount} rate(s).`,
    data: result,
  });
});

