import { Booking } from '../../models/Booking.ts';
import { TrackingEvent } from '../../models/TrackingEvent.ts';
import { DeliveryProof } from '../../models/DeliveryProof.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { Transporter } from '../../models/Transporter.ts';
import { AppError } from '../../utils/AppError.ts';
import { escapeRegex } from '../../utils/sanitize.ts';
import { UserRole } from '../../utils/constants.ts';

export async function trackShipmentByLr(lrNumber: string, userId: string, role: UserRole) {
  const cleanLr = lrNumber.trim();
  const booking = await Booking.findOne({
    lrNumber: new RegExp(`^${escapeRegex(cleanLr)}$`, 'i'),
  })
    .populate('transporterId', 'companyName contactPerson phone')
    .populate('sellerId', 'businessName city')
    .lean();

  if (!booking) {
    throw new AppError(`No shipment found with LR number "${cleanLr}".`, 404, 'LR_NOT_FOUND');
  }

  // Enforce strict authorization before exposing shipment details
  if (role === UserRole.SELLER) {
    const seller = await SellerProfile.findOne({ userId }).lean();
    const bookingSellerId =
      typeof booking.sellerId === 'object' && booking.sellerId !== null && '_id' in booking.sellerId
        ? (booking.sellerId as { _id: { toString(): string } })._id.toString()
        : String(booking.sellerId);

    if (!seller || bookingSellerId !== seller._id.toString()) {
      throw new AppError('You are not authorized to track this shipment.', 403, 'TRACKING_ACCESS_FORBIDDEN');
    }
  } else if (role === UserRole.TRANSPORTER) {
    const transporter = await Transporter.findOne({ userId }).lean();
    const bookingTransporterId =
      typeof booking.transporterId === 'object' &&
      booking.transporterId !== null &&
      '_id' in booking.transporterId
        ? (booking.transporterId as { _id: { toString(): string } })._id.toString()
        : String(booking.transporterId);

    if (!transporter || bookingTransporterId !== transporter._id.toString()) {
      throw new AppError('You are not authorized to track this shipment.', 403, 'TRACKING_ACCESS_FORBIDDEN');
    }
  }

  const timeline = await TrackingEvent.find({ bookingId: booking._id })
    .sort({ createdAt: 1, eventTimestamp: 1 })
    .lean();

  const latestUpdate = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  return {
    bookingId: booking._id.toString(),
    bookingRef: booking.bookingId,
    lrNumber: booking.lrNumber,
    currentStatus: booking.status,
    origin: booking.origin,
    destination: booking.destination,
    sender: booking.sender,
    receiver: {
      name: booking.receiver.name,
      city: booking.receiver.city,
      pincode: booking.receiver.pincode,
    },
    transporter: booking.transporterId,
    bookingDate: booking.createdAt,
    latestUpdate,
    timeline,
  };
}

export async function trackShipmentPublicByLr(lrNumber: string) {
  const cleanLr = lrNumber.trim();
  const booking = await Booking.findOne({
    lrNumber: new RegExp(`^${escapeRegex(cleanLr)}$`, 'i'),
  })
    .populate('transporterId', 'companyName')
    .populate('sellerId', 'businessName city')
    .lean();

  if (!booking) {
    throw new AppError(`No shipment found with LR number "${cleanLr}".`, 404, 'LR_NOT_FOUND');
  }

  const [timeline, deliveryProof] = await Promise.all([
    TrackingEvent.find({ bookingId: booking._id })
      .select('status location description remarks eventTimestamp')
      .sort({ createdAt: 1, eventTimestamp: 1 })
      .lean(),
    DeliveryProof.findOne({ bookingId: booking._id })
      .select('receiverName deliveryDate remarks')
      .lean(),
  ]);

  const latestUpdate = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const sellerObj =
    typeof booking.sellerId === 'object' && booking.sellerId !== null
      ? (booking.sellerId as unknown as { businessName?: string })
      : null;
  const transporterObj =
    typeof booking.transporterId === 'object' && booking.transporterId !== null
      ? (booking.transporterId as unknown as { companyName?: string })
      : null;

  return {
    bookingId: booking.bookingId,
    bookingRef: booking.bookingId,
    lrNumber: booking.lrNumber,
    status: booking.status,
    currentStatus: booking.status,
    origin: {
      city: booking.origin.city,
      pincode: booking.origin.pincode,
    },
    destination: {
      city: booking.destination.city,
      pincode: booking.destination.pincode,
    },
    consignorName: sellerObj?.businessName || booking.sender.name,
    consigneeName: booking.receiver.name,
    transporterName: transporterObj?.companyName || 'Assigned Carrier',
    estimatedDeliveryTime: booking.pricingSnapshot?.estimatedDeliveryTime || null,
    numberOfPackages: booking.parcel?.numberOfPackages || 1,
    totalCartons: booking.parcel?.numberOfPackages || 1,
    scannedCartonsCount: (booking.scannedCartons || []).length,
    bookingDate: booking.createdAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    deliverySummary: deliveryProof
      ? {
          receiverName: deliveryProof.receiverName,
          deliveryDate: deliveryProof.deliveryDate,
        }
      : null,
    deliveryProof: deliveryProof
      ? {
          receiverName: deliveryProof.receiverName,
          deliveryDate: deliveryProof.deliveryDate,
          remarks: deliveryProof.remarks,
        }
      : null,
    latestUpdate,
    timeline,
  };
}

