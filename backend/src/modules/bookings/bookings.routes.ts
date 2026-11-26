import { Router } from 'express';
import {
  cancelBookingController,
  createBookingController,
  createBulkBookingsController,
  downloadBarcodeController,
  downloadBulkLrPdfController,
  downloadCartonBarcodeController,
  downloadLrPdfController,
  downloadTaxInvoicePdfController,
  getBookingDetailsController,
  listBookingsController,
  previewBulkBookingsController,
  resolveNdrController,
  scanBookingCartonController,
  updateBookingStatusController,
} from './bookings.controller.ts';
import {
  getDeliveryProofImageController,
  uploadDeliveryProofController,
} from '../deliveryProof/deliveryProof.controller.ts';
import {
  getWeightDiscrepancyImageController,
  reportWeightDiscrepancyController,
  resolveWeightDiscrepancyController,
  respondWeightDiscrepancyController,
} from '../deliveryProof/weightDiscrepancy.controller.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorizeRoles, requireApprovedSeller } from '../../middleware/rbac.ts';
import { validateRequest } from '../../middleware/validate.ts';
import { deliveryProofUpload } from '../../middleware/upload.ts';
import {
  bookingIdParamSchema,
  bulkBookingRequestSchema,
  bulkLrSchema,
  cancelBookingSchema,
  cartonBarcodeParamSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  ndrActionSchema,
  resolveWeightDiscrepancySchema,
  respondWeightDiscrepancySchema,
  scanCartonSchema,
  updateBookingStatusSchema,
} from './bookings.validator.ts';
import { UserRole } from '../../utils/constants.ts';

const bookingsRouter = Router();

bookingsRouter.use(authenticate);

bookingsRouter.post(
  '/bulk/preview',
  authorizeRoles(UserRole.SELLER),
  requireApprovedSeller,
  validateRequest({ body: bulkBookingRequestSchema }),
  previewBulkBookingsController
);

bookingsRouter.post(
  '/bulk',
  authorizeRoles(UserRole.SELLER),
  requireApprovedSeller,
  validateRequest({ body: bulkBookingRequestSchema }),
  createBulkBookingsController
);

bookingsRouter.post(
  '/bulk-lr',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ body: bulkLrSchema }),
  downloadBulkLrPdfController
);

bookingsRouter.post(
  '/',
  authorizeRoles(UserRole.SELLER),
  requireApprovedSeller,
  validateRequest({ body: createBookingSchema }),
  createBookingController
);

bookingsRouter.get(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ query: listBookingsQuerySchema }),
  listBookingsController
);

bookingsRouter.get(
  '/:id',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  getBookingDetailsController
);

bookingsRouter.get(
  '/:id/lr',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  downloadLrPdfController
);

bookingsRouter.get(
  '/:id/tax-invoice',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  downloadTaxInvoicePdfController
);

bookingsRouter.get(
  '/:id/barcode',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  downloadBarcodeController
);

bookingsRouter.get(
  '/:id/cartons/:cartonNumber/barcode',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: cartonBarcodeParamSchema }),
  downloadCartonBarcodeController
);

bookingsRouter.post(
  '/:id/cartons/scan',
  authorizeRoles(UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema, body: scanCartonSchema }),
  scanBookingCartonController
);

bookingsRouter.patch(
  '/:id/status',
  authorizeRoles(UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema, body: updateBookingStatusSchema }),
  updateBookingStatusController
);

bookingsRouter.post(
  '/:id/cancel',
  authorizeRoles(UserRole.SELLER),
  validateRequest({ params: bookingIdParamSchema, body: cancelBookingSchema }),
  cancelBookingController
);

bookingsRouter.post(
  '/:id/ndr-action',
  authorizeRoles(UserRole.SELLER),
  validateRequest({ params: bookingIdParamSchema, body: ndrActionSchema }),
  resolveNdrController
);

bookingsRouter.post(
  '/:id/delivery-proof',
  authorizeRoles(UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  deliveryProofUpload.single('image'),
  uploadDeliveryProofController
);

bookingsRouter.get(
  '/:id/delivery-proof/image',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  getDeliveryProofImageController
);

bookingsRouter.post(
  '/:id/weight-discrepancy',
  authorizeRoles(UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  deliveryProofUpload.single('image'),
  reportWeightDiscrepancyController
);

bookingsRouter.get(
  '/:id/weight-discrepancy/image',
  authorizeRoles(UserRole.ADMIN, UserRole.SELLER, UserRole.TRANSPORTER),
  validateRequest({ params: bookingIdParamSchema }),
  getWeightDiscrepancyImageController
);

bookingsRouter.post(
  '/:id/weight-discrepancy/respond',
  authorizeRoles(UserRole.SELLER),
  validateRequest({ params: bookingIdParamSchema, body: respondWeightDiscrepancySchema }),
  respondWeightDiscrepancyController
);

bookingsRouter.post(
  '/:id/weight-discrepancy/resolve',
  authorizeRoles(UserRole.ADMIN),
  validateRequest({ params: bookingIdParamSchema, body: resolveWeightDiscrepancySchema }),
  resolveWeightDiscrepancyController
);

export { bookingsRouter };
