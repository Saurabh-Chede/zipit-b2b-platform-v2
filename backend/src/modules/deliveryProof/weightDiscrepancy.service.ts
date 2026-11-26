import crypto from 'crypto';
import {
  WeightDiscrepancy,
  WeightDiscrepancyStatus,
} from '../../models/WeightDiscrepancy.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { Transporter } from '../../models/Transporter.ts';
import {
  WalletPaymentMethod,
  WalletTransaction,
  WalletTransactionType,
} from '../../models/WalletTransaction.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import { fileStorage } from '../../config/storage.ts';
import { runInTransaction } from '../../config/database.ts';
import { AppError } from '../../utils/AppError.ts';
import { BookingStatus, UserRole } from '../../utils/constants.ts';
import { verifyImageMagicBytes } from '../../utils/imageValidation.ts';
import { calculateFreightBreakdown } from '../pricing/pricing.engine.ts';
import { assertBookingAccess } from '../bookings/bookings.service.ts';
import {
  createAndPushNotification,
  notifyAllAdmins,
} from '../notifications/notifications.service.ts';

function generateDiscrepancyId(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ZPT-WD-${ymd}-${rand}`;
}

function generateTxnId(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ZPT-TXN-${ymd}-${rand}`;
}

export interface ReportWeightDiscrepancyInput {
  reportedActualWeightKg: number;
  reportedLengthCm?: number;
  reportedWidthCm?: number;
  reportedHeightCm?: number;
  remarks?: string;
}

