import mongoose, { Schema, Document } from 'mongoose';

export enum WeightDiscrepancyStatus {
  OPEN = 'OPEN',
  ACCEPTED = 'ACCEPTED',
  DISPUTED = 'DISPUTED',
  RESOLVED_CHARGED = 'RESOLVED_CHARGED',
  RESOLVED_WAIVED = 'RESOLVED_WAIVED',
}

export interface IWeightDiscrepancy extends Document {
  _id: mongoose.Types.ObjectId;
  discrepancyId: string;
  bookingId: mongoose.Types.ObjectId;
  lrNumber: string;
  sellerId: mongoose.Types.ObjectId;
  transporterId: mongoose.Types.ObjectId;
  declaredActualWeightKg: number;
  declaredVolumetricWeightKg: number;
  declaredChargeableWeightKg: number;
  declaredFinalAmount: number;
  reportedActualWeightKg: number;
  reportedLengthCm?: number;
  reportedWidthCm?: number;
  reportedHeightCm?: number;
  reportedVolumetricWeightKg: number;
  reportedChargeableWeightKg: number;
  revisedFinalAmount: number;
  additionalDifferenceAmount: number;
  scaleImageFileName: string;
  scaleImageStorageKey: string;
  scaleImageMimeType: string;
  scaleImageFileSizeBytes: number;
  transporterRemarks?: string;
  sellerDisputeReason?: string;
  sellerRespondedAt?: Date | null;
  adminResolutionNotes?: string;
  resolvedByUserId?: mongoose.Types.ObjectId;
  resolvedAt?: Date | null;
  status: WeightDiscrepancyStatus;
  paymentBilledStatus: 'NONE' | 'WALLET_DEBITED' | 'INVOICE_BILLED' | 'INVOICE_PENDING' | 'WAIVED';
  reportedByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const weightDiscrepancySchema = new Schema<IWeightDiscrepancy>(
  {
    discrepancyId: {
      type: String,
      required: true,
      trim: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    lrNumber: {
      type: String,
      required: true,
      trim: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: 'SellerProfile',
      required: true,
    },
    transporterId: {
      type: Schema.Types.ObjectId,
      ref: 'Transporter',
      required: true,
    },
    declaredActualWeightKg: { type: Number, required: true, min: 0.1 },
    declaredVolumetricWeightKg: { type: Number, required: true, min: 0 },
    declaredChargeableWeightKg: { type: Number, required: true, min: 0.1 },
    declaredFinalAmount: { type: Number, required: true, min: 0 },
    reportedActualWeightKg: { type: Number, required: true, min: 0.1 },
    reportedLengthCm: { type: Number, min: 1 },
    reportedWidthCm: { type: Number, min: 1 },
    reportedHeightCm: { type: Number, min: 1 },
    reportedVolumetricWeightKg: { type: Number, required: true, min: 0 },
    reportedChargeableWeightKg: { type: Number, required: true, min: 0.1 },
    revisedFinalAmount: { type: Number, required: true, min: 0 },
    additionalDifferenceAmount: { type: Number, required: true, min: 0.01 },
    scaleImageFileName: { type: String, required: true, trim: true },
    scaleImageStorageKey: { type: String, required: true, trim: true },
    scaleImageMimeType: { type: String, required: true },
    scaleImageFileSizeBytes: { type: Number, required: true, min: 1 },
    transporterRemarks: { type: String, trim: true, maxlength: 400 },
    sellerDisputeReason: { type: String, trim: true, maxlength: 400 },
    sellerRespondedAt: { type: Date, default: null },
    adminResolutionNotes: { type: String, trim: true, maxlength: 400 },
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(WeightDiscrepancyStatus),
      default: WeightDiscrepancyStatus.OPEN,
      required: true,
    },
    paymentBilledStatus: {
      type: String,
      enum: ['NONE', 'WALLET_DEBITED', 'INVOICE_BILLED', 'INVOICE_PENDING', 'WAIVED'],
      default: 'NONE',
      required: true,
    },
    reportedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret.scaleImageStorageKey;
        return ret;
      },
    },
  }
);

weightDiscrepancySchema.index({ discrepancyId: 1 }, { unique: true });
weightDiscrepancySchema.index({ bookingId: 1 }, { unique: true });
weightDiscrepancySchema.index({ sellerId: 1, status: 1, createdAt: -1 });
weightDiscrepancySchema.index({ transporterId: 1, createdAt: -1 });

export const WeightDiscrepancy = mongoose.model<IWeightDiscrepancy>(
  'WeightDiscrepancy',
  weightDiscrepancySchema
);
