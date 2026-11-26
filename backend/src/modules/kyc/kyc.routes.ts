import { Router } from 'express';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles } from '../../middleware/rbac.ts';
import { kycDocumentUpload } from '../../middleware/upload.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { UserRole } from '../../utils/constants.ts';
import {
  getMyKycController,
  listKycQueueController,
  reviewKycController,
  streamKycDocController,
  updateMyKycController,
  uploadMyKycDocController,
} from './kyc.controller.ts';
import {
  kycDocParamSchema,
  kycReviewBodySchema,
  kycReviewParamSchema,
  listKycQueueQuerySchema,
  updateKycDetailsSchema,
  uploadKycDocBodySchema,
} from './kyc.validator.ts';

const kycRouter = Router();

kycRouter.use(authenticate);

// Seller & Transporter self-service KYC endpoints
kycRouter.get(
  '/me',
  authorizeRoles(UserRole.SELLER, UserRole.TRANSPORTER),
  getMyKycController
);

kycRouter.put(
  '/me',
  authorizeRoles(UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ body: updateKycDetailsSchema }),
  updateMyKycController
);

kycRouter.post(
  '/me/documents',
  authorizeRoles(UserRole.SELLER, UserRole.TRANSPORTER),
  kycDocumentUpload.single('document'),
  validateRequest({ body: uploadKycDocBodySchema }),
  uploadMyKycDocController
);

// Admin KYC compliance queue & decision endpoints
kycRouter.get(
  '/queue',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ query: listKycQueueQuerySchema }),
  listKycQueueController
);

kycRouter.patch(
  '/:entityType/:profileId/review',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: kycReviewParamSchema, body: kycReviewBodySchema }),
  reviewKycController
);

// Authorized private document streaming (Admin or owning Seller/Transporter verified in service)
kycRouter.get(
  '/:entityType/:profileId/documents/:docType',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: kycDocParamSchema }),
  streamKycDocController
);

export { kycRouter };
