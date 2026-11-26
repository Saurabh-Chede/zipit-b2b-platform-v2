import mongoose, { Schema, Document } from 'mongoose';
import { WhatsAppEventType } from '../utils/constants.ts';
import { env } from '../config/env.ts';

export interface IWhatsAppEventTemplateConfig {
  eventType: WhatsAppEventType;
  enabled: boolean;
  templateName: string;
  languageCode: string;
  statusLabel: string;
  updateSummaryTemplate: string;
}

export interface IWhatsAppConfig extends Document {
  _id: mongoose.Types.ObjectId;
  key: 'DEFAULT';
  enabled: boolean;
  apiVersion: string;
  phoneNumberId: string;
  businessAccountId: string;
  defaultCountryCode: string;
  requireCustomerOptIn: boolean;
  recipients: {
    sendToReceiver: boolean;
    sendToSender: boolean;
    sendToSeller: boolean;
  };
  retryPolicy: {
    maxRetries: number;
    backoffSeconds: number;
  };
  events: IWhatsAppEventTemplateConfig[];
  updatedByUserId?: mongoose.Types.ObjectId | null;
  updatedByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_WHATSAPP_EVENTS: IWhatsAppEventTemplateConfig[] = [
  {
    eventType: WhatsAppEventType.BOOKING_CONFIRMED,
    enabled: true,
    templateName: 'zipit_booking_confirmed',
    languageCode: 'en',
    statusLabel: 'Booking Confirmed',
    updateSummaryTemplate: 'Your ZIPIT B2B booking is confirmed and LR has been generated.',
  },
  {
    eventType: WhatsAppEventType.PICKED_UP,
    enabled: true,
    templateName: 'zipit_shipment_picked_up',
    languageCode: 'en',
    statusLabel: 'Picked Up',
    updateSummaryTemplate: 'Shipment has been picked up by the assigned carrier.',
  },
  {
    eventType: WhatsAppEventType.IN_TRANSIT,
    enabled: true,
    templateName: 'zipit_shipment_in_transit',
    languageCode: 'en',
    statusLabel: 'In Transit',
    updateSummaryTemplate: 'Shipment has departed origin hub and is in transit.',
  },
  {
    eventType: WhatsAppEventType.REACHED_DESTINATION,
    enabled: true,
    templateName: 'zipit_shipment_reached_destination',
    languageCode: 'en',
    statusLabel: 'Reached Destination',
    updateSummaryTemplate: 'Shipment has arrived at the destination city hub.',
  },
  {
    eventType: WhatsAppEventType.OUT_FOR_DELIVERY,
    enabled: true,
    templateName: 'zipit_shipment_out_for_delivery',
    languageCode: 'en',
    statusLabel: 'Out for Delivery',
    updateSummaryTemplate: 'Shipment is out for final delivery to the consignee.',
  },
  {
    eventType: WhatsAppEventType.DELIVERED,
    enabled: true,
    templateName: 'zipit_shipment_delivered',
    languageCode: 'en',
    statusLabel: 'Delivered',
    updateSummaryTemplate: 'Shipment has been successfully delivered to the consignee.',
  },
];

const eventTemplateSchema = new Schema<IWhatsAppEventTemplateConfig>(
  {
    eventType: {
      type: String,
      enum: Object.values(WhatsAppEventType),
      required: true,
    },
    enabled: { type: Boolean, default: true },
    templateName: { type: String, required: true, trim: true, maxlength: 120 },
    languageCode: { type: String, default: 'en', trim: true, maxlength: 20 },
    statusLabel: { type: String, required: true, trim: true, maxlength: 80 },
    updateSummaryTemplate: { type: String, required: true, trim: true, maxlength: 280 },
  },
  { _id: false }
);

const whatsAppConfigSchema = new Schema<IWhatsAppConfig>(
  {
    key: {
      type: String,
      enum: ['DEFAULT'],
      default: 'DEFAULT',
      unique: true,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: () => env.whatsappEnabled,
    },
    apiVersion: {
      type: String,
      default: () => env.whatsappApiVersion || 'v21.0',
      trim: true,
      maxlength: 20,
    },
    phoneNumberId: {
      type: String,
      default: () => env.whatsappPhoneNumberId || '',
      trim: true,
      maxlength: 64,
    },
    businessAccountId: {
      type: String,
      default: () => env.whatsappBusinessAccountId || '',
      trim: true,
      maxlength: 64,
    },
    defaultCountryCode: {
      type: String,
      default: '91',
      trim: true,
      maxlength: 5,
    },
    requireCustomerOptIn: {
      type: Boolean,
      default: true,
    },
    recipients: {
      sendToReceiver: { type: Boolean, default: true },
      sendToSender: { type: Boolean, default: false },
      sendToSeller: { type: Boolean, default: true },
    },
    retryPolicy: {
      maxRetries: { type: Number, default: 3, min: 0, max: 5 },
      backoffSeconds: { type: Number, default: 30, min: 5, max: 300 },
    },
    events: {
      type: [eventTemplateSchema],
      default: () => DEFAULT_WHATSAPP_EVENTS.map((ev) => ({ ...ev })),
    },
    updatedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedByName: {
      type: String,
      trim: true,
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

export const WhatsAppConfig = mongoose.model<IWhatsAppConfig>('WhatsAppConfig', whatsAppConfigSchema);
