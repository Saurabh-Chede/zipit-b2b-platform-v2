import mongoose, { Schema, Document } from 'mongoose';
import { BookingStatus } from '../utils/constants.ts';

export interface IPartyDetails {
  name: string;
  companyName?: string;
  contactPerson?: string;
  phone: string;
  address: string;
  state?: string;
  city: string;
  pincode: string;
  gstin?: string;
}

export interface IPickupAddressSnapshot {
  addressId?: mongoose.Types.ObjectId | null;
  label?: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  address: string;
  state?: string;
  city: string;
  pincode: string;
  gstin?: string;
  isPrimary: boolean;
}

export interface IParcelDetails {
  description: string;
  actualWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  numberOfPackages: number;
}

export interface IPricingSnapshot {
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  volumetricDivisor: number;
  minimumFreight: number;
  ratePerKg: number;
  baseFreight: number;
  additionalCharges: number;
  platformCharge: number;
  platformChargeType: 'NONE' | 'FIXED' | 'PERCENTAGE';
  platformChargeValue: number;
  platformChargeApplied: boolean;
  rtoCharges: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  taxAmount: number;
  finalAmount: number;
  estimatedDeliveryTime: string;
  isSampleRate: boolean;
}

export interface IScannedCarton {
  cartonNumber: number;
  cartonCode: string;
  scannedAt: Date;
  scannedByUserId: mongoose.Types.ObjectId;
  location?: string;
}

export type BookingSource = 'PLATFORM' | 'TRANSPORTER_SELF';
export type BookingPaymentMode = 'INVOICE' | 'WALLET' | 'CASH' | 'TO_PAY';

export interface IBooking extends Document {
  _id: mongoose.Types.ObjectId;
  bookingId: string;
  lrNumber: string;
  bookingSource: BookingSource;
  createdByUserId?: mongoose.Types.ObjectId | null;
  createdByRole?: string;
  idempotencyKey?: string;
  duplicateFingerprint?: string;
  sellerId?: mongoose.Types.ObjectId | null;
  pickupAddressId?: mongoose.Types.ObjectId | null;
  pickupAddressSnapshot?: IPickupAddressSnapshot | null;
  transporterId: mongoose.Types.ObjectId;
  routeId: mongoose.Types.ObjectId;
  rateId: mongoose.Types.ObjectId;
  sender: IPartyDetails;
  receiver: IPartyDetails;
  parcel: IParcelDetails;
  origin: { city: string; pincode: string };
  destination: { city: string; pincode: string };
  actualWeight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  freight: number;
  platformCharge: number;
  rtoCharges: number;
  tax: number;
  finalAmount: number;
  pricingSnapshot: IPricingSnapshot;
  paymentMode: BookingPaymentMode;
  invoiceNumber?: string;
  ewayBillNumber?: string;
  ewayBillValidUpto?: Date | null;
  status: BookingStatus;
  rejectionReason?: string;
  rejectedAt?: Date | null;
  cancellationReason?: string;
  cancelledAt?: Date | null;
  ndrReason?: string;
  ndrAttempts?: number;
  ndrRaisedAt?: Date | null;
  rtoReason?: string;
  rtoInitiatedAt?: Date | null;
  rtoDeliveredAt?: Date | null;
  rtoBilledStatus?: 'NONE' | 'WALLET_DEBITED' | 'INVOICE_BILLED' | 'INVOICE_PENDING';
  whatsappOptIn: boolean;
  scannedCartons: IScannedCarton[];
  createdAt: Date;
  updatedAt: Date;
}

const partySchema = new Schema<IPartyDetails>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    companyName: { type: String, trim: true, maxlength: 160 },
    contactPerson: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, match: [/^[6-9]\d{9}$/, 'Invalid phone number'] },
    address: { type: String, required: true, trim: true, maxlength: 400 },
    state: { type: String, trim: true, maxlength: 100 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    pincode: { type: String, required: true, trim: true, match: [/^\d{6}$/, 'Pincode must be 6 digits'] },
    gstin: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format'],
    },
  },
  { _id: false }
);

