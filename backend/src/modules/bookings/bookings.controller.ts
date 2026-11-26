import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  calculateTransporterPersonalBooking,
  cancelBookingBySeller,
  createBooking,
  createBulkBookings,
  createTransporterPersonalBooking,
  generateBookingBarcodePng,
  generateBookingLrPdf,
  generateBookingTaxInvoicePdf,
  generateBulkLrPdf,
  generateCartonBarcodePng,
  getBookingDetails,
  listBookingsForUser,
  previewBulkBookings,
  resolveNdrBySeller,
  scanBookingCarton,
  scanCartonByBarcode,
  updateBookingStatus,
} from './bookings.service.ts';
import { UserRole } from '../../utils/constants.ts';
import { logger } from '../../config/logger.ts';

export const createBookingController = asyncHandler(async (req: Request, res: Response) => {
  const headerKey =
    typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;

  const { booking, idempotentReplay } = await createBooking(req.user!.id, req.body, headerKey);

  logger.info({
    requestId: req.requestId,
    module: 'bookings',
    action: idempotentReplay ? 'booking_idempotent_replay' : 'booking_created',
    meta: { lrNumber: booking?.lrNumber, bookingId: booking?.bookingId },
  });

  res.status(idempotentReplay ? 200 : 201).json({
    success: true,
    message: idempotentReplay
      ? 'Existing booking returned for idempotent request.'
      : 'Shipment booked and LR generated successfully.',
    idempotentReplay,
    data: booking,
  });
});

export const listBookingsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listBookingsForUser(
    req.user!.id,
    req.user!.role,
    req.query as Record<string, unknown>
  );
  res.status(200).json({ success: true, data });
});

export const listTransporterBookingsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listBookingsForUser(
    req.user!.id,
    UserRole.TRANSPORTER,
    req.query as Record<string, unknown>
  );
  res.status(200).json({ success: true, data });
});

export const calculateTransporterBookingController = asyncHandler(async (req: Request, res: Response) => {
  const data = await calculateTransporterPersonalBooking(req.user!.id, req.body);
  res.status(200).json({ success: true, data });
});

export const createTransporterPersonalBookingController = asyncHandler(async (req: Request, res: Response) => {
  const headerKey =
    typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;

  const { booking, idempotentReplay } = await createTransporterPersonalBooking(
    req.user!.id,
    req.body,
    headerKey
  );

  logger.info({
    requestId: req.requestId,
    module: 'bookings',
    action: idempotentReplay ? 'transporter_booking_idempotent_replay' : 'transporter_booking_created',
    meta: { lrNumber: booking?.lrNumber, bookingId: booking?.bookingId },
  });

  res.status(idempotentReplay ? 200 : 201).json({
    success: true,
    message: idempotentReplay
      ? 'Existing personal booking returned for idempotent request.'
      : 'Personal shipment booked and LR generated successfully.',
    idempotentReplay,
    data: booking,
  });
});

export const getBookingDetailsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getBookingDetails(req.params.id, req.user!.id, req.user!.role);
  res.status(200).json({ success: true, data });
});

export const downloadLrPdfController = asyncHandler(async (req: Request, res: Response) => {
  const { lrNumber, pdfBuffer } = await generateBookingLrPdf(req.params.id, req.user!.id, req.user!.role);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${lrNumber}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});

export const downloadTaxInvoicePdfController = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceNumber, pdfBuffer } = await generateBookingTaxInvoicePdf(
    req.params.id,
    req.user!.id,
    req.user!.role
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoiceNumber}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});

export const previewBulkBookingsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await previewBulkBookings(req.user!.id, req.body.rows, req.body.paymentMode);
  res.status(200).json({
    success: true,
    data: result,
  });
});

export const createBulkBookingsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await createBulkBookings(req.user!.id, req.body.rows, req.body.paymentMode);
  logger.info({
    requestId: req.requestId,
    module: 'bookings',
    action: 'bulk_bookings_created',
    meta: { batchId: result.batchId, createdCount: result.createdCount },
  });
  res.status(201).json({
    success: true,
    message: `${result.createdCount} shipment(s) booked in batch ${result.batchId}.`,
    data: result,
  });
});

