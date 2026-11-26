import mongoose, { Schema, Document } from 'mongoose';
import { WalletPaymentMethod } from './WalletTransaction.ts';

export enum PaymentOrderStatus {
  CREATED = 'CREATED',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export interface IPaymentOrder extends Document {
  _id: mongoose.Types.ObjectId;
  orderRef: string;
  gateway: 'RAZORPAY';
  sellerId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amountInr: number;
  amountPaise: number;
  currency: 'INR';
  preferredMethod: WalletPaymentMethod;
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  paidMethod?: string;
  status: PaymentOrderStatus;
  walletTransactionId?: string;
  creditedAt?: Date | null;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentOrderSchema = new Schema<IPaymentOrder>(
  {
    orderRef: {
      type: String,
      required: true,
      trim: true,
    },
    gateway: {
      type: String,
      enum: ['RAZORPAY'],
      default: 'RAZORPAY',
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
    amountInr: {
      type: Number,
      required: true,
      min: 100,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 10000,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    preferredMethod: {
      type: String,
      enum: [
        WalletPaymentMethod.UPI,
        WalletPaymentMethod.NEFT_RTGS,
        WalletPaymentMethod.NETBANKING,
        WalletPaymentMethod.CARD,
      ],
      default: WalletPaymentMethod.UPI,
    },
    gatewayOrderId: {
      type: String,
      required: true,
      trim: true,
    },
    gatewayPaymentId: {
      type: String,
      trim: true,
    },
    paidMethod: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentOrderStatus),
      default: PaymentOrderStatus.CREATED,
    },
    walletTransactionId: {
      type: String,
      trim: true,
    },
    creditedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 300,
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

paymentOrderSchema.index({ orderRef: 1 }, { unique: true });
paymentOrderSchema.index({ gatewayOrderId: 1 }, { unique: true });
paymentOrderSchema.index(
  { gatewayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { gatewayPaymentId: { $type: 'string' } },
  }
);
paymentOrderSchema.index({ sellerId: 1, createdAt: -1 });

export const PaymentOrder = mongoose.model<IPaymentOrder>('PaymentOrder', paymentOrderSchema);
