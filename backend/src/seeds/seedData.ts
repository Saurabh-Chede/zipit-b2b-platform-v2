import bcrypt from 'bcryptjs';
import { User } from '../models/User.ts';
import { SellerProfile } from '../models/SellerProfile.ts';
import { Transporter } from '../models/Transporter.ts';
import { TransportRoute } from '../models/TransportRoute.ts';
import { TransportRate } from '../models/TransportRate.ts';
import { Booking } from '../models/Booking.ts';
import { TrackingEvent } from '../models/TrackingEvent.ts';
import { DeliveryProof } from '../models/DeliveryProof.ts';
import {
  WalletPaymentMethod,
  WalletTransaction,
  WalletTransactionType,
} from '../models/WalletTransaction.ts';
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../models/SupportTicket.ts';
import { TransporterSettlement, SettlementStatus } from '../models/TransporterSettlement.ts';
import { PlatformConfig } from '../models/PlatformConfig.ts';
import { RouteAuditLog } from '../models/RouteAuditLog.ts';
import {
  BookingStatus,
  EntityStatus,
  SellerApprovalStatus,
  TransporterApprovalStatus,
  STATUS_DESCRIPTIONS,
  UserRole,
} from '../utils/constants.ts';
import { calculateFreightBreakdown } from '../modules/pricing/pricing.engine.ts';
import { fileStorage } from '../config/storage.ts';
import { logger } from '../config/logger.ts';

// Minimal valid 1x1 PNG buffer for seeded delivered shipment proof preview
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABmJLR0QA/wD/AP+gvaeTAAAAb0lEQVR4nO3QMQEAAAgDoGly/3Y4wMMEJ0xV0+x6B4HAAQIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcIEAgcOAAf5kAQRm5u90AAAAASUVORK5CYII=';

