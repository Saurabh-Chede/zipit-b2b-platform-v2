import type mongoose from 'mongoose';
import { PlatformConfig, type IPlatformChargeRule, type IPlatformConfig } from '../../models/PlatformConfig.ts';
import { RouteAuditLog, type RouteAuditAction, type RouteAuditEntityType } from '../../models/RouteAuditLog.ts';
import { UserRole } from '../../utils/constants.ts';
import type { z } from 'zod';
import type { updatePlatformConfigSchema } from './platformConfig.validator.ts';

export type UpdatePlatformConfigInput = z.infer<typeof updatePlatformConfigSchema>;

export interface AuditActor {
  userId: string | mongoose.Types.ObjectId;
  name: string;
  email: string;
  role: UserRole;
}

export async function recordRouteAudit(params: {
  entityType: RouteAuditEntityType;
  action: RouteAuditAction;
  transporterId?: string | mongoose.Types.ObjectId | null;
  routeId?: string | mongoose.Types.ObjectId | null;
  rateId?: string | mongoose.Types.ObjectId | null;
  actor: AuditActor;
  summary: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}) {
  return RouteAuditLog.create({
    entityType: params.entityType,
    action: params.action,
    transporterId: params.transporterId ?? null,
    routeId: params.routeId ?? null,
    rateId: params.rateId ?? null,
    actorUserId: params.actor.userId,
    actorName: params.actor.name,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    summary: params.summary,
    previousValues: params.previousValues ?? undefined,
    newValues: params.newValues ?? undefined,
  });
}

const DEFAULT_RULE: IPlatformChargeRule = {
  enabled: false,
  chargeType: 'FIXED',
  value: 0,
  applyGstOnCharge: false,
};

export async function getOrCreatePlatformConfig(): Promise<IPlatformConfig> {
  let config = await PlatformConfig.findOne({ key: 'DEFAULT' });
  if (!config) {
    config = await PlatformConfig.create({
      key: 'DEFAULT',
      sellerBookingCharge: { ...DEFAULT_RULE },
      transporterBookingCharge: { ...DEFAULT_RULE },
      billingRuleNotes: '',
    });
  }
  return config;
}

export async function getPlatformConfigForUser(role: UserRole) {
  const config = await getOrCreatePlatformConfig();
  if (role !== UserRole.ADMIN) {
    return { config, auditHistory: [] };
  }

  const auditHistory = await RouteAuditLog.find({ entityType: 'PLATFORM_CONFIG' })
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return { config, auditHistory };
}

export async function getApplicablePlatformChargeRule(
  bookingSource: 'PLATFORM' | 'TRANSPORTER_SELF'
): Promise<IPlatformChargeRule> {
  const config = await PlatformConfig.findOne({ key: 'DEFAULT' }).lean();
  if (!config) {
    return { ...DEFAULT_RULE };
  }
  return bookingSource === 'TRANSPORTER_SELF'
    ? config.transporterBookingCharge
    : config.sellerBookingCharge;
}

export async function updatePlatformConfig(
  input: UpdatePlatformConfigInput,
  actor: AuditActor
) {
  const config = await getOrCreatePlatformConfig();
  const previousValues = {
    sellerBookingCharge: { ...config.sellerBookingCharge },
    transporterBookingCharge: { ...config.transporterBookingCharge },
    billingRuleNotes: config.billingRuleNotes || '',
  };

  config.sellerBookingCharge = input.sellerBookingCharge;
  config.transporterBookingCharge = input.transporterBookingCharge;
  config.billingRuleNotes = input.billingRuleNotes ?? '';
  config.updatedByUserId = actor.userId as mongoose.Types.ObjectId;
  config.updatedByName = actor.name;
  await config.save();

  await recordRouteAudit({
    entityType: 'PLATFORM_CONFIG',
    action: 'PLATFORM_CHARGE_UPDATE',
    actor,
    summary: `Platform charge settings updated by ${actor.name} (${actor.role})`,
    previousValues,
    newValues: {
      sellerBookingCharge: input.sellerBookingCharge,
      transporterBookingCharge: input.transporterBookingCharge,
      billingRuleNotes: input.billingRuleNotes ?? '',
    },
  });

  const auditHistory = await RouteAuditLog.find({ entityType: 'PLATFORM_CONFIG' })
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return { config, auditHistory };
}
