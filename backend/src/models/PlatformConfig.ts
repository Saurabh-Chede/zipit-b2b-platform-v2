import mongoose, { Schema, Document } from 'mongoose';

export type PlatformChargeType = 'FIXED' | 'PERCENTAGE';

export interface IPlatformChargeRule {
  enabled: boolean;
  chargeType: PlatformChargeType;
  value: number;
  applyGstOnCharge: boolean;
}

export interface IPlatformConfig extends Document {
  _id: mongoose.Types.ObjectId;
  key: string;
  sellerBookingCharge: IPlatformChargeRule;
  transporterBookingCharge: IPlatformChargeRule;
  billingRuleNotes?: string;
  updatedByUserId?: mongoose.Types.ObjectId | null;
  updatedByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const platformChargeRuleSchema = new Schema<IPlatformChargeRule>(
  {
    enabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    chargeType: {
      type: String,
      enum: ['FIXED', 'PERCENTAGE'],
      required: true,
      default: 'FIXED',
    },
    value: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Platform charge value cannot be negative'],
    },
    applyGstOnCharge: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  { _id: false }
);

const platformConfigSchema = new Schema<IPlatformConfig>(
  {
    key: {
      type: String,
      required: true,
      default: 'DEFAULT',
      trim: true,
    },
    sellerBookingCharge: {
      type: platformChargeRuleSchema,
      required: true,
      default: () => ({
        enabled: false,
        chargeType: 'FIXED',
        value: 0,
        applyGstOnCharge: false,
      }),
    },
    transporterBookingCharge: {
      type: platformChargeRuleSchema,
      required: true,
      default: () => ({
        enabled: false,
        chargeType: 'FIXED',
        value: 0,
        applyGstOnCharge: false,
      }),
    },
    billingRuleNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    updatedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedByName: {
      type: String,
      trim: true,
      maxlength: 140,
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

platformConfigSchema.index({ key: 1 }, { unique: true });

export const PlatformConfig = mongoose.model<IPlatformConfig>(
  'PlatformConfig',
  platformConfigSchema
);
