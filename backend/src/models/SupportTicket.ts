import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../utils/constants.ts';

export enum SupportTicketCategory {
  SHIPMENT_DELAY = 'SHIPMENT_DELAY',
  BILLING_WALLET = 'BILLING_WALLET',
  PICKUP_DELIVERY = 'PICKUP_DELIVERY',
  POD_DOCUMENTS = 'POD_DOCUMENTS',
  ACCOUNT_TECHNICAL = 'ACCOUNT_TECHNICAL',
  OTHER = 'OTHER',
}

export enum SupportTicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum SupportTicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export interface ISupportMessage {
  senderUserId: mongoose.Types.ObjectId;
  senderName: string;
  senderRole: UserRole;
  body: string;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  _id: mongoose.Types.ObjectId;
  ticketNumber: string;
  createdByUserId: mongoose.Types.ObjectId;
  createdByRole: UserRole.SELLER | UserRole.TRANSPORTER;
  createdByName: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  lrNumber?: string;
  status: SupportTicketStatus;
  messages: ISupportMessage[];
  lastMessageAt: Date;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const supportMessageSchema = new Schema<ISupportMessage>(
  {
    senderUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    senderRole: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: true }
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: {
      type: String,
      required: true,
      trim: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdByRole: {
      type: String,
      enum: [UserRole.SELLER, UserRole.TRANSPORTER],
      required: true,
    },
    createdByName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      minlength: 4,
      maxlength: 160,
    },
    category: {
      type: String,
      enum: Object.values(SupportTicketCategory),
      default: SupportTicketCategory.OTHER,
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(SupportTicketPriority),
      default: SupportTicketPriority.MEDIUM,
      required: true,
    },
    lrNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    status: {
      type: String,
      enum: Object.values(SupportTicketStatus),
      default: SupportTicketStatus.OPEN,
      required: true,
    },
    messages: {
      type: [supportMessageSchema],
      default: [],
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    resolvedAt: {
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

supportTicketSchema.index({ ticketNumber: 1 }, { unique: true });
supportTicketSchema.index({ createdByUserId: 1, lastMessageAt: -1 });
supportTicketSchema.index({ status: 1, lastMessageAt: -1 });

export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', supportTicketSchema);