export async function seedDatabase(forceReset = false): Promise<{ seeded: boolean }> {
  await Promise.allSettled([
    TransportRoute.syncIndexes(),
    TransportRate.syncIndexes(),
    Booking.syncIndexes(),
  ]);

  if (forceReset) {
    await Promise.all([
      RouteAuditLog.deleteMany({}),
      PlatformConfig.deleteMany({}),
      TransporterSettlement.deleteMany({}),
      SupportTicket.deleteMany({}),
      WalletTransaction.deleteMany({}),
      DeliveryProof.deleteMany({}),
      TrackingEvent.deleteMany({}),
      Booking.deleteMany({}),
      TransportRate.deleteMany({}),
      TransportRoute.deleteMany({}),
      Transporter.deleteMany({}),
      SellerProfile.deleteMany({}),
      User.deleteMany({}),
    ]);
  }

  const existingUsers = await User.countDocuments({});
  if (existingUsers > 0) {
    // Non-destructive backfill for demo sellers seeded prior to wallet support
    const demoCredits = [
      { email: 'seller1@apexhardware.in', amount: 25000, txnId: 'ZPT-TXN-SEED-1001', ref: 'NEFT-APEX-OPENING' },
      { email: 'seller2@metrotextiles.in', amount: 18500, txnId: 'ZPT-TXN-SEED-1002', ref: 'NEFT-METRO-OPENING' },
    ];
    for (const demo of demoCredits) {
      const seller = await SellerProfile.findOne({ email: demo.email }).lean();
      if (!seller) continue;
      const txnCount = await WalletTransaction.countDocuments({ sellerId: seller._id });
      if (txnCount === 0 && Number(seller.walletBalance || 0) === 0) {
        await SellerProfile.updateOne(
          { _id: seller._id },
          { $set: { walletBalance: demo.amount } }
        );
        await WalletTransaction.create({
          transactionId: demo.txnId,
          sellerId: seller._id,
          userId: seller.userId,
          type: WalletTransactionType.CREDIT,
          amount: demo.amount,
          balanceAfter: demo.amount,
          paymentMethod: WalletPaymentMethod.OPENING_CREDIT,
          referenceNote: demo.ref,
          description: 'Opening Prepaid Wallet Credit',
        });
      }
    }

    const ticketCount = await SupportTicket.countDocuments({});
    if (ticketCount === 0) {
      const [adminDoc, seller1Doc, trans1Doc] = await Promise.all([
        User.findOne({ email: 'admin@zipit.in' }).lean(),
        User.findOne({ email: 'seller1@apexhardware.in' }).lean(),
        User.findOne({ email: 'ops@swiftlinefreight.in' }).lean(),
      ]);
      if (adminDoc && seller1Doc && trans1Doc) {
        await SupportTicket.create([
          {
            ticketNumber: 'ZPT-SUP-SEED-1001',
            createdByUserId: seller1Doc._id,
            createdByRole: UserRole.SELLER,
            createdByName: 'Apex Industrial Hardware Pvt Ltd',
            subject: 'Pickup slot confirmation for Bhosari dispatch',
            category: SupportTicketCategory.PICKUP_DELIVERY,
            priority: SupportTicketPriority.MEDIUM,
            lrNumber: 'ZIPIT-LR-100001',
            status: SupportTicketStatus.IN_PROGRESS,
            lastMessageAt: new Date(Date.now() - 2 * 3600000),
            messages: [
              {
                senderUserId: seller1Doc._id,
                senderName: 'Apex Industrial Hardware Pvt Ltd',
                senderRole: UserRole.SELLER,
                body: 'Requesting morning dock pickup before 11:30 AM for 5 packed pallets under ZIPIT-LR-100001.',
                createdAt: new Date(Date.now() - 4 * 3600000),
              },
              {
                senderUserId: adminDoc._id,
                senderName: adminDoc.name,
                senderRole: UserRole.ADMIN,
                body: 'Coordinated with SwiftLine Freight dispatch desk; vehicle MH-12-TR-4421 is scheduled for 10:45 AM.',
                createdAt: new Date(Date.now() - 2 * 3600000),
              },
            ],
          },
          {
            ticketNumber: 'ZPT-SUP-SEED-1002',
            createdByUserId: trans1Doc._id,
            createdByRole: UserRole.TRANSPORTER,
            createdByName: 'SwiftLine Freight Movers',
            subject: 'Clarification on Nashik highway detention charges',
            category: SupportTicketCategory.BILLING_WALLET,
            priority: SupportTicketPriority.HIGH,
            lrNumber: 'ZIPIT-LR-100005',
            status: SupportTicketStatus.OPEN,
            lastMessageAt: new Date(Date.now() - 3 * 3600000),
            messages: [
              {
                senderUserId: trans1Doc._id,
                senderName: 'SwiftLine Freight Movers',
                senderRole: UserRole.TRANSPORTER,
                body: 'Consignee unloading gate at Ambad MIDC held our truck for 3 hours. Please confirm detention billing approval.',
                createdAt: new Date(Date.now() - 3 * 3600000),
              },
            ],
          },
        ]);
      }
    }

    const settlementCount = await TransporterSettlement.countDocuments({});
    if (settlementCount === 0) {
      const deliveredBk = await Booking.findOne({ lrNumber: 'ZIPIT-LR-100005', status: BookingStatus.DELIVERED }).lean();
      if (deliveredBk) {
        const gross = Number(
          (Number(deliveredBk.freight || 0) + Number(deliveredBk.pricingSnapshot?.additionalCharges || 0)).toFixed(2)
        );
        const fee = Number((gross * 0.05).toFixed(2));
        const net = Number(Math.max(0, gross - fee).toFixed(2));
        await TransporterSettlement.create({
          settlementId: 'ZPT-SET-SEED-1001',
          transporterId: deliveredBk.transporterId,
          periodLabel: 'Nov Cycle 1 (Settled)',
          bookingIds: [deliveredBk._id],
          bookingCount: 1,
          grossAmount: gross,
          platformCommissionRate: 5,
          platformFee: fee,
          netPayoutAmount: net,
          payoutMethod: 'NEFT',
          utrNumber: 'HDFC261119008812',
          status: SettlementStatus.SETTLED,
          settledAt: new Date(Date.now() - 12 * 3600000),
        });
      }
    }

    const demoPickupBackfill = [
      {
        email: 'seller1@apexhardware.in',
        addresses: [
          {
            label: 'Bhosari Main Plant',
            addressType: 'PICKUP' as const,
            companyName: 'Apex Industrial Hardware Pvt Ltd',
            contactPerson: 'Rajesh Kulkarni',
            name: 'Apex Industrial Hardware Pvt Ltd',
            phone: '9823011223',
            address: 'Plot B-42, MIDC Industrial Area, Bhosari',
            state: 'Maharashtra',
            city: 'Pune',
            pincode: '411026',
            gstin: '27AABCA4521K1Z5',
            isDefault: true,
          },
          {
            label: 'Chakan Dispatch Hub',
            addressType: 'PICKUP' as const,
            companyName: 'Apex Industrial Hardware — Chakan Warehouse',
            contactPerson: 'Prakash More',
            name: 'Apex Industrial Hardware — Chakan Warehouse',
            phone: '9823099887',
            address: 'Gate 3, Phase II Logistics Park, Chakan MIDC',
            state: 'Maharashtra',
            city: 'Pune',
            pincode: '410501',
            gstin: '27AABCA4521K1Z5',
            isDefault: false,
          },
        ],
      },
      {
        email: 'seller2@metrotextiles.in',
        addresses: [
          {
            label: 'Lower Parel Mill Unit',
            addressType: 'PICKUP' as const,
            companyName: 'Metro Wholesale Textiles LLP',
            contactPerson: 'Meera Shah',
            name: 'Metro Wholesale Textiles LLP',
            phone: '9820455667',
            address: 'Unit 14, Gala Industrial Estate, Lower Parel',
            state: 'Maharashtra',
            city: 'Mumbai',
            pincode: '400013',
            gstin: '27AADCM8812N1Z2',
            isDefault: true,
          },
        ],
      },
    ];
    for (const item of demoPickupBackfill) {
      const seller = await SellerProfile.findOne({ email: item.email }).select('savedAddresses').lean();
      if (seller && (!seller.savedAddresses || seller.savedAddresses.length === 0)) {
        await SellerProfile.updateOne(
          { _id: seller._id },
          { $set: { savedAddresses: item.addresses } }
        );
      }
    }

    return { seeded: false };
  }

  const defaultPass = process.env.DEMO_SEED_PASSWORD || 'ZipitDemo@2026';
  const passwordHash = await bcrypt.hash(defaultPass, 10);

  // 1. Admin User
  const adminUser = await User.create({
    name: 'Vikram Deshmukh',
    email: 'admin@zipit.in',
    passwordHash,
    role: UserRole.ADMIN,
    isActive: true,
  });

  // 2. Approved Seller 1
  const seller1User = await User.create({
    name: 'Rajesh Kulkarni',
    email: 'seller1@apexhardware.in',
    passwordHash,
    role: UserRole.SELLER,
    isActive: true,
  });

  const seller1Profile = await SellerProfile.create({
    userId: seller1User._id,
    businessName: 'Apex Industrial Hardware Pvt Ltd',
    ownerName: 'Rajesh Kulkarni',
    email: 'seller1@apexhardware.in',
    phone: '9823011223',
    gstNumber: '27AABCA4521K1Z5',
    businessAddress: 'Plot B-42, MIDC Industrial Area, Bhosari',
    city: 'Pune',
    pincode: '411026',
    walletBalance: 25000,
    approvalStatus: SellerApprovalStatus.APPROVED,
    reviewedBy: adminUser._id,
    reviewedAt: new Date(Date.now() - 10 * 86400000),
    savedAddresses: [
      {
        label: 'Bhosari Main Plant',
        addressType: 'PICKUP',
        companyName: 'Apex Industrial Hardware Pvt Ltd',
        contactPerson: 'Rajesh Kulkarni',
        name: 'Apex Industrial Hardware Pvt Ltd',
        phone: '9823011223',
        address: 'Plot B-42, MIDC Industrial Area, Bhosari',
        state: 'Maharashtra',
        city: 'Pune',
        pincode: '411026',
        gstin: '27AABCA4521K1Z5',
        isDefault: true,
      },
      {
        label: 'Chakan Dispatch Hub',
        addressType: 'PICKUP',
        companyName: 'Apex Industrial Hardware — Chakan Warehouse',
        contactPerson: 'Prakash More',
        name: 'Apex Industrial Hardware — Chakan Warehouse',
        phone: '9823099887',
        address: 'Gate 3, Phase II Logistics Park, Chakan MIDC',
        state: 'Maharashtra',
        city: 'Pune',
        pincode: '410501',
        gstin: '27AABCA4521K1Z5',
        isDefault: false,
      },
    ],
  });

  await WalletTransaction.create({
    transactionId: 'ZPT-TXN-SEED-1001',
    sellerId: seller1Profile._id,
    userId: seller1User._id,
    type: WalletTransactionType.CREDIT,
    amount: 25000,
    balanceAfter: 25000,
    paymentMethod: WalletPaymentMethod.OPENING_CREDIT,
    referenceNote: 'NEFT-APEX-OPENING',
    description: 'Opening Prepaid Wallet Credit',
  });

  // 3. Approved Seller 2
  const seller2User = await User.create({
    name: 'Meera Shah',
    email: 'seller2@metrotextiles.in',
    passwordHash,
    role: UserRole.SELLER,
    isActive: true,
  });

  const seller2Profile = await SellerProfile.create({
    userId: seller2User._id,
    businessName: 'Metro Wholesale Textiles LLP',
    ownerName: 'Meera Shah',
    email: 'seller2@metrotextiles.in',
    phone: '9820455667',
    gstNumber: '27AADCM8812N1Z2',
    businessAddress: 'Unit 14, Gala Industrial Estate, Lower Parel',
    city: 'Mumbai',
    pincode: '400013',
    walletBalance: 18500,
    approvalStatus: SellerApprovalStatus.APPROVED,
    reviewedBy: adminUser._id,
    reviewedAt: new Date(Date.now() - 8 * 86400000),
    savedAddresses: [
      {
        label: 'Lower Parel Mill Unit',
        addressType: 'PICKUP',
        companyName: 'Metro Wholesale Textiles LLP',
        contactPerson: 'Meera Shah',
        name: 'Metro Wholesale Textiles LLP',
        phone: '9820455667',
        address: 'Unit 14, Gala Industrial Estate, Lower Parel',
        state: 'Maharashtra',
        city: 'Mumbai',
        pincode: '400013',
        gstin: '27AADCM8812N1Z2',
        isDefault: true,
      },
    ],
  });

  await WalletTransaction.create({
    transactionId: 'ZPT-TXN-SEED-1002',
    sellerId: seller2Profile._id,
    userId: seller2User._id,
    type: WalletTransactionType.CREDIT,
    amount: 18500,
    balanceAfter: 18500,
    paymentMethod: WalletPaymentMethod.OPENING_CREDIT,
    referenceNote: 'NEFT-METRO-OPENING',
    description: 'Opening Prepaid Wallet Credit',
  });

  // 4. Pending Seller Application
  const pendingSellerUser = await User.create({
    name: 'Suresh Patil',
    email: 'pending@navkarindustrial.in',
    passwordHash,
    role: UserRole.SELLER,
    isActive: true,
  });

  await SellerProfile.create({
    userId: pendingSellerUser._id,
    businessName: 'Navkar Electricals & Switchgear',
    ownerName: 'Suresh Patil',
    email: 'pending@navkarindustrial.in',
    phone: '9765432109',
    gstNumber: '27AABCN9921L1Z9',
    businessAddress: 'Shop 8, Satpur Industrial Colony',
    city: 'Nashik',
    pincode: '422007',
    approvalStatus: SellerApprovalStatus.PENDING,
  });

  // 5. Transporter 1
  const trans1User = await User.create({
    name: 'Arvind Nair',
    email: 'ops@swiftlinefreight.in',
    passwordHash,
    role: UserRole.TRANSPORTER,
    isActive: true,
  });

  const transporter1 = await Transporter.create({
    userId: trans1User._id,
    companyName: 'SwiftLine B2B Freight Carriers',
    contactPerson: 'Arvind Nair',
    email: 'ops@swiftlinefreight.in',
    phone: '9822098765',
    gstNumber: '27AAECS3310M1Z4',
    address: 'Hub 3, Transport Nagar, Nigdi',
    serviceAreas: [
      { city: 'Pune', pincode: '411026' },
      { city: 'Mumbai', pincode: '400013' },
      { city: 'Nashik', pincode: '422007' },
    ],
    status: EntityStatus.ACTIVE,
    approvalStatus: TransporterApprovalStatus.APPROVED,
  });

  // 6. Transporter 2
  const trans2User = await User.create({
    name: 'Karan Mehta',
    email: 'dispatch@rapidroadways.in',
    passwordHash,
    role: UserRole.TRANSPORTER,
    isActive: true,
  });

  const transporter2 = await Transporter.create({
    userId: trans2User._id,
    companyName: 'Rapid Roadways Logistics',
    contactPerson: 'Karan Mehta',
    email: 'dispatch@rapidroadways.in',
    phone: '9819076543',
    gstNumber: '27AAECR7742P1Z8',
    address: 'Warehouse 12, Bhiwandi Logistics Park',
    serviceAreas: [
      { city: 'Mumbai', pincode: '400013' },
      { city: 'Pune', pincode: '411026' },
      { city: 'Surat', pincode: '395003' },
    ],
    status: EntityStatus.ACTIVE,
    approvalStatus: TransporterApprovalStatus.APPROVED,
  });

  // 7. Routes
  const routePuneMumbai = await TransportRoute.create({
    originCity: 'Pune',
    originPincode: '411026',
    destinationCity: 'Mumbai',
    destinationPincode: '400013',
    distanceKm: 152,
    status: EntityStatus.ACTIVE,
  });

  const routeMumbaiPune = await TransportRoute.create({
    originCity: 'Mumbai',
    originPincode: '400013',
    destinationCity: 'Pune',
    destinationPincode: '411026',
    distanceKm: 152,
    status: EntityStatus.ACTIVE,
  });

  const routePuneNashik = await TransportRoute.create({
    originCity: 'Pune',
    originPincode: '411026',
    destinationCity: 'Nashik',
    destinationPincode: '422007',
    distanceKm: 210,
    status: EntityStatus.ACTIVE,
  });

  const routeMumbaiSurat = await TransportRoute.create({
    originCity: 'Mumbai',
    originPincode: '400013',
    destinationCity: 'Surat',
    destinationPincode: '395003',
    distanceKm: 284,
    status: EntityStatus.ACTIVE,
  });

  // 8. Sample Transporter Rates (marked isSampleData: true)
  const effectiveFrom = new Date(Date.now() - 30 * 86400000);

  const rate1 = await TransportRate.create({
    transporterId: transporter1._id,
    routeId: routePuneMumbai._id,
    minimumFreight: 650,
    ratePerKg: 12,
    volumetricDivisor: 5000,
    rtoCharges: 350,
    additionalCharges: 120,
    gstApplicable: true,
    gstRatePercent: 18,
    estimatedDeliveryTime: '12-18 Hours',
    effectiveFrom,
    isActive: true,
    isSampleData: true,
  });

  const rate2 = await TransportRate.create({
    transporterId: transporter2._id,
    routeId: routePuneMumbai._id,
    minimumFreight: 550,
    ratePerKg: 14,
    volumetricDivisor: 4500,
    rtoCharges: 400,
    additionalCharges: 100,
    gstApplicable: true,
    gstRatePercent: 18,
    estimatedDeliveryTime: '18-24 Hours',
    effectiveFrom,
    isActive: true,
    isSampleData: true,
  });

  const rate3 = await TransportRate.create({
    transporterId: transporter1._id,
    routeId: routeMumbaiPune._id,
    minimumFreight: 600,
    ratePerKg: 11.5,
    volumetricDivisor: 5000,
    rtoCharges: 320,
    additionalCharges: 100,
    gstApplicable: true,
    gstRatePercent: 18,
    estimatedDeliveryTime: '12-18 Hours',
    effectiveFrom,
    isActive: true,
    isSampleData: true,
  });

  const rate4 = await TransportRate.create({
    transporterId: transporter1._id,
    routeId: routePuneNashik._id,
    minimumFreight: 750,
    ratePerKg: 15,
    volumetricDivisor: 5000,
    rtoCharges: 420,
    additionalCharges: 150,
    gstApplicable: true,
    gstRatePercent: 18,
    estimatedDeliveryTime: '24-30 Hours',
    effectiveFrom,
    isActive: true,
    isSampleData: true,
  });

  const rate5 = await TransportRate.create({
    transporterId: transporter2._id,
    routeId: routeMumbaiSurat._id,
    minimumFreight: 900,
    ratePerKg: 16,
    volumetricDivisor: 5000,
    rtoCharges: 500,
    additionalCharges: 180,
    gstApplicable: true,
    gstRatePercent: 18,
    estimatedDeliveryTime: '24-36 Hours',
    effectiveFrom,
    isActive: true,
    isSampleData: true,
  });

  // 9. Sample Bookings in all 5 workflow statuses
  async function createSeededBooking(params: {
    bookingId: string;
    lrNumber: string;
    seller: typeof seller1Profile;
    sellerUserId: typeof seller1User._id;
    transporter: typeof transporter1;
    transporterUserId: typeof trans1User._id;
    route: typeof routePuneMumbai;
    rate: typeof rate1;
    sender: { name: string; phone: string; address: string; city: string; pincode: string };
    receiver: { name: string; phone: string; address: string; city: string; pincode: string };
    parcel: {
      description: string;
      actualWeightKg: number;
      lengthCm: number;
      widthCm: number;
      heightCm: number;
      numberOfPackages: number;
    };
    statuses: BookingStatus[];
    hoursAgoStart: number;
  }) {
    const breakdown = calculateFreightBreakdown(
      {
        actualWeightKg: params.parcel.actualWeightKg,
        lengthCm: params.parcel.lengthCm,
        widthCm: params.parcel.widthCm,
        heightCm: params.parcel.heightCm,
      },
      {
        minimumFreight: params.rate.minimumFreight,
        ratePerKg: params.rate.ratePerKg,
        volumetricDivisor: params.rate.volumetricDivisor,
        rtoCharges: params.rate.rtoCharges,
        additionalCharges: params.rate.additionalCharges,
        gstApplicable: params.rate.gstApplicable,
        gstRatePercent: params.rate.gstRatePercent,
      }
    );

    const finalStatus = params.statuses[params.statuses.length - 1];
    const createdAt = new Date(Date.now() - params.hoursAgoStart * 3600000);

    const booking = await Booking.create({
      bookingId: params.bookingId,
      lrNumber: params.lrNumber,
      sellerId: params.seller._id,
      transporterId: params.transporter._id,
      routeId: params.route._id,
      rateId: params.rate._id,
      sender: params.sender,
      receiver: params.receiver,
      parcel: params.parcel,
      origin: { city: params.route.originCity, pincode: params.route.originPincode },
      destination: { city: params.route.destinationCity, pincode: params.route.destinationPincode },
      actualWeight: breakdown.actualWeightKg,
      volumetricWeight: breakdown.volumetricWeightKg,
      chargeableWeight: breakdown.chargeableWeightKg,
      freight: breakdown.baseFreight,
      rtoCharges: breakdown.rtoCharges,
      tax: breakdown.taxAmount,
      finalAmount: breakdown.finalAmount,
      pricingSnapshot: {
        ...breakdown,
        estimatedDeliveryTime: params.rate.estimatedDeliveryTime,
        isSampleRate: params.rate.isSampleData,
      },
      status: finalStatus,
      createdAt,
    });

    for (let idx = 0; idx < params.statuses.length; idx++) {
      const st = params.statuses[idx];
      const eventTime = new Date(createdAt.getTime() + idx * 3 * 3600000);
      const location =
        st === BookingStatus.ARRIVED || st === BookingStatus.DELIVERED
          ? `${params.route.destinationCity} (${params.route.destinationPincode})`
          : `${params.route.originCity} (${params.route.originPincode})`;

      await TrackingEvent.create({
        bookingId: booking._id,
        lrNumber: booking.lrNumber,
        status: st,
        location,
        description: STATUS_DESCRIPTIONS[st],
        remarks: idx === 0 ? `Assigned to ${params.transporter.companyName}` : undefined,
        actorUserId: idx === 0 ? params.sellerUserId : params.transporterUserId,
        actorRole: idx === 0 ? UserRole.SELLER : UserRole.TRANSPORTER,
        eventTimestamp: eventTime,
      });
    }

    return booking;
  }

  // Booking 1: BOOKED
  await createSeededBooking({
    bookingId: 'ZPT-BK-20261113-1001',
    lrNumber: 'ZIPIT-LR-100001',
    seller: seller1Profile,
    sellerUserId: seller1User._id,
    transporter: transporter1,
    transporterUserId: trans1User._id,
    route: routePuneMumbai,
    rate: rate1,
    sender: {
      name: 'Apex Hardware Dispatch',
      phone: '9823011223',
      address: 'Plot B-42, MIDC Bhosari',
      city: 'Pune',
      pincode: '411026',
    },
    receiver: {
      name: 'Western Engineering Co.',
      phone: '9821144556',
      address: 'Unit 9, Andheri Industrial Estate',
      city: 'Mumbai',
      pincode: '400013',
    },
    parcel: {
      description: 'CNC Brass Couplings & Valves (12 Cartons)',
      actualWeightKg: 85,
      lengthCm: 60,
      widthCm: 45,
      heightCm: 40,
      numberOfPackages: 12,
    },
    statuses: [BookingStatus.BOOKED],
    hoursAgoStart: 2,
  });

  // Booking 2: ACCEPTED
  await createSeededBooking({
    bookingId: 'ZPT-BK-20261113-1002',
    lrNumber: 'ZIPIT-LR-100002',
    seller: seller1Profile,
    sellerUserId: seller1User._id,
    transporter: transporter2,
    transporterUserId: trans2User._id,
    route: routePuneMumbai,
    rate: rate2,
    sender: {
      name: 'Apex Hardware Dispatch',
      phone: '9823011223',
      address: 'Plot B-42, MIDC Bhosari',
      city: 'Pune',
      pincode: '411026',
    },
    receiver: {
      name: 'Harbor Marine Supplies',
      phone: '9820033445',
      address: 'Dockyard Road Warehouse 4',
      city: 'Mumbai',
      pincode: '400013',
    },
    parcel: {
      description: 'Stainless Steel Fasteners (6 Crates)',
      actualWeightKg: 140,
      lengthCm: 80,
      widthCm: 50,
      heightCm: 45,
      numberOfPackages: 6,
    },
    statuses: [BookingStatus.BOOKED, BookingStatus.ACCEPTED],
    hoursAgoStart: 6,
  });

  // Booking 3: DISPATCHED
  await createSeededBooking({
    bookingId: 'ZPT-BK-20261112-1003',
    lrNumber: 'ZIPIT-LR-100003',
    seller: seller2Profile,
    sellerUserId: seller2User._id,
    transporter: transporter1,
    transporterUserId: trans1User._id,
    route: routeMumbaiPune,
    rate: rate3,
    sender: {
      name: 'Metro Textiles Warehouse',
      phone: '9820455667',
      address: 'Gala Industrial Estate, Lower Parel',
      city: 'Mumbai',
      pincode: '400013',
    },
    receiver: {
      name: 'Deccan Garment Distributors',
      phone: '9890122334',
      address: 'Gate 2, Chakan Commercial Complex',
      city: 'Pune',
      pincode: '411026',
    },
    parcel: {
      description: 'Cotton Twill Fabric Rolls (20 Bales)',
      actualWeightKg: 210,
      lengthCm: 110,
      widthCm: 65,
      heightCm: 55,
      numberOfPackages: 20,
    },
    statuses: [BookingStatus.BOOKED, BookingStatus.ACCEPTED, BookingStatus.DISPATCHED],
    hoursAgoStart: 12,
  });

  // Booking 4: ARRIVED
  await createSeededBooking({
    bookingId: 'ZPT-BK-20261112-1004',
    lrNumber: 'ZIPIT-LR-100004',
    seller: seller2Profile,
    sellerUserId: seller2User._id,
    transporter: transporter2,
    transporterUserId: trans2User._id,
    route: routeMumbaiSurat,
    rate: rate5,
    sender: {
      name: 'Metro Textiles Warehouse',
      phone: '9820455667',
      address: 'Gala Industrial Estate, Lower Parel',
      city: 'Mumbai',
      pincode: '400013',
    },
    receiver: {
      name: 'Gujarat Apparel House',
      phone: '9825011229',
      address: 'Ring Road Textile Market, Block C',
      city: 'Surat',
      pincode: '395003',
    },
    parcel: {
      description: 'Dyed Polyester Yarn Boxes',
      actualWeightKg: 95,
      lengthCm: 70,
      widthCm: 55,
      heightCm: 50,
      numberOfPackages: 8,
    },
    statuses: [
      BookingStatus.BOOKED,
      BookingStatus.ACCEPTED,
      BookingStatus.DISPATCHED,
      BookingStatus.ARRIVED,
    ],
    hoursAgoStart: 24,
  });

  // Booking 5: DELIVERED (with Delivery Proof)
  const deliveredBooking = await createSeededBooking({
    bookingId: 'ZPT-BK-20261111-1005',
    lrNumber: 'ZIPIT-LR-100005',
    seller: seller1Profile,
    sellerUserId: seller1User._id,
    transporter: transporter1,
    transporterUserId: trans1User._id,
    route: routePuneNashik,
    rate: rate4,
    sender: {
      name: 'Apex Hardware Dispatch',
      phone: '9823011223',
      address: 'Plot B-42, MIDC Bhosari',
      city: 'Pune',
      pincode: '411026',
    },
    receiver: {
      name: 'Godavari Precision Tools',
      phone: '9823556677',
      address: 'Plot 18, Ambad MIDC',
      city: 'Nashik',
      pincode: '422007',
    },
    parcel: {
      description: 'Hydraulic Bearings & Shaft Assemblies',
      actualWeightKg: 62,
      lengthCm: 50,
      widthCm: 40,
      heightCm: 35,
      numberOfPackages: 4,
    },
    statuses: [
      BookingStatus.BOOKED,
      BookingStatus.ACCEPTED,
      BookingStatus.DISPATCHED,
      BookingStatus.ARRIVED,
      BookingStatus.DELIVERED,
    ],
    hoursAgoStart: 42,
  });

  const samplePng = Buffer.from(SAMPLE_PNG_BASE64, 'base64');
  const storedPod = await fileStorage.saveFile(samplePng, 'signed-pod-100005.png', 'image/png');
  await DeliveryProof.create({
    bookingId: deliveredBooking._id,
    lrNumber: deliveredBooking.lrNumber,
    transporterId: transporter1._id,
    imageFileName: storedPod.fileName,
    imageStorageKey: storedPod.storageKey,
    mimeType: storedPod.mimeType,
    fileSizeBytes: storedPod.sizeBytes,
    receiverName: 'Ramesh Jadhav (Store Manager)',
    deliveryDate: new Date(Date.now() - 26 * 3600000),
    remarks: 'Received all 4 crates in intact condition with signed stamp.',
    uploadedBy: trans1User._id,
  });

  await SupportTicket.create([
    {
      ticketNumber: 'ZPT-SUP-SEED-1001',
      createdByUserId: seller1User._id,
      createdByRole: UserRole.SELLER,
      createdByName: seller1Profile.businessName,
      subject: 'Pickup slot confirmation for Bhosari dispatch',
      category: SupportTicketCategory.PICKUP_DELIVERY,
      priority: SupportTicketPriority.MEDIUM,
      lrNumber: 'ZIPIT-LR-100001',
      status: SupportTicketStatus.IN_PROGRESS,
      lastMessageAt: new Date(Date.now() - 2 * 3600000),
      messages: [
        {
          senderUserId: seller1User._id,
          senderName: seller1Profile.businessName,
          senderRole: UserRole.SELLER,
          body: 'Requesting morning dock pickup before 11:30 AM for 5 packed pallets under ZIPIT-LR-100001.',
          createdAt: new Date(Date.now() - 4 * 3600000),
        },
        {
          senderUserId: adminUser._id,
          senderName: adminUser.name,
          senderRole: UserRole.ADMIN,
          body: 'Coordinated with SwiftLine Freight dispatch desk; vehicle MH-12-TR-4421 is scheduled for 10:45 AM.',
          createdAt: new Date(Date.now() - 2 * 3600000),
        },
      ],
    },
    {
      ticketNumber: 'ZPT-SUP-SEED-1002',
      createdByUserId: trans1User._id,
      createdByRole: UserRole.TRANSPORTER,
      createdByName: transporter1.companyName,
      subject: 'Clarification on Nashik highway detention charges',
      category: SupportTicketCategory.BILLING_WALLET,
      priority: SupportTicketPriority.HIGH,
      lrNumber: 'ZIPIT-LR-100005',
      status: SupportTicketStatus.OPEN,
      lastMessageAt: new Date(Date.now() - 3 * 3600000),
      messages: [
        {
          senderUserId: trans1User._id,
          senderName: transporter1.companyName,
          senderRole: UserRole.TRANSPORTER,
          body: 'Consignee unloading gate at Ambad MIDC held our truck for 3 hours. Please confirm detention billing approval.',
          createdAt: new Date(Date.now() - 3 * 3600000),
        },
      ],
    },
  ]);

  const deliveredGross = Number(
    (Number(deliveredBooking.freight || 0) + Number(deliveredBooking.pricingSnapshot?.additionalCharges || 0)).toFixed(2)
  );
  const deliveredFee = Number((deliveredGross * 0.05).toFixed(2));
  const deliveredNet = Number(Math.max(0, deliveredGross - deliveredFee).toFixed(2));

  await TransporterSettlement.create({
    settlementId: 'ZPT-SET-SEED-1001',
    transporterId: transporter1._id,
    periodLabel: 'Nov Cycle 1 (Settled)',
    bookingIds: [deliveredBooking._id],
    bookingCount: 1,
    grossAmount: deliveredGross,
    platformCommissionRate: 5,
    platformFee: deliveredFee,
    netPayoutAmount: deliveredNet,
    payoutMethod: 'NEFT',
    utrNumber: 'HDFC261119008812',
    status: SettlementStatus.SETTLED,
    settledAt: new Date(Date.now() - 12 * 3600000),
  });

  logger.info({
    module: 'seed',
    action: 'database_seeded',
    meta: { users: 6, routes: 4, rates: 5, bookings: 5, supportTickets: 2, settlements: 1 },
  });

  return { seeded: true };
}