export async function reportWeightDiscrepancy(
  bookingId: string,
  userId: string,
  role: UserRole,
  file: Express.Multer.File | undefined,
  input: ReportWeightDiscrepancyInput
) {
  if (role !== UserRole.TRANSPORTER) {
    throw new AppError(
      'Only the assigned transporter can report a weight discrepancy.',
      403,
      'TRANSPORTER_ROLE_REQUIRED'
    );
  }

  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new AppError(
      'Scale proof photo is required when reporting a weight discrepancy.',
      400,
      'SCALE_IMAGE_REQUIRED'
    );
  }

  verifyImageMagicBytes(file.buffer, file.mimetype, 'weight scale proof image');

  const booking = await assertBookingAccess(bookingId, userId, role);

  if (booking.bookingSource === 'TRANSPORTER_SELF' || !booking.sellerId) {
    throw new AppError(
      'Weight discrepancies apply only to platform seller bookings, not transporter personal bookings.',
      400,
      'WEIGHT_DISCREPANCY_NOT_APPLICABLE'
    );
  }

  const allowedStatuses = new Set([
    BookingStatus.ACCEPTED,
    BookingStatus.DISPATCHED,
    BookingStatus.ARRIVED,
    BookingStatus.NDR,
  ]);
  if (!allowedStatuses.has(booking.status)) {
    throw new AppError(
      `Weight discrepancy can only be reported during active transit (ACCEPTED, DISPATCHED, ARRIVED, or NDR). Current status: ${booking.status}.`,
      400,
      'INVALID_BOOKING_STATUS_FOR_DISCREPANCY'
    );
  }

  const existing = await WeightDiscrepancy.findOne({ bookingId: booking._id }).lean();
  if (existing) {
    throw new AppError(
      'A weight discrepancy record already exists for this booking.',
      409,
      'WEIGHT_DISCREPANCY_EXISTS'
    );
  }

  const lengthCm = input.reportedLengthCm ?? booking.parcel.lengthCm;
  const widthCm = input.reportedWidthCm ?? booking.parcel.widthCm;
  const heightCm = input.reportedHeightCm ?? booking.parcel.heightCm;

  const revisedBreakdown = calculateFreightBreakdown(
    {
      actualWeightKg: input.reportedActualWeightKg,
      lengthCm,
      widthCm,
      heightCm,
    },
    {
      minimumFreight: booking.pricingSnapshot.minimumFreight,
      ratePerKg: booking.pricingSnapshot.ratePerKg,
      volumetricDivisor: booking.pricingSnapshot.volumetricDivisor,
      rtoCharges: booking.pricingSnapshot.rtoCharges,
      additionalCharges: booking.pricingSnapshot.additionalCharges,
      gstApplicable: booking.pricingSnapshot.gstApplicable,
      gstRatePercent: booking.pricingSnapshot.gstRatePercent,
    }
  );

  const additionalDifferenceAmount =
    Math.round((revisedBreakdown.finalAmount - booking.finalAmount) * 100) / 100;

  if (
    revisedBreakdown.chargeableWeightKg <= booking.chargeableWeight ||
    additionalDifferenceAmount <= 0
  ) {
    throw new AppError(
      `Reported chargeable weight (${revisedBreakdown.chargeableWeightKg.toFixed(
        2
      )} kg) must exceed declared chargeable weight (${booking.chargeableWeight.toFixed(
        2
      )} kg) and increase freight tariff.`,
      400,
      'NO_WEIGHT_INCREASE'
    );
  }

  const stored = await fileStorage.saveFile(file.buffer, file.originalname, file.mimetype);

  try {
    const record = await WeightDiscrepancy.create({
      discrepancyId: generateDiscrepancyId(),
      bookingId: booking._id,
      lrNumber: booking.lrNumber,
      sellerId: booking.sellerId,
      transporterId: booking.transporterId,
      declaredActualWeightKg: booking.actualWeight,
      declaredVolumetricWeightKg: booking.volumetricWeight,
      declaredChargeableWeightKg: booking.chargeableWeight,
      declaredFinalAmount: booking.finalAmount,
      reportedActualWeightKg: input.reportedActualWeightKg,
      reportedLengthCm: input.reportedLengthCm,
      reportedWidthCm: input.reportedWidthCm,
      reportedHeightCm: input.reportedHeightCm,
      reportedVolumetricWeightKg: revisedBreakdown.volumetricWeightKg,
      reportedChargeableWeightKg: revisedBreakdown.chargeableWeightKg,
      revisedFinalAmount: revisedBreakdown.finalAmount,
      additionalDifferenceAmount,
      scaleImageFileName: stored.fileName,
      scaleImageStorageKey: stored.storageKey,
      scaleImageMimeType: stored.mimeType,
      scaleImageFileSizeBytes: stored.sizeBytes,
      transporterRemarks: input.remarks?.trim() || undefined,
      status: WeightDiscrepancyStatus.OPEN,
      paymentBilledStatus: 'NONE',
      reportedByUserId: userId,
    });

    const seller = await SellerProfile.findById(booking.sellerId).select('userId businessName').lean();
    if (seller?.userId) {
      void createAndPushNotification({
        recipientUserId: seller.userId.toString(),
        recipientRole: UserRole.SELLER,
        category: NotificationCategory.SHIPMENT,
        title: `Weight Discrepancy Raised: ${booking.lrNumber}`,
        message: `Hub scale recorded ${revisedBreakdown.chargeableWeightKg.toFixed(
          2
        )} kg vs declared ${booking.chargeableWeight.toFixed(
          2
        )} kg (+INR ${additionalDifferenceAmount.toFixed(2)}). Please accept or dispute.`,
        link: `/seller/shipments/${booking._id.toString()}`,
        entityType: 'Booking',
        entityId: booking._id.toString(),
      });
    }

    void notifyAllAdmins({
      category: NotificationCategory.SHIPMENT,
      title: `Weight Discrepancy: ${booking.lrNumber}`,
      message: `Transporter flagged ${revisedBreakdown.chargeableWeightKg.toFixed(
        2
      )} kg vs ${booking.chargeableWeight.toFixed(2)} kg (+INR ${additionalDifferenceAmount.toFixed(2)}).`,
      link: `/admin/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });

    return record;
  } catch (err) {
    await fileStorage.deleteFile(stored.storageKey).catch(() => undefined);
    throw err;
  }
}

export async function getAuthorizedWeightDiscrepancyImageStream(
  bookingId: string,
  userId: string,
  role: UserRole
) {
  await assertBookingAccess(bookingId, userId, role);

  const discrepancy = await WeightDiscrepancy.findOne({ bookingId }).lean();
  if (!discrepancy) {
    throw new AppError('Weight discrepancy record not found.', 404, 'WEIGHT_DISCREPANCY_NOT_FOUND');
  }

  const exists = await fileStorage.exists(discrepancy.scaleImageStorageKey);
  if (!exists) {
    throw new AppError('Weight scale proof image missing on storage.', 404, 'SCALE_IMAGE_NOT_FOUND');
  }

  const stream = await fileStorage.getFileReadStream(discrepancy.scaleImageStorageKey);
  return {
    stream,
    mimeType: discrepancy.scaleImageMimeType,
    fileName: discrepancy.scaleImageFileName,
  };
}

export async function respondToWeightDiscrepancy(
  bookingId: string,
  userId: string,
  role: UserRole,
  input: { action: 'ACCEPT' | 'DISPUTE'; reason?: string }
) {
  if (role !== UserRole.SELLER) {
    throw new AppError(
      'Only the owning seller can accept or dispute a weight discrepancy.',
      403,
      'SELLER_ROLE_REQUIRED'
    );
  }

  const booking = await assertBookingAccess(bookingId, userId, role);
  const discrepancy = await WeightDiscrepancy.findOne({ bookingId: booking._id });
  if (!discrepancy) {
    throw new AppError('No weight discrepancy found for this booking.', 404, 'WEIGHT_DISCREPANCY_NOT_FOUND');
  }

  if (discrepancy.status !== WeightDiscrepancyStatus.OPEN) {
    throw new AppError(
      `Cannot respond to a weight discrepancy in ${discrepancy.status} state.`,
      400,
      'DISCREPANCY_NOT_OPEN'
    );
  }

  if (input.action === 'DISPUTE') {
    const cleanReason = input.reason?.trim() || '';
    if (cleanReason.length < 5) {
      throw new AppError(
        'Please provide a clear dispute reason (at least 5 characters).',
        400,
        'DISPUTE_REASON_REQUIRED'
      );
    }

    discrepancy.status = WeightDiscrepancyStatus.DISPUTED;
    discrepancy.sellerDisputeReason = cleanReason;
    discrepancy.sellerRespondedAt = new Date();
    await discrepancy.save();

    const transporter = await Transporter.findById(booking.transporterId).select('userId').lean();
    if (transporter?.userId) {
      void createAndPushNotification({
        recipientUserId: transporter.userId.toString(),
        recipientRole: UserRole.TRANSPORTER,
        category: NotificationCategory.SHIPMENT,
        title: `Weight Discrepancy Disputed: ${booking.lrNumber}`,
        message: `Seller disputed the re-weigh claim: "${cleanReason}". Escalated for admin review.`,
        link: `/transporter/bookings/${booking._id.toString()}`,
        entityType: 'Booking',
        entityId: booking._id.toString(),
      });
    }

    void notifyAllAdmins({
      category: NotificationCategory.SHIPMENT,
      title: `Weight Dispute Escalated: ${booking.lrNumber}`,
      message: `Seller disputed +INR ${discrepancy.additionalDifferenceAmount.toFixed(
        2
      )} weight claim (${cleanReason}). Review scale photo & resolve.`,
      link: `/admin/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });

    return discrepancy;
  }

  // ACCEPT
  const diff = discrepancy.additionalDifferenceAmount;
  const updated = await runInTransaction(async (session) => {
    let debited = 0;

    const sellerObjectId = booking.sellerId;
    if (booking.paymentMode === 'WALLET' && sellerObjectId) {
      const debitedSeller = await SellerProfile.findOneAndUpdate(
        { _id: sellerObjectId, walletBalance: { $gte: diff } },
        { $inc: { walletBalance: -diff } },
        { returnDocument: 'after', ...(session ? { session } : {}) }
      ).lean();

      if (!debitedSeller) {
        throw new AppError(
          `Insufficient wallet balance to cover INR ${diff.toFixed(
            2
          )} weight difference. Please recharge your wallet first.`,
          400,
          'INSUFFICIENT_WALLET_BALANCE'
        );
      }

      debited = diff;

      try {
        await WalletTransaction.create(
          [
            {
              transactionId: generateTxnId(),
              sellerId: sellerObjectId,
              userId: debitedSeller.userId,
              type: WalletTransactionType.DEBIT,
              amount: diff,
              balanceAfter: Number(debitedSeller.walletBalance || 0),
              paymentMethod: WalletPaymentMethod.WEIGHT_DISCREPANCY,
              referenceNote: discrepancy.discrepancyId,
              description: `Weight discrepancy charge accepted for ${booking.lrNumber}`,
              bookingId: booking._id,
              lrNumber: booking.lrNumber,
            },
          ],
          session ? { session } : undefined
        );
      } catch (err) {
        if (!session && debited > 0) {
          await SellerProfile.updateOne(
            { _id: sellerObjectId },
            { $inc: { walletBalance: debited } }
          ).catch(() => {});
        }
        throw err;
      }

      discrepancy.paymentBilledStatus = 'WALLET_DEBITED';
    } else {
      discrepancy.paymentBilledStatus = 'INVOICE_BILLED';
    }

    discrepancy.status = WeightDiscrepancyStatus.ACCEPTED;
    discrepancy.sellerRespondedAt = new Date();
    await discrepancy.save(session ? { session } : undefined);
    return discrepancy;
  });

  const transporter = await Transporter.findById(booking.transporterId).select('userId').lean();
  if (transporter?.userId) {
    void createAndPushNotification({
      recipientUserId: transporter.userId.toString(),
      recipientRole: UserRole.TRANSPORTER,
      category: NotificationCategory.SHIPMENT,
      title: `Weight Discrepancy Accepted: ${booking.lrNumber}`,
      message: `Seller accepted the +INR ${diff.toFixed(2)} weight adjustment (${updated.paymentBilledStatus}).`,
      link: `/transporter/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });
  }

  return updated;
}

export async function resolveWeightDiscrepancyByAdmin(
  bookingId: string,
  userId: string,
  role: UserRole,
  input: { decision: 'CHARGE_SELLER' | 'WAIVE'; notes: string }
) {
  if (role !== UserRole.ADMIN) {
    throw new AppError('Only admins can resolve weight discrepancy disputes.', 403, 'FORBIDDEN_ROLE');
  }

  const booking = await assertBookingAccess(bookingId, userId, role);
  const discrepancy = await WeightDiscrepancy.findOne({ bookingId: booking._id });
  if (!discrepancy) {
    throw new AppError('Weight discrepancy not found.', 404, 'WEIGHT_DISCREPANCY_NOT_FOUND');
  }

  if (
    discrepancy.status !== WeightDiscrepancyStatus.OPEN &&
    discrepancy.status !== WeightDiscrepancyStatus.DISPUTED
  ) {
    throw new AppError(
      `Discrepancy has already been finalized (${discrepancy.status}).`,
      400,
      'DISCREPANCY_ALREADY_RESOLVED'
    );
  }

  const cleanNotes = input.notes.trim();
  const diff = discrepancy.additionalDifferenceAmount;

  const resolved = await runInTransaction(async (session) => {
    if (input.decision === 'WAIVE') {
      discrepancy.status = WeightDiscrepancyStatus.RESOLVED_WAIVED;
      discrepancy.paymentBilledStatus = 'WAIVED';
    } else {
      const sellerObjectId = booking.sellerId;
      if (booking.paymentMode === 'WALLET' && sellerObjectId) {
        const debitedSeller = await SellerProfile.findOneAndUpdate(
          { _id: sellerObjectId, walletBalance: { $gte: diff } },
          { $inc: { walletBalance: -diff } },
          { returnDocument: 'after', ...(session ? { session } : {}) }
        ).lean();

        if (debitedSeller) {
          await WalletTransaction.create(
            [
              {
                transactionId: generateTxnId(),
                sellerId: sellerObjectId,
                userId: debitedSeller.userId,
                type: WalletTransactionType.DEBIT,
                amount: diff,
                balanceAfter: Number(debitedSeller.walletBalance || 0),
                paymentMethod: WalletPaymentMethod.WEIGHT_DISCREPANCY,
                referenceNote: discrepancy.discrepancyId,
                description: `Admin-resolved weight discrepancy charge for ${booking.lrNumber}`,
                bookingId: booking._id,
                lrNumber: booking.lrNumber,
              },
            ],
            session ? { session } : undefined
          );
          discrepancy.paymentBilledStatus = 'WALLET_DEBITED';
        } else {
          discrepancy.paymentBilledStatus = 'INVOICE_PENDING';
        }
      } else {
        discrepancy.paymentBilledStatus = 'INVOICE_BILLED';
      }
      discrepancy.status = WeightDiscrepancyStatus.RESOLVED_CHARGED;
    }

    discrepancy.adminResolutionNotes = cleanNotes;
    discrepancy.resolvedByUserId = userId as unknown as typeof discrepancy.resolvedByUserId;
    discrepancy.resolvedAt = new Date();
    await discrepancy.save(session ? { session } : undefined);
    return discrepancy;
  });

  const [seller, transporter] = await Promise.all([
    SellerProfile.findById(booking.sellerId).select('userId').lean(),
    Transporter.findById(booking.transporterId).select('userId').lean(),
  ]);

  const summaryMsg =
    input.decision === 'WAIVE'
      ? `Admin waived the +INR ${diff.toFixed(2)} weight claim on ${booking.lrNumber}. Note: ${cleanNotes}`
      : `Admin approved +INR ${diff.toFixed(2)} charge on ${booking.lrNumber} (${resolved.paymentBilledStatus}). Note: ${cleanNotes}`;

  if (seller?.userId) {
    void createAndPushNotification({
      recipientUserId: seller.userId.toString(),
      recipientRole: UserRole.SELLER,
      category:
        resolved.paymentBilledStatus === 'WALLET_DEBITED'
          ? NotificationCategory.WALLET
          : NotificationCategory.SHIPMENT,
      title: `Weight Dispute Resolved: ${booking.lrNumber}`,
      message: summaryMsg,
      link: `/seller/shipments/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });
  }

  if (transporter?.userId) {
    void createAndPushNotification({
      recipientUserId: transporter.userId.toString(),
      recipientRole: UserRole.TRANSPORTER,
      category: NotificationCategory.SHIPMENT,
      title: `Weight Dispute Resolved: ${booking.lrNumber}`,
      message: summaryMsg,
      link: `/transporter/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });
  }

  return resolved;
}
