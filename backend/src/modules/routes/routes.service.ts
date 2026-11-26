import type mongoose from 'mongoose';
import { Booking } from '../../models/Booking.ts';
import { RouteAuditLog } from '../../models/RouteAuditLog.ts';
import { TransportRate, type ITransportRate } from '../../models/TransportRate.ts';
import { TransportRoute, type ITransportRoute } from '../../models/TransportRoute.ts';
import { Transporter } from '../../models/Transporter.ts';
import { AppError } from '../../utils/AppError.ts';
import { EntityStatus, TransporterApprovalStatus, UserRole } from '../../utils/constants.ts';
import { buildPaginatedResponse, parsePagination } from '../../utils/pagination.ts';
import { escapeRegex } from '../../utils/sanitize.ts';
import { recordRouteAudit, type AuditActor } from '../platformConfig/platformConfig.service.ts';
import type { z } from 'zod';
import type {
  adminMasterCreateRouteSchema,
  adminMasterUpdateRouteSchema,
  createRouteSchema,
  integratedRouteRateSchema,
  updateIntegratedRouteRateSchema,
  updateRouteSchema,
} from './routes.validator.ts';

export type CreateRouteInput = z.infer<typeof createRouteSchema>;
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;
export type IntegratedRouteRateInput = z.infer<typeof integratedRouteRateSchema>;
export type UpdateIntegratedRouteRateInput = z.infer<typeof updateIntegratedRouteRateSchema>;
export type AdminMasterCreateRouteInput = z.infer<typeof adminMasterCreateRouteSchema>;
export type AdminMasterUpdateRouteInput = z.infer<typeof adminMasterUpdateRouteSchema>;

