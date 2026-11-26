import mongoose, { Schema } from 'mongoose';
import { KycDocumentType, KycVerificationStatus } from '../utils/constants.ts';

export interface IKycDocument {
  docType: KycDocumentType;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

export interface IKycDetails {
  status: KycVerificationStatus;
  panNumber?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  documents: IKycDocument[];
  submittedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
}

const kycDocumentSchema = new Schema<IKycDocument>(
  {
    docType: {
      type: String,
      enum: Object.values(KycDocumentType),
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: false }
);

export const kycDetailsSchema = new Schema<IKycDetails>(
  {
    status: {
      type: String,
      enum: Object.values(KycVerificationStatus),
      default: KycVerificationStatus.NOT_SUBMITTED,
      required: true,
    },
    panNumber: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format (e.g. ABCDE1234F)'],
    },
    bankAccountHolder: {
      type: String,
      trim: true,
      maxlength: 140,
    },
    bankAccountNumber: {
      type: String,
      trim: true,
      match: [/^\d{9,18}$/, 'Bank account number must be 9 to 18 digits'],
    },
    ifscCode: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format (e.g. HDFC0001234)'],
    },
    bankName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    documents: {
      type: [kycDocumentSchema],
      default: [],
    },
    submittedAt: {
      type: Date,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false }
);

export function sanitizeKycDetails(kyc?: IKycDetails | Record<string, unknown> | null) {
  if (!kyc) {
    return {
      status: KycVerificationStatus.NOT_SUBMITTED,
      documents: [],
    };
  }
  const rawDocs = Array.isArray((kyc as IKycDetails).documents) ? (kyc as IKycDetails).documents : [];
  return {
    status: (kyc as IKycDetails).status || KycVerificationStatus.NOT_SUBMITTED,
    panNumber: (kyc as IKycDetails).panNumber,
    bankAccountHolder: (kyc as IKycDetails).bankAccountHolder,
    bankAccountNumber: (kyc as IKycDetails).bankAccountNumber,
    ifscCode: (kyc as IKycDetails).ifscCode,
    bankName: (kyc as IKycDetails).bankName,
    submittedAt: (kyc as IKycDetails).submittedAt,
    reviewedAt: (kyc as IKycDetails).reviewedAt,
    rejectionReason: (kyc as IKycDetails).rejectionReason,
    documents: rawDocs.map((doc) => ({
      docType: doc.docType,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      uploadedAt: doc.uploadedAt,
    })),
  };
}
