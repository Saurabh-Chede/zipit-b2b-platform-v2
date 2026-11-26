import mongoose, { Schema, Document } from 'mongoose';
import { EntityStatus, TransporterApprovalStatus } from '../utils/constants.ts';
import { kycDetailsSchema, sanitizeKycDetails, type IKycDetails } from './kycSchema.ts';

export interface IServiceArea {
  city: string;
  pincode: string;
}

export interface ITransporter extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
  serviceAreas: IServiceArea[];
  status: EntityStatus;
  approvalStatus: TransporterApprovalStatus;
  rejectionReason?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  kyc?: IKycDetails;
  createdAt: Date;
  updatedAt: Date;
}

const serviceAreaSchema = new Schema<IServiceArea>(
  {
    city: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true, match: [/^\d{6}$/, 'Pincode must be 6 digits'] },
  },
  { _id: false }
);

const transporterSchema = new Schema<ITransporter>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    contactPerson: {
      type: String,
      required: [true, 'Contact person is required'],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Phone must be a valid 10-digit Indian mobile number'],
    },
    gstNumber: {
      type: String,
      required: [true, 'GST number is required'],
      uppercase: true,
      trim: true,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format'],
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: 400,
    },
    serviceAreas: {
      type: [serviceAreaSchema],
      default: [],
      validate: {
        validator: (arr: IServiceArea[]) => arr.length >= 1,
        message: 'At least one service area is required',
      },
    },
    status: {
      type: String,
      enum: Object.values(EntityStatus),
      default: EntityStatus.ACTIVE,
      required: true,
    },
    approvalStatus: {
      type: String,
      enum: Object.values(TransporterApprovalStatus),
      default: TransporterApprovalStatus.APPROVED,
      required: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    kyc: {
      type: kycDetailsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        ret.kyc = sanitizeKycDetails(ret.kyc as IKycDetails | undefined);
        return ret;
      },
    },
  }
);

transporterSchema.index({ userId: 1 }, { unique: true });
transporterSchema.index({ status: 1, companyName: 1 });
transporterSchema.index({ approvalStatus: 1, createdAt: -1 });
transporterSchema.index({ 'kyc.status': 1, updatedAt: -1 });
transporterSchema.index({ gstNumber: 1 }, { unique: true });

export const Transporter = mongoose.model<ITransporter>('Transporter', transporterSchema);
