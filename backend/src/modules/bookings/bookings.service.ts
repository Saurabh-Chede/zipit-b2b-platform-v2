import crypto from 'crypto';
import mongoose from 'mongoose';
import { Booking, type IBooking } from '../../models/Booking.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { Transporter } from '../../models/Transporter.ts';
import { TransportRoute } from '../../models/TransportRoute.ts';
import { TransportRate } from '../../models/TransportRate.ts';
import { TrackingEvent } from '../../models/TrackingEvent.ts';
import { DeliveryProof } from '../../models/DeliveryProof.ts';
import { WeightDiscrepancy } from '../../models/WeightDiscrepancy.ts';
import {
  WalletPaymentMethod,
  WalletTransaction,
  WalletTransactionType,
} from '../../models/WalletTransaction.ts';
import { runInTransaction } from '../../config/database.ts';
import { AppError } from '../../utils/AppError.ts';
import {
  ALLOWED_STATUS_TRANSITIONS,
  BookingStatus,
  EntityStatus,
  SellerApprovalStatus,
  TransporterApprovalStatus,
  STATUS_DESCRIPTIONS,
  UserRole,
  WHATSAPP_STATUS_TO_EVENT,
  WhatsAppEventType,
} from '../../utils/constants.ts';
import { buildPaginatedResponse, parsePagination } from '../../utils/pagination.ts';
import { escapeRegex } from '../../utils/sanitize.ts';
import { calculateFreightBreakdown } from '../pricing/pricing.engine.ts';
import { getApplicablePlatformChargeRule } from '../platformConfig/platformConfig.service.ts';
import {
  generateCombinedLrPdfBuffer,
  generateLrBarcodeBuffer,
  generateLrPdfBuffer,
} from '../documents/lrDocument.service.ts';
import {
  generateTaxInvoicePdfBuffer,
  resolveInvoiceNumber,
} from '../documents/taxInvoice.service.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import {
  createAndPushNotification,
  notifyAllAdmins,
} from '../notifications/notifications.service.ts';
import { dispatchBookingNotificationEvent } from '../whatsapp/whatsapp.service.ts';
import type { z } from 'zod';
import {
  bulkBookingRowSchema,
  calculateTransporterBookingSchema,
  createBookingSchema,
  createTransporterPersonalBookingSchema,
  updateBookingStatusSchema,
} from './bookings.validator.ts';

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CalculateTransporterBookingInput = z.infer<typeof calculateTransporterBookingSchema>;
export type CreateTransporterPersonalBookingInput = z.infer<typeof createTransporterPersonalBookingSchema>;
export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;

