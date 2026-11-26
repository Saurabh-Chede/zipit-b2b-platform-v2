import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Search,
  Truck,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../services/api.ts';
import { formatDate, formatDateTime } from '../utils/formatters.ts';
import { BrandMark } from '../components/ui/BrandMark.tsx';
import { StatusBadge } from '../components/ui/StatusBadge.tsx';
import { BookingStatus, type PublicTrackingData } from '../types/index.ts';

const STEP_ORDER: { status: BookingStatus; label: string }[] = [
  { status: BookingStatus.BOOKED, label: 'Booked' },
  { status: BookingStatus.ACCEPTED, label: 'Accepted' },
  { status: BookingStatus.DISPATCHED, label: 'Dispatched' },
  { status: BookingStatus.ARRIVED, label: 'At Hub' },
  { status: BookingStatus.DELIVERED, label: 'Delivered' },
];

const RANK: Record<BookingStatus, number> = {
  [BookingStatus.BOOKED]: 0,
  [BookingStatus.ACCEPTED]: 1,
  [BookingStatus.DISPATCHED]: 2,
  [BookingStatus.ARRIVED]: 3,
  [BookingStatus.OUT_FOR_DELIVERY]: 3,
  [BookingStatus.DELIVERED]: 4,
  [BookingStatus.REJECTED]: -1,
  [BookingStatus.CANCELLED]: -1,
  [BookingStatus.NDR]: 3,
  [BookingStatus.RTO_INITIATED]: 3,
  [BookingStatus.RTO_DELIVERED]: 4,
};

export function PublicTrackingPage() {
  const { lrNumber: routeLr } = useParams<{ lrNumber?: string }>();
  const navigate = useNavigate();

  const [lrInput, setLrInput] = useState(routeLr || '');
  const [data, setData] = useState<PublicTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (lr: string) => {
    const clean = lr.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PublicTrackingData }>(
        `/public/tracking/${encodeURIComponent(clean)}`
      );
      setData(res.data.data);
    } catch (err) {
      setData(null);
      setError(extractErrorMessage(err, 'No shipment found matching that LR number.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (routeLr && routeLr.trim()) {
      setLrInput(routeLr.toUpperCase());
      void lookup(routeLr);
    }
  }, [routeLr, lookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lrInput.trim().toUpperCase();
    if (!clean) return;
    if (routeLr?.toUpperCase() === clean) {
      void lookup(clean);
    } else {
      navigate(`/track/${encodeURIComponent(clean)}`);
    }
  };

  const activeRank = data ? RANK[data.status] : -1;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-3.5 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        <Link to="/track" className="flex items-center shrink-0">
          <BrandMark />
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          <span>Workspace Sign In</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-4 py-6 sm:py-12 space-y-5 sm:space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-sm">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Track Your B2B Consignment
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter your ZIPIT Lorry Receipt (LR) number to check live hub milestones and delivery confirmation.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={lrInput}
                onChange={(e) => setLrInput(e.target.value.toUpperCase())}
                placeholder="e.g. ZIPIT-LR-102401"
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !lrInput.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              <span>{loading ? 'Searching...' : 'Track Shipment'}</span>
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Overview Header Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Lorry Receipt Number</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <h2 className="text-xl font-bold font-mono tabular-nums text-slate-900">
                      {data.lrNumber}
                    </h2>
                    <StatusBadge status={data.status} />
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-1">
                    Ref: {data.bookingId} · Booked {formatDateTime(data.createdAt)}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-500">Assigned Carrier</p>
                  <p className="text-sm font-semibold text-slate-900 flex items-center sm:justify-end gap-1.5 mt-0.5">
                    <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{data.transporterName}</span>
                  </p>
                  {data.estimatedDeliveryTime && (
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center sm:justify-end gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Est. Transit: {data.estimatedDeliveryTime}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>Origin Hub</span>
                  </p>
                  <p className="font-semibold text-slate-900 mt-1">
                    {data.origin.city}
                  </p>
                  <p className="text-xs font-mono text-slate-500">PIN {data.origin.pincode}</p>
                </div>

                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Destination Hub</span>
                  </p>
                  <p className="font-semibold text-slate-900 mt-1">
                    {data.destination.city}
                  </p>
                  <p className="text-xs font-mono text-slate-500">PIN {data.destination.pincode}</p>
                </div>

                <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-slate-600" />
                    <span>Packages</span>
                  </p>
                  <p className="font-semibold font-mono tabular-nums text-slate-900 mt-1">
                    {data.numberOfPackages} {data.numberOfPackages === 1 ? 'Carton' : 'Cartons'}
                  </p>
                  <p className="text-xs text-slate-500">Updated {formatDate(data.updatedAt)}</p>
                </div>
              </div>

              {activeRank >= 0 && (
                <div className="pt-2">
                  {/* Mobile vertical milestone tracker */}
                  <div className="sm:hidden space-y-2.5">
                    {STEP_ORDER.map((step, idx) => {
                      const done = activeRank >= RANK[step.status];
                      const lineDone = activeRank > RANK[step.status];
                      return (
                        <div key={step.status} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                done
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-white border-slate-300 text-slate-400'
                              }`}
                            >
                              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                            </div>
                            {idx < STEP_ORDER.length - 1 && (
                              <span
                                className={`w-0.5 h-4 mt-1 ${
                                  lineDone ? 'bg-blue-600' : 'bg-slate-200'
                                }`}
                              />
                            )}
                          </div>
                          <div className="pt-0.5 flex items-center justify-between flex-1">
                            <span
                              className={`text-xs font-semibold ${
                                done ? 'text-blue-700' : 'text-slate-500'
                              }`}
                            >
                              {step.label}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {done ? 'Completed' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tablet & Desktop 5-step horizontal stepper */}
                  <div className="hidden sm:grid grid-cols-5 gap-2 relative">
                    {STEP_ORDER.map((step, idx) => {
                      const done = activeRank >= RANK[step.status];
                      return (
                        <div key={step.status} className="flex flex-col items-center text-center relative">
                          {idx < STEP_ORDER.length - 1 && (
                            <div
                              className={`absolute left-1/2 top-3.5 h-0.5 w-full ${
                                activeRank > RANK[step.status] ? 'bg-blue-600' : 'bg-slate-200'
                              }`}
                            />
                          )}
                          <div
                            className={`relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                              done
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-300 text-slate-400'
                            }`}
                          >
                            {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                          </div>
                          <span
                            className={`mt-1.5 text-[11px] font-semibold ${
                              done ? 'text-blue-700' : 'text-slate-500'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.deliverySummary && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900">
                  <span className="font-semibold inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Delivered &amp; signed by {data.deliverySummary.receiverName}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatDate(data.deliverySummary.deliveryDate)}
                  </span>
                </div>
              )}
            </div>

            {/* Public Milestone Timeline */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Shipment Milestones</h3>
              {data.timeline.length === 0 ? (
                <p className="text-sm text-slate-500">No milestone events recorded yet.</p>
              ) : (
                <ol className="space-y-4">
                  {data.timeline.map((ev, index) => {
                    const isLatest = index === data.timeline.length - 1;
                    return (
                      <li key={ev._id} className="flex gap-3.5">
                        <div className="flex flex-col items-center">
                          <span
                            className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                              isLatest ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-400'
                            }`}
                          />
                          {index < data.timeline.length - 1 && (
                            <span className="w-px flex-1 bg-slate-200 mt-1" />
                          )}
                        </div>
                        <div className="pb-4 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{ev.description}</p>
                            <span className="text-xs font-mono tabular-nums text-slate-500">
                              {formatDateTime(ev.eventTimestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{ev.location}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
