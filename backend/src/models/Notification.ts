import mongoose, { Schema, type Document } from 'mongoose';
import { UserRole } from '../utils/constants.ts';

export enum NotificationCategory {
  BOOKING = 'BOOKING',
  SHIPMENT = 'SHIPMENT',
  WALLET = 'WALLET',
  SUPPORT = 'SUPPORT',
  SELLER_KYC = 'SELLER_KYC',
}

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  recipientUserId: mongoose.Types.ObjectId;
  recipientRole: UserRole;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientRole: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
    category: {
      type: String,
      enum: Object.values(NotificationCategory),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    link: {
      type: String,
      trim: true,
      maxlength: 250,
    },
    entityType: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    entityId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    isRead: {
      type: Boolean,
      default: false,
      required: true,
    },
    readAt: {
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

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
