import mongoose, { Schema, Document } from 'mongoose';

export interface IDeliveryProof extends Document {
  _id: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  lrNumber: string;
  transporterId: mongoose.Types.ObjectId;
  imageFileName: string;
  imageStorageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  receiverName: string;
  deliveryDate: Date;
  remarks?: string;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const deliveryProofSchema = new Schema<IDeliveryProof>(
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
    transporterId: {
      type: Schema.Types.ObjectId,
      ref: 'Transporter',
      required: true,
    },
    imageFileName: {
      type: String,
      required: true,
      trim: true,
    },
    imageStorageKey: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    receiverName: {
      type: String,
      required: [true, 'Receiver name is required'],
      trim: true,
      maxlength: 140,
    },
    deliveryDate: {
      type: Date,
      required: [true, 'Delivery date is required'],
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret.imageStorageKey;
        return ret;
      },
    },
  }
);

deliveryProofSchema.index({ bookingId: 1 }, { unique: true });
deliveryProofSchema.index({ lrNumber: 1 });
deliveryProofSchema.index({ transporterId: 1 });

export const DeliveryProof = mongoose.model<IDeliveryProof>('DeliveryProof', deliveryProofSchema);