interface IntegratedRouteDto {
  id: string;
  rateId: string;
  routeId: string;
  transporterId: string;
  transporterName: string;
  transporterEmail?: string;
  transporterPhone?: string;
  transporterStatus?: string;
  isSharedRoute: boolean;
  originCity: string;
  originPincode: string;
  destinationCity: string;
  destinationPincode: string;
  distanceKm?: number;
  status: EntityStatus;
  isActive: boolean;
  ratePerKg: number;
  minimumFreight: number;
  additionalCharges: number;
  rtoCharges: number;
  volumetricDivisor: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  estimatedDeliveryTime: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  lastModifiedByName?: string | null;
  lastModifiedByRole?: string | null;
  lastModifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function buildSnapshot(route: Partial<ITransportRoute>, rate: Partial<ITransportRate>) {
  return {
    originCity: route.originCity,
    originPincode: route.originPincode,
    destinationCity: route.destinationCity,
    destinationPincode: route.destinationPincode,
    distanceKm: route.distanceKm ?? null,
    routeStatus: route.status,
    ratePerKg: rate.ratePerKg,
    minimumFreight: rate.minimumFreight,
    additionalCharges: rate.additionalCharges,
    rtoCharges: rate.rtoCharges,
    volumetricDivisor: rate.volumetricDivisor,
    gstApplicable: rate.gstApplicable,
    gstRatePercent: rate.gstRatePercent,
    estimatedDeliveryTime: rate.estimatedDeliveryTime,
    isActive: rate.isActive,
  };
}

function toIntegratedDto(
  rate: ITransportRate & { _id: mongoose.Types.ObjectId },
  route: ITransportRoute & { _id: mongoose.Types.ObjectId },
  transporter?: {
    _id: mongoose.Types.ObjectId;
    companyName?: string;
    email?: string;
    phone?: string;
    status?: string;
  } | null
): IntegratedRouteDto {
  const effectiveActive = Boolean(rate.isActive && route.status === EntityStatus.ACTIVE);
  return {
    id: rate._id.toString(),
    rateId: rate._id.toString(),
    routeId: route._id.toString(),
    transporterId: (transporter?._id || rate.transporterId).toString(),
    transporterName: transporter?.companyName || 'Transporter',
    transporterEmail: transporter?.email,
    transporterPhone: transporter?.phone,
    transporterStatus: transporter?.status,
    isSharedRoute: !route.transporterId,
    originCity: route.originCity,
    originPincode: route.originPincode,
    destinationCity: route.destinationCity,
    destinationPincode: route.destinationPincode,
    distanceKm: route.distanceKm,
    status: effectiveActive ? EntityStatus.ACTIVE : EntityStatus.INACTIVE,
    isActive: effectiveActive,
    ratePerKg: rate.ratePerKg,
    minimumFreight: rate.minimumFreight,
    additionalCharges: rate.additionalCharges,
    rtoCharges: rate.rtoCharges,
    volumetricDivisor: rate.volumetricDivisor,
    gstApplicable: rate.gstApplicable,
    gstRatePercent: rate.gstRatePercent,
    estimatedDeliveryTime: rate.estimatedDeliveryTime,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo ?? null,
    lastModifiedByName: rate.lastModifiedByName || route.lastModifiedByName || null,
    lastModifiedByRole: rate.lastModifiedByRole || route.lastModifiedByRole || null,
    lastModifiedAt: rate.lastModifiedAt || route.lastModifiedAt || rate.updatedAt,
    createdAt: rate.createdAt,
    updatedAt: rate.updatedAt,
  };
}

export async function createRoute(input: CreateRouteInput, actor?: AuditActor) {
  if (input.originPincode === input.destinationPincode) {
    throw new AppError(
      'Origin and destination pincodes must be different.',
      400,
      'INVALID_ROUTE_PINCODES'
    );
  }

  const existing = await TransportRoute.findOne({
    transporterId: null,
    originPincode: input.originPincode,
    destinationPincode: input.destinationPincode,
    isDeleted: { $ne: true },
  }).lean();

  if (existing) {
    throw new AppError(
      `Route from ${input.originPincode} to ${input.destinationPincode} already exists.`,
      409,
      'ROUTE_ALREADY_EXISTS'
    );
  }

  const route = await TransportRoute.create({
    ...input,
    transporterId: null,
    isDeleted: false,
    ...(actor
      ? {
          lastModifiedByUserId: actor.userId,
          lastModifiedByName: actor.name,
          lastModifiedByRole: actor.role,
          lastModifiedAt: new Date(),
        }
      : {}),
  });

  if (actor) {
    await recordRouteAudit({
      entityType: 'ROUTE',
      action: 'CREATE',
      routeId: route._id,
      actor,
      summary: `Created route ${route.originCity} (${route.originPincode}) -> ${route.destinationCity} (${route.destinationPincode})`,
      newValues: {
        originCity: route.originCity,
        originPincode: route.originPincode,
        destinationCity: route.destinationCity,
        destinationPincode: route.destinationPincode,
        status: route.status,
      },
    });
  }

  return route;
}

export async function listRoutes(
  query: Record<string, unknown>,
  forceActiveOnly = false,
  deduplicateByCorridor = false
) {
  const pagination = parsePagination(query, 50, 100);
  const filter: Record<string, unknown> = { isDeleted: { $ne: true } };

  if (forceActiveOnly) {
    filter.status = EntityStatus.ACTIVE;
  } else if (query.status && Object.values(EntityStatus).includes(query.status as EntityStatus)) {
    filter.status = query.status;
  }

  if (typeof query.search === 'string' && query.search.trim()) {
    const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [
      { originCity: regex },
      { originPincode: regex },
      { destinationCity: regex },
      { destinationPincode: regex },
    ];
  }

  if (deduplicateByCorridor) {
    const allRoutes = await TransportRoute.find(filter)
      .sort({ transporterId: 1, originCity: 1, destinationCity: 1 })
      .lean();

    const uniqueMap = new Map<string, (typeof allRoutes)[number]>();
    for (const r of allRoutes) {
      const key = `${r.originPincode}:${r.destinationPincode}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      }
    }
    const deduped = Array.from(uniqueMap.values());
    const paged = deduped.slice(pagination.skip, pagination.skip + pagination.limit);
    return buildPaginatedResponse(paged, deduped.length, pagination);
  }

  const [items, total] = await Promise.all([
    TransportRoute.find(filter)
      .sort({ originCity: 1, destinationCity: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    TransportRoute.countDocuments(filter),
  ]);

  return buildPaginatedResponse(items, total, pagination);
}

export async function updateRoute(id: string, input: UpdateRouteInput, actor?: AuditActor) {
  const route = await TransportRoute.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!route) {
    throw new AppError('Transport route not found.', 404, 'ROUTE_NOT_FOUND');
  }

  const nextOrigin = input.originPincode ?? route.originPincode;
  const nextDest = input.destinationPincode ?? route.destinationPincode;
  if (nextOrigin === nextDest) {
    throw new AppError('Origin and destination pincodes must be different.', 400, 'INVALID_ROUTE_PINCODES');
  }

  const previousValues = {
    originCity: route.originCity,
    originPincode: route.originPincode,
    destinationCity: route.destinationCity,
    destinationPincode: route.destinationPincode,
    distanceKm: route.distanceKm,
    status: route.status,
  };

  Object.assign(route, input);
  if (actor) {
    route.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
    route.lastModifiedByName = actor.name;
    route.lastModifiedByRole = actor.role;
    route.lastModifiedAt = new Date();
  }
  await route.save();

  if (actor) {
    await recordRouteAudit({
      entityType: 'ROUTE',
      action: 'UPDATE',
      transporterId: route.transporterId ?? null,
      routeId: route._id,
      actor,
      summary: `Updated route ${route.originCity} (${route.originPincode}) -> ${route.destinationCity} (${route.destinationPincode})`,
      previousValues,
      newValues: {
        originCity: route.originCity,
        originPincode: route.originPincode,
        destinationCity: route.destinationCity,
        destinationPincode: route.destinationPincode,
        distanceKm: route.distanceKm,
        status: route.status,
      },
    });
  }

  return route;
}

async function resolveTransporterForUser(userId: string) {
  const transporter = await Transporter.findOne({ userId });
  if (!transporter) {
    throw new AppError('Transporter profile not found for this account.', 404, 'TRANSPORTER_NOT_FOUND');
  }
  return transporter;
}

async function createIntegratedRouteRateCore(
  transporterId: mongoose.Types.ObjectId,
  actor: AuditActor,
  input: IntegratedRouteRateInput
): Promise<IntegratedRouteDto> {
  if (input.originPincode === input.destinationPincode) {
    throw new AppError(
      'Origin and destination pincodes must be different.',
      400,
      'INVALID_ROUTE_PINCODES'
    );
  }

  const transporter = await Transporter.findById(transporterId).lean();
  if (!transporter) {
    throw new AppError('Selected transporter not found.', 404, 'TRANSPORTER_NOT_FOUND');
  }

  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new AppError('Effective end date must be after effective start date.', 400, 'INVALID_DATE_RANGE');
  }

  // Check if transporter already has a non-deleted route/rate for the same pincode pair
  const matchingRoutes = await TransportRoute.find({
    originPincode: input.originPincode,
    destinationPincode: input.destinationPincode,
    isDeleted: { $ne: true },
    $or: [{ transporterId: transporter._id }, { transporterId: null }],
  })
    .select('_id transporterId')
    .lean();

  if (matchingRoutes.length > 0) {
    const ownedConflict = matchingRoutes.find(
      (r) => r.transporterId && r.transporterId.toString() === transporter._id.toString()
    );
    if (ownedConflict) {
      throw new AppError(
        `Route from ${input.originPincode} to ${input.destinationPincode} already exists for ${transporter.companyName}.`,
        409,
        'ROUTE_ALREADY_EXISTS'
      );
    }

    const existingRateOnShared = await TransportRate.findOne({
      transporterId: transporter._id,
      routeId: { $in: matchingRoutes.map((r) => r._id) },
      isDeleted: { $ne: true },
    }).lean();

    if (existingRateOnShared) {
      throw new AppError(
        `A route and rate for ${input.originPincode} -> ${input.destinationPincode} is already configured for ${transporter.companyName}. Please edit the existing route instead.`,
        409,
        'ROUTE_ALREADY_EXISTS'
      );
    }
  }

  const now = new Date();
  const isActive = input.isActive !== undefined ? input.isActive : true;

  const route = await TransportRoute.create({
    transporterId: transporter._id,
    originCity: input.originCity,
    originPincode: input.originPincode,
    destinationCity: input.destinationCity,
    destinationPincode: input.destinationPincode,
    distanceKm: input.distanceKm,
    status: isActive ? EntityStatus.ACTIVE : EntityStatus.INACTIVE,
    isDeleted: false,
    lastModifiedByUserId: actor.userId,
    lastModifiedByName: actor.name,
    lastModifiedByRole: actor.role,
    lastModifiedAt: now,
  });

  const rate = await TransportRate.create({
    transporterId: transporter._id,
    routeId: route._id,
    minimumFreight: input.minimumFreight,
    ratePerKg: input.ratePerKg,
    volumetricDivisor: input.volumetricDivisor ?? 5000,
    rtoCharges: input.rtoCharges ?? 0,
    additionalCharges: input.additionalCharges ?? 0,
    gstApplicable: input.gstApplicable ?? true,
    gstRatePercent: input.gstRatePercent ?? 18,
    estimatedDeliveryTime: input.estimatedDeliveryTime,
    effectiveFrom,
    effectiveTo,
    isActive,
    isSampleData: false,
    isDeleted: false,
    lastModifiedByUserId: actor.userId,
    lastModifiedByName: actor.name,
    lastModifiedByRole: actor.role,
    lastModifiedAt: now,
  });

  await recordRouteAudit({
    entityType: 'ROUTE_RATE',
    action: 'CREATE',
    transporterId: transporter._id,
    routeId: route._id,
    rateId: rate._id,
    actor,
    summary: `${actor.name} (${actor.role}) created route ${route.originCity} (${route.originPincode}) -> ${route.destinationCity} (${route.destinationPincode}) for ${transporter.companyName}`,
    newValues: buildSnapshot(route, rate),
  });

  return toIntegratedDto(rate, route, transporter);
}

async function listIntegratedRoutesCore(query: Record<string, unknown>, fixedTransporterId?: string) {
  const pagination = parsePagination(query, 50, 100);
  const rateFilter: Record<string, unknown> = { isDeleted: { $ne: true } };

  const transporterFilterId =
    fixedTransporterId ||
    (typeof query.transporterId === 'string' && query.transporterId.trim()
      ? query.transporterId.trim()
      : undefined);

  if (transporterFilterId) {
    rateFilter.transporterId = transporterFilterId;
  }

  const rates = await TransportRate.find(rateFilter)
    .populate('transporterId', 'companyName email phone status')
    .populate('routeId')
    .sort({ updatedAt: -1 })
    .lean();

  const searchLower =
    typeof query.search === 'string' && query.search.trim() ? query.search.trim().toLowerCase() : '';
  const statusFilter =
    query.status && Object.values(EntityStatus).includes(query.status as EntityStatus)
      ? (query.status as EntityStatus)
      : undefined;

  const items: IntegratedRouteDto[] = [];
  for (const rate of rates) {
    const route = rate.routeId as unknown as (ITransportRoute & { _id: mongoose.Types.ObjectId }) | null;
    const transporter = rate.transporterId as unknown as {
      _id: mongoose.Types.ObjectId;
      companyName?: string;
      email?: string;
      phone?: string;
      status?: string;
    } | null;

    if (!route || route.isDeleted) continue;

    const dto = toIntegratedDto(
      rate as unknown as ITransportRate & { _id: mongoose.Types.ObjectId },
      route,
      transporter
    );

    if (statusFilter && dto.status !== statusFilter) continue;

    if (searchLower) {
      const hay = [
        dto.originCity,
        dto.originPincode,
        dto.destinationCity,
        dto.destinationPincode,
        dto.transporterName,
        dto.estimatedDeliveryTime,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(searchLower)) continue;
    }

    items.push(dto);
  }

  const total = items.length;
  const paged = items.slice(pagination.skip, pagination.skip + pagination.limit);
  return buildPaginatedResponse(paged, total, pagination);
}

async function updateIntegratedRouteRateCore(
  rateId: string,
  actor: AuditActor,
  input: UpdateIntegratedRouteRateInput,
  enforceTransporterId?: mongoose.Types.ObjectId
): Promise<IntegratedRouteDto> {
  const rate = await TransportRate.findOne({ _id: rateId, isDeleted: { $ne: true } });
  if (!rate) {
    throw new AppError('Route and rate configuration not found.', 404, 'ROUTE_NOT_FOUND');
  }

  if (enforceTransporterId && rate.transporterId.toString() !== enforceTransporterId.toString()) {
    throw new AppError(
      'You are not authorized to modify another transporter\'s route or rate.',
      403,
      'ROUTE_OWNERSHIP_FORBIDDEN'
    );
  }

  let route = await TransportRoute.findOne({ _id: rate.routeId, isDeleted: { $ne: true } });
  if (!route) {
    throw new AppError('Associated transport route not found.', 404, 'ROUTE_NOT_FOUND');
  }

  const transporter = await Transporter.findById(rate.transporterId).lean();
  const previousValues = buildSnapshot(route, rate);

  const nextOriginCity = input.originCity ?? route.originCity;
  const nextOriginPincode = input.originPincode ?? route.originPincode;
  const nextDestCity = input.destinationCity ?? route.destinationCity;
  const nextDestPincode = input.destinationPincode ?? route.destinationPincode;
  const nextDistanceKm = input.distanceKm !== undefined ? input.distanceKm : route.distanceKm;

  if (nextOriginPincode === nextDestPincode) {
    throw new AppError('Origin and destination pincodes must be different.', 400, 'INVALID_ROUTE_PINCODES');
  }

  const nextEffectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : rate.effectiveFrom;
  const nextEffectiveTo =
    input.effectiveTo !== undefined
      ? input.effectiveTo
        ? new Date(input.effectiveTo)
        : null
      : rate.effectiveTo;

  if (nextEffectiveTo && nextEffectiveTo < nextEffectiveFrom) {
    throw new AppError('Effective end date must be after effective start date.', 400, 'INVALID_DATE_RANGE');
  }

  const now = new Date();
  const nextIsActive = input.isActive !== undefined ? input.isActive : rate.isActive;
  const nextRouteStatus = nextIsActive ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;

  // Conflict check against other routes owned by this transporter
  const conflictOwned = await TransportRoute.findOne({
    _id: { $ne: route._id },
    transporterId: rate.transporterId,
    originPincode: nextOriginPincode,
    destinationPincode: nextDestPincode,
    isDeleted: { $ne: true },
  }).lean();

  if (conflictOwned) {
    throw new AppError(
      `Another route for ${nextOriginPincode} -> ${nextDestPincode} already exists for this transporter.`,
      409,
      'ROUTE_ALREADY_EXISTS'
    );
  }

  // If the current route is a legacy shared seeded route (transporterId === null),
  // fork a transporter-owned route so edits/status changes never mutate other transporters' routes.
  if (!route.transporterId) {
    const forkedRoute = await TransportRoute.create({
      transporterId: rate.transporterId,
      originCity: nextOriginCity,
      originPincode: nextOriginPincode,
      destinationCity: nextDestCity,
      destinationPincode: nextDestPincode,
      distanceKm: nextDistanceKm,
      status: nextRouteStatus,
      isDeleted: false,
      lastModifiedByUserId: actor.userId,
      lastModifiedByName: actor.name,
      lastModifiedByRole: actor.role,
      lastModifiedAt: now,
    });
    route = forkedRoute;
    rate.routeId = forkedRoute._id;
  } else {
    route.originCity = nextOriginCity;
    route.originPincode = nextOriginPincode;
    route.destinationCity = nextDestCity;
    route.destinationPincode = nextDestPincode;
    if (nextDistanceKm !== undefined) {
      route.distanceKm = nextDistanceKm;
    }
    route.status = nextRouteStatus;
    route.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
    route.lastModifiedByName = actor.name;
    route.lastModifiedByRole = actor.role;
    route.lastModifiedAt = now;
    await route.save();
  }

  if (input.ratePerKg !== undefined) rate.ratePerKg = input.ratePerKg;
  if (input.minimumFreight !== undefined) rate.minimumFreight = input.minimumFreight;
  if (input.additionalCharges !== undefined) rate.additionalCharges = input.additionalCharges;
  if (input.rtoCharges !== undefined) rate.rtoCharges = input.rtoCharges;
  if (input.volumetricDivisor !== undefined) rate.volumetricDivisor = input.volumetricDivisor;
  if (input.gstApplicable !== undefined) rate.gstApplicable = input.gstApplicable;
  if (input.gstRatePercent !== undefined) rate.gstRatePercent = input.gstRatePercent;
  if (input.estimatedDeliveryTime !== undefined) rate.estimatedDeliveryTime = input.estimatedDeliveryTime;
  rate.effectiveFrom = nextEffectiveFrom;
  rate.effectiveTo = nextEffectiveTo ?? null;
  rate.isActive = nextIsActive;
  rate.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
  rate.lastModifiedByName = actor.name;
  rate.lastModifiedByRole = actor.role;
  rate.lastModifiedAt = now;
  await rate.save();

  await recordRouteAudit({
    entityType: 'ROUTE_RATE',
    action: 'UPDATE',
    transporterId: rate.transporterId,
    routeId: route._id,
    rateId: rate._id,
    actor,
    summary: `${actor.name} (${actor.role}) updated route & rate ${route.originCity} (${route.originPincode}) -> ${route.destinationCity} (${route.destinationPincode})`,
    previousValues,
    newValues: buildSnapshot(route, rate),
  });

  return toIntegratedDto(rate, route, transporter);
}

async function toggleIntegratedRouteStatusCore(
  rateId: string,
  isActive: boolean,
  actor: AuditActor,
  enforceTransporterId?: mongoose.Types.ObjectId
): Promise<IntegratedRouteDto> {
  const rate = await TransportRate.findOne({ _id: rateId, isDeleted: { $ne: true } });
  if (!rate) {
    throw new AppError('Route and rate configuration not found.', 404, 'ROUTE_NOT_FOUND');
  }

  if (enforceTransporterId && rate.transporterId.toString() !== enforceTransporterId.toString()) {
    throw new AppError(
      'You are not authorized to change status of another transporter\'s route.',
      403,
      'ROUTE_OWNERSHIP_FORBIDDEN'
    );
  }

  const route = await TransportRoute.findOne({ _id: rate.routeId, isDeleted: { $ne: true } });
  if (!route) {
    throw new AppError('Associated transport route not found.', 404, 'ROUTE_NOT_FOUND');
  }

  const transporter = await Transporter.findById(rate.transporterId).lean();
  const previousValues = buildSnapshot(route, rate);
  const now = new Date();

  rate.isActive = isActive;
  rate.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
  rate.lastModifiedByName = actor.name;
  rate.lastModifiedByRole = actor.role;
  rate.lastModifiedAt = now;
  await rate.save();

  if (route.transporterId && route.transporterId.toString() === rate.transporterId.toString()) {
    route.status = isActive ? EntityStatus.ACTIVE : EntityStatus.INACTIVE;
    route.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
    route.lastModifiedByName = actor.name;
    route.lastModifiedByRole = actor.role;
    route.lastModifiedAt = now;
    await route.save();
  }

  await recordRouteAudit({
    entityType: 'ROUTE_RATE',
    action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
    transporterId: rate.transporterId,
    routeId: route._id,
    rateId: rate._id,
    actor,
    summary: `${actor.name} (${actor.role}) ${isActive ? 'activated' : 'deactivated'} route ${route.originCity} (${route.originPincode}) -> ${route.destinationCity} (${route.destinationPincode})`,
    previousValues,
    newValues: buildSnapshot(route, rate),
  });

  return toIntegratedDto(rate, route, transporter);
}

async function deleteIntegratedRouteCore(
  rateId: string,
  actor: AuditActor,
  enforceTransporterId?: mongoose.Types.ObjectId
) {
  const rate = await TransportRate.findOne({ _id: rateId, isDeleted: { $ne: true } });
  if (!rate) {
    throw new AppError('Route and rate configuration not found.', 404, 'ROUTE_NOT_FOUND');
  }

  if (enforceTransporterId && rate.transporterId.toString() !== enforceTransporterId.toString()) {
    throw new AppError(
      'You are not authorized to delete another transporter\'s route.',
      403,
      'ROUTE_OWNERSHIP_FORBIDDEN'
    );
  }

  const route = await TransportRoute.findById(rate.routeId);
  const isOwnedRoute = Boolean(
    route?.transporterId && route.transporterId.toString() === rate.transporterId.toString()
  );

  const hasBookings = await Booking.exists({
    $or: [{ rateId: rate._id }, ...(isOwnedRoute && route ? [{ routeId: route._id }] : [])],
  });

  const previousValues = route ? buildSnapshot(route, rate) : { ratePerKg: rate.ratePerKg };
  const routeLabel = route
    ? `${route.originCity} (${route.originPincode}) -> ${route.destinationCity} (${route.destinationPincode})`
    : rateId;

  if (hasBookings) {
    const now = new Date();
    rate.isActive = false;
    rate.isDeleted = true;
    rate.deletedAt = now;
    rate.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
    rate.lastModifiedByName = actor.name;
    rate.lastModifiedByRole = actor.role;
    rate.lastModifiedAt = now;
    await rate.save();

    if (isOwnedRoute && route) {
      route.status = EntityStatus.INACTIVE;
      route.isDeleted = true;
      route.deletedAt = now;
      route.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
      route.lastModifiedByName = actor.name;
      route.lastModifiedByRole = actor.role;
      route.lastModifiedAt = now;
      await route.save();
    }
  } else {
    await TransportRate.deleteOne({ _id: rate._id });
    if (isOwnedRoute && route) {
      await TransportRoute.deleteOne({ _id: route._id });
    }
  }

  await recordRouteAudit({
    entityType: 'ROUTE_RATE',
    action: 'DELETE',
    transporterId: rate.transporterId,
    routeId: route?._id ?? null,
    rateId: rate._id,
    actor,
    summary: `${actor.name} (${actor.role}) deleted route ${routeLabel}${hasBookings ? ' (archived due to shipment history)' : ''}`,
    previousValues,
  });

  return { deleted: true, softDeleted: Boolean(hasBookings), rateId };
}

async function getIntegratedRouteAuditCore(
  rateId: string,
  enforceTransporterId?: mongoose.Types.ObjectId
) {
  const rate = await TransportRate.findById(rateId).lean();
  if (!rate) {
    throw new AppError('Route and rate configuration not found.', 404, 'ROUTE_NOT_FOUND');
  }

  if (enforceTransporterId && rate.transporterId.toString() !== enforceTransporterId.toString()) {
    throw new AppError(
      'You are not authorized to view audit logs for another transporter\'s route.',
      403,
      'ROUTE_OWNERSHIP_FORBIDDEN'
    );
  }

  const route = await TransportRoute.findById(rate.routeId).lean();
  const isOwnedRoute = Boolean(
    route?.transporterId && route.transporterId.toString() === rate.transporterId.toString()
  );

  const logs = await RouteAuditLog.find({
    $or: [{ rateId: rate._id }, ...(isOwnedRoute && route ? [{ routeId: route._id }] : [])],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return logs;
}

// Transporter Panel Services
export async function listTransporterRoutesWithRates(userId: string, query: Record<string, unknown>) {
  const transporter = await resolveTransporterForUser(userId);
  return listIntegratedRoutesCore(query, transporter._id.toString());
}

function assertTransporterApprovedAndActive(transporter: {
  status: EntityStatus;
  approvalStatus?: TransporterApprovalStatus;
  rejectionReason?: string;
}) {
  if (transporter.approvalStatus === TransporterApprovalStatus.PENDING) {
    throw new AppError(
      'Your transporter application is pending admin approval. Route configuration unlocks once approved.',
      403,
      'TRANSPORTER_APPROVAL_PENDING'
    );
  }
  if (transporter.approvalStatus === TransporterApprovalStatus.REJECTED) {
    throw new AppError(
      `Your transporter application was rejected: ${transporter.rejectionReason || 'No reason provided'}`,
      403,
      'TRANSPORTER_APPROVAL_REJECTED'
    );
  }
  if (transporter.status !== EntityStatus.ACTIVE) {
    throw new AppError('Only active transporters can manage routes.', 403, 'TRANSPORTER_INACTIVE');
  }
}

export async function createTransporterRouteWithRate(
  userId: string,
  actor: AuditActor,
  input: IntegratedRouteRateInput
) {
  const transporter = await resolveTransporterForUser(userId);
  assertTransporterApprovedAndActive(transporter);
  return createIntegratedRouteRateCore(transporter._id, actor, input);
}

export async function updateTransporterRouteWithRate(
  userId: string,
  actor: AuditActor,
  rateId: string,
  input: UpdateIntegratedRouteRateInput
) {
  const transporter = await resolveTransporterForUser(userId);
  assertTransporterApprovedAndActive(transporter);
  return updateIntegratedRouteRateCore(rateId, actor, input, transporter._id);
}

export async function toggleTransporterRouteStatus(
  userId: string,
  actor: AuditActor,
  rateId: string,
  isActive: boolean
) {
  const transporter = await resolveTransporterForUser(userId);
  assertTransporterApprovedAndActive(transporter);
  return toggleIntegratedRouteStatusCore(rateId, isActive, actor, transporter._id);
}

export async function deleteTransporterRoute(userId: string, actor: AuditActor, rateId: string) {
  const transporter = await resolveTransporterForUser(userId);
  assertTransporterApprovedAndActive(transporter);
  return deleteIntegratedRouteCore(rateId, actor, transporter._id);
}

export async function getTransporterRouteAudit(userId: string, rateId: string) {
  const transporter = await resolveTransporterForUser(userId);
  return getIntegratedRouteAuditCore(rateId, transporter._id);
}

// Admin Master Control Services
export async function listAdminMasterRoutes(query: Record<string, unknown>) {
  return listIntegratedRoutesCore(query);
}

export async function createAdminMasterRoute(actor: AuditActor, input: AdminMasterCreateRouteInput) {
  const transporter = await Transporter.findById(input.transporterId);
  if (!transporter) {
    throw new AppError('Selected transporter not found.', 404, 'TRANSPORTER_NOT_FOUND');
  }
  const { transporterId: _tid, ...routeRateInput } = input;
  return createIntegratedRouteRateCore(transporter._id, actor, routeRateInput);
}

export async function updateAdminMasterRoute(
  rateId: string,
  actor: AuditActor,
  input: AdminMasterUpdateRouteInput
) {
  return updateIntegratedRouteRateCore(rateId, actor, input);
}

export async function toggleAdminMasterRouteStatus(
  rateId: string,
  isActive: boolean,
  actor: AuditActor
) {
  return toggleIntegratedRouteStatusCore(rateId, isActive, actor);
}

export async function deleteAdminMasterRoute(rateId: string, actor: AuditActor) {
  return deleteIntegratedRouteCore(rateId, actor);
}

export async function getAdminMasterRouteAudit(rateId: string) {
  return getIntegratedRouteAuditCore(rateId);
}

export { UserRole };
