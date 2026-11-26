import mongoose from 'mongoose';
import { env } from '../../config/env.ts';
import { fileStorage } from '../../config/storage.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { Transporter } from '../../models/Transporter.ts';
import { TransportRoute } from '../../models/TransportRoute.ts';
import { Booking } from '../../models/Booking.ts';
import {
  BookingStatus,
  EntityStatus,
  SellerApprovalStatus,
  TransporterApprovalStatus,
  UserRole,
} from '../../utils/constants.ts';

export async function getDashboardStats(userId: string, role: UserRole) {
  if (role === UserRole.ADMIN) {
    const [
      totalSellers,
      pendingSellerApprovals,
      totalTransporters,
      pendingTransporterApprovals,
      activeRoutes,
      totalBookings,
      pendingBookings,
      deliveredShipments,
      recentBookings,
    ] = await Promise.all([
      SellerProfile.countDocuments({}),
      SellerProfile.countDocuments({ approvalStatus: SellerApprovalStatus.PENDING }),
      Transporter.countDocuments({}),
      Transporter.countDocuments({ approvalStatus: TransporterApprovalStatus.PENDING }),
      TransportRoute.countDocuments({ status: EntityStatus.ACTIVE, isDeleted: { $ne: true } }),
      Booking.countDocuments({}),
      Booking.countDocuments({ status: { $in: [BookingStatus.BOOKED, BookingStatus.ACCEPTED] } }),
      Booking.countDocuments({ status: BookingStatus.DELIVERED }),
      Booking.find({})
        .populate('sellerId', 'businessName')
        .populate('transporterId', 'companyName')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
    ]);

    return {
      role,
      metrics: {
        totalSellers,
        pendingSellerApprovals,
        totalTransporters,
        pendingTransporterApprovals,
        activeRoutes,
        totalBookings,
        pendingBookings,
        deliveredShipments,
      },
      recentBookings,
    };
  }

  if (role === UserRole.SELLER) {
    const seller = await SellerProfile.findOne({ userId }).lean();
    if (!seller) {
      return {
        role,
        approvalStatus: SellerApprovalStatus.PENDING,
        metrics: {
          totalShipments: 0,
          pendingShipments: 0,
          inTransitShipments: 0,
          deliveredShipments: 0,
        },
        recentBookings: [],
      };
    }

    const [totalShipments, pendingShipments, inTransitShipments, deliveredShipments, recentBookings] =
      await Promise.all([
        Booking.countDocuments({ sellerId: seller._id }),
        Booking.countDocuments({ sellerId: seller._id, status: BookingStatus.BOOKED }),
        Booking.countDocuments({
          sellerId: seller._id,
          status: {
            $in: [
              BookingStatus.ACCEPTED,
              BookingStatus.DISPATCHED,
              BookingStatus.ARRIVED,
              BookingStatus.NDR,
              BookingStatus.RTO_INITIATED,
            ],
          },
        }),
        Booking.countDocuments({ sellerId: seller._id, status: BookingStatus.DELIVERED }),
        Booking.find({ sellerId: seller._id })
          .populate('transporterId', 'companyName phone')
          .sort({ createdAt: -1 })
          .limit(6)
          .lean(),
      ]);

    return {
      role,
      approvalStatus: seller.approvalStatus,
      rejectionReason: seller.rejectionReason,
      metrics: {
        totalShipments,
        pendingShipments,
        inTransitShipments,
        deliveredShipments,
      },
      recentBookings,
    };
  }

  const transporter = await Transporter.findOne({ userId }).lean();
  if (!transporter) {
    return {
      role,
      metrics: {
        totalAssigned: 0,
        pendingAcceptance: 0,
        inTransitShipments: 0,
        deliveredShipments: 0,
      },
      recentBookings: [],
    };
  }

  const [
    totalAssigned,
    pendingAcceptance,
    inTransitShipments,
    deliveredShipments,
    platformOrdersCount,
    personalBookedCount,
    recentBookings,
  ] = await Promise.all([
    Booking.countDocuments({ transporterId: transporter._id }),
    Booking.countDocuments({ transporterId: transporter._id, status: BookingStatus.BOOKED }),
    Booking.countDocuments({
      transporterId: transporter._id,
      status: {
        $in: [
          BookingStatus.ACCEPTED,
          BookingStatus.DISPATCHED,
          BookingStatus.ARRIVED,
          BookingStatus.NDR,
          BookingStatus.RTO_INITIATED,
        ],
      },
    }),
    Booking.countDocuments({ transporterId: transporter._id, status: BookingStatus.DELIVERED }),
    Booking.countDocuments({
      transporterId: transporter._id,
      bookingSource: { $ne: 'TRANSPORTER_SELF' },
    }),
    Booking.countDocuments({
      transporterId: transporter._id,
      bookingSource: 'TRANSPORTER_SELF',
    }),
    Booking.find({ transporterId: transporter._id })
      .populate('sellerId', 'businessName phone')
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  return {
    role,
    transporterStatus: transporter.status,
    approvalStatus: transporter.approvalStatus ?? TransporterApprovalStatus.APPROVED,
    rejectionReason: transporter.rejectionReason,
    metrics: {
      totalAssigned,
      pendingAcceptance,
      inTransitShipments,
      deliveredShipments,
      platformOrdersCount,
      personalBookedCount,
    },
    recentBookings,
  };
}

const MONGO_STATES: Record<number, string> = {
  0: 'Disconnected',
  1: 'Connected',
  2: 'Connecting',
  3: 'Disconnecting',
};

export async function getBackendHealth() {
  const readyState = mongoose.connection.readyState;
  const dbStateLabel = MONGO_STATES[readyState] || 'Unknown';
  let dbConnected = false;
  let dbPingMs: number | null = null;
  let dbError: string | undefined;

  if (readyState === 1 && mongoose.connection.db) {
    const start = performance.now();
    try {
      await mongoose.connection.db.admin().ping();
      dbPingMs = Math.round((performance.now() - start) * 100) / 100;
      dbConnected = true;
    } catch (err) {
      dbError = err instanceof Error ? err.message : 'Database ping failed';
    }
  } else {
    dbError = `Database is currently ${dbStateLabel.toLowerCase()}.`;
  }

  const storageHealth = await fileStorage.checkHealth();
  const storageWritable = storageHealth.writable;

  const mem = process.memoryUsage();
  const status = dbConnected && storageWritable ? 'healthy' : 'degraded';

  return {
    status,
    service: 'zipit-b2b-transport',
    environment: env.nodeEnv,
    uptimeSeconds: Math.floor(process.uptime()),
    checkedAt: new Date().toISOString(),
    database: {
      connected: dbConnected,
      state: dbStateLabel,
      pingMs: dbPingMs,
      error: dbError,
    },
    storage: {
      writable: storageWritable,
      provider: storageHealth.provider,
    },
    runtime: {
      nodeVersion: process.version,
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
      rssMb: Math.round(mem.rss / (1024 * 1024)),
    },
  };
}
