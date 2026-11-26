import mongoose, { Schema, Document } from 'mongoose';
import { SellerApprovalStatus } from '../utils/constants.ts';
import { kycDetailsSchema, sanitizeKycDetails, type IKycDetails } from './kycSchema.ts';

export interface ISavedAddress {
  _id: mongoose.Types.ObjectId;
  label: string;
  addressType: 'PICKUP' | 'DELIVERY' | 'BOTH';
  companyName?: string;
  contactPerson?: string;
  name: string;
  phone: string;
  address: string;
  state?: string;
  city: string;
  pincode: string;
  gstin?: string;
  isDefault: boolean;
}

export interface ISellerProfile extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  gstNumber: string;
  businessAddress: string;
  city: string;
  pincode: string;
  approvalStatus: SellerApprovalStatus;
  walletBalance: number;
  rejectionReason?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  kyc?: IKycDetails;
  savedAddresses?: ISavedAddress[];
  createdAt: Date;
  updatedAt: Date;
}

const savedAddressSchema = new Schema<ISavedAddress>(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    addressType: {
      type: String,
      enum: ['PICKUP', 'DELIVERY', 'BOTH'],
      default: 'PICKUP',
      required: true,
    },
    companyName: { type: String, trim: true, maxlength: 160 },
    contactPerson: { type: String, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 140 },
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
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const sellerProfileSchema = new Schema<ISellerProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    ownerName: {
      type: String,
      required: [true, 'Owner name is required'],
      trim: true,
      minlength: 2,
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
    businessAddress: {
      type: String,
      required: [true, 'Business address is required'],
      trim: true,
      maxlength: 400,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: 100,
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      trim: true,
      match: [/^\d{6}$/, 'Pincode must be 6 digits'],
    },
    approvalStatus: {
      type: String,
      enum: Object.values(SellerApprovalStatus),
      default: SellerApprovalStatus.PENDING,
      required: true,
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
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
    savedAddresses: {
      type: [savedAddressSchema],
      default: [],
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

sellerProfileSchema.index({ userId: 1 }, { unique: true });
sellerProfileSchema.index({ approvalStatus: 1, createdAt: -1 });
sellerProfileSchema.index({ 'kyc.status': 1, updatedAt: -1 });
sellerProfileSchema.index({ gstNumber: 1 }, { unique: true });

export const SellerProfile = mongoose.model<ISellerProfile>('SellerProfile', sellerProfileSchema);
