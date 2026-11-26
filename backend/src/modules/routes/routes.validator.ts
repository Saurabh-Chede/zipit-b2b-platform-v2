import { z } from 'zod';
import { EntityStatus } from '../../utils/constants.ts';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createRouteSchema = z.object({
  originCity: z.string().min(2).max(100).trim(),
  originPincode: z.string().regex(/^\d{6}$/, 'Origin pincode must be 6 digits'),
  destinationCity: z.string().min(2).max(100).trim(),
  destinationPincode: z.string().regex(/^\d{6}$/, 'Destination pincode must be 6 digits'),
  distanceKm: z.coerce.number().positive().optional(),
  status: z.nativeEnum(EntityStatus).optional().default(EntityStatus.ACTIVE),
});

export const updateRouteSchema = z.object({
  originCity: z.string().min(2).max(100).trim().optional(),
  originPincode: z.string().regex(/^\d{6}$/).optional(),
  destinationCity: z.string().min(2).max(100).trim().optional(),
  destinationPincode: z.string().regex(/^\d{6}$/).optional(),
  distanceKm: z.coerce.number().positive().optional(),
  status: z.nativeEnum(EntityStatus).optional(),
});

export const listRoutesQuerySchema = z.object({
  status: z.nativeEnum(EntityStatus).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const routeIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid route ID'),
});

export const integratedRouteRateSchema = z.object({
  originCity: z.string().min(2, 'Origin city is required').max(100).trim(),
  originPincode: z.string().regex(/^\d{6}$/, 'Origin pincode must be 6 digits'),
  destinationCity: z.string().min(2, 'Destination city is required').max(100).trim(),
  destinationPincode: z.string().regex(/^\d{6}$/, 'Destination pincode must be 6 digits'),
  distanceKm: z.coerce.number().positive('Distance must be greater than 0').optional(),
  ratePerKg: z.coerce.number().positive('Rate per KG must be greater than 0'),
  minimumFreight: z.coerce.number().min(0, 'Minimum freight cannot be negative'),
  additionalCharges: z.coerce.number().min(0, 'Additional charges cannot be negative').default(0),
  rtoCharges: z.coerce.number().min(0, 'RTO charges cannot be negative').default(0),
  volumetricDivisor: z.coerce.number().positive('Volumetric divisor must be positive').default(5000),
  gstApplicable: z.boolean().default(true),
  gstRatePercent: z.coerce.number().min(0).max(28, 'GST percentage must be between 0 and 28').default(18),
  estimatedDeliveryTime: z.string().min(2, 'Estimated delivery time is required').max(80).trim(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateIntegratedRouteRateSchema = integratedRouteRateSchema.partial();

export const adminMasterCreateRouteSchema = integratedRouteRateSchema.extend({
  transporterId: z.string().regex(objectIdRegex, 'Valid transporter ID is required'),
});

export const adminMasterUpdateRouteSchema = integratedRouteRateSchema.partial().extend({
  transporterId: z.string().regex(objectIdRegex, 'Valid transporter ID is required').optional(),
});

export const toggleRouteStatusSchema = z.object({
  isActive: z.boolean(),
});

export const listMasterRoutesQuerySchema = z.object({
  transporterId: z.string().regex(objectIdRegex, 'Invalid transporter ID').optional(),
  status: z.nativeEnum(EntityStatus).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
