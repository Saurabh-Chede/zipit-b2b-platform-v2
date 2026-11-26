import mongoose, { Schema, Document } from 'mongoose';

export enum SettlementStatus {
  PROCESSING = 'PROCESSING',
  SETTLED = 'SETTLED',
}

export interface ITransporterSettlement extends Document {
  _id: mongoose.Types.ObjectId;
  settlementId: string;
  transporterId: mongoose.Types.ObjectId;
  periodLabel: string;
  bookingIds: mongoose.Types.ObjectId[];
  bookingCount: number;
  grossAmount: number;
  platformCommissionRate: number;
  platformFee: number;
  netPayoutAmount: number;
  payoutMethod: 'NEFT' | 'RTGS' | 'IMPS';
  utrNumber: string;
  status: SettlementStatus;
  settledAt: Date;
  settledByUserId?: mongoose.Types.ObjectId;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const transporterSettlementSchema = new Schema<ITransporterSettlement>(
  {
    settlementId: { type: String, required: true, trim: true },
    transporterId: { type: Schema.Types.ObjectId, ref: 'Transporter', required: true },
    periodLabel: { type: String, required: true, trim: true, maxlength: 100 },
    bookingIds: [{ type: Schema.Types.ObjectId, ref: 'Booking' }],
    bookingCount: { type: Number, required: true, min: 1 },
    grossAmount: { type: Number, required: true, min: 0 },
    platformCommissionRate: { type: Number, required: true, default: 5 },
    platformFee: { type: Number, required: true, min: 0 },
    netPayoutAmount: { type: Number, required: true, min: 0 },
    payoutMethod: {
      type: String,
      enum: ['NEFT', 'RTGS', 'IMPS'],
      default: 'NEFT',
      required: true,
    },
    utrNumber: { type: String, required: true, trim: true, maxlength: 80 },
    status: {
      type: String,
      enum: Object.values(SettlementStatus),
      default: SettlementStatus.SETTLED,
      required: true,
    },
    settledAt: { type: Date, required: true, default: Date.now },
    settledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String, trim: true, maxlength: 240 },
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

transporterSettlementSchema.index({ settlementId: 1 }, { unique: true });
transporterSettlementSchema.index({ utrNumber: 1 }, { unique: true });
transporterSettlementSchema.index({ transporterId: 1, settledAt: -1 });

export const TransporterSettlement = mongoose.model<ITransporterSettlement>(
  'TransporterSettlement',
  transporterSettlementSchema
);
