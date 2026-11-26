import { DeliveryProof } from '../../models/DeliveryProof.ts';
import { TrackingEvent } from '../../models/TrackingEvent.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import { fileStorage } from '../../config/storage.ts';
import { runInTransaction } from '../../config/database.ts';
import { AppError } from '../../utils/AppError.ts';
import {
  BookingStatus,
  STATUS_DESCRIPTIONS,
  UserRole,
  WhatsAppEventType,
} from '../../utils/constants.ts';
import { assertBookingAccess } from '../bookings/bookings.service.ts';
import {
  createAndPushNotification,
  notifyAllAdmins,
} from '../notifications/notifications.service.ts';
import { dispatchBookingNotificationEvent } from '../whatsapp/whatsapp.service.ts';
import { verifyImageMagicBytes } from '../../utils/imageValidation.ts';
import type { UploadDeliveryProofInput } from './deliveryProof.validator.ts';

export async function uploadDeliveryProof(
  bookingId: string,
  userId: string,
  role: UserRole,
  file: Express.Multer.File | undefined,
  input: UploadDeliveryProofInput
) {
  if (role !== UserRole.TRANSPORTER) {
    throw new AppError('Only the assigned transporter can upload delivery proof.', 403, 'TRANSPORTER_ROLE_REQUIRED');
  }

  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppError('Delivery proof image file is required.', 400, 'DELIVERY_IMAGE_REQUIRED');
  }

  verifyImageMagicBytes(file.buffer, file.mimetype, 'delivery proof');

  const booking = await assertBookingAccess(bookingId, userId, role);

  if (
    booking.status !== BookingStatus.ARRIVED &&
    booking.status !== BookingStatus.OUT_FOR_DELIVERY &&
    booking.status !== BookingStatus.NDR &&
    booking.status !== BookingStatus.DELIVERED
  ) {
    throw new AppError(
      `Delivery proof can only be uploaded after the shipment has arrived, entered NDR re-attempt, or been delivered (current status: ${booking.status}).`,
      400,
      'INVALID_BOOKING_STATUS_FOR_POD'
    );
  }

  const existingProof = await DeliveryProof.findOne({ bookingId: booking._id }).lean();
  if (existingProof) {
    throw new AppError('Delivery proof has already been uploaded for this booking.', 409, 'DELIVERY_PROOF_EXISTS');
  }

  const stored = await fileStorage.saveFile(file.buffer, file.originalname, file.mimetype);

  try {
    let deliveredTrackingEventId: string | null = null;
    const proof = await runInTransaction(async (session) => {
      const [createdProof] = await DeliveryProof.create(
        [
          {
            bookingId: booking._id,
            lrNumber: booking.lrNumber,
            transporterId: booking.transporterId,
            imageFileName: stored.fileName,
            imageStorageKey: stored.storageKey,
            mimeType: stored.mimeType,
            fileSizeBytes: stored.sizeBytes,
            receiverName: input.receiverName,
            deliveryDate: input.deliveryDate,
            remarks: input.remarks,
            uploadedBy: userId,
          },
        ],
        session ? { session } : undefined
      );

      if (
        input.markDelivered &&
        (booking.status === BookingStatus.ARRIVED ||
          booking.status === BookingStatus.OUT_FOR_DELIVERY ||
          booking.status === BookingStatus.NDR)
      ) {
        booking.status = BookingStatus.DELIVERED;
        await booking.save(session ? { session } : undefined);

        const [deliveredEvent] = await TrackingEvent.create(
          [
            {
              bookingId: booking._id,
              lrNumber: booking.lrNumber,
              status: BookingStatus.DELIVERED,
              location: `${booking.destination.city} (${booking.destination.pincode})`,
              description: STATUS_DESCRIPTIONS[BookingStatus.DELIVERED],
              remarks: `Delivered to ${input.receiverName}. ${input.remarks || ''}`.trim(),
              actorUserId: userId,
              actorRole: role,
              eventTimestamp: new Date(),
            },
          ],
          session ? { session } : undefined
        );
        deliveredTrackingEventId = deliveredEvent?._id?.toString() ?? null;
      }

      return createdProof;
    });

    const seller = booking.sellerId
      ? await SellerProfile.findById(booking.sellerId).select('userId').lean()
      : null;
    if (seller?.userId) {
      void createAndPushNotification({
        recipientUserId: seller.userId.toString(),
        recipientRole: UserRole.SELLER,
        category: NotificationCategory.SHIPMENT,
        title: `Proof of Delivery Uploaded: ${booking.lrNumber}`,
        message: `Signed POD received by ${input.receiverName}${input.markDelivered ? ' (Marked Delivered)' : ''}.`,
        link: `/seller/shipments/${booking._id.toString()}`,
        entityType: 'Booking',
        entityId: booking._id.toString(),
      });
    }

    void notifyAllAdmins({
      category: NotificationCategory.SHIPMENT,
      title: `POD Uploaded: ${booking.lrNumber}`,
      message: `Delivery proof uploaded for ${booking.lrNumber} (Receiver: ${input.receiverName}).`,
      link: `/admin/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });

    if (deliveredTrackingEventId) {
      void dispatchBookingNotificationEvent({
        booking,
        eventType: WhatsAppEventType.DELIVERED,
        latestUpdate: `Delivered to ${input.receiverName} at ${booking.destination.city} (${booking.destination.pincode}).`,
        sourceEventKey: `event:${deliveredTrackingEventId}`,
      });
    }

    return proof;
  } catch (err) {
    await fileStorage.deleteFile(stored.storageKey).catch(() => undefined);
    throw err;
  }
}

export async function getAuthorizedDeliveryProofStream(bookingId: string, userId: string, role: UserRole) {
  await assertBookingAccess(bookingId, userId, role);

  const proof = await DeliveryProof.findOne({ bookingId }).lean();
  if (!proof) {
    throw new AppError('Delivery proof not found for this booking.', 404, 'DELIVERY_PROOF_NOT_FOUND');
  }

  const exists = await fileStorage.exists(proof.imageStorageKey);
  if (!exists) {
    throw new AppError('Delivery proof image file is missing on storage.', 404, 'DELIVERY_PROOF_FILE_NOT_FOUND');
  }

  const stream = await fileStorage.getFileReadStream(proof.imageStorageKey);
  return {
    stream,
    mimeType: proof.mimeType,
    fileName: proof.imageFileName,
  };
}