const pickupAddressSnapshotSchema = new Schema<IPickupAddressSnapshot>(
  {
    addressId: { type: Schema.Types.ObjectId, default: null },
    label: { type: String, trim: true, maxlength: 80 },
    companyName: { type: String, required: true, trim: true, maxlength: 160 },
    contactPerson: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true, maxlength: 400 },
    state: { type: String, trim: true, maxlength: 100 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    pincode: { type: String, required: true, trim: true },
    gstin: { type: String, uppercase: true, trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const parcelSchema = new Schema<IParcelDetails>(
  {
    description: { type: String, required: true, trim: true, maxlength: 300 },
    actualWeightKg: { type: Number, required: true, min: 0.1 },
    lengthCm: { type: Number, required: true, min: 1 },
    widthCm: { type: Number, required: true, min: 1 },
    heightCm: { type: Number, required: true, min: 1 },
    numberOfPackages: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const pricingSnapshotSchema = new Schema<IPricingSnapshot>(
  {
    actualWeightKg: { type: Number, required: true },
    volumetricWeightKg: { type: Number, required: true },
    chargeableWeightKg: { type: Number, required: true },
    volumetricDivisor: { type: Number, required: true },
    minimumFreight: { type: Number, required: true },
    ratePerKg: { type: Number, required: true },
    baseFreight: { type: Number, required: true },
    additionalCharges: { type: Number, required: true },
    platformCharge: { type: Number, default: 0 },
    platformChargeType: {
      type: String,
      enum: ['NONE', 'FIXED', 'PERCENTAGE'],
      default: 'NONE',
    },
    platformChargeValue: { type: Number, default: 0 },
    platformChargeApplied: { type: Boolean, default: false },
    rtoCharges: { type: Number, required: true },
    gstApplicable: { type: Boolean, required: true },
    gstRatePercent: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
    finalAmount: { type: Number, required: true },
    estimatedDeliveryTime: { type: String, required: true },
    isSampleRate: { type: Boolean, default: false },
  },
  { _id: false }
);

const bookingSchema = new Schema<IBooking>(
  {
    bookingId: {
      type: String,
      required: true,
      trim: true,
    },
    lrNumber: {
      type: String,
      required: true,
      trim: true,
    },
    bookingSource: {
      type: String,
      enum: ['PLATFORM', 'TRANSPORTER_SELF'],
      default: 'PLATFORM',
      required: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByRole: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    duplicateFingerprint: {
      type: String,
      trim: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: 'SellerProfile',
      default: null,
      required: function (this: IBooking) {
        return this.bookingSource !== 'TRANSPORTER_SELF';
      },
    },
    pickupAddressId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    pickupAddressSnapshot: {
      type: pickupAddressSnapshotSchema,
      default: null,
    },
    transporterId: {
      type: Schema.Types.ObjectId,
      ref: 'Transporter',
      required: true,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      ref: 'TransportRoute',
      required: true,
    },
    rateId: {
      type: Schema.Types.ObjectId,
      ref: 'TransportRate',
      required: true,
    },
    sender: { type: partySchema, required: true },
    receiver: { type: partySchema, required: true },
    parcel: { type: parcelSchema, required: true },
    origin: {
      city: { type: String, required: true, trim: true },
      pincode: { type: String, required: true, trim: true },
    },
    destination: {
      city: { type: String, required: true, trim: true },
      pincode: { type: String, required: true, trim: true },
    },
    actualWeight: { type: Number, required: true, min: 0.1 },
    volumetricWeight: { type: Number, required: true, min: 0 },
    chargeableWeight: { type: Number, required: true, min: 0.1 },
    freight: { type: Number, required: true, min: 0 },
    platformCharge: { type: Number, default: 0, min: 0 },
    rtoCharges: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    finalAmount: { type: Number, required: true, min: 0 },
    pricingSnapshot: { type: pricingSnapshotSchema, required: true },
    paymentMode: {
      type: String,
      enum: ['INVOICE', 'WALLET', 'CASH', 'TO_PAY'],
      default: 'INVOICE',
      required: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    ewayBillNumber: {
      type: String,
      trim: true,
      match: [/^\d{12}$/, 'E-Way Bill number must be 12 digits'],
    },
    ewayBillValidUpto: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.BOOKED,
      required: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    ndrReason: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    ndrAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    ndrRaisedAt: {
      type: Date,
      default: null,
    },
    rtoReason: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    rtoInitiatedAt: {
      type: Date,
      default: null,
    },
    rtoDeliveredAt: {
      type: Date,
      default: null,
    },
    rtoBilledStatus: {
      type: String,
      enum: ['NONE', 'WALLET_DEBITED', 'INVOICE_BILLED', 'INVOICE_PENDING'],
      default: 'NONE',
    },
    whatsappOptIn: {
      type: Boolean,
      default: true,
    },
    scannedCartons: {
      type: [
        new Schema<IScannedCarton>(
          {
            cartonNumber: { type: Number, required: true, min: 1 },
            cartonCode: { type: String, required: true, trim: true, uppercase: true },
            scannedAt: { type: Date, default: Date.now, required: true },
            scannedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            location: { type: String, trim: true, maxlength: 160 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

bookingSchema.index({ bookingId: 1 }, { unique: true });
bookingSchema.index({ lrNumber: 1 }, { unique: true });
bookingSchema.index(
  { sellerId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sellerId: { $type: 'objectId' },
      idempotencyKey: { $type: 'string' },
    },
  }
);
bookingSchema.index(
  { transporterId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      bookingSource: 'TRANSPORTER_SELF',
      idempotencyKey: { $type: 'string' },
    },
  }
);
bookingSchema.index({ sellerId: 1, duplicateFingerprint: 1, status: 1, createdAt: -1 });
bookingSchema.index({ sellerId: 1, pickupAddressId: 1, status: 1 });
bookingSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ transporterId: 1, bookingSource: 1, status: 1, createdAt: -1 });
bookingSchema.index({ bookingSource: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });

export const Booking = mongoose.model<IBooking>('Booking', bookingSchema);
