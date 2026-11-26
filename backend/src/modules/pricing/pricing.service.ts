import type mongoose from 'mongoose';
import { TransportRate } from '../../models/TransportRate.ts';
import { Transporter } from '../../models/Transporter.ts';
import { TransportRoute } from '../../models/TransportRoute.ts';
import { AppError } from '../../utils/AppError.ts';
import { EntityStatus, TransporterApprovalStatus } from '../../utils/constants.ts';
import { buildPaginatedResponse, parsePagination } from '../../utils/pagination.ts';
import { calculateFreightBreakdown } from './pricing.engine.ts';
import { bulkRateRowSchema } from './pricing.validator.ts';
import {
  getApplicablePlatformChargeRule,
  recordRouteAudit,
  type AuditActor,
} from '../platformConfig/platformConfig.service.ts';
import type { z } from 'zod';
import type { calculateRatesSchema, createRateSchema, updateRateSchema } from './pricing.validator.ts';

export type CreateRateInput = z.infer<typeof createRateSchema>;
export type UpdateRateInput = z.infer<typeof updateRateSchema>;
export type CalculateRatesInput = z.infer<typeof calculateRatesSchema>;

function csvSafeCell(value: unknown): string {
  const raw = String(value ?? '');
  const sanitized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export async function createRate(input: CreateRateInput, actor?: AuditActor) {
  const [transporter, route] = await Promise.all([
    Transporter.findById(input.transporterId).lean(),
    TransportRoute.findOne({ _id: input.routeId, isDeleted: { $ne: true } }).lean(),
  ]);

  if (!transporter) {
    throw new AppError('Selected transporter does not exist.', 404, 'TRANSPORTER_NOT_FOUND');
  }
  if (!route) {
    throw new AppError('Selected route does not exist.', 404, 'ROUTE_NOT_FOUND');
  }
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new AppError('Effective end date must be after effective start date.', 400, 'INVALID_DATE_RANGE');
  }

  const rate = await TransportRate.create({
    ...input,
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
      entityType: 'RATE',
      action: 'CREATE',
      transporterId: rate.transporterId,
      routeId: rate.routeId,
      rateId: rate._id,
      actor,
      summary: `${actor.name} (${actor.role}) created rate for ${transporter.companyName}`,
      newValues: {
        ratePerKg: rate.ratePerKg,
        minimumFreight: rate.minimumFreight,
        additionalCharges: rate.additionalCharges,
        rtoCharges: rate.rtoCharges,
        volumetricDivisor: rate.volumetricDivisor,
        gstApplicable: rate.gstApplicable,
        gstRatePercent: rate.gstRatePercent,
        estimatedDeliveryTime: rate.estimatedDeliveryTime,
        isActive: rate.isActive,
      },
    });
  }

  return rate;
}

export async function listRates(query: Record<string, unknown>) {
  const pagination = parsePagination(query, 50, 100);
  const filter: Record<string, unknown> = { isDeleted: { $ne: true } };

  if (query.transporterId && typeof query.transporterId === 'string') {
    filter.transporterId = query.transporterId;
  }
  if (query.routeId && typeof query.routeId === 'string') {
    filter.routeId = query.routeId;
  }
  if (query.isActive === 'true') filter.isActive = true;
  if (query.isActive === 'false') filter.isActive = false;

  const [items, total] = await Promise.all([
    TransportRate.find(filter)
      .populate('transporterId', 'companyName contactPerson phone status')
      .populate('routeId', 'originCity originPincode destinationCity destinationPincode distanceKm status')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    TransportRate.countDocuments(filter),
  ]);

  return buildPaginatedResponse(items, total, pagination);
}

