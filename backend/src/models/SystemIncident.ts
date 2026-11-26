import mongoose, { Schema, type Document } from 'mongoose';

export type IncidentSource = 'BACKEND_API' | 'FRONTEND_UI' | 'DATABASE' | 'PROCESS' | 'SUPPORT';
export type IncidentSeverity = 'WARN' | 'ERROR' | 'FATAL';

export interface ISystemIncident extends Document {
  source: IncidentSource;
  severity: IncidentSeverity;
  errorCode: string;
  message: string;
  route?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  userId?: string;
  userRole?: string;
  stack?: string;
  dedupKey: string;
  occurrenceCount: number;
  lastOccurredAt: Date;
  notifiedChannels: string[];
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const systemIncidentSchema = new Schema<ISystemIncident>(
  {
    source: {
      type: String,
      enum: ['BACKEND_API', 'FRONTEND_UI', 'DATABASE', 'PROCESS', 'SUPPORT'],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['WARN', 'ERROR', 'FATAL'],
      required: true,
      index: true,
    },
    errorCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    route: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    method: {
      type: String,
      trim: true,
      maxlength: 16,
    },
    statusCode: {
      type: Number,
    },
    requestId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    userId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    userRole: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    stack: {
      type: String,
      maxlength: 2500,
    },
    dedupKey: {
      type: String,
      required: true,
      index: true,
    },
    occurrenceCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastOccurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notifiedChannels: {
      type: [String],
      default: [],
    },
    meta: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Automatically expire system incident logs after 30 days to prevent unbounded database growth
systemIncidentSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
systemIncidentSchema.index({ severity: 1, lastOccurredAt: -1 });

export const SystemIncident = mongoose.model<ISystemIncident>('SystemIncident', systemIncidentSchema);
