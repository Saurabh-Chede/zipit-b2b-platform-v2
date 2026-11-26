import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { uploadDeliveryProofSchema } from './deliveryProof.validator.ts';
import { getAuthorizedDeliveryProofStream, uploadDeliveryProof } from './deliveryProof.service.ts';
import { logger } from '../../config/logger.ts';

export const uploadDeliveryProofController = asyncHandler(async (req: Request, res: Response) => {
  const parsedBody = uploadDeliveryProofSchema.parse(req.body);
  const proof = await uploadDeliveryProof(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.file,
    parsedBody
  );

  logger.info({
    requestId: req.requestId,
    module: 'deliveryProof',
    action: 'delivery_proof_uploaded',
    meta: { bookingId: req.params.id, proofId: proof._id.toString() },
  });

  res.status(201).json({
    success: true,
    message: 'Delivery proof uploaded successfully.',
    data: proof,
  });
});

export const getDeliveryProofImageController = asyncHandler(async (req: Request, res: Response) => {
  const { stream, mimeType, fileName } = await getAuthorizedDeliveryProofStream(
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
        message: 'Delivery proof image could not be read.',
        errorCode: 'DELIVERY_PROOF_READ_ERROR',
      });
    }
  });

  stream.pipe(res);
});
