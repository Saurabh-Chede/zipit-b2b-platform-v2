import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import type { KycDocumentType, KycEntityType } from '../../utils/constants.ts';
import {
  getAuthorizedKycDocumentStream,
  getMyKycProfile,
  listAdminKycQueue,
  reviewKycApplication,
  updateMyKycDetails,
  uploadMyKycDocument,
} from './kyc.service.ts';

export const getMyKycController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getMyKycProfile(req.user!.id, req.user!.role);
  res.status(200).json({ success: true, data });
});

export const updateMyKycController = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateMyKycDetails(req.user!.id, req.user!.role, req.body);
  res.status(200).json({
    success: true,
    message: 'KYC details submitted for verification.',
    data,
  });
});

export const uploadMyKycDocController = asyncHandler(async (req: Request, res: Response) => {
  const data = await uploadMyKycDocument(
    req.user!.id,
    req.user!.role,
    req.body.docType as KycDocumentType,
    req.file
  );
  res.status(201).json({
    success: true,
    message: 'KYC document uploaded successfully.',
    data,
  });
});

export const listKycQueueController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listAdminKycQueue(req.query);
  res.status(200).json({ success: true, data });
});

export const reviewKycController = asyncHandler(async (req: Request, res: Response) => {
  const data = await reviewKycApplication(
    req.params.entityType as KycEntityType,
    req.params.profileId,
    req.user!.id,
    req.body
  );
  res.status(200).json({
    success: true,
    message: `KYC status updated to ${data.kyc.status}.`,
    data,
  });
});

export const streamKycDocController = asyncHandler(async (req: Request, res: Response) => {
  const { stream, mimeType, fileName } = await getAuthorizedKycDocumentStream(
    req.params.entityType as KycEntityType,
    req.params.profileId,
    req.params.docType as KycDocumentType,
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
        message: 'KYC document file could not be read.',
        errorCode: 'KYC_DOC_READ_ERROR',
      });
    }
  });

  stream.pipe(res);
});