export async function updateRate(id: string, input: UpdateRateInput, actor?: AuditActor) {
  const rate = await TransportRate.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!rate) {
    throw new AppError('Transport rate not found.', 404, 'RATE_NOT_FOUND');
  }

  const previousValues = {
    minimumFreight: rate.minimumFreight,
    ratePerKg: rate.ratePerKg,
    volumetricDivisor: rate.volumetricDivisor,
    rtoCharges: rate.rtoCharges,
    additionalCharges: rate.additionalCharges,
    gstApplicable: rate.gstApplicable,
    gstRatePercent: rate.gstRatePercent,
    estimatedDeliveryTime: rate.estimatedDeliveryTime,
    isActive: rate.isActive,
  };

  Object.assign(rate, input);
  if (rate.effectiveTo && rate.effectiveTo < rate.effectiveFrom) {
    throw new AppError('Effective end date must be after effective start date.', 400, 'INVALID_DATE_RANGE');
  }

  if (actor) {
    rate.lastModifiedByUserId = actor.userId as mongoose.Types.ObjectId;
    rate.lastModifiedByName = actor.name;
    rate.lastModifiedByRole = actor.role;
    rate.lastModifiedAt = new Date();
  }

  await rate.save();

  if (actor) {
    await recordRouteAudit({
      entityType: 'RATE',
      action: 'UPDATE',
      transporterId: rate.transporterId,
      routeId: rate.routeId,
      rateId: rate._id,
      actor,
      summary: `${actor.name} (${actor.role}) updated rate configuration`,
      previousValues,
      newValues: {
        minimumFreight: rate.minimumFreight,
        ratePerKg: rate.ratePerKg,
        volumetricDivisor: rate.volumetricDivisor,
        rtoCharges: rate.rtoCharges,
        additionalCharges: rate.additionalCharges,
        gstApplicable: rate.gstApplicable,
        gstRatePercent: rate.gstRatePercent,
        estimatedDeliveryTime: rate.estimatedDeliveryTime,
        isActive: rate.isActive,
      },
    });
  }

  return rate;
}

export async function calculateAvailableQuotes(input: CalculateRatesInput) {
  let primaryRoute = null;
  let originPincode = input.originPincode;
  let destinationPincode = input.destinationPincode;

  if (input.routeId) {
    primaryRoute = await TransportRoute.findOne({
      _id: input.routeId,
      isDeleted: { $ne: true },
    }).lean();
    if (!primaryRoute) {
      throw new AppError(
        'No transport route found for the specified origin and destination.',
        404,
        'ROUTE_NOT_FOUND'
      );
    }
    originPincode = primaryRoute.originPincode;
    destinationPincode = primaryRoute.destinationPincode;
  }

  const matchingRoutes = await TransportRoute.find({
    originPincode,
    destinationPincode,
    isDeleted: { $ne: true },
  }).lean();

  if (matchingRoutes.length === 0) {
    throw new AppError(
      'No transport route found for the specified origin and destination.',
      404,
      'ROUTE_NOT_FOUND'
    );
  }

  const activeRoutes = matchingRoutes.filter((r) => r.status === EntityStatus.ACTIVE);
  if (activeRoutes.length === 0) {
    throw new AppError('The selected transport route is currently inactive.', 400, 'ROUTE_INACTIVE');
  }

  if (!primaryRoute || primaryRoute.status !== EntityStatus.ACTIVE) {
    primaryRoute = activeRoutes[0];
  }

  const now = new Date();
  const [rates, platformChargeRule] = await Promise.all([
    TransportRate.find({
      routeId: { $in: activeRoutes.map((r) => r._id) },
      isActive: true,
      isDeleted: { $ne: true },
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gte: now } }],
    })
      .populate('transporterId', 'companyName contactPerson phone email status approvalStatus serviceAreas')
      .lean(),
    getApplicablePlatformChargeRule('PLATFORM'),
  ]);

  const quotes = rates
    .filter((rate) => {
      const t = rate.transporterId as unknown as {
        status?: EntityStatus;
        approvalStatus?: TransporterApprovalStatus;
      } | null;
      return (
        t &&
        t.status === EntityStatus.ACTIVE &&
        (!t.approvalStatus || t.approvalStatus === TransporterApprovalStatus.APPROVED)
      );
    })
    .map((rate) => {
      const transporter = rate.transporterId as unknown as {
        _id: string;
        companyName: string;
        contactPerson: string;
        phone: string;
        email: string;
      };

      const breakdown = calculateFreightBreakdown(
        {
          actualWeightKg: input.actualWeightKg,
          lengthCm: input.lengthCm,
          widthCm: input.widthCm,
          heightCm: input.heightCm,
        },
        {
          minimumFreight: rate.minimumFreight,
          ratePerKg: rate.ratePerKg,
          volumetricDivisor: rate.volumetricDivisor,
          rtoCharges: rate.rtoCharges,
          additionalCharges: rate.additionalCharges,
          gstApplicable: rate.gstApplicable,
          gstRatePercent: rate.gstRatePercent,
        },
        platformChargeRule
      );

      return {
        rateId: rate._id.toString(),
        routeId: rate.routeId.toString(),
        transporterId: transporter._id.toString(),
        transporterName: transporter.companyName,
        contactPerson: transporter.contactPerson,
        transporterPhone: transporter.phone,
        estimatedDeliveryTime: rate.estimatedDeliveryTime,
        isSampleData: rate.isSampleData,
        breakdown,
      };
    })
    .sort((a, b) => a.breakdown.finalAmount - b.breakdown.finalAmount);

  return {
    route: {
      id: primaryRoute._id.toString(),
      originCity: primaryRoute.originCity,
      originPincode: primaryRoute.originPincode,
      destinationCity: primaryRoute.destinationCity,
      destinationPincode: primaryRoute.destinationPincode,
      distanceKm: primaryRoute.distanceKm,
    },
    parcel: {
      actualWeightKg: input.actualWeightKg,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
      numberOfPackages: input.numberOfPackages,
    },
    quotes,
  };
}