const inFlightIdem = new Map<string, Promise<unknown>>();
const inFlightFingerprint = new Map<string, Promise<unknown>>();

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildDuplicateFingerprint(
  sellerId: string,
  input: CreateBookingInput,
  finalAmount: number
): string {
  const canonical = [
    sellerId,
    input.routeId,
    input.transporterId,
    input.sender.phone.trim(),
    normalizeText(input.receiver.name),
    input.receiver.phone.trim(),
    input.receiver.pincode.trim(),
    normalizeText(input.parcel.description),
    Number(input.parcel.actualWeightKg).toFixed(2),
    Number(input.parcel.lengthCm).toFixed(2),
    Number(input.parcel.widthCm).toFixed(2),
    Number(input.parcel.heightCm).toFixed(2),
    String(input.parcel.numberOfPackages),
    finalAmount.toFixed(2),
  ].join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function generateUniqueRefs() {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const randHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  const lrSuffix = `${Date.now().toString().slice(-5)}${crypto.randomInt(100, 999)}`;
  return {
    bookingId: `ZPT-BK-${ymd}-${randHex}`,
    lrNumber: `ZIPIT-LR-${lrSuffix}`,
  };
}

export async function createBooking(
  userId: string,
  input: CreateBookingInput,
  headerIdempotencyKey?: string,
  options?: { skipDuplicateHeuristic?: boolean }
) {
  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }

  if (seller.approvalStatus !== SellerApprovalStatus.APPROVED) {
    throw new AppError(
      'Only approved sellers can create shipments.',
      403,
      'SELLER_NOT_APPROVED'
    );
  }

  let matchedPickupAddress: NonNullable<typeof seller.savedAddresses>[number] | null = null;
  if (input.pickupAddressId) {
    const foundAddr = (seller.savedAddresses || []).find(
      (addr) => addr._id.toString() === input.pickupAddressId
    );
    if (!foundAddr || (foundAddr.addressType !== 'PICKUP' && foundAddr.addressType !== 'BOTH')) {
      throw new AppError(
        'Selected pickup address was not found in your saved pickup addresses.',
        404,
        'PICKUP_ADDRESS_NOT_FOUND'
      );
    }
    matchedPickupAddress = foundAddr;
  }

  const normalizedSender = {
    name: (input.sender.companyName || input.sender.name).trim(),
    companyName: (input.sender.companyName || input.sender.name).trim(),
    contactPerson: (input.sender.contactPerson || input.sender.name).trim(),
    phone: input.sender.phone.trim(),
    address: input.sender.address.trim(),
    state: input.sender.state?.trim() || matchedPickupAddress?.state || undefined,
    city: input.sender.city.trim(),
    pincode: input.sender.pincode.trim(),
    gstin: input.sender.gstin?.trim().toUpperCase() || undefined,
  };

  const pickupAddressSnapshot = matchedPickupAddress
    ? {
        addressId: matchedPickupAddress._id,
        label: matchedPickupAddress.label,
        companyName: matchedPickupAddress.companyName || matchedPickupAddress.name,
        contactPerson: matchedPickupAddress.contactPerson || matchedPickupAddress.name,
        phone: matchedPickupAddress.phone,
        address: matchedPickupAddress.address,
        state: matchedPickupAddress.state,
        city: matchedPickupAddress.city,
        pincode: matchedPickupAddress.pincode,
        gstin: matchedPickupAddress.gstin,
        isPrimary: Boolean(matchedPickupAddress.isDefault),
      }
    : null;

  const effectiveIdempotencyKey = input.idempotencyKey || headerIdempotencyKey;
  const idemLockKey = effectiveIdempotencyKey
    ? `${seller._id.toString()}:${effectiveIdempotencyKey}`
    : null;

  if (effectiveIdempotencyKey) {
    if (idemLockKey && inFlightIdem.has(idemLockKey)) {
      try {
        await inFlightIdem.get(idemLockKey);
      } catch {
        // Primary attempt failed; allow retry to proceed below
      }
    }

    const existing = await Booking.findOne({
      sellerId: seller._id,
      idempotencyKey: effectiveIdempotencyKey,
    })
      .populate('transporterId', 'companyName contactPerson phone email')
      .lean();

    if (existing) {
      return { booking: existing, idempotentReplay: true };
    }
  }

  const [selectedRoute, transporter, rate, platformChargeRule] = await Promise.all([
    TransportRoute.findOne({ _id: input.routeId, isDeleted: { $ne: true } }).lean(),
    Transporter.findById(input.transporterId).lean(),
    TransportRate.findOne({ _id: input.rateId, isDeleted: { $ne: true } }).lean(),
    getApplicablePlatformChargeRule('PLATFORM'),
  ]);

  if (!selectedRoute || selectedRoute.status !== EntityStatus.ACTIVE) {
    throw new AppError('Selected transport route is unavailable or inactive.', 400, 'ROUTE_UNAVAILABLE');
  }

  if (
    !transporter ||
    transporter.status !== EntityStatus.ACTIVE ||
    (transporter.approvalStatus &&
      transporter.approvalStatus !== TransporterApprovalStatus.APPROVED)
  ) {
    throw new AppError('Selected transporter is unavailable or inactive.', 400, 'TRANSPORTER_UNAVAILABLE');
  }

  let route = selectedRoute;
  if (rate && rate.routeId.toString() !== selectedRoute._id.toString()) {
    const carrierRoute = await TransportRoute.findOne({
      _id: rate.routeId,
      isDeleted: { $ne: true },
      status: EntityStatus.ACTIVE,
      originPincode: selectedRoute.originPincode,
      destinationPincode: selectedRoute.destinationPincode,
    }).lean();
    if (carrierRoute) {
      route = carrierRoute;
    }
  }

  const now = new Date();
  if (
    !rate ||
    !rate.isActive ||
    rate.routeId.toString() !== route._id.toString() ||
    rate.transporterId.toString() !== transporter._id.toString() ||
    rate.effectiveFrom > now ||
    (rate.effectiveTo && rate.effectiveTo < now)
  ) {
    throw new AppError(
      'Selected rate is invalid, inactive, or does not match the chosen transporter and route.',
      400,
      'INVALID_OR_EXPIRED_RATE'
    );
  }

  // Always compute pricing strictly on the backend
  const breakdown = calculateFreightBreakdown(
    {
      actualWeightKg: input.parcel.actualWeightKg,
      lengthCm: input.parcel.lengthCm,
      widthCm: input.parcel.widthCm,
      heightCm: input.parcel.heightCm,
    },
    {
      minimumFreight: rate.minimumFreight,
      ratePerKg: rate.ratePerKg,
      volumetricDivisor: rate.volumetricDivisor,
      rtoCharges: rate.rtoCharges,
      additionalCharges: rate.additionalCharges,
      gstApplicable: rate.gstApplicable,
      gstRatePercent: rate.gstRatePercent,
    },
    platformChargeRule
  );

  const duplicateFingerprint = buildDuplicateFingerprint(
    seller._id.toString(),
    input,
    breakdown.finalAmount
  );

  const fpLockKey = `${seller._id.toString()}:${duplicateFingerprint}`;
  if (inFlightFingerprint.has(fpLockKey)) {
    try {
      await inFlightFingerprint.get(fpLockKey);
    } catch {
      // Primary attempt failed; allow fallback check below
    }

    if (effectiveIdempotencyKey) {
      const replay = await Booking.findOne({
        sellerId: seller._id,
        idempotencyKey: effectiveIdempotencyKey,
      })
        .populate('transporterId', 'companyName contactPerson phone email')
        .lean();
      if (replay) {
        return { booking: replay, idempotentReplay: true };
      }
    }
  }

  const workPromise = (async () => {
    try {
      if (!options?.skipDuplicateHeuristic) {
        const existingDuplicate = await Booking.findOne({
          sellerId: seller._id,
          status: BookingStatus.BOOKED,
          $or: [
            { duplicateFingerprint },
            {
              routeId: route._id,
              transporterId: transporter._id,
              'receiver.name': new RegExp(`^${escapeRegex(input.receiver.name.trim())}$`, 'i'),
              'receiver.phone': input.receiver.phone.trim(),
              'receiver.pincode': input.receiver.pincode.trim(),
              actualWeight: breakdown.actualWeightKg,
              finalAmount: breakdown.finalAmount,
            },
          ],
        })
          .sort({ createdAt: -1 })
          .lean();

        if (existingDuplicate) {
          throw new AppError(
            `Duplicate booking prevented. An active booking (${existingDuplicate.lrNumber}) already exists for ${existingDuplicate.receiver.name} with ${existingDuplicate.chargeableWeight.toFixed(
              2
            )} kg and INR ${existingDuplicate.finalAmount.toFixed(2)}.`,
            409,
            'DUPLICATE_BOOKING'
          );
        }
      }

      const { bookingId, lrNumber } = generateUniqueRefs();
      const invoiceNumber = resolveInvoiceNumber({ lrNumber, createdAt: now });

      const paymentMode = input.paymentMode || 'WALLET';

      const createdBooking = await runInTransaction(async (session) => {
        let debitedAmount = 0;
        let balanceAfterDebit = 0;

        if (paymentMode === 'WALLET') {
          const updatedSeller = await SellerProfile.findOneAndUpdate(
            { _id: seller._id, walletBalance: { $gte: breakdown.finalAmount } },
            { $inc: { walletBalance: -breakdown.finalAmount } },
            {
              returnDocument: 'after',
              ...(session ? { session } : {}),
            }
          ).lean();

          if (!updatedSeller) {
            throw new AppError(
              `Insufficient wallet balance for INR ${breakdown.finalAmount.toFixed(
                2
              )}. Please recharge your wallet or select B2B Invoice.`,
              400,
              'INSUFFICIENT_WALLET_BALANCE'
            );
          }

          debitedAmount = breakdown.finalAmount;
          balanceAfterDebit = Number(updatedSeller.walletBalance || 0);
        }

        try {
          const [booking] = await Booking.create(
            [
              {
                bookingId,
                lrNumber,
                bookingSource: 'PLATFORM',
                createdByUserId: new mongoose.Types.ObjectId(userId),
                createdByRole: UserRole.SELLER,
                invoiceNumber,
                ewayBillNumber: input.ewayBillNumber || undefined,
                ewayBillValidUpto: input.ewayBillValidUpto ?? null,
                idempotencyKey: effectiveIdempotencyKey || undefined,
                duplicateFingerprint,
                sellerId: seller._id,
                pickupAddressId: matchedPickupAddress ? matchedPickupAddress._id : null,
                pickupAddressSnapshot,
                transporterId: transporter._id,
                routeId: route._id,
                rateId: rate._id,
                sender: normalizedSender,
                receiver: input.receiver,
                parcel: input.parcel,
                origin: { city: route.originCity, pincode: route.originPincode },
                destination: { city: route.destinationCity, pincode: route.destinationPincode },
                actualWeight: breakdown.actualWeightKg,
                volumetricWeight: breakdown.volumetricWeightKg,
                chargeableWeight: breakdown.chargeableWeightKg,
                freight: breakdown.baseFreight,
                platformCharge: breakdown.platformCharge,
                rtoCharges: breakdown.rtoCharges,
                tax: breakdown.taxAmount,
                finalAmount: breakdown.finalAmount,
                pricingSnapshot: {
                  ...breakdown,
                  estimatedDeliveryTime: rate.estimatedDeliveryTime,
                  isSampleRate: rate.isSampleData,
                },
                paymentMode,
                status: BookingStatus.BOOKED,
                whatsappOptIn: input.whatsappOptIn ?? true,
              },
            ],
            session ? { session } : undefined
          );

          if (paymentMode === 'WALLET') {
            const txnRand = crypto.randomBytes(3).toString('hex').toUpperCase();
            const txnYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            await WalletTransaction.create(
              [
                {
                  transactionId: `ZPT-TXN-${txnYmd}-${txnRand}`,
                  sellerId: seller._id,
                  userId,
                  type: WalletTransactionType.DEBIT,
                  amount: debitedAmount,
                  balanceAfter: balanceAfterDebit,
                  paymentMethod: WalletPaymentMethod.WALLET_BOOKING,
                  description: `Freight paid for ${booking.lrNumber}`,
                  bookingId: booking._id,
                  lrNumber: booking.lrNumber,
                },
              ],
              session ? { session } : undefined
            );
          }

          await TrackingEvent.create(
            [
              {
                bookingId: booking._id,
                lrNumber: booking.lrNumber,
                status: BookingStatus.BOOKED,
                location: `${route.originCity} (${route.originPincode})`,
                description: STATUS_DESCRIPTIONS[BookingStatus.BOOKED],
                remarks:
                  paymentMode === 'WALLET'
                    ? `Assigned to ${transporter.companyName} · Paid via Wallet`
                    : `Assigned to ${transporter.companyName}`,
                actorUserId: userId,
                actorRole: UserRole.SELLER,
                eventTimestamp: new Date(),
              },
            ],
            session ? { session } : undefined
          );

          return booking;
        } catch (innerErr) {
          // On standalone MongoDB (no replica set session), restore wallet balance if booking creation failed
          if (!session && debitedAmount > 0) {
            await SellerProfile.updateOne(
              { _id: seller._id },
              { $inc: { walletBalance: debitedAmount } }
            ).catch(() => {});
          }
          throw innerErr;
        }
      });

      const populated = await Booking.findById(createdBooking._id)
        .populate('transporterId', 'companyName contactPerson phone email')
        .lean();

      void createAndPushNotification({
        recipientUserId: transporter.userId.toString(),
        recipientRole: UserRole.TRANSPORTER,
        category: NotificationCategory.BOOKING,
        title: `New Booking Assigned: ${createdBooking.lrNumber}`,
        message: `${seller.businessName} booked ${input.parcel.numberOfPackages} carton(s) on ${route.originCity} -> ${route.destinationCity}.`,
        link: `/transporter/bookings/${createdBooking._id.toString()}`,
        entityType: 'Booking',
        entityId: createdBooking._id.toString(),
      });

      void notifyAllAdmins({
        category: NotificationCategory.BOOKING,
        title: `New Booking: ${createdBooking.lrNumber}`,
        message: `${seller.businessName} booked ${route.originCity} -> ${route.destinationCity} via ${transporter.companyName} (INR ${breakdown.finalAmount.toFixed(2)}).`,
        link: `/admin/bookings/${createdBooking._id.toString()}`,
        entityType: 'Booking',
        entityId: createdBooking._id.toString(),
      });

      void dispatchBookingNotificationEvent({
        booking: createdBooking,
        eventType: WhatsAppEventType.BOOKING_CONFIRMED,
        latestUpdate: `Booking confirmed via ${transporter.companyName}. LR ${createdBooking.lrNumber} generated.`,
        sourceEventKey: `status:${BookingStatus.BOOKED}`,
      });

      return { booking: populated, idempotentReplay: false };
    } catch (err: unknown) {
      // Handle concurrent duplicate booking requests racing on the same idempotencyKey
      if (
        effectiveIdempotencyKey &&
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        const existing = await Booking.findOne({
          sellerId: seller._id,
          idempotencyKey: effectiveIdempotencyKey,
        })
          .populate('transporterId', 'companyName contactPerson phone email')
          .lean();
        if (existing) {
          return { booking: existing, idempotentReplay: true };
        }
      }
      throw err;
    } finally {
      if (idemLockKey) inFlightIdem.delete(idemLockKey);
      inFlightFingerprint.delete(fpLockKey);
    }
  })();

  if (idemLockKey) inFlightIdem.set(idemLockKey, workPromise);
  inFlightFingerprint.set(fpLockKey, workPromise);

  return workPromise;
}

