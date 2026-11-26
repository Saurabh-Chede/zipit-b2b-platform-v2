import mongoose, { Schema, Document } from 'mongoose';
import { BookingStatus, UserRole } from '../utils/constants.ts';

export interface ITrackingEvent extends Document {
  _id: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  lrNumber: string;
  status: BookingStatus;
  location: string;
  description: string;
  remarks?: string;
  actorUserId?: mongoose.Types.ObjectId;
  actorRole?: UserRole;
  eventTimestamp: Date;
  createdAt: Date;
}

const trackingEventSchema = new Schema<ITrackingEvent>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    lrNumber: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      required: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    actorRole: {
      type: String,
      enum: Object.values(UserRole),
    },
    eventTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Enforce append-only semantics on historical tracking events
trackingEventSchema.pre(/^(updateOne|updateMany|findOneAndUpdate|deleteOne|findOneAndDelete)$/, function () {
  throw new Error('TrackingEvent records are append-only and cannot be modified or deleted');
});

trackingEventSchema.index({ bookingId: 1, eventTimestamp: 1 });
trackingEventSchema.index({ lrNumber: 1, eventTimestamp: 1 });

export const TrackingEvent = mongoose.model<ITrackingEvent>('TrackingEvent', trackingEventSchema);