export async function exportRatesCsv(): Promise<string> {
  const rates = await TransportRate.find({ isDeleted: { $ne: true } })
    .populate('transporterId', 'companyName email gstNumber')
    .populate('routeId', 'originCity originPincode destinationCity destinationPincode')
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'transporterName',
    'transporterGst',
    'transporterEmail',
    'originCity',
    'originPincode',
    'destinationCity',
    'destinationPincode',
    'minimumFreight',
    'ratePerKg',
    'volumetricDivisor',
    'rtoCharges',
    'additionalCharges',
    'gstApplicable',
    'gstRatePercent',
    'estimatedDeliveryTime',
    'effectiveFrom',
    'effectiveTo',
    'isActive',
  ];

  const lines = [headers.join(',')];
  for (const rate of rates) {
    const t = rate.transporterId as unknown as {
      companyName?: string;
      gstNumber?: string;
      email?: string;
    } | null;
    const rt = rate.routeId as unknown as {
      originCity?: string;
      originPincode?: string;
      destinationCity?: string;
      destinationPincode?: string;
    } | null;

    const row = [
      t?.companyName || '',
      t?.gstNumber || '',
      t?.email || '',
      rt?.originCity || '',
      rt?.originPincode || '',
      rt?.destinationCity || '',
      rt?.destinationPincode || '',
      rate.minimumFreight,
      rate.ratePerKg,
      rate.volumetricDivisor,
      rate.rtoCharges,
      rate.additionalCharges,
      rate.gstApplicable ? 'true' : 'false',
      rate.gstRatePercent,
      rate.estimatedDeliveryTime,
      rate.effectiveFrom ? new Date(rate.effectiveFrom).toISOString().slice(0, 10) : '',
      rate.effectiveTo ? new Date(rate.effectiveTo).toISOString().slice(0, 10) : '',
      rate.isActive ? 'true' : 'false',
    ];
    lines.push(row.map(csvSafeCell).join(','));
  }

  return lines.join('\n');
}

