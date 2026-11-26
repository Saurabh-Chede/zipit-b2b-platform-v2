import mongoose, { Schema, Document } from 'mongoose';
import { WhatsAppEventType } from '../utils/constants.ts';
import type { BookingSource } from './Booking.ts';

export type WhatsAppNotificationStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'SKIPPED';

export type WhatsAppRecipientRole = 'RECEIVER' | 'SENDER' | 'SELLER';

export interface IWhatsAppTemplateVariables {
  brandName: string;
  customerName: string;
  lrNumber: string;
  statusLabel: string;
  pickupLocation: string;
  destinationLocation: string;
  latestUpdate: string;
  trackingUrl: string;
}

export interface IWhatsAppWebhookHistoryEntry {
  status: string;
  rawTimestamp?: string;
  errorCode?: string;
  errorTitle?: string;
  errorMessage?: string;
  receivedAt: Date;
}

export interface IWhatsAppNotificationLog extends Document {
  _id: mongoose.Types.ObjectId;
  notificationId: string;
  bookingId: mongoose.Types.ObjectId;
  lrNumber: string;
  bookingSource: BookingSource;
  eventType: WhatsAppEventType;
  sourceEventKey: string;
  dedupKey: string;
  recipientRole: WhatsAppRecipientRole;
  recipientName: string;
  recipientPhone: string;
  templateName: string;
  languageCode: string;
  templateVariables: IWhatsAppTemplateVariables;
  messagePreview: string;
  status: WhatsAppNotificationStatus;
  skipReason?: string;
  metaMessageId?: string;
  attemptCount: number;
  maxRetries: number;
  nextRetryAt?: Date | null;
  lastAttemptAt?: Date | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  failedAt?: Date | null;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorHttpStatus?: number;
  retryableError: boolean;
  webhookHistory: IWhatsAppWebhookHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const templateVariablesSchema = new Schema<IWhatsAppTemplateVariables>(
  {
    brandName: { type: String, required: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    lrNumber: { type: String, required: true, trim: true },
    statusLabel: { type: String, required: true, trim: true },
    pickupLocation: { type: String, required: true, trim: true },
    destinationLocation: { type: String, required: true, trim: true },
    latestUpdate: { type: String, required: true, trim: true },
    trackingUrl: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const webhookHistorySchema = new Schema<IWhatsAppWebhookHistoryEntry>(
  {
    status: { type: String, required: true, trim: true },
    rawTimestamp: { type: String, trim: true },
    errorCode: { type: String, trim: true },
    errorTitle: { type: String, trim: true },
    errorMessage: { type: String, trim: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const whatsAppNotificationLogSchema = new Schema<IWhatsAppNotificationLog>(
  {
    notificationId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    lrNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    bookingSource: {
      type: String,
      enum: ['PLATFORM', 'TRANSPORTER_SELF'],
      default: 'PLATFORM',
      required: true,
    },
    eventType: {
      type: String,
      enum: Object.values(WhatsAppEventType),
      required: true,
      index: true,
    },
    sourceEventKey: {
      type: String,
      required: true,
      trim: true,
    },
    dedupKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    recipientRole: {
      type: String,
      enum: ['RECEIVER', 'SENDER', 'SELLER'],
      required: true,
    },
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    recipientPhone: {
      type: String,
      required: true,
      trim: true,
    },
    templateName: {
      type: String,
      required: true,
      trim: true,
    },
    languageCode: {
      type: String,
      default: 'en',
      trim: true,
    },
    templateVariables: {
      type: templateVariablesSchema,
      required: true,
    },
    messagePreview: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED'],
      default: 'QUEUED',
      required: true,
      index: true,
    },
    skipReason: {
      type: String,
      trim: true,
    },
    metaMessageId: {
      type: String,
      trim: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    lastErrorCode: {
      type: String,
      trim: true,
    },
    lastErrorMessage: {
      type: String,
      trim: true,
    },
    lastErrorHttpStatus: {
      type: Number,
    },
    retryableError: {
      type: Boolean,
      default: false,
    },
    webhookHistory: {
      type: [webhookHistorySchema],
      default: [],
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

whatsAppNotificationLogSchema.index({ metaMessageId: 1 }, { sparse: true });
whatsAppNotificationLogSchema.index({ status: 1, createdAt: -1 });
whatsAppNotificationLogSchema.index({ bookingId: 1, eventType: 1, createdAt: -1 });

export const WhatsAppNotificationLog = mongoose.model<IWhatsAppNotificationLog>(
  'WhatsAppNotificationLog',
  whatsAppNotificationLogSchema
);
