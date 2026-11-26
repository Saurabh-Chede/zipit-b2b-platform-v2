import mongoose, { Schema, Document } from 'mongoose';

export enum OtpPurpose {
  SIGNUP_EMAIL = 'SIGNUP_EMAIL',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

export interface IOtpVerification extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  purpose: OtpPurpose;
  otpHash: string;
  attempts: number;
  resendCount: number;
  lastSentAt: Date;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const otpVerificationSchema = new Schema<IOtpVerification>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    purpose: {
      type: String,
      enum: Object.values(OtpPurpose),
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    resendCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSentAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

otpVerificationSchema.index({ email: 1, purpose: 1 }, { unique: true });
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpVerification = mongoose.model<IOtpVerification>(
  'OtpVerification',
  otpVerificationSchema
);
