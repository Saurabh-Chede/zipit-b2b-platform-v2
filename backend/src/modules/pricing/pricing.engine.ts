import { AppError } from '../../utils/AppError.ts';

export interface ParcelCalculationInput {
  actualWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface RateCalculationConfig {
  minimumFreight: number;
  ratePerKg: number;
  volumetricDivisor: number;
  rtoCharges: number;
  additionalCharges: number;
  gstApplicable: boolean;
  gstRatePercent: number;
}

export interface PlatformChargeConfigInput {
  enabled: boolean;
  chargeType: 'FIXED' | 'PERCENTAGE';
  value: number;
  applyGstOnCharge?: boolean;
}

export interface CalculatedFreightBreakdown {
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  volumetricDivisor: number;
  minimumFreight: number;
  ratePerKg: number;
  baseFreight: number;
  additionalCharges: number;
  platformCharge: number;
  platformChargeType: 'NONE' | 'FIXED' | 'PERCENTAGE';
  platformChargeValue: number;
  platformChargeApplied: boolean;
  rtoCharges: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  taxAmount: number;
  finalAmount: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Pure deterministic freight pricing engine.
 * Formula:
 * - Volumetric Weight = (Length * Width * Height) / Volumetric Divisor
 * - Chargeable Weight = Max(Actual Weight, Volumetric Weight)
 * - Freight = Max(Minimum Freight, Chargeable Weight * Rate Per Kg)
 * - Platform Charge = configurable FIXED or PERCENTAGE on (Freight + Additional Charges), if enabled
 * - GST = gstApplicable ? ((Freight + Additional Charges + (applyGstOnCharge ? Platform Charge : 0)) * gstRatePercent / 100) : 0
 * - Final Amount = Freight + Additional Charges + Platform Charge + GST
 * - RTO Charges returned separately
 */
export function calculateFreightBreakdown(
  parcel: ParcelCalculationInput,
  rate: RateCalculationConfig,
  platformChargeConfig?: PlatformChargeConfigInput | null
): CalculatedFreightBreakdown {
  const { actualWeightKg, lengthCm, widthCm, heightCm } = parcel;

  if (!Number.isFinite(actualWeightKg) || actualWeightKg <= 0) {
    throw new AppError('Actual weight must be a positive number.', 400, 'INVALID_WEIGHT');
  }
  if (
    !Number.isFinite(lengthCm) ||
    lengthCm <= 0 ||
    !Number.isFinite(widthCm) ||
    widthCm <= 0 ||
    !Number.isFinite(heightCm) ||
    heightCm <= 0
  ) {
    throw new AppError('Parcel dimensions (length, width, height) must be positive numbers.', 400, 'INVALID_DIMENSIONS');
  }
  if (!Number.isFinite(rate.volumetricDivisor) || rate.volumetricDivisor <= 0) {
    throw new AppError('Volumetric divisor must be positive.', 400, 'INVALID_RATE_CONFIGURATION');
  }
  if (!Number.isFinite(rate.ratePerKg) || rate.ratePerKg <= 0 || rate.minimumFreight < 0) {
    throw new AppError('Invalid transporter rate configuration.', 400, 'INVALID_RATE_CONFIGURATION');
  }

  const volumetricWeightKg = round2((lengthCm * widthCm * heightCm) / rate.volumetricDivisor);
  const chargeableWeightKg = round2(Math.max(actualWeightKg, volumetricWeightKg));
  const calculatedWeightFreight = chargeableWeightKg * rate.ratePerKg;
  const baseFreight = round2(Math.max(rate.minimumFreight, calculatedWeightFreight));
  const additionalCharges = round2(rate.additionalCharges);
  const freightPlusAdditional = round2(baseFreight + additionalCharges);

  let platformCharge = 0;
  let platformChargeType: 'NONE' | 'FIXED' | 'PERCENTAGE' = 'NONE';
  let platformChargeValue = 0;
  let platformChargeApplied = false;

  if (
    platformChargeConfig &&
    platformChargeConfig.enabled &&
    Number.isFinite(platformChargeConfig.value) &&
    platformChargeConfig.value > 0
  ) {
    platformChargeApplied = true;
    platformChargeType = platformChargeConfig.chargeType;
    platformChargeValue = round2(platformChargeConfig.value);
    if (platformChargeConfig.chargeType === 'PERCENTAGE') {
      platformCharge = round2(freightPlusAdditional * (platformChargeConfig.value / 100));
    } else {
      platformCharge = round2(platformChargeConfig.value);
    }
  }

  const taxableSubtotal = platformChargeConfig?.applyGstOnCharge
    ? round2(freightPlusAdditional + platformCharge)
    : freightPlusAdditional;

  const taxAmount = rate.gstApplicable ? round2(taxableSubtotal * (rate.gstRatePercent / 100)) : 0;
  const finalAmount = round2(freightPlusAdditional + platformCharge + taxAmount);
  const rtoCharges = round2(rate.rtoCharges);

  return {
    actualWeightKg: round2(actualWeightKg),
    volumetricWeightKg,
    chargeableWeightKg,
    volumetricDivisor: rate.volumetricDivisor,
    minimumFreight: round2(rate.minimumFreight),
    ratePerKg: round2(rate.ratePerKg),
    baseFreight,
    additionalCharges,
    platformCharge,
    platformChargeType,
    platformChargeValue,
    platformChargeApplied,
    rtoCharges,
    gstApplicable: rate.gstApplicable,
    gstRatePercent: rate.gstApplicable ? rate.gstRatePercent : 0,
    taxAmount,
    finalAmount,
  };
}
