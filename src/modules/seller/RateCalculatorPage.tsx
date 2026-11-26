import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  Check,
  Info,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatINR, formatWeight } from '../../utils/formatters.ts';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import type { PaginatedResponse, RateQuote, TransportRoute } from '../../types/index.ts';

const MAX_INSURANCE = 100000;
const OTP_BASE_FEE = 5;
const OTP_GST_FEE = 0.9;

type ShipmentType = 'forward' | 'return';
type PaymentType = 'prepaid' | 'cod';

interface CalculatedRouteInfo {
  id: string;
  originCity: string;
  originPincode: string;
  destinationCity: string;
  destinationPincode: string;
  distanceKm?: number;
}

interface CalcResultState {
  route: CalculatedRouteInfo;
  quotes: RateQuote[];
  shipment: ShipmentType;
  payment: PaymentType;
  insuranceDeclared: number;
  insuranceFeeExclGst: number;
  insuranceGst: number;
  otpEnabled: boolean;
  otpFeeTotal: number;
}

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <Info className="h-3.5 w-3.5 cursor-help text-slate-400 hover:text-slate-600 transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function Label({
  children,
  required,
  tip,
}: {
  children: React.ReactNode;
  required?: boolean;
  tip?: string;
}) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <span>{children}</span>
      {required && <span className="text-red-500">*</span>}
      {tip && <Tip text={tip} />}
    </span>
  );
}

function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap ${
              on
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors ${
                on ? 'border-blue-600' : 'border-slate-300 bg-white'
              }`}
            >
              {on && <span className="h-2 w-2 rounded-full bg-blue-600" />}
            </span>
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm font-medium text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
          checked
            ? 'border-blue-600 bg-blue-600'
            : 'border-slate-300 bg-white'
        }`}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
      <span className="inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        checked ? 'bg-blue-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function computeInsuranceCharges(declaredValue: number): { baseFee: number; gst: number } {
  if (declaredValue <= 0) return { baseFee: 0, gst: 0 };
  const baseFee = declaredValue <= 200 ? 5 : Number((5 + (declaredValue - 200) * 0.016).toFixed(2));
  const gst = Number((baseFee * 0.18).toFixed(2));
  return { baseFee, gst };
}

