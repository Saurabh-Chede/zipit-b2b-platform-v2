import mongoose, { Schema, Document } from 'mongoose';

export interface ITransportRate extends Document {
  _id: mongoose.Types.ObjectId;
  transporterId: mongoose.Types.ObjectId;
  routeId: mongoose.Types.ObjectId;
  minimumFreight: number;
  ratePerKg: number;
  volumetricDivisor: number;
  rtoCharges: number;
  additionalCharges: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  estimatedDeliveryTime: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive: boolean;
  isSampleData: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  lastModifiedByUserId?: mongoose.Types.ObjectId | null;
  lastModifiedByName?: string;
  lastModifiedByRole?: string;
  lastModifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const transportRateSchema = new Schema<ITransportRate>(
  {
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
    minimumFreight: {
      type: Number,
      required: true,
      min: [0, 'Minimum freight cannot be negative'],
    },
    ratePerKg: {
      type: Number,
      required: true,
      min: [0.01, 'Rate per kg must be greater than 0'],
    },
    volumetricDivisor: {
      type: Number,
      required: true,
      default: 5000,
      min: [1, 'Volumetric divisor must be positive'],
    },
    rtoCharges: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'RTO charges cannot be negative'],
    },
    additionalCharges: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Additional charges cannot be negative'],
    },
    gstApplicable: {
      type: Boolean,
      required: true,
      default: true,
    },
    gstRatePercent: {
      type: Number,
      required: true,
      default: 18,
      min: 0,
      max: 28,
    },
    estimatedDeliveryTime: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    effectiveFrom: {
      type: Date,
      required: true,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    isSampleData: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    lastModifiedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastModifiedByName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    lastModifiedByRole: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    lastModifiedAt: {
      type: Date,
      default: null,
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

transportRateSchema.index({ routeId: 1, isActive: 1, isDeleted: 1, effectiveFrom: 1, effectiveTo: 1 });
transportRateSchema.index({ transporterId: 1, routeId: 1, isActive: 1, isDeleted: 1 });

export const TransportRate = mongoose.model<ITransportRate>('TransportRate', transportRateSchema);
