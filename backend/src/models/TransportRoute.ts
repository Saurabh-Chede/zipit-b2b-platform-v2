import mongoose, { Schema, Document } from 'mongoose';
import { EntityStatus } from '../utils/constants.ts';

export interface ITransportRoute extends Document {
  _id: mongoose.Types.ObjectId;
  transporterId?: mongoose.Types.ObjectId | null;
  originCity: string;
  originPincode: string;
  destinationCity: string;
  destinationPincode: string;
  distanceKm?: number;
  status: EntityStatus;
  isDeleted: boolean;
  deletedAt?: Date | null;
  lastModifiedByUserId?: mongoose.Types.ObjectId | null;
  lastModifiedByName?: string;
  lastModifiedByRole?: string;
  lastModifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const transportRouteSchema = new Schema<ITransportRoute>(
  {
    transporterId: {
      type: Schema.Types.ObjectId,
      ref: 'Transporter',
      default: null,
    },
    originCity: {
      type: String,
      required: [true, 'Origin city is required'],
      trim: true,
      maxlength: 100,
    },
    originPincode: {
      type: String,
      required: [true, 'Origin pincode is required'],
      trim: true,
      match: [/^\d{6}$/, 'Origin pincode must be 6 digits'],
    },
    destinationCity: {
      type: String,
      required: [true, 'Destination city is required'],
      trim: true,
      maxlength: 100,
    },
    destinationPincode: {
      type: String,
      required: [true, 'Destination pincode must be 6 digits'],
      trim: true,
      match: [/^\d{6}$/, 'Destination pincode must be 6 digits'],
    },
    distanceKm: {
      type: Number,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(EntityStatus),
      default: EntityStatus.ACTIVE,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    lastModifiedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastModifiedByName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    lastModifiedByRole: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    lastModifiedAt: {
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

transportRouteSchema.index(
  { transporterId: 1, originPincode: 1, destinationPincode: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: { $ne: true } },
  }
);
transportRouteSchema.index({ originPincode: 1, destinationPincode: 1, status: 1, isDeleted: 1 });
transportRouteSchema.index({ status: 1, isDeleted: 1, originCity: 1, destinationCity: 1 });

export const TransportRoute = mongoose.model<ITransportRoute>('TransportRoute', transportRouteSchema);
