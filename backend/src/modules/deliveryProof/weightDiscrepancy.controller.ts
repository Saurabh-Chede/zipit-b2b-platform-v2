import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { reportWeightDiscrepancySchema } from '../bookings/bookings.validator.ts';
import {
  getAuthorizedWeightDiscrepancyImageStream,
  reportWeightDiscrepancy,
  resolveWeightDiscrepancyByAdmin,
  respondToWeightDiscrepancy,
} from './weightDiscrepancy.service.ts';
import { logger } from '../../config/logger.ts';

export const reportWeightDiscrepancyController = asyncHandler(async (req: Request, res: Response) => {
  const parsedBody = reportWeightDiscrepancySchema.parse(req.body);
  const discrepancy = await reportWeightDiscrepancy(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.file,
    parsedBody
  );

  logger.info({
    requestId: req.requestId,
    module: 'weightDiscrepancy',
    action: 'weight_discrepancy_reported',
    meta: {
      bookingId: req.params.id,
      discrepancyId: discrepancy.discrepancyId,
      diffAmount: discrepancy.additionalDifferenceAmount,
    },
  });

  res.status(201).json({
    success: true,
    message: 'Weight discrepancy reported and seller notified.',
    data: discrepancy,
  });
});

export const getWeightDiscrepancyImageController = asyncHandler(async (req: Request, res: Response) => {
  const { stream, mimeType, fileName } = await getAuthorizedWeightDiscrepancyImageStream(
    req.params.id,
    req.user!.id,
    req.user!.role
  );

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');

  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(404).json({
        success: false,
        message: 'Weight scale proof image could not be read.',
        errorCode: 'SCALE_IMAGE_READ_ERROR',
      });
    }
  });

  stream.pipe(res);
});

export const respondWeightDiscrepancyController = asyncHandler(async (req: Request, res: Response) => {
  const discrepancy = await respondToWeightDiscrepancy(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.body
  );

  res.status(200).json({
    success: true,
    message:
      req.body.action === 'ACCEPT'
        ? 'Weight discrepancy accepted and billing updated.'
        : 'Weight discrepancy disputed and escalated to Admin review.',
    data: discrepancy,
  });
});

export const resolveWeightDiscrepancyController = asyncHandler(async (req: Request, res: Response) => {
  const discrepancy = await resolveWeightDiscrepancyByAdmin(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.body
  );

  res.status(200).json({
    success: true,
    message:
      req.body.decision === 'WAIVE'
        ? 'Weight discrepancy waived in favor of seller.'
        : 'Weight discrepancy finalized and billed to seller.',
    data: discrepancy,
  });
});
