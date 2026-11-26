import { describe, expect, it } from 'vitest';
import { calculateFreightBreakdown } from '../backend/src/modules/pricing/pricing.engine.ts';
import { AppError } from '../backend/src/utils/AppError.ts';

describe('Freight Pricing Engine Unit Tests', () => {
  const sampleRate = {
    minimumFreight: 650,
    ratePerKg: 12,
    volumetricDivisor: 5000,
    rtoCharges: 350,
    additionalCharges: 120,
    gstApplicable: true,
    gstRatePercent: 18,
  };

  it('uses actual weight when actual weight exceeds volumetric weight', () => {
    // Volumetric = (50 * 40 * 30) / 5000 = 12 kg; Actual = 80 kg
    const result = calculateFreightBreakdown(
      { actualWeightKg: 80, lengthCm: 50, widthCm: 40, heightCm: 30 },
      sampleRate
    );

    expect(result.volumetricWeightKg).toBe(12);
    expect(result.chargeableWeightKg).toBe(80);
    expect(result.baseFreight).toBe(960); // 80 * 12
    expect(result.taxAmount).toBe(194.4); // (960 + 120) * 0.18
    expect(result.finalAmount).toBe(1274.4); // 960 + 120 + 194.4
    expect(result.rtoCharges).toBe(350); // Separate from finalAmount
  });

  it('uses volumetric weight when volumetric weight exceeds actual weight', () => {
    // Volumetric = (100 * 80 * 60) / 5000 = 96 kg; Actual = 30 kg
    const result = calculateFreightBreakdown(
      { actualWeightKg: 30, lengthCm: 100, widthCm: 80, heightCm: 60 },
      sampleRate
    );

    expect(result.volumetricWeightKg).toBe(96);
    expect(result.chargeableWeightKg).toBe(96);
    expect(result.baseFreight).toBe(1152); // 96 * 12
    expect(result.taxAmount).toBe(228.96); // (1152 + 120) * 0.18
    expect(result.finalAmount).toBe(1500.96);
  });

  it('enforces minimum freight floor for light parcels', () => {
    // Volumetric = (20 * 20 * 20) / 5000 = 1.6 kg; Actual = 5 kg -> 5 * 12 = 60 < 650 minFreight
    const result = calculateFreightBreakdown(
      { actualWeightKg: 5, lengthCm: 20, widthCm: 20, heightCm: 20 },
      sampleRate
    );

    expect(result.chargeableWeightKg).toBe(5);
    expect(result.baseFreight).toBe(650);
    expect(result.taxAmount).toBe(138.6); // (650 + 120) * 0.18
    expect(result.finalAmount).toBe(908.6);
  });

  it('calculates zero tax when GST is not applicable', () => {
    const result = calculateFreightBreakdown(
      { actualWeightKg: 60, lengthCm: 40, widthCm: 40, heightCm: 40 },
      { ...sampleRate, gstApplicable: false }
    );

    expect(result.taxAmount).toBe(0);
    expect(result.gstRatePercent).toBe(0);
    expect(result.finalAmount).toBe(720 + 120);
  });

  it('throws INVALID_WEIGHT error for zero or negative weight', () => {
    expect(() =>
      calculateFreightBreakdown(
        { actualWeightKg: 0, lengthCm: 30, widthCm: 30, heightCm: 30 },
        sampleRate
      )
    ).toThrowError(AppError);

    expect(() =>
      calculateFreightBreakdown(
        { actualWeightKg: -5, lengthCm: 30, widthCm: 30, heightCm: 30 },
        sampleRate
      )
    ).toThrowError(/Actual weight must be a positive number/);
  });

  it('throws INVALID_DIMENSIONS error for zero or negative parcel dimensions', () => {
    expect(() =>
      calculateFreightBreakdown(
        { actualWeightKg: 10, lengthCm: 0, widthCm: 30, heightCm: 30 },
        sampleRate
      )
    ).toThrowError(/Parcel dimensions/);

    expect(() =>
      calculateFreightBreakdown(
        { actualWeightKg: 10, lengthCm: 30, widthCm: -2, heightCm: 30 },
        sampleRate
      )
    ).toThrowError(/Parcel dimensions/);
  });

  it('applies FIXED platform charge with and without GST on charge', () => {
    // baseFreight = 80 * 12 = 960; additional = 120 => subtotal = 1080
    const noGstOnCharge = calculateFreightBreakdown(
      { actualWeightKg: 80, lengthCm: 50, widthCm: 40, heightCm: 30 },
      sampleRate,
      { enabled: true, chargeType: 'FIXED', value: 50, applyGstOnCharge: false }
    );
    expect(noGstOnCharge.platformChargeApplied).toBe(true);
    expect(noGstOnCharge.platformChargeType).toBe('FIXED');
    expect(noGstOnCharge.platformCharge).toBe(50);
    expect(noGstOnCharge.taxAmount).toBe(194.4); // 1080 * 0.18
    expect(noGstOnCharge.finalAmount).toBe(1324.4); // 1080 + 50 + 194.4

    const withGstOnCharge = calculateFreightBreakdown(
      { actualWeightKg: 80, lengthCm: 50, widthCm: 40, heightCm: 30 },
      sampleRate,
      { enabled: true, chargeType: 'FIXED', value: 50, applyGstOnCharge: true }
    );
    expect(withGstOnCharge.platformCharge).toBe(50);
    expect(withGstOnCharge.taxAmount).toBe(203.4); // (1080 + 50) * 0.18
    expect(withGstOnCharge.finalAmount).toBe(1333.4); // 1080 + 50 + 203.4
  });

  it('applies PERCENTAGE platform charge and ignores disabled or zero rules', () => {
    // baseFreight = 960, additional = 120 => subtotal = 1080; 2.5% of 1080 = 27
    const pctResult = calculateFreightBreakdown(
      { actualWeightKg: 80, lengthCm: 50, widthCm: 40, heightCm: 30 },
      sampleRate,
      { enabled: true, chargeType: 'PERCENTAGE', value: 2.5, applyGstOnCharge: true }
    );
    expect(pctResult.platformChargeApplied).toBe(true);
    expect(pctResult.platformChargeType).toBe('PERCENTAGE');
    expect(pctResult.platformChargeValue).toBe(2.5);
    expect(pctResult.platformCharge).toBe(27);
    expect(pctResult.taxAmount).toBe(199.26); // (1080 + 27) * 0.18 = 199.26
    expect(pctResult.finalAmount).toBe(1306.26); // 1080 + 27 + 199.26

    const disabledResult = calculateFreightBreakdown(
      { actualWeightKg: 80, lengthCm: 50, widthCm: 40, heightCm: 30 },
      sampleRate,
      { enabled: false, chargeType: 'PERCENTAGE', value: 10, applyGstOnCharge: true }
    );
    expect(disabledResult.platformChargeApplied).toBe(false);
    expect(disabledResult.platformCharge).toBe(0);
    expect(disabledResult.finalAmount).toBe(1274.4);
  });
});

