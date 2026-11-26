import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../utils/constants.ts';

export type RouteAuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'DELETE'
  | 'PLATFORM_CHARGE_UPDATE';

export type RouteAuditEntityType = 'ROUTE_RATE' | 'ROUTE' | 'RATE' | 'PLATFORM_CONFIG';

export interface IRouteAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  entityType: RouteAuditEntityType;
  action: RouteAuditAction;
  transporterId?: mongoose.Types.ObjectId | null;
  routeId?: mongoose.Types.ObjectId | null;
  rateId?: mongoose.Types.ObjectId | null;
  actorUserId: mongoose.Types.ObjectId;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole;
  summary: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const routeAuditLogSchema = new Schema<IRouteAuditLog>(
  {
    entityType: {
      type: String,
      enum: ['ROUTE_RATE', 'ROUTE', 'RATE', 'PLATFORM_CONFIG'],
      required: true,
    },
    action: {
      type: String,
      enum: ['CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE', 'DELETE', 'PLATFORM_CHARGE_UPDATE'],
      required: true,
    },
    transporterId: {
      type: Schema.Types.ObjectId,
      ref: 'Transporter',
      default: null,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      ref: 'TransportRoute',
      default: null,
    },
    rateId: {
      type: Schema.Types.ObjectId,
      ref: 'TransportRate',
      default: null,
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    actorEmail: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    actorRole: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 600,
    },
    previousValues: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newValues: {
      type: Schema.Types.Mixed,
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

routeAuditLogSchema.index({ routeId: 1, createdAt: -1 });
routeAuditLogSchema.index({ rateId: 1, createdAt: -1 });
routeAuditLogSchema.index({ transporterId: 1, createdAt: -1 });
routeAuditLogSchema.index({ entityType: 1, createdAt: -1 });

export const RouteAuditLog = mongoose.model<IRouteAuditLog>('RouteAuditLog', routeAuditLogSchema);