export async function calculateTransporterPersonalBooking(
  userId: string,
  input: CalculateTransporterBookingInput
) {
  const transporter = await Transporter.findOne({ userId }).lean();
  if (!transporter) {
    throw new AppError('Transporter profile not found.', 404, 'TRANSPORTER_NOT_FOUND');
  }

  const rate = await TransportRate.findOne({
    _id: input.rateId,
    isDeleted: { $ne: true },
  }).lean();
  if (!rate) {
    throw new AppError('Selected route and rate configuration not found.', 404, 'RATE_NOT_FOUND');
  }

  if (rate.transporterId.toString() !== transporter._id.toString()) {
    throw new AppError(
      'You are not authorized to calculate freight using another transporter\'s route.',
      403,
      'ROUTE_OWNERSHIP_FORBIDDEN'
    );
  }

  const [route, platformChargeRule] = await Promise.all([
    TransportRoute.findOne({ _id: rate.routeId, isDeleted: { $ne: true } }).lean(),
    getApplicablePlatformChargeRule('TRANSPORTER_SELF'),
  ]);

  if (!route || route.status !== EntityStatus.ACTIVE || !rate.isActive) {
    throw new AppError(
      'Selected route is currently inactive. Activate the route before creating a booking.',
      400,
      'ROUTE_INACTIVE'
    );
  }

  const breakdown = calculateFreightBreakdown(
    {
      actualWeightKg: input.actualWeightKg,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
    },
    {
      minimumFreight: rate.minimumFreight,
      ratePerKg: rate.ratePerKg,
      volumetricDivisor: rate.volumetricDivisor,
      rtoCharges: rate.rtoCharges,
      additionalCharges: rate.additionalCharges,
      gstApplicable: rate.gstApplicable,
      gstRatePercent: rate.gstRatePercent,
    },
    platformChargeRule
  );

  return {
    route: {
      id: route._id.toString(),
      rateId: rate._id.toString(),
      originCity: route.originCity,
      originPincode: route.originPincode,
      destinationCity: route.destinationCity,
      destinationPincode: route.destinationPincode,
      distanceKm: route.distanceKm,
      estimatedDeliveryTime: rate.estimatedDeliveryTime,
    },
    breakdown,
  };
}

export async function createTransporterPersonalBooking(
  userId: string,
  input: CreateTransporterPersonalBookingInput,
  headerIdempotencyKey?: string
) {
  const transporter = await Transporter.findOne({ userId }).lean();
  if (!transporter) {
    throw new AppError('Transporter profile not found.', 404, 'TRANSPORTER_NOT_FOUND');
  }
  if (transporter.approvalStatus === TransporterApprovalStatus.PENDING) {
    throw new AppError(
      'Your transporter application is pending admin approval. You cannot create bookings yet.',
      403,
      'TRANSPORTER_APPROVAL_PENDING'
    );
  }
  if (transporter.approvalStatus === TransporterApprovalStatus.REJECTED) {
    throw new AppError(
      `Your transporter application was rejected: ${transporter.rejectionReason || 'No reason provided'}`,
      403,
      'TRANSPORTER_APPROVAL_REJECTED'
    );
  }
  if (transporter.status !== EntityStatus.ACTIVE) {
    throw new AppError(
      'Only active transporters can create personal bookings.',
      403,
      'TRANSPORTER_INACTIVE'
    );
  }

  const effectiveIdempotencyKey = input.idempotencyKey || headerIdempotencyKey;
  if (effectiveIdempotencyKey) {
    const existing = await Booking.findOne({
      transporterId: transporter._id,
      bookingSource: 'TRANSPORTER_SELF',
      idempotencyKey: effectiveIdempotencyKey,
    })
      .populate('transporterId', 'companyName contactPerson phone email')
      .lean();
    if (existing) {
      return { booking: existing, idempotentReplay: true };
    }
  }

  const rate = await TransportRate.findOne({
    _id: input.rateId,
    isDeleted: { $ne: true },
  }).lean();
  if (!rate) {
    throw new AppError('Selected route and rate configuration not found.', 404, 'RATE_NOT_FOUND');
  }

  if (rate.transporterId.toString() !== transporter._id.toString()) {
    throw new AppError(
      'You are not authorized to create a booking on another transporter\'s route.',
      403,
      'ROUTE_OWNERSHIP_FORBIDDEN'
    );
  }

  if (input.routeId && rate.routeId.toString() !== input.routeId) {
    throw new AppError('Selected route does not match the selected rate.', 400, 'INVALID_OR_EXPIRED_RATE');
  }

  const now = new Date();
  const [route, platformChargeRule] = await Promise.all([
    TransportRoute.findOne({ _id: rate.routeId, isDeleted: { $ne: true } }).lean(),
    getApplicablePlatformChargeRule('TRANSPORTER_SELF'),
  ]);

  if (
    !route ||
    route.status !== EntityStatus.ACTIVE ||
    !rate.isActive ||
    rate.effectiveFrom > now ||
    (rate.effectiveTo && rate.effectiveTo < now)
  ) {
    throw new AppError(
      'Selected route or rate is inactive or expired.',
      400,
      'INVALID_OR_EXPIRED_RATE'
    );
  }

  const breakdown = calculateFreightBreakdown(
    {
      actualWeightKg: input.parcel.actualWeightKg,
      lengthCm: input.parcel.lengthCm,
      widthCm: input.parcel.widthCm,
      heightCm: input.parcel.heightCm,
    },
    {
      minimumFreight: rate.minimumFreight,
      ratePerKg: rate.ratePerKg,
      volumetricDivisor: rate.volumetricDivisor,
      rtoCharges: rate.rtoCharges,
      additionalCharges: rate.additionalCharges,
      gstApplicable: rate.gstApplicable,
      gstRatePercent: rate.gstRatePercent,
    },
    platformChargeRule
  );

  const { bookingId, lrNumber } = generateUniqueRefs();
  const invoiceNumber = resolveInvoiceNumber({ lrNumber, createdAt: now });
  const paymentMode = input.paymentMode || 'CASH';

  try {
    const createdBooking = await runInTransaction(async (session) => {
      const [booking] = await Booking.create(
        [
          {
            bookingId,
            lrNumber,
            bookingSource: 'TRANSPORTER_SELF',
            createdByUserId: new mongoose.Types.ObjectId(userId),
            createdByRole: UserRole.TRANSPORTER,
            invoiceNumber,
            ewayBillNumber: input.ewayBillNumber || undefined,
            ewayBillValidUpto: input.ewayBillValidUpto ?? null,
            idempotencyKey: effectiveIdempotencyKey || undefined,
            sellerId: null,
            transporterId: transporter._id,
            routeId: route._id,
            rateId: rate._id,
            sender: input.sender,
            receiver: input.receiver,
            parcel: input.parcel,
            origin: { city: route.originCity, pincode: route.originPincode },
            destination: { city: route.destinationCity, pincode: route.destinationPincode },
            actualWeight: breakdown.actualWeightKg,
            volumetricWeight: breakdown.volumetricWeightKg,
            chargeableWeight: breakdown.chargeableWeightKg,
            freight: breakdown.baseFreight,
            platformCharge: breakdown.platformCharge,
            rtoCharges: breakdown.rtoCharges,
            tax: breakdown.taxAmount,
            finalAmount: breakdown.finalAmount,
            pricingSnapshot: {
              ...breakdown,
              estimatedDeliveryTime: rate.estimatedDeliveryTime,
              isSampleRate: false,
            },
            paymentMode,
            status: BookingStatus.ACCEPTED,
            whatsappOptIn: input.whatsappOptIn ?? true,
          },
        ],
        session ? { session } : undefined
      );

      await TrackingEvent.create(
        [
          {
            bookingId: booking._id,
            lrNumber: booking.lrNumber,
            status: BookingStatus.ACCEPTED,
            location: `${route.originCity} (${route.originPincode})`,
            description: 'Direct customer order booked & confirmed by transporter',
            remarks: `Transporter personal booking created by ${transporter.companyName} (${paymentMode})`,
            actorUserId: userId,
            actorRole: UserRole.TRANSPORTER,
            eventTimestamp: new Date(),
          },
        ],
        session ? { session } : undefined
      );

      return booking;
    });

    const populated = await Booking.findById(createdBooking._id)
      .populate('transporterId', 'companyName contactPerson phone email')
      .lean();

    void notifyAllAdmins({
      category: NotificationCategory.BOOKING,
      title: `Transporter Direct Booking: ${createdBooking.lrNumber}`,
      message: `${transporter.companyName} created personal booking ${route.originCity} -> ${route.destinationCity} (INR ${breakdown.finalAmount.toFixed(2)}).`,
      link: `/admin/bookings/${createdBooking._id.toString()}`,
      entityType: 'Booking',
      entityId: createdBooking._id.toString(),
    });

    void dispatchBookingNotificationEvent({
      booking: createdBooking,
      eventType: WhatsAppEventType.BOOKING_CONFIRMED,
      latestUpdate: `Booking confirmed by ${transporter.companyName}. LR ${createdBooking.lrNumber} generated.`,
      sourceEventKey: `status:${BookingStatus.BOOKED}`,
    });

    return { booking: populated, idempotentReplay: false };
  } catch (err: unknown) {
    if (
      effectiveIdempotencyKey &&
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      const existing = await Booking.findOne({
        transporterId: transporter._id,
        bookingSource: 'TRANSPORTER_SELF',
        idempotencyKey: effectiveIdempotencyKey,
      })
        .populate('transporterId', 'companyName contactPerson phone email')
        .lean();
      if (existing) {
        return { booking: existing, idempotentReplay: true };
      }
    }
    throw err;
  }
}