export async function bulkImportRates(rawRows: Record<string, unknown>[]) {
  const [transporters, routes] = await Promise.all([
    Transporter.find().select('_id gstNumber email companyName').lean(),
    TransportRoute.find({ isDeleted: { $ne: true } })
      .select('_id transporterId originPincode destinationPincode')
      .lean(),
  ]);

  const byId = new Map(transporters.map((t) => [t._id.toString(), t]));
  const byGst = new Map(transporters.map((t) => [t.gstNumber.toUpperCase(), t]));
  const byEmail = new Map(transporters.map((t) => [t.email.toLowerCase(), t]));
  const routesByPincodes = new Map<string, (typeof routes)[number][]>();
  for (const r of routes) {
    const key = `${r.originPincode}:${r.destinationPincode}`;
    const list = routesByPincodes.get(key) || [];
    list.push(r);
    routesByPincodes.set(key, list);
  }

  let createdCount = 0;
  let updatedCount = 0;
  const errors: { rowNumber: number; message: string }[] = [];

  for (let idx = 0; idx < rawRows.length; idx += 1) {
    const raw = rawRows[idx];
    const rowNumber = Number(raw.rowNumber || idx + 1);
    const parsed = bulkRateRowSchema.safeParse({
      ...raw,
      rowNumber,
      effectiveTo: raw.effectiveTo ? raw.effectiveTo : undefined,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      errors.push({
        rowNumber,
        message: firstIssue ? `${firstIssue.path.join('.') || 'row'}: ${firstIssue.message}` : 'Invalid row format',
      });
      continue;
    }

    const row = parsed.data;
    const transporter =
      (row.transporterId && byId.get(row.transporterId)) ||
      (row.transporterGst && byGst.get(row.transporterGst.toUpperCase())) ||
      (row.transporterEmail && byEmail.get(row.transporterEmail.toLowerCase())) ||
      null;

    if (!transporter) {
      errors.push({
        rowNumber,
        message: 'Transporter not found (check transporterGst / transporterEmail / transporterId)',
      });
      continue;
    }

    const corridorRoutes = routesByPincodes.get(`${row.originPincode}:${row.destinationPincode}`) || [];
    const route =
      corridorRoutes.find(
        (r) => r.transporterId && r.transporterId.toString() === transporter._id.toString()
      ) ||
      corridorRoutes.find((r) => !r.transporterId) ||
      corridorRoutes[0];
    if (!route) {
      errors.push({
        rowNumber,
        message: `Route ${row.originPincode} -> ${row.destinationPincode} does not exist`,
      });
      continue;
    }

    if (row.effectiveTo && row.effectiveTo < row.effectiveFrom) {
      errors.push({
        rowNumber,
        message: 'effectiveTo must be on or after effectiveFrom',
      });
      continue;
    }

    const existing = await TransportRate.findOne({
      transporterId: transporter._id,
      routeId: route._id,
      isDeleted: { $ne: true },
    });

    if (existing) {
      existing.minimumFreight = row.minimumFreight;
      existing.ratePerKg = row.ratePerKg;
      existing.volumetricDivisor = row.volumetricDivisor;
      existing.rtoCharges = row.rtoCharges;
      existing.additionalCharges = row.additionalCharges;
      existing.gstApplicable = row.gstApplicable;
      existing.gstRatePercent = row.gstRatePercent;
      existing.estimatedDeliveryTime = row.estimatedDeliveryTime;
      existing.effectiveFrom = row.effectiveFrom;
      existing.effectiveTo = row.effectiveTo ?? null;
      existing.isActive = row.isActive;
      await existing.save();
      updatedCount += 1;
    } else {
      await TransportRate.create({
        transporterId: transporter._id,
        routeId: route._id,
        minimumFreight: row.minimumFreight,
        ratePerKg: row.ratePerKg,
        volumetricDivisor: row.volumetricDivisor,
        rtoCharges: row.rtoCharges,
        additionalCharges: row.additionalCharges,
        gstApplicable: row.gstApplicable,
        gstRatePercent: row.gstRatePercent,
        estimatedDeliveryTime: row.estimatedDeliveryTime,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo ?? null,
        isActive: row.isActive,
        isSampleData: false,
      });
      createdCount += 1;
    }
  }

  return {
    totalProcessed: rawRows.length,
    createdCount,
    updatedCount,
    failedCount: errors.length,
    errors,
  };
}

