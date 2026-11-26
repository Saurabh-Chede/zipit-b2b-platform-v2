import mongoose, { Schema, Document } from 'mongoose';

export enum WalletTransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum WalletPaymentMethod {
  UPI = 'UPI',
  NEFT_RTGS = 'NEFT_RTGS',
  NETBANKING = 'NETBANKING',
  CARD = 'CARD',
  WALLET_BOOKING = 'WALLET_BOOKING',
  WALLET_REFUND = 'WALLET_REFUND',
  RTO_CHARGE = 'RTO_CHARGE',
  WEIGHT_DISCREPANCY = 'WEIGHT_DISCREPANCY',
  OPENING_CREDIT = 'OPENING_CREDIT',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

export interface IWalletTransaction extends Document {
  _id: mongoose.Types.ObjectId;
  transactionId: string;
  sellerId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  paymentMethod: WalletPaymentMethod;
  referenceNote?: string;
  description: string;
  bookingId?: mongoose.Types.ObjectId;
  lrNumber?: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    transactionId: {
      type: String,
      required: true,
      trim: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: 'SellerProfile',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(WalletTransactionType),
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(WalletPaymentMethod),
      required: true,
    },
    referenceNote: {
      type: String,
      trim: true,
      maxlength: 140,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
    },
    lrNumber: {
      type: String,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
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

walletTransactionSchema.index({ transactionId: 1 }, { unique: true });
walletTransactionSchema.index({ sellerId: 1, createdAt: -1 });
walletTransactionSchema.index(
  { sellerId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  }
);

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  'WalletTransaction',
  walletTransactionSchema
);