export async function listBookingsForUser(
  userId: string,
  role: UserRole,
  query: Record<string, unknown>
) {
  const pagination = parsePagination(query, 20, 100);
  const filter: Record<string, unknown> = {};

  if (role === UserRole.SELLER) {
    const seller = await SellerProfile.findOne({ userId }).lean();
    if (!seller) {
      throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
    }
    filter.sellerId = seller._id;
  } else if (role === UserRole.TRANSPORTER) {
    const transporter = await Transporter.findOne({ userId }).lean();
    if (!transporter) {
      throw new AppError('Transporter profile not found.', 404, 'TRANSPORTER_NOT_FOUND');
    }
    filter.transporterId = transporter._id;
  }

  if (query.bookingSource === 'TRANSPORTER_SELF') {
    filter.bookingSource = 'TRANSPORTER_SELF';
  } else if (query.bookingSource === 'PLATFORM') {
    filter.bookingSource = { $ne: 'TRANSPORTER_SELF' };
  }

  if (query.status && Object.values(BookingStatus).includes(query.status as BookingStatus)) {
    filter.status = query.status;
  }

  const searchText = typeof query.lrNumber === 'string' && query.lrNumber.trim()
    ? query.lrNumber.trim()
    : typeof query.search === 'string' && query.search.trim()
      ? query.search.trim()
      : '';

  if (searchText) {
    const regex = new RegExp(escapeRegex(searchText), 'i');
    filter.$or = [
      { lrNumber: regex },
      { bookingId: regex },
      { 'sender.name': regex },
      { 'receiver.name': regex },
      { 'origin.city': regex },
      { 'destination.city': regex },
    ];
  }

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .populate('sellerId', 'businessName ownerName phone city')
      .populate('transporterId', 'companyName contactPerson phone')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return buildPaginatedResponse(items, total, pagination);
}

export async function assertBookingAccess(bookingId: string, userId: string, role: UserRole) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found.', 404, 'BOOKING_NOT_FOUND');
  }

  if (role === UserRole.ADMIN) {
    return booking;
  }

  if (role === UserRole.SELLER) {
    const seller = await SellerProfile.findOne({ userId }).lean();
    if (!seller || !booking.sellerId || booking.sellerId.toString() !== seller._id.toString()) {
      throw new AppError('You are not authorized to access this booking.', 403, 'BOOKING_ACCESS_FORBIDDEN');
    }
    return booking;
  }

  if (role === UserRole.TRANSPORTER) {
    const transporter = await Transporter.findOne({ userId }).lean();
    if (!transporter || booking.transporterId.toString() !== transporter._id.toString()) {
      throw new AppError('You are not authorized to access this booking.', 403, 'BOOKING_ACCESS_FORBIDDEN');
    }
    return booking;
  }

  throw new AppError('Access denied.', 403, 'FORBIDDEN');
}

export async function getBookingDetails(bookingId: string, userId: string, role: UserRole) {
  await assertBookingAccess(bookingId, userId, role);

  const [booking, trackingEvents, deliveryProof, weightDiscrepancy] = await Promise.all([
    Booking.findById(bookingId)
      .populate('sellerId', 'businessName ownerName phone email gstNumber city pincode')
      .populate('transporterId', 'companyName contactPerson phone email gstNumber address')
      .populate('routeId', 'originCity originPincode destinationCity destinationPincode distanceKm')
      .lean(),
    TrackingEvent.find({ bookingId }).sort({ createdAt: 1, eventTimestamp: 1 }).lean(),
    DeliveryProof.findOne({ bookingId }).lean(),
    WeightDiscrepancy.findOne({ bookingId }).select('-scaleImageStorageKey').lean(),
  ]);

  return {
    booking,
    trackingEvents,
    deliveryProof,
    weightDiscrepancy,
  };
}

export async function generateBookingLrPdf(bookingId: string, userId: string, role: UserRole) {
  const booking = await assertBookingAccess(bookingId, userId, role);

  const [transporter, seller] = await Promise.all([
    Transporter.findById(booking.transporterId).lean(),
    booking.sellerId ? SellerProfile.findById(booking.sellerId).lean() : Promise.resolve(null),
  ]);

  if (!transporter || (booking.sellerId && !seller)) {
    throw new AppError('Associated transporter or seller data missing.', 404, 'RELATED_ENTITY_NOT_FOUND');
  }

  const pdfBuffer = await generateLrPdfBuffer({
    booking,
    transporter,
    seller: seller ?? null,
  });

  return {
    lrNumber: booking.lrNumber,
    pdfBuffer,
  };
}

export async function generateBookingTaxInvoicePdf(bookingId: string, userId: string, role: UserRole) {
  const booking = await assertBookingAccess(bookingId, userId, role);

  const [transporter, seller] = await Promise.all([
    Transporter.findById(booking.transporterId).lean(),
    booking.sellerId ? SellerProfile.findById(booking.sellerId).lean() : Promise.resolve(null),
  ]);

  if (!transporter || (booking.sellerId && !seller)) {
    throw new AppError('Associated transporter or seller data missing.', 404, 'RELATED_ENTITY_NOT_FOUND');
  }

  const invoiceNumber = resolveInvoiceNumber(booking);
  if (!booking.invoiceNumber) {
    booking.invoiceNumber = invoiceNumber;
    await booking.save().catch(() => {});
  }

  const pdfBuffer = await generateTaxInvoicePdfBuffer({
    booking,
    transporter,
    seller: seller ?? null,
    invoiceNumber,
  });

  return {
    invoiceNumber,
    lrNumber: booking.lrNumber,
    pdfBuffer,
  };
}

export async function generateBulkLrPdf(bookingIds: string[], userId: string, role: UserRole) {
  const uniqueIds = Array.from(new Set(bookingIds));
  const authorizedBookings = await Promise.all(
    uniqueIds.map((id) => assertBookingAccess(id, userId, role))
  );

  const transporterIds = Array.from(new Set(authorizedBookings.map((b) => b.transporterId.toString())));
  const sellerIds = Array.from(
    new Set(authorizedBookings.filter((b) => b.sellerId).map((b) => b.sellerId!.toString()))
  );

  const [transporters, sellers] = await Promise.all([
    Transporter.find({ _id: { $in: transporterIds } }).lean(),
    sellerIds.length > 0 ? SellerProfile.find({ _id: { $in: sellerIds } }).lean() : Promise.resolve([]),
  ]);

  const transporterMap = new Map(transporters.map((t) => [t._id.toString(), t]));
  const sellerMap = new Map(sellers.map((s) => [s._id.toString(), s]));

  const inputs = authorizedBookings.map((booking) => {
    const transporter = transporterMap.get(booking.transporterId.toString());
    const seller = booking.sellerId ? sellerMap.get(booking.sellerId.toString()) ?? null : null;
    if (!transporter || (booking.sellerId && !seller)) {
      throw new AppError(
        `Associated transporter or seller data missing for ${booking.lrNumber}.`,
        404,
        'RELATED_ENTITY_NOT_FOUND'
      );
    }
    return { booking, transporter, seller };
  });

  const pdfBuffer = await generateCombinedLrPdfBuffer(inputs);
  return {
    count: inputs.length,
    pdfBuffer,
  };
}

function normalizeBulkRawRow(raw: Record<string, unknown>): Record<string, unknown> {
  const strFields = [
    'originPincode',
    'destinationPincode',
    'transporterId',
    'transporterGst',
    'transporterEmail',
    'senderName',
    'senderPhone',
    'senderAddress',
    'senderCity',
    'senderPincode',
    'receiverName',
    'receiverPhone',
    'receiverAddress',
    'receiverCity',
    'receiverPincode',
    'description',
    'ewayBillNumber',
  ];
  const out: Record<string, unknown> = { ...raw };
  for (const key of strFields) {
    if (typeof out[key] === 'number') {
      out[key] = String(Math.trunc(out[key] as number));
    }
  }
  return out;
}