export const downloadBulkLrPdfController = asyncHandler(async (req: Request, res: Response) => {
  const { count, pdfBuffer } = await generateBulkLrPdf(
    req.body.bookingIds,
    req.user!.id,
    req.user!.role
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ZIPIT-LR-BUNDLE-${count}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});

export const downloadBarcodeController = asyncHandler(async (req: Request, res: Response) => {
  const { lrNumber, barcodeBuffer } = await generateBookingBarcodePng(
    req.params.id,
    req.user!.id,
    req.user!.role
  );
  const isDownload = req.query.download === '1' || req.query.download === 'true';

  res.setHeader('Content-Type', 'image/png');
  res.setHeader(
    'Content-Disposition',
    `${isDownload ? 'attachment' : 'inline'}; filename="${lrNumber}-barcode.png"`
  );
  res.setHeader('Content-Length', barcodeBuffer.length);
  res.send(barcodeBuffer);
});

export const updateBookingStatusController = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateBookingStatus(req.params.id, req.user!.id, req.user!.role, req.body);
  logger.info({
    requestId: req.requestId,
    module: 'bookings',
    action: 'booking_status_updated',
    meta: { bookingId: req.params.id, status: req.body.status },
  });
  res.status(200).json({
    success: true,
    message: `Shipment status updated to ${req.body.status}.`,
    data: result,
  });
});

export const cancelBookingController = asyncHandler(async (req: Request, res: Response) => {
  const result = await cancelBookingBySeller(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.body.reason
  );
  res.status(200).json({
    success: true,
    message:
      result.refundedAmount > 0
        ? `Booking cancelled and INR ${result.refundedAmount.toFixed(2)} refunded to wallet.`
        : 'Booking cancelled successfully.',
    data: result,
  });
});

export const resolveNdrController = asyncHandler(async (req: Request, res: Response) => {
  const result = await resolveNdrBySeller(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.body
  );
  res.status(200).json({
    success: true,
    message:
      req.body.action === 'INITIATE_RTO'
        ? 'Return to Origin (RTO) initiated for this shipment.'
        : 'Delivery re-attempt instructions sent to the transporter.',
    data: result,
  });
});

export const downloadCartonBarcodeController = asyncHandler(async (req: Request, res: Response) => {
  const { cartonCode, barcodeBuffer } = await generateCartonBarcodePng(
    req.params.id,
    Number(req.params.cartonNumber),
    req.user!.id,
    req.user!.role
  );
  const isDownload = req.query.download === '1' || req.query.download === 'true';

  res.setHeader('Content-Type', 'image/png');
  res.setHeader(
    'Content-Disposition',
    `${isDownload ? 'attachment' : 'inline'}; filename="${cartonCode}-barcode.png"`
  );
  res.setHeader('Content-Length', barcodeBuffer.length);
  res.send(barcodeBuffer);
});

export const scanBookingCartonController = asyncHandler(async (req: Request, res: Response) => {
  const result = await scanBookingCarton(
    req.params.id,
    req.user!.id,
    req.user!.role,
    req.body
  );
  res.status(200).json({
    success: true,
    message: result.alreadyScanned
      ? `Carton ${result.scannedCarton.cartonCode} was already scanned.`
      : `Carton ${result.scannedCarton.cartonCode} scanned (${result.scannedCount}/${result.totalCartons}).`,
    data: result,
  });
});

export const scanGlobalCartonController = asyncHandler(async (req: Request, res: Response) => {
  const result = await scanCartonByBarcode(
    req.user!.id,
    req.user!.role,
    req.body.cartonCode,
    req.body.location
  );
  res.status(200).json({
    success: true,
    message: result.alreadyScanned
      ? `Carton ${result.scannedCarton.cartonCode} was already scanned.`
      : `Carton ${result.scannedCarton.cartonCode} scanned (${result.scannedCount}/${result.totalCartons}).`,
    data: result,
  });
});
