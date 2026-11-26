import crypto from 'crypto';
import mongoose from 'mongoose';
import { Booking } from '../../models/Booking.ts';
import { Transporter } from '../../models/Transporter.ts';
import { SettlementStatus, TransporterSettlement } from '../../models/TransporterSettlement.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import { runInTransaction } from '../../config/database.ts';
import { round2 } from '../pricing/pricing.engine.ts';
import { createAndPushNotification } from '../notifications/notifications.service.ts';
import { AppError } from '../../utils/AppError.ts';
import { BookingStatus, UserRole } from '../../utils/constants.ts';
import type { CreateTransporterSettlementInput } from './settlements.validator.ts';

const PLATFORM_COMMISSION_RATE = 5;

function generateSettlementId(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ZPT-SET-${ymd}-${rand}`;
}

function computeBookingEarnings(booking: {
  freight?: number;
  pricingSnapshot?: { additionalCharges?: number };
}) {
  const grossFreight = round2(
    Number(booking.freight || 0) + Number(booking.pricingSnapshot?.additionalCharges || 0)
  );
  const platformFee = round2(grossFreight * (PLATFORM_COMMISSION_RATE / 100));
  const netEarning = round2(Math.max(0, grossFreight - platformFee));
  return { grossFreight, platformFee, netEarning };
}

function formatTransporterSummary(t: {
  _id: mongoose.Types.ObjectId;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstNumber: string;
  status: string;
  kyc?: {
    status?: string;
    bankName?: string;
    bankAccountHolder?: string;
    bankAccountNumber?: string;
    ifscCode?: string;
  };
}) {
  return {
    _id: t._id.toString(),
    companyName: t.companyName,
    contactPerson: t.contactPerson,
    email: t.email,
    phone: t.phone,
    gstNumber: t.gstNumber,
    status: t.status,
    kycStatus: t.kyc?.status || 'NOT_SUBMITTED',
    bankAccount: {
      bankName: t.kyc?.bankName || '',
      accountHolder: t.kyc?.bankAccountHolder || '',
      accountNumber: t.kyc?.bankAccountNumber || '',
      ifscCode: t.kyc?.ifscCode || '',
    },
  };
}

export async function getAdminSettlementsOverview() {
  const [transporters, settlements, deliveredBookings] = await Promise.all([
    Transporter.find({})
      .select('companyName contactPerson email phone gstNumber status kyc.status kyc.bankName kyc.bankAccountHolder kyc.bankAccountNumber kyc.ifscCode')
      .sort({ companyName: 1 })
      .lean(),
    TransporterSettlement.find({})
      .populate('transporterId', 'companyName contactPerson gstNumber')
      .sort({ settledAt: -1 })
      .limit(100)
      .lean(),
    Booking.find({
      status: BookingStatus.DELIVERED,
      bookingSource: { $ne: 'TRANSPORTER_SELF' },
    })
      .select('transporterId freight pricingSnapshot createdAt')
      .lean(),
  ]);

  const settledBookingIds = new Set<string>();
  let totalSettledAmount = 0;

  for (const st of settlements) {
    if (st.status === SettlementStatus.SETTLED) {
      totalSettledAmount = round2(totalSettledAmount + Number(st.netPayoutAmount || 0));
    }
    for (const bid of st.bookingIds || []) {
      settledBookingIds.add(bid.toString());
    }
  }

  const pendingByTransporter = new Map<
    string,
    {
      pendingCount: number;
      pendingGrossFreight: number;
      pendingPlatformFee: number;
      pendingNetPayout: number;
      oldestDeliveredAt: Date | null;
    }
  >();

  let totalPendingPayout = 0;
  let totalPendingBookings = 0;

  for (const b of deliveredBookings) {
    if (settledBookingIds.has(b._id.toString())) {
      continue;
    }
    const tid = b.transporterId.toString();
    const calc = computeBookingEarnings(b);
    const current = pendingByTransporter.get(tid) || {
      pendingCount: 0,
      pendingGrossFreight: 0,
      pendingPlatformFee: 0,
      pendingNetPayout: 0,
      oldestDeliveredAt: null,
    };

    current.pendingCount += 1;
    current.pendingGrossFreight = round2(current.pendingGrossFreight + calc.grossFreight);
    current.pendingPlatformFee = round2(current.pendingPlatformFee + calc.platformFee);
    current.pendingNetPayout = round2(current.pendingNetPayout + calc.netEarning);
    if (!current.oldestDeliveredAt || new Date(b.createdAt) < current.oldestDeliveredAt) {
      current.oldestDeliveredAt = new Date(b.createdAt);
    }

    pendingByTransporter.set(tid, current);
    totalPendingPayout = round2(totalPendingPayout + calc.netEarning);
    totalPendingBookings += 1;
  }

  const carrierSummaries = transporters
    .map((t) => {
      const pending = pendingByTransporter.get(t._id.toString()) || {
        pendingCount: 0,
        pendingGrossFreight: 0,
        pendingPlatformFee: 0,
        pendingNetPayout: 0,
        oldestDeliveredAt: null,
      };
      return {
        ...formatTransporterSummary(t),
        ...pending,
      };
    })
    .sort((a, b) => b.pendingNetPayout - a.pendingNetPayout);

  return {
    commissionRatePercent: PLATFORM_COMMISSION_RATE,
    summary: {
      totalPendingPayout,
      totalPendingBookings,
      totalSettledAmount,
      settledBatchCount: settlements.length,
      transportersAwaitingPayout: carrierSummaries.filter((c) => c.pendingCount > 0).length,
    },
    transporters: carrierSummaries,
    settlements,
  };
}

export async function getTransporterPendingBookings(transporterId: string) {
  const transporter = await Transporter.findById(transporterId)
    .select('companyName contactPerson email phone gstNumber status kyc.status kyc.bankName kyc.bankAccountHolder kyc.bankAccountNumber kyc.ifscCode')
    .lean();

  if (!transporter) {
    throw new AppError('Transporter not found.', 404, 'TRANSPORTER_NOT_FOUND');
  }

  const [deliveredBookings, settlements] = await Promise.all([
    Booking.find({
      transporterId: transporter._id,
      status: BookingStatus.DELIVERED,
      bookingSource: { $ne: 'TRANSPORTER_SELF' },
    })
      .select('bookingId lrNumber origin destination freight tax pricingSnapshot paymentMode createdAt updatedAt')
      .sort({ createdAt: 1 })
      .lean(),
    TransporterSettlement.find({ transporterId: transporter._id })
      .sort({ settledAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const settledBookingIds = new Set<string>();
  for (const st of settlements) {
    for (const bid of st.bookingIds || []) {
      settledBookingIds.add(bid.toString());
    }
  }

  let grossAmount = 0;
  let platformFee = 0;
  let netPayoutAmount = 0;

  const pendingBookings = deliveredBookings
    .filter((b) => !settledBookingIds.has(b._id.toString()))
    .map((b) => {
      const calc = computeBookingEarnings(b);
      grossAmount = round2(grossAmount + calc.grossFreight);
      platformFee = round2(platformFee + calc.platformFee);
      netPayoutAmount = round2(netPayoutAmount + calc.netEarning);

      return {
        _id: b._id.toString(),
        bookingId: b.bookingId,
        lrNumber: b.lrNumber,
        lane: `${b.origin.city} → ${b.destination.city}`,
        paymentMode: b.paymentMode,
        grossFreight: calc.grossFreight,
        platformFee: calc.platformFee,
        netEarning: calc.netEarning,
        deliveredAt: b.updatedAt,
        createdAt: b.createdAt,
      };
    });

  return {
    commissionRatePercent: PLATFORM_COMMISSION_RATE,
    transporter: formatTransporterSummary(transporter),
    pendingBookings,
    totals: {
      bookingCount: pendingBookings.length,
      grossAmount,
      platformFee,
      netPayoutAmount,
    },
    recentSettlements: settlements,
  };
}

export async function createTransporterSettlement(
  adminUserId: string,
  input: CreateTransporterSettlementInput
) {
  const uniqueBookingIdStrings = Array.from(new Set(input.bookingIds));
  const bookingObjectIds = uniqueBookingIdStrings.map((id) => new mongoose.Types.ObjectId(id));
  const cleanUtr = input.utrNumber.trim().toUpperCase();

  const txResult = await runInTransaction(async (session) => {
    const transporter = await Transporter.findById(
      input.transporterId,
      'userId companyName contactPerson email',
      session ? { session } : undefined
    ).lean();

    if (!transporter) {
      throw new AppError('Transporter not found.', 404, 'TRANSPORTER_NOT_FOUND');
    }

    const duplicateUtr = await TransporterSettlement.findOne(
      { utrNumber: cleanUtr },
      '_id settlementId',
      session ? { session } : undefined
    ).lean();

    if (duplicateUtr) {
      throw new AppError(
        `UTR number ${cleanUtr} is already recorded under settlement ${duplicateUtr.settlementId}.`,
        409,
        'DUPLICATE_UTR_NUMBER'
      );
    }

    const bookings = await Booking.find(
      {
        _id: { $in: bookingObjectIds },
        transporterId: transporter._id,
      },
      'bookingId lrNumber bookingSource status freight pricingSnapshot',
      session ? { session } : undefined
    ).lean();

    if (bookings.length !== uniqueBookingIdStrings.length) {
      throw new AppError(
        'One or more selected bookings do not exist or do not belong to this transporter.',
        400,
        'INVALID_SETTLEMENT_BOOKINGS'
      );
    }

    const personalBookings = bookings.filter((b) => b.bookingSource === 'TRANSPORTER_SELF');
    if (personalBookings.length > 0) {
      throw new AppError(
        `Transporter personal bookings (${personalBookings[0].lrNumber}) are settled directly with your customer and excluded from platform payouts.`,
        400,
        'PERSONAL_BOOKINGS_NOT_SETTLED'
      );
    }

    const nonDelivered = bookings.filter((b) => b.status !== BookingStatus.DELIVERED);
    if (nonDelivered.length > 0) {
      throw new AppError(
        `Only DELIVERED bookings can be settled (found ${nonDelivered[0].lrNumber} in ${nonDelivered[0].status}).`,
        400,
        'BOOKINGS_NOT_DELIVERED'
      );
    }

    const alreadySettled = await TransporterSettlement.findOne(
      { bookingIds: { $in: bookingObjectIds } },
      'settlementId',
      session ? { session } : undefined
    ).lean();

    if (alreadySettled) {
      throw new AppError(
        `One or more selected bookings are already included in settlement ${alreadySettled.settlementId}.`,
        409,
        'BOOKING_ALREADY_SETTLED'
      );
    }

    let grossAmount = 0;
    let platformFee = 0;
    let netPayoutAmount = 0;

    for (const b of bookings) {
      const calc = computeBookingEarnings(b);
      grossAmount = round2(grossAmount + calc.grossFreight);
      platformFee = round2(platformFee + calc.platformFee);
      netPayoutAmount = round2(netPayoutAmount + calc.netEarning);
    }

    const [settlement] = await TransporterSettlement.create(
      [
        {
          settlementId: generateSettlementId(),
          transporterId: transporter._id,
          periodLabel: input.periodLabel.trim(),
          bookingIds: bookings.map((b) => b._id),
          bookingCount: bookings.length,
          grossAmount,
          platformCommissionRate: PLATFORM_COMMISSION_RATE,
          platformFee,
          netPayoutAmount,
          payoutMethod: input.payoutMethod,
          utrNumber: cleanUtr,
          status: SettlementStatus.SETTLED,
          settledAt: new Date(),
          settledByUserId: new mongoose.Types.ObjectId(adminUserId),
          ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}),
        },
      ],
      session ? { session } : undefined
    );

    return {
      settlement: settlement.toJSON(),
      transporterUserId: transporter.userId.toString(),
      companyName: transporter.companyName,
    };
  });

  void createAndPushNotification({
    recipientUserId: txResult.transporterUserId,
    recipientRole: UserRole.TRANSPORTER,
    category: NotificationCategory.WALLET,
    title: `Payout Settled: INR ${txResult.settlement.netPayoutAmount.toFixed(2)}`,
    message: `${txResult.settlement.bookingCount} delivered shipment(s) settled via ${txResult.settlement.payoutMethod} (UTR: ${txResult.settlement.utrNumber}).`,
    link: '/transporter/earnings',
    entityType: 'TransporterSettlement',
    entityId: txResult.settlement.settlementId,
  });

  return txResult.settlement;
}