interface ResolvedBulkRow {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  routeLabel?: string;
  transporterName?: string;
  chargeableWeightKg?: number;
  estimatedAmount?: number;
  bookingInput?: Omit<CreateBookingInput, 'idempotencyKey' | 'paymentMode'>;
}

async function resolveBulkRows(rawRows: Record<string, unknown>[]): Promise<ResolvedBulkRow[]> {
  const now = new Date();
  const [routes, transporters, rates, platformChargeRule] = await Promise.all([
    TransportRoute.find({ status: EntityStatus.ACTIVE, isDeleted: { $ne: true } }).lean(),
    Transporter.find({
      status: EntityStatus.ACTIVE,
      $or: [
        { approvalStatus: TransporterApprovalStatus.APPROVED },
        { approvalStatus: { $exists: false } },
      ],
    }).lean(),
    TransportRate.find({
      isActive: true,
      isDeleted: { $ne: true },
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gte: now } }],
    }).lean(),
    getApplicablePlatformChargeRule('PLATFORM'),
  ]);

  const routesByPincodes = new Map<string, (typeof routes)[number][]>();
  for (const r of routes) {
    const key = `${r.originPincode}:${r.destinationPincode}`;
    const list = routesByPincodes.get(key) || [];
    list.push(r);
    routesByPincodes.set(key, list);
  }
  const routeById = new Map(routes.map((r) => [r._id.toString(), r]));
  const transporterById = new Map(transporters.map((t) => [t._id.toString(), t]));
  const transporterByGst = new Map(transporters.map((t) => [t.gstNumber.toUpperCase(), t]));
  const transporterByEmail = new Map(transporters.map((t) => [t.email.toLowerCase(), t]));

  const activeRateByPair = new Map<string, (typeof rates)[number]>();
  const activeRatesByRoute = new Map<string, (typeof rates)[number][]>();
  for (const r of rates) {
    if (!transporterById.has(r.transporterId.toString())) continue;
    const pairKey = `${r.routeId.toString()}:${r.transporterId.toString()}`;
    const existing = activeRateByPair.get(pairKey);
    if (!existing || r.effectiveFrom > existing.effectiveFrom) {
      activeRateByPair.set(pairKey, r);
    }
    const list = activeRatesByRoute.get(r.routeId.toString()) || [];
    list.push(r);
    activeRatesByRoute.set(r.routeId.toString(), list);
  }

  return rawRows.map((raw, idx) => {
    const rowNum =
      typeof raw.rowNumber === 'number' && Number.isInteger(raw.rowNumber) ? raw.rowNumber : idx + 1;
    const normalized = normalizeBulkRawRow(raw);
    const parsed = bulkBookingRowSchema.safeParse(normalized);

    if (!parsed.success) {
      const errs = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`);
      return { rowNumber: rowNum, valid: false, errors: errs };
    }

    const row = parsed.data;
    const corridorRoutes = routesByPincodes.get(`${row.originPincode}:${row.destinationPincode}`) || [];
    if (corridorRoutes.length === 0) {
      return {
        rowNumber: rowNum,
        valid: false,
        errors: [`No active route found for ${row.originPincode} -> ${row.destinationPincode}.`],
      };
    }

    const primaryRoute = corridorRoutes[0];

    let matchedTransporter = row.transporterId
      ? transporterById.get(row.transporterId)
      : row.transporterGst
        ? transporterByGst.get(row.transporterGst.toUpperCase())
        : row.transporterEmail
          ? transporterByEmail.get(row.transporterEmail.toLowerCase())
          : undefined;

    let selectedRate: (typeof rates)[number] | undefined;

    if (row.transporterId || row.transporterGst || row.transporterEmail) {
      if (!matchedTransporter) {
        return {
          rowNumber: rowNum,
          valid: false,
          errors: ['Specified transporter was not found or is inactive.'],
        };
      }
      for (const rt of corridorRoutes) {
        const candidate = activeRateByPair.get(`${rt._id.toString()}:${matchedTransporter._id.toString()}`);
        if (candidate) {
          selectedRate = candidate;
          break;
        }
      }
      if (!selectedRate) {
        return {
          rowNumber: rowNum,
          valid: false,
          routeLabel: `${primaryRoute.originCity} -> ${primaryRoute.destinationCity}`,
          transporterName: matchedTransporter.companyName,
          errors: [
            `${matchedTransporter.companyName} has no active rate card on ${primaryRoute.originCity} -> ${primaryRoute.destinationCity}.`,
          ],
        };
      }
    } else {
      const corridorRates: (typeof rates)[number][] = [];
      for (const rt of corridorRoutes) {
        const list = activeRatesByRoute.get(rt._id.toString()) || [];
        corridorRates.push(...list);
      }
      if (corridorRates.length === 0) {
        return {
          rowNumber: rowNum,
          valid: false,
          routeLabel: `${primaryRoute.originCity} -> ${primaryRoute.destinationCity}`,
          errors: [
            `No active carrier rate card exists for ${primaryRoute.originCity} -> ${primaryRoute.destinationCity}.`,
          ],
        };
      }
      let bestCost = Number.POSITIVE_INFINITY;
      for (const candidate of corridorRates) {
        const calc = calculateFreightBreakdown(
          {
            actualWeightKg: row.actualWeightKg,
            lengthCm: row.lengthCm,
            widthCm: row.widthCm,
            heightCm: row.heightCm,
          },
          candidate,
          platformChargeRule
        );
        if (calc.finalAmount < bestCost) {
          bestCost = calc.finalAmount;
          selectedRate = candidate;
          matchedTransporter = transporterById.get(candidate.transporterId.toString());
        }
      }
    }

    if (!selectedRate || !matchedTransporter) {
      return {
        rowNumber: rowNum,
        valid: false,
        errors: ['Could not match an active carrier rate card for this lane.'],
      };
    }

    const matchedRoute = routeById.get(selectedRate.routeId.toString()) || primaryRoute;
    const breakdown = calculateFreightBreakdown(
      {
        actualWeightKg: row.actualWeightKg,
        lengthCm: row.lengthCm,
        widthCm: row.widthCm,
        heightCm: row.heightCm,
      },
      selectedRate,
      platformChargeRule
    );

    return {
      rowNumber: rowNum,
      valid: true,
      errors: [],
      routeLabel: `${matchedRoute.originCity} (${matchedRoute.originPincode}) -> ${matchedRoute.destinationCity} (${matchedRoute.destinationPincode})`,
      transporterName: matchedTransporter.companyName,
      chargeableWeightKg: breakdown.chargeableWeightKg,
      estimatedAmount: breakdown.finalAmount,
      bookingInput: {
        routeId: matchedRoute._id.toString(),
        transporterId: matchedTransporter._id.toString(),
        rateId: selectedRate._id.toString(),
        ewayBillNumber: row.ewayBillNumber,
        ewayBillValidUpto: row.ewayBillValidUpto ?? null,
        sender: {
          name: row.senderName,
          phone: row.senderPhone,
          address: row.senderAddress,
          city: row.senderCity,
          pincode: row.senderPincode,
        },
        receiver: {
          name: row.receiverName,
          phone: row.receiverPhone,
          address: row.receiverAddress,
          city: row.receiverCity,
          pincode: row.receiverPincode,
        },
        parcel: {
          description: row.description,
          actualWeightKg: row.actualWeightKg,
          lengthCm: row.lengthCm,
          widthCm: row.widthCm,
          heightCm: row.heightCm,
          numberOfPackages: row.numberOfPackages,
        },
        whatsappOptIn: row.whatsappOptIn ?? true,
      },
    };
  });
}

export async function previewBulkBookings(
  userId: string,
  rawRows: Record<string, unknown>[],
  paymentMode: 'WALLET' | 'INVOICE'
) {
  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }

  const resolved = await resolveBulkRows(rawRows);
  const validRows = resolved.filter((r) => r.valid);
  const totalEstimatedAmount =
    Math.round(validRows.reduce((sum, r) => sum + Number(r.estimatedAmount || 0), 0) * 100) / 100;

  return {
    totalRows: resolved.length,
    validCount: validRows.length,
    invalidCount: resolved.length - validRows.length,
    totalEstimatedAmount,
    walletBalance: Number(seller.walletBalance || 0),
    sufficientWalletBalance:
      paymentMode !== 'WALLET' || Number(seller.walletBalance || 0) >= totalEstimatedAmount,
    rows: resolved.map(({ bookingInput: _omit, ...rest }) => rest),
  };
}

export async function createBulkBookings(
  userId: string,
  rawRows: Record<string, unknown>[],
  paymentMode: 'WALLET' | 'INVOICE'
) {
  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }
  if (seller.approvalStatus !== SellerApprovalStatus.APPROVED) {
    throw new AppError('Only approved sellers can create bulk shipments.', 403, 'SELLER_NOT_APPROVED');
  }

  const resolved = await resolveBulkRows(rawRows);
  const invalidRows = resolved.filter((r) => !r.valid);
  if (invalidRows.length > 0) {
    throw new AppError(
      `${invalidRows.length} row(s) contain validation or route errors. Please fix them before submitting.`,
      400,
      'BULK_VALIDATION_FAILED',
      invalidRows
    );
  }

  const totalEstimatedAmount =
    Math.round(resolved.reduce((sum, r) => sum + Number(r.estimatedAmount || 0), 0) * 100) / 100;

  if (paymentMode === 'WALLET' && Number(seller.walletBalance || 0) < totalEstimatedAmount) {
    throw new AppError(
      `Insufficient wallet balance. Total batch cost is INR ${totalEstimatedAmount.toFixed(
        2
      )}, but wallet balance is INR ${Number(seller.walletBalance || 0).toFixed(2)}.`,
      400,
      'INSUFFICIENT_WALLET_BALANCE'
    );
  }

  const batchId = `ZPT-BATCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const createdBookings = [];

  for (const row of resolved) {
    const idempotencyKey = `${batchId}-R${row.rowNumber}`;
    const result = await createBooking(
      userId,
      {
        ...row.bookingInput!,
        paymentMode,
        idempotencyKey,
      },
      undefined,
      { skipDuplicateHeuristic: true }
    );
    if (result.booking) {
      createdBookings.push(result.booking);
    }
  }

  const updatedSeller = await SellerProfile.findOne({ userId }).select('walletBalance').lean();

  return {
    batchId,
    createdCount: createdBookings.length,
    totalCharged: totalEstimatedAmount,
    walletBalance: Number(updatedSeller?.walletBalance || 0),
    bookings: createdBookings,
  };
}

export async function generateBookingBarcodePng(bookingId: string, userId: string, role: UserRole) {
  const booking = await assertBookingAccess(bookingId, userId, role);
  const barcodeBuffer = await generateLrBarcodeBuffer(booking.lrNumber);

  return {
    lrNumber: booking.lrNumber,
    barcodeBuffer,
  };
}

export function formatCartonCode(lrNumber: string, cartonNumber: number): string {
  return `${lrNumber.toUpperCase()}-C${String(cartonNumber).padStart(2, '0')}`;
}

export async function generateCartonBarcodePng(
  bookingId: string,
  cartonNumber: number,
  userId: string,
  role: UserRole
) {
  const booking = await assertBookingAccess(bookingId, userId, role);
  if (cartonNumber < 1 || cartonNumber > booking.parcel.numberOfPackages) {
    throw new AppError(
      `Carton number must be between 1 and ${booking.parcel.numberOfPackages}.`,
      400,
      'INVALID_CARTON_NUMBER'
    );
  }
  const cartonCode = formatCartonCode(booking.lrNumber, cartonNumber);
  const barcodeBuffer = await generateLrBarcodeBuffer(cartonCode);
  return { cartonCode, barcodeBuffer };
}

async function applyRtoCharge(
  booking: IBooking,
  session?: mongoose.ClientSession | null
): Promise<number> {
  if (!booking.sellerId || booking.bookingSource === 'TRANSPORTER_SELF') {
    booking.rtoBilledStatus = 'NONE';
    return 0;
  }

  if (booking.rtoBilledStatus && booking.rtoBilledStatus !== 'NONE') {
    return 0;
  }

  const rtoAmount = Number(booking.rtoCharges || 0);
  if (rtoAmount <= 0) {
    booking.rtoBilledStatus = 'NONE';
    return 0;
  }

  if (booking.paymentMode === 'WALLET') {
    const updatedSeller = await SellerProfile.findOneAndUpdate(
      { _id: booking.sellerId, walletBalance: { $gte: rtoAmount } },
      { $inc: { walletBalance: -rtoAmount } },
      { returnDocument: 'after', ...(session ? { session } : {}) }
    ).lean();

    if (updatedSeller) {
      const txnRand = crypto.randomBytes(3).toString('hex').toUpperCase();
      const txnYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      await WalletTransaction.create(
        [
          {
            transactionId: `ZPT-TXN-${txnYmd}-${txnRand}`,
            sellerId: booking.sellerId,
            userId: updatedSeller.userId,
            type: WalletTransactionType.DEBIT,
            amount: rtoAmount,
            balanceAfter: Number(updatedSeller.walletBalance || 0),
            paymentMethod: WalletPaymentMethod.RTO_CHARGE,
            referenceNote: booking.lrNumber,
            description: `RTO return charge for ${booking.lrNumber}`,
            bookingId: booking._id,
            lrNumber: booking.lrNumber,
          },
        ],
        session ? { session } : undefined
      );
      booking.rtoBilledStatus = 'WALLET_DEBITED';
      return rtoAmount;
    }

    booking.rtoBilledStatus = 'INVOICE_PENDING';
    return 0;
  }

  booking.rtoBilledStatus = 'INVOICE_BILLED';
  return 0;
}

export async function updateBookingStatus(
  bookingId: string,
  userId: string,
  role: UserRole,
  input: UpdateBookingStatusInput
) {
  if (role !== UserRole.TRANSPORTER) {
    throw new AppError('Only the assigned transporter can update shipment status.', 403, 'TRANSPORTER_ROLE_REQUIRED');
  }

  const booking = await assertBookingAccess(bookingId, userId, role);

  const allowedNext =
    booking.bookingSource === 'TRANSPORTER_SELF' && booking.status === BookingStatus.BOOKED
      ? [BookingStatus.DISPATCHED]
      : ALLOWED_STATUS_TRANSITIONS[booking.status] || [];
  if (booking.bookingSource === 'TRANSPORTER_SELF' && input.status === BookingStatus.REJECTED) {
    throw new AppError(
      'Personal bookings cannot be rejected. Proceed directly to dispatch or delivery.',
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }
  if (!allowedNext.includes(input.status)) {
    throw new AppError(
      `Invalid status transition from ${booking.status} to ${input.status}. Allowed next: ${
        allowedNext.join(', ') || 'None (terminal state)'
      }.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  if (
    (input.status === BookingStatus.REJECTED ||
      input.status === BookingStatus.NDR ||
      input.status === BookingStatus.RTO_INITIATED) &&
    (!input.remarks || input.remarks.trim().length < 4)
  ) {
    throw new AppError(
      `Please provide a clear reason (at least 4 characters) when marking ${input.status}.`,
      400,
      'STATUS_REASON_REQUIRED'
    );
  }

  const txResult = await runInTransaction(async (session) => {
    let refundedAmount = 0;
    let rtoDebitedAmount = 0;

    if (input.status === BookingStatus.REJECTED) {
      booking.rejectionReason = input.remarks!.trim();
      booking.rejectedAt = new Date();

      if (booking.sellerId && booking.paymentMode === 'WALLET' && booking.finalAmount > 0) {
        const refundedSeller = await SellerProfile.findOneAndUpdate(
          { _id: booking.sellerId },
          { $inc: { walletBalance: booking.finalAmount } },
          { returnDocument: 'after', ...(session ? { session } : {}) }
        ).lean();

        if (refundedSeller) {
          refundedAmount = booking.finalAmount;
          const txnRand = crypto.randomBytes(3).toString('hex').toUpperCase();
          const txnYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          await WalletTransaction.create(
            [
              {
                transactionId: `ZPT-TXN-${txnYmd}-${txnRand}`,
                sellerId: booking.sellerId,
                userId: refundedSeller.userId,
                type: WalletTransactionType.CREDIT,
                amount: booking.finalAmount,
                balanceAfter: Number(refundedSeller.walletBalance || 0),
                paymentMethod: WalletPaymentMethod.WALLET_REFUND,
                referenceNote: booking.lrNumber,
                description: `Auto-refund for rejected booking ${booking.lrNumber}`,
                bookingId: booking._id,
                lrNumber: booking.lrNumber,
              },
            ],
            session ? { session } : undefined
          );
        }
      }
    } else if (input.status === BookingStatus.NDR) {
      booking.ndrReason = input.remarks!.trim();
      booking.ndrAttempts = Number(booking.ndrAttempts || 0) + 1;
      booking.ndrRaisedAt = new Date();
    } else if (input.status === BookingStatus.RTO_INITIATED) {
      booking.rtoReason = input.remarks!.trim();
      booking.rtoInitiatedAt = new Date();
      rtoDebitedAmount = await applyRtoCharge(booking, session);
    } else if (input.status === BookingStatus.RTO_DELIVERED) {
      booking.rtoDeliveredAt = new Date();
    }

    booking.status = input.status;
    await booking.save(session ? { session } : undefined);

    const eventRemarks =
      input.status === BookingStatus.REJECTED && refundedAmount > 0
        ? `${input.remarks!.trim()} · INR ${refundedAmount.toFixed(2)} refunded to seller wallet`
        : input.status === BookingStatus.RTO_INITIATED && rtoDebitedAmount > 0
          ? `${input.remarks!.trim()} · INR ${rtoDebitedAmount.toFixed(2)} RTO charge debited from seller wallet`
          : input.remarks;

    const [event] = await TrackingEvent.create(
      [
        {
          bookingId: booking._id,
          lrNumber: booking.lrNumber,
          status: input.status,
          location: input.location,
          description: STATUS_DESCRIPTIONS[input.status],
          remarks: eventRemarks,
          actorUserId: userId,
          actorRole: role,
          eventTimestamp: new Date(),
        },
      ],
      session ? { session } : undefined
    );

    return { booking, trackingEvent: event, refundedAmount, rtoDebitedAmount };
  });

  const sellerProfile = booking.sellerId
    ? await SellerProfile.findById(booking.sellerId).select('userId').lean()
    : null;
  if (sellerProfile?.userId) {
    const statusTitles: Record<BookingStatus, string> = {
      [BookingStatus.BOOKED]: `Booking Confirmed: ${booking.lrNumber}`,
      [BookingStatus.ACCEPTED]: `Booking Accepted: ${booking.lrNumber}`,
      [BookingStatus.DISPATCHED]: `Shipment Dispatched: ${booking.lrNumber}`,
      [BookingStatus.ARRIVED]: `Arrived at Destination Hub: ${booking.lrNumber}`,
      [BookingStatus.OUT_FOR_DELIVERY]: `Out for Delivery: ${booking.lrNumber}`,
      [BookingStatus.DELIVERED]: `Shipment Delivered: ${booking.lrNumber}`,
      [BookingStatus.REJECTED]: `Booking Rejected: ${booking.lrNumber}`,
      [BookingStatus.CANCELLED]: `Booking Cancelled: ${booking.lrNumber}`,
      [BookingStatus.NDR]: `Delivery Exception (NDR): ${booking.lrNumber}`,
      [BookingStatus.RTO_INITIATED]: `Return to Origin (RTO) Initiated: ${booking.lrNumber}`,
      [BookingStatus.RTO_DELIVERED]: `RTO Return Delivered: ${booking.lrNumber}`,
    };

    const statusMessage =
      input.status === BookingStatus.REJECTED
        ? txResult.refundedAmount > 0
          ? `Rejected at ${input.location}: ${input.remarks}. INR ${txResult.refundedAmount.toFixed(2)} auto-refunded to your wallet.`
          : `Rejected at ${input.location}: ${input.remarks}.`
        : input.status === BookingStatus.NDR
          ? `Delivery failed at ${input.location}: ${input.remarks}. Please choose Re-Attempt or Initiate RTO.`
          : input.status === BookingStatus.RTO_INITIATED
            ? txResult.rtoDebitedAmount > 0
              ? `RTO initiated (${input.remarks}). INR ${txResult.rtoDebitedAmount.toFixed(2)} RTO fee debited from wallet.`
              : `RTO initiated (${input.remarks}).`
            : `${STATUS_DESCRIPTIONS[input.status]} (${input.location}).`;

    void createAndPushNotification({
      recipientUserId: sellerProfile.userId.toString(),
      recipientRole: UserRole.SELLER,
      category:
        (input.status === BookingStatus.REJECTED && txResult.refundedAmount > 0) ||
        (input.status === BookingStatus.RTO_INITIATED && txResult.rtoDebitedAmount > 0)
          ? NotificationCategory.WALLET
          : NotificationCategory.SHIPMENT,
      title: statusTitles[input.status],
      message: statusMessage,
      link: `/seller/shipments/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });
  }

  if (
    input.status === BookingStatus.NDR ||
    input.status === BookingStatus.RTO_INITIATED ||
    input.status === BookingStatus.RTO_DELIVERED
  ) {
    void notifyAllAdmins({
      category: NotificationCategory.SHIPMENT,
      title: `${input.status}: ${booking.lrNumber}`,
      message: `${booking.lrNumber} transitioned to ${input.status} at ${input.location}${input.remarks ? ` (${input.remarks})` : ''}.`,
      link: `/admin/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });
  }

  const waEvent = WHATSAPP_STATUS_TO_EVENT[input.status];
  if (waEvent) {
    const updateText = input.remarks?.trim()
      ? `${STATUS_DESCRIPTIONS[input.status]} at ${input.location} (${input.remarks.trim()})`
      : `${STATUS_DESCRIPTIONS[input.status]} at ${input.location}`;
    void dispatchBookingNotificationEvent({
      booking: txResult.booking,
      eventType: waEvent,
      latestUpdate: updateText,
      sourceEventKey: `event:${txResult.trackingEvent._id.toString()}`,
    });
  }

  return txResult;
}

export async function cancelBookingBySeller(
  bookingId: string,
  userId: string,
  role: UserRole,
  reason: string
) {
  if (role !== UserRole.SELLER) {
    throw new AppError('Only the owning seller can cancel a booking.', 403, 'SELLER_ROLE_REQUIRED');
  }

  const booking = await assertBookingAccess(bookingId, userId, role);

  if (booking.status !== BookingStatus.BOOKED && booking.status !== BookingStatus.ACCEPTED) {
    throw new AppError(
      `Booking cannot be self-cancelled once shipment is ${booking.status}. Cancellation is allowed only before dispatch (BOOKED or ACCEPTED).`,
      400,
      'CANCELLATION_NOT_ALLOWED'
    );
  }

  const cleanReason = reason.trim();

  const txResult = await runInTransaction(async (session) => {
    let refundedAmount = 0;

    const sellerObjectId = booking.sellerId;
    if (booking.paymentMode === 'WALLET' && sellerObjectId && booking.finalAmount > 0) {
      const refundedSeller = await SellerProfile.findOneAndUpdate(
        { _id: sellerObjectId },
        { $inc: { walletBalance: booking.finalAmount } },
        { returnDocument: 'after', ...(session ? { session } : {}) }
      ).lean();

      if (refundedSeller) {
        refundedAmount = booking.finalAmount;
        const txnRand = crypto.randomBytes(3).toString('hex').toUpperCase();
        const txnYmd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        await WalletTransaction.create(
          [
            {
              transactionId: `ZPT-TXN-${txnYmd}-${txnRand}`,
              sellerId: sellerObjectId,
              userId: refundedSeller.userId,
              type: WalletTransactionType.CREDIT,
              amount: booking.finalAmount,
              balanceAfter: Number(refundedSeller.walletBalance || 0),
              paymentMethod: WalletPaymentMethod.WALLET_REFUND,
              referenceNote: booking.lrNumber,
              description: `Auto-refund for seller-cancelled booking ${booking.lrNumber}`,
              bookingId: booking._id,
              lrNumber: booking.lrNumber,
            },
          ],
          session ? { session } : undefined
        );
      }
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancellationReason = cleanReason;
    booking.cancelledAt = new Date();
    await booking.save(session ? { session } : undefined);

    const [event] = await TrackingEvent.create(
      [
        {
          bookingId: booking._id,
          lrNumber: booking.lrNumber,
          status: BookingStatus.CANCELLED,
          location: `${booking.origin.city} (${booking.origin.pincode})`,
          description: STATUS_DESCRIPTIONS[BookingStatus.CANCELLED],
          remarks:
            refundedAmount > 0
              ? `${cleanReason} · INR ${refundedAmount.toFixed(2)} refunded to seller wallet`
              : cleanReason,
          actorUserId: userId,
          actorRole: role,
          eventTimestamp: new Date(),
        },
      ],
      session ? { session } : undefined
    );

    return { booking, trackingEvent: event, refundedAmount };
  });

  const transporter = await Transporter.findById(booking.transporterId).select('userId companyName').lean();
  if (transporter?.userId) {
    void createAndPushNotification({
      recipientUserId: transporter.userId.toString(),
      recipientRole: UserRole.TRANSPORTER,
      category: NotificationCategory.BOOKING,
      title: `Booking Cancelled by Seller: ${booking.lrNumber}`,
      message: `Seller cancelled ${booking.lrNumber} prior to dispatch. Reason: ${cleanReason}`,
      link: `/transporter/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });
  }

  void notifyAllAdmins({
    category: NotificationCategory.BOOKING,
    title: `Booking Cancelled: ${booking.lrNumber}`,
    message: `Seller cancelled ${booking.lrNumber} (${cleanReason})${txResult.refundedAmount > 0 ? ` · INR ${txResult.refundedAmount.toFixed(2)} wallet refunded` : ''}.`,
    link: `/admin/bookings/${booking._id.toString()}`,
    entityType: 'Booking',
    entityId: booking._id.toString(),
  });

  return txResult;
}

export async function resolveNdrBySeller(
  bookingId: string,
  userId: string,
  role: UserRole,
  input: { action: 'REATTEMPT' | 'INITIATE_RTO'; remarks: string }
) {
  if (role !== UserRole.SELLER) {
    throw new AppError('Only the owning seller can submit NDR instructions.', 403, 'SELLER_ROLE_REQUIRED');
  }

  const booking = await assertBookingAccess(bookingId, userId, role);
  if (booking.status !== BookingStatus.NDR) {
    throw new AppError(
      `NDR instructions can only be submitted when shipment is in NDR status (current: ${booking.status}).`,
      400,
      'INVALID_STATUS_FOR_NDR_ACTION'
    );
  }

  const cleanRemarks = input.remarks.trim();

  if (input.action === 'REATTEMPT') {
    const event = await TrackingEvent.create({
      bookingId: booking._id,
      lrNumber: booking.lrNumber,
      status: BookingStatus.NDR,
      location: `${booking.destination.city} (${booking.destination.pincode})`,
      description: 'Seller requested delivery re-attempt',
      remarks: cleanRemarks,
      actorUserId: userId,
      actorRole: role,
      eventTimestamp: new Date(),
    });

    const transporter = await Transporter.findById(booking.transporterId).select('userId').lean();
    if (transporter?.userId) {
      void createAndPushNotification({
        recipientUserId: transporter.userId.toString(),
        recipientRole: UserRole.TRANSPORTER,
        category: NotificationCategory.SHIPMENT,
        title: `NDR Re-Attempt Requested: ${booking.lrNumber}`,
        message: `Seller instructions for ${booking.lrNumber}: ${cleanRemarks}`,
        link: `/transporter/bookings/${booking._id.toString()}`,
        entityType: 'Booking',
        entityId: booking._id.toString(),
      });
    }

    return { booking, trackingEvent: event, rtoDebitedAmount: 0 };
  }

  const txResult = await runInTransaction(async (session) => {
    booking.rtoReason = cleanRemarks;
    booking.rtoInitiatedAt = new Date();
    const rtoDebitedAmount = await applyRtoCharge(booking, session);
    booking.status = BookingStatus.RTO_INITIATED;
    await booking.save(session ? { session } : undefined);

    const [event] = await TrackingEvent.create(
      [
        {
          bookingId: booking._id,
          lrNumber: booking.lrNumber,
          status: BookingStatus.RTO_INITIATED,
          location: `${booking.destination.city} (${booking.destination.pincode})`,
          description: STATUS_DESCRIPTIONS[BookingStatus.RTO_INITIATED],
          remarks:
            rtoDebitedAmount > 0
              ? `${cleanRemarks} · Seller confirmed RTO · INR ${rtoDebitedAmount.toFixed(2)} RTO charge debited`
              : `${cleanRemarks} · Seller confirmed RTO`,
          actorUserId: userId,
          actorRole: role,
          eventTimestamp: new Date(),
        },
      ],
      session ? { session } : undefined
    );

    return { booking, trackingEvent: event, rtoDebitedAmount };
  });

  const transporter = await Transporter.findById(booking.transporterId).select('userId').lean();
  if (transporter?.userId) {
    void createAndPushNotification({
      recipientUserId: transporter.userId.toString(),
      recipientRole: UserRole.TRANSPORTER,
      category: NotificationCategory.SHIPMENT,
      title: `RTO Approved by Seller: ${booking.lrNumber}`,
      message: `Please return ${booking.lrNumber} back to ${booking.origin.city}. Note: ${cleanRemarks}`,
      link: `/transporter/bookings/${booking._id.toString()}`,
      entityType: 'Booking',
      entityId: booking._id.toString(),
    });
  }

  void notifyAllAdmins({
    category: NotificationCategory.SHIPMENT,
    title: `RTO Initiated by Seller: ${booking.lrNumber}`,
    message: `Seller requested Return to Origin for ${booking.lrNumber}: ${cleanRemarks}.`,
    link: `/admin/bookings/${booking._id.toString()}`,
    entityType: 'Booking',
    entityId: booking._id.toString(),
  });

  return txResult;
}

function parseCartonTarget(
  lrNumber: string,
  totalPackages: number,
  cartonNumberInput?: number,
  cartonCodeInput?: string
): { cartonNumber: number; cartonCode: string } {
  if (cartonNumberInput !== undefined) {
    if (cartonNumberInput < 1 || cartonNumberInput > totalPackages) {
      throw new AppError(
        `Carton #${cartonNumberInput} is out of range (manifest has ${totalPackages} cartons).`,
        400,
        'INVALID_CARTON_NUMBER'
      );
    }
    return {
      cartonNumber: cartonNumberInput,
      cartonCode: formatCartonCode(lrNumber, cartonNumberInput),
    };
  }

  const normalized = (cartonCodeInput || '').trim().toUpperCase();
  const lrUpper = lrNumber.toUpperCase();
  const match = normalized.match(/^(.+)-C(\d+)$/);
  if (match) {
    const [, prefix, numStr] = match;
    if (prefix !== lrUpper) {
      throw new AppError(
        `Scanned barcode ${normalized} belongs to ${prefix}, not ${lrUpper}.`,
        400,
        'CARTON_LR_MISMATCH'
      );
    }
    const parsedNum = Number(numStr);
    if (!Number.isInteger(parsedNum) || parsedNum < 1 || parsedNum > totalPackages) {
      throw new AppError(
        `Carton #${parsedNum} does not exist on ${lrUpper} (total ${totalPackages} cartons).`,
        400,
        'INVALID_CARTON_NUMBER'
      );
    }
    return { cartonNumber: parsedNum, cartonCode: formatCartonCode(lrUpper, parsedNum) };
  }

  if (normalized === lrUpper && totalPackages === 1) {
    return { cartonNumber: 1, cartonCode: formatCartonCode(lrUpper, 1) };
  }

  throw new AppError(
    `Invalid carton barcode "${normalized}". Expected format: ${formatCartonCode(lrUpper, 1)}`,
    400,
    'INVALID_CARTON_BARCODE'
  );
}

export async function scanBookingCarton(
  bookingId: string,
  userId: string,
  role: UserRole,
  input: { cartonNumber?: number; cartonCode?: string; location?: string }
) {
  if (role !== UserRole.TRANSPORTER) {
    throw new AppError('Only the assigned transporter can scan carton barcodes.', 403, 'TRANSPORTER_ROLE_REQUIRED');
  }

  const booking = await assertBookingAccess(bookingId, userId, role);
  if (
    booking.status === BookingStatus.REJECTED ||
    booking.status === BookingStatus.CANCELLED ||
    booking.status === BookingStatus.RTO_DELIVERED
  ) {
    throw new AppError(
      `Cannot scan cartons for a ${booking.status.toLowerCase().replace(/_/g, ' ')} booking.`,
      400,
      'BOOKING_REJECTED'
    );
  }

  const { cartonNumber, cartonCode } = parseCartonTarget(
    booking.lrNumber,
    booking.parcel.numberOfPackages,
    input.cartonNumber,
    input.cartonCode
  );

  const existing = (booking.scannedCartons || []).find((c) => c.cartonNumber === cartonNumber);
  if (existing) {
    return {
      booking: booking.toJSON(),
      scannedCarton: existing,
      alreadyScanned: true,
      scannedCount: booking.scannedCartons.length,
      totalCartons: booking.parcel.numberOfPackages,
    };
  }

  const scannedEntry = {
    cartonNumber,
    cartonCode,
    scannedAt: new Date(),
    scannedByUserId: new mongoose.Types.ObjectId(userId),
    location:
      input.location?.trim() || `${booking.origin.city} (${booking.origin.pincode})`,
  };

  booking.scannedCartons.push(scannedEntry);
  await booking.save();

  return {
    booking: booking.toJSON(),
    scannedCarton: scannedEntry,
    alreadyScanned: false,
    scannedCount: booking.scannedCartons.length,
    totalCartons: booking.parcel.numberOfPackages,
  };
}

export async function scanCartonByBarcode(
  userId: string,
  role: UserRole,
  cartonCodeInput: string,
  location?: string
) {
  if (role !== UserRole.TRANSPORTER) {
    throw new AppError('Only transporters can scan carton barcodes.', 403, 'TRANSPORTER_ROLE_REQUIRED');
  }

  const transporter = await Transporter.findOne({ userId }).lean();
  if (!transporter) {
    throw new AppError('Transporter profile not found.', 404, 'TRANSPORTER_NOT_FOUND');
  }

  const normalized = cartonCodeInput.trim().toUpperCase();
  const suffixMatch = normalized.match(/^(.+)-C(\d+)$/);
  const targetLr = suffixMatch ? suffixMatch[1] : normalized;

  const booking = await Booking.findOne({
    transporterId: transporter._id,
    lrNumber: targetLr,
  }).lean();

  if (!booking) {
    throw new AppError(
      `No assigned shipment found matching LR/carton code "${normalized}".`,
      404,
      'CARTON_BOOKING_NOT_FOUND'
    );
  }

  return scanBookingCarton(booking._id.toString(), userId, role, {
    cartonCode: normalized,
    location,
  });
}