export function RateCalculatorPage() {
  const navigate = useNavigate();

  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);

  const [shipment, setShipment] = useState<ShipmentType>('forward');
  const [payment, setPayment] = useState<PaymentType>('prepaid');
  const [pickup, setPickup] = useState('');
  const [delivery, setDelivery] = useState('');
  const [weight, setWeight] = useState('0.5');
  const [dims, setDims] = useState({ l: '20', w: '15', h: '10' });
  const [insured, setInsured] = useState(false);
  const [insurance, setInsurance] = useState('');
  const [otp, setOtp] = useState(false);

  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalcResultState | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get<{ success: boolean; data: PaginatedResponse<TransportRoute> }>('/routes')
      .then((res) => {
        if (!active) return;
        const loaded = res.data.data.items;
        setRoutes(loaded);
        if (loaded.length > 0) {
          setPickup((prev) => prev || loaded[0].originPincode);
          setDelivery((prev) => prev || loaded[0].destinationPincode);
        }
      })
      .catch(() => {
        // Pincodes can still be typed manually
      })
      .finally(() => {
        if (active) setLoadingRoutes(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

  const setDim = (k: 'l' | 'w' | 'h') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDims((d) => ({ ...d, [k]: e.target.value.replace(/[^\d.]/g, '') }));

  const chargeable = useMemo(() => {
    const vol = ((Number(dims.l) || 0) * (Number(dims.w) || 0) * (Number(dims.h) || 0)) / 5000;
    return Number(Math.max(vol, Number(weight) || 0).toFixed(2));
  }, [dims, weight]);

  const toggleInsured = (on: boolean) => {
    setInsured(on);
    if (!on) setInsurance('');
  };

  const onInsuranceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(digits(e.target.value, 7));
    setInsurance(n ? String(Math.min(n, MAX_INSURANCE)) : '');
  };

  const valid =
    pickup.length === 6 &&
    delivery.length === 6 &&
    Number(weight) > 0 &&
    Number(dims.l) > 0 &&
    Number(dims.w) > 0 &&
    Number(dims.h) > 0 &&
    (!insured || Number(insurance) > 0);

  const matchedRoute = useMemo(
    () =>
      routes.find(
        (r) =>
          (shipment === 'forward' &&
            r.originPincode === pickup &&
            r.destinationPincode === delivery) ||
          (shipment === 'return' &&
            r.originPincode === delivery &&
            r.destinationPincode === pickup)
      ) || null,
    [routes, pickup, delivery, shipment]
  );

  const reset = () => {
    setShipment('forward');
    setPayment('prepaid');
    setPickup(routes[0]?.originPincode || '');
    setDelivery(routes[0]?.destinationPincode || '');
    setWeight('0.5');
    setDims({ l: '20', w: '15', h: '10' });
    setInsured(false);
    setInsurance('');
    setOtp(false);
    setError(null);
    setResult(null);
  };

  const handleQuickSelectRoute = (route: TransportRoute) => {
    if (shipment === 'return') {
      setPickup(route.destinationPincode);
      setDelivery(route.originPincode);
    } else {
      setPickup(route.originPincode);
      setDelivery(route.destinationPincode);
    }
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;

    setCalculating(true);
    setError(null);
    try {
      const originPincode = shipment === 'return' ? delivery : pickup;
      const destinationPincode = shipment === 'return' ? pickup : delivery;

      const res = await apiClient.post<{
        success: boolean;
        data: { route: CalculatedRouteInfo; quotes: RateQuote[] };
      }>('/rates/calculate', {
        originPincode,
        destinationPincode,
        actualWeightKg: Number(weight),
        lengthCm: Number(dims.l),
        widthCm: Number(dims.w),
        heightCm: Number(dims.h),
        numberOfPackages: 1,
      });

      const declared = insured ? Number(insurance) || 0 : 0;
      const ins = computeInsuranceCharges(declared);
      const otpFeeTotal = otp ? Number((OTP_BASE_FEE + OTP_GST_FEE).toFixed(2)) : 0;

      setResult({
        route: res.data.data.route,
        quotes: res.data.data.quotes,
        shipment,
        payment,
        insuranceDeclared: declared,
        insuranceFeeExclGst: ins.baseFee,
        insuranceGst: ins.gst,
        otpEnabled: otp,
        otpFeeTotal,
      });
    } catch (err) {
      setResult(null);
      setError(extractErrorMessage(err, 'Failed to calculate shipping rates.'));
    } finally {
      setCalculating(false);
    }
  };

  if (loadingRoutes) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Shipping Rate Calculator</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Estimate volumetric freight, GST, insurance, and compare carrier quotes before booking
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
          Est. Chargeable Weight:{' '}
          <strong className="text-slate-900">{formatWeight(chargeable)}</strong>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {routes.length > 0 && (
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-6 overflow-x-auto sm:flex-wrap sm:overflow-visible scrollbar-none">
            <span className="text-xs font-medium text-slate-500 mr-1 shrink-0">Active Lanes:</span>
            {routes.map((r) => {
              const isSelected =
                (shipment === 'forward' &&
                  r.originPincode === pickup &&
                  r.destinationPincode === delivery) ||
                (shipment === 'return' &&
                  r.originPincode === delivery &&
                  r.destinationPincode === pickup);
              return (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => handleQuickSelectRoute(r)}
                  className={`rounded-lg border px-2.5 py-1.5 sm:py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {r.originCity} ({r.originPincode}) → {r.destinationCity} ({r.destinationPincode})
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-blue-600 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-900">Shipment Inputs</h2>
              <Tip text="Fill in pickup, delivery, weight, and dimensions to get instant transporter rates." />
            </div>
            {matchedRoute && (
              <p className="text-xs text-slate-600">
                Matched Lane:{' '}
                <strong className="text-slate-900">
                  {matchedRoute.originCity} ({matchedRoute.originPincode}) →{' '}
                  {matchedRoute.destinationCity} ({matchedRoute.destinationPincode})
                </strong>
                {matchedRoute.distanceKm ? ` · ${matchedRoute.distanceKm} km` : ''}
              </p>
            )}
          </div>

          <div className="space-y-6 p-4 sm:p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <Label tip="Forward: you ship to a customer. Return: customer ships back to you.">
                  Shipment Type
                </Label>
                <RadioGroup
                  value={shipment}
                  onChange={setShipment}
                  options={[
                    { value: 'forward', label: 'Forward' },
                    { value: 'return', label: 'Return' },
                  ]}
                />
              </div>

              <div>
                <Label tip="Prepaid: wallet or advance payment. Cash on delivery: collect payment at delivery.">
                  Payment Type
                </Label>
                <RadioGroup
                  value={payment}
                  onChange={setPayment}
                  options={[
                    { value: 'prepaid', label: 'Prepaid' },
                    { value: 'cod', label: 'Cash on delivery' },
                  ]}
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <Label required tip="6-digit pincode where the parcel is picked up.">
                  Pickup Pincode
                </Label>
                <input
                  inputMode="numeric"
                  list="zipit-origin-pincodes"
                  value={pickup}
                  onChange={(e) => setPickup(digits(e.target.value, 6))}
                  placeholder="411026"
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </label>

              <label className="block">
                <Label required tip="6-digit pincode where the parcel is delivered.">
                  Delivery Pincode
                </Label>
                <input
                  inputMode="numeric"
                  list="zipit-dest-pincodes"
                  value={delivery}
                  onChange={(e) => setDelivery(digits(e.target.value, 6))}
                  placeholder="400013"
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </label>

              <datalist id="zipit-origin-pincodes">
                {Array.from(new Set(routes.map((r) => r.originPincode))).map((pin) => (
                  <option key={pin} value={pin} />
                ))}
              </datalist>
              <datalist id="zipit-dest-pincodes">
                {Array.from(new Set(routes.map((r) => r.destinationPincode))).map((pin) => (
                  <option key={pin} value={pin} />
                ))}
              </datalist>

              <label className="block">
                <Label required tip="Actual weight of the packed parcel in kilograms.">
                  Actual Weight (Kg)
                </Label>
                <input
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))}
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </label>

              <div>
                <Label
                  required
                  tip="Length, width and height of the packed parcel in centimetres."
                >
                  Dimensions (cm)
                </Label>

                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {(
                    [
                      ['l', 'Length (cm)'],
                      ['w', 'Width (cm)'],
                      ['h', 'Height (cm)'],
                    ] as const
                  ).map(([k, name]) => (
                    <label key={k} className="block">
                      <span className="mb-1 block text-[11px] text-slate-500">{name}</span>
                      <input
                        inputMode="decimal"
                        value={dims[k]}
                        onChange={setDim(k)}
                        className={`${inputCls} font-mono tabular-nums`}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 md:col-span-2 pt-1">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Checkbox checked={insured} onChange={toggleInsured}>
                      <ShieldCheck className="h-4 w-4 text-blue-600" />
                      <span>Add insurance cover</span>
                    </Checkbox>
                    <Tip text="Covers loss or damage up to the declared value." />
                  </div>

                  {insured && (
                    <div className="relative mt-2.5">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                        ₹
                      </span>
                      <input
                        autoFocus
                        inputMode="numeric"
                        value={insurance}
                        onChange={onInsuranceChange}
                        placeholder="Enter declared value"
                        aria-label="Insurance cover amount in rupees"
                        className={`${inputCls} pl-7 font-mono tabular-nums`}
                      />
                    </div>
                  )}

                  <p className="mt-2 text-xs text-slate-500">
                    Optional · Max ₹1,00,000. ₹5 up to ₹200; then 1.6% above ₹200 + GST.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <KeyRound className="h-4 w-4 text-blue-600" />
                      <span>OTP delivery</span>
                    </span>
                    <Toggle checked={otp} onChange={setOtp} />
                  </div>

                  <p className="text-xs text-slate-500">
                    Add ₹5 + ₹0.90 GST per parcel for OTP-verified handover at destination.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 border-t border-slate-200 bg-slate-50/50 px-4 py-3.5 sm:px-6">
            <p className="text-xs text-slate-500">
              Fields marked <span className="text-red-500">*</span> are required.
            </p>

            <div className="flex w-full gap-2.5 sm:w-auto">
              <button
                type="button"
                onClick={reset}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>

              <button
                type="submit"
                disabled={!valid || calculating}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 sm:py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Calculator className="h-4 w-4" />
                <span>{calculating ? 'Calculating...' : 'Calculate Rates'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && <ErrorBanner message={error} />}

      {result && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-6 sm:py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Calculated Transporter Quotes ({result.quotes.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {result.route.originCity} ({result.route.originPincode}) →{' '}
                {result.route.destinationCity} ({result.route.destinationPincode}) ·{' '}
                {result.shipment === 'forward' ? 'Forward' : 'Return'} ·{' '}
                {result.payment === 'prepaid' ? 'Prepaid' : 'Cash on Delivery'}
              </p>
            </div>
            {result.route.distanceKm && (
              <span className="text-xs font-mono tabular-nums text-slate-600">
                Distance: {result.route.distanceKm} km
              </span>
            )}
          </div>

          {result.quotes.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                title="No active transporter rates found"
                description="No active carrier rates are configured for this pincode lane yet."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 sm:p-6">
              {result.quotes.map((q) => {
                const insTotal = Number(
                  (result.insuranceFeeExclGst + result.insuranceGst).toFixed(2)
                );
                const returnFee = result.shipment === 'return' ? q.breakdown.rtoCharges : 0;
                const grandTotal = Number(
                  (q.breakdown.finalAmount + insTotal + result.otpFeeTotal + returnFee).toFixed(2)
                );

                return (
                  <div
                    key={q.rateId}
                    className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                            <Truck className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-900 truncate">
                              {q.transporterName}
                            </h4>
                            <p className="text-xs text-slate-500">
                              ETA: {q.estimatedDeliveryTime}
                              {q.isSampleData ? ' · Sample Rate' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="block text-[11px] text-slate-500">Estimated Total</span>
                          <span className="text-lg font-bold font-mono tabular-nums text-blue-600">
                            {formatINR(grandTotal)}
                          </span>
                        </div>
                      </div>

                      <dl className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-y-1.5 text-xs">
                        <dt className="text-slate-500">Actual / Volumetric Wt</dt>
                        <dd className="text-right font-mono tabular-nums text-slate-800">
                          {formatWeight(q.breakdown.actualWeightKg)} /{' '}
                          {formatWeight(q.breakdown.volumetricWeightKg)}
                        </dd>
                        <dt className="text-slate-500">Chargeable Weight</dt>
                        <dd className="text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatWeight(q.breakdown.chargeableWeightKg)}
                        </dd>
                        <dt className="text-slate-500">Rate / kg (Min Freight)</dt>
                        <dd className="text-right font-mono tabular-nums text-slate-800">
                          {formatINR(q.breakdown.ratePerKg)} ({formatINR(q.breakdown.minimumFreight)})
                        </dd>
                        <dt className="text-slate-500">Base Freight</dt>
                        <dd className="text-right font-mono tabular-nums text-slate-900">
                          {formatINR(q.breakdown.baseFreight)}
                        </dd>
                        <dt className="text-slate-500">Additional Charges</dt>
                        <dd className="text-right font-mono tabular-nums text-slate-800">
                          {formatINR(q.breakdown.additionalCharges)}
                        </dd>
                        {q.breakdown.platformChargeApplied &&
                          Number(q.breakdown.platformCharge || 0) > 0 && (
                            <>
                              <dt className="text-slate-500">
                                Platform Charge
                                {q.breakdown.platformChargeType === 'PERCENTAGE'
                                  ? ` (${q.breakdown.platformChargeValue}%)`
                                  : ''}
                              </dt>
                              <dd className="text-right font-mono tabular-nums text-slate-800">
                                {formatINR(q.breakdown.platformCharge || 0)}
                              </dd>
                            </>
                          )}
                        <dt className="text-slate-500">
                          Freight GST ({q.breakdown.gstApplicable ? `${q.breakdown.gstRatePercent}%` : 'Exempt'})
                        </dt>
                        <dd className="text-right font-mono tabular-nums text-slate-800">
                          {formatINR(q.breakdown.taxAmount)}
                        </dd>

                        {result.insuranceDeclared > 0 && (
                          <>
                            <dt className="text-slate-500">
                              Insurance ({formatINR(result.insuranceDeclared)} cover + GST)
                            </dt>
                            <dd className="text-right font-mono tabular-nums text-slate-800">
                              {formatINR(insTotal)}
                            </dd>
                          </>
                        )}

                        {result.otpEnabled && (
                          <>
                            <dt className="text-slate-500">OTP Delivery (₹5 + ₹0.90 GST)</dt>
                            <dd className="text-right font-mono tabular-nums text-slate-800">
                              {formatINR(result.otpFeeTotal)}
                            </dd>
                          </>
                        )}

                        <dt className="text-slate-500">
                          {result.shipment === 'return'
                            ? 'Return / RTO Charge (Included)'
                            : 'RTO Charges (If returned)'}
                        </dt>
                        <dd className="text-right font-mono tabular-nums text-slate-700">
                          {formatINR(q.breakdown.rtoCharges)}
                        </dd>
                      </dl>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          navigate('/seller/create-booking', {
                            state: {
                              routeId: q.routeId || result.route.id,
                              actualWeightKg: weight,
                              lengthCm: dims.l,
                              widthCm: dims.w,
                              heightCm: dims.h,
                              paymentMode: result.payment === 'prepaid' ? 'WALLET' : 'INVOICE',
                            },
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>Create Booking</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
