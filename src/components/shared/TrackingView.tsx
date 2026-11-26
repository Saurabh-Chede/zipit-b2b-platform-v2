import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatDateTime } from '../../utils/formatters.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { TrackingTimeline } from '../ui/TrackingTimeline.tsx';
import { ErrorBanner, LoadingSkeleton } from '../ui/States.tsx';
import {
  BookingStatus,
  type Booking,
  type PaginatedResponse,
  type PartyDetails,
  type TrackingEvent,
} from '../../types/index.ts';

interface TrackingResult {
  bookingId: string;
  bookingRef: string;
  lrNumber: string;
  currentStatus: BookingStatus;
  origin: { city: string; pincode: string };
  destination: { city: string; pincode: string };
  sender?: PartyDetails;
  receiver?: { name: string; city: string; pincode: string };
  transporter?: { companyName: string; contactPerson: string; phone: string };
  bookingDate: string;
  latestUpdate: TrackingEvent | null;
  timeline: TrackingEvent[];
}

const TERMINAL_STATUSES = new Set<BookingStatus>([
  BookingStatus.DELIVERED,
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.RTO_DELIVERED,
]);

const STATUS_SHORT_LABEL: Record<BookingStatus, string> = {
  [BookingStatus.BOOKED]: 'Booked',
  [BookingStatus.ACCEPTED]: 'Accepted',
  [BookingStatus.DISPATCHED]: 'Dispatched',
  [BookingStatus.ARRIVED]: 'At Hub',
  [BookingStatus.OUT_FOR_DELIVERY]: 'Out for Delivery',
  [BookingStatus.DELIVERED]: 'Delivered',
  [BookingStatus.REJECTED]: 'Rejected',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.NDR]: 'NDR',
  [BookingStatus.RTO_INITIATED]: 'RTO Initiated',
  [BookingStatus.RTO_DELIVERED]: 'RTO Delivered',
};

export function TrackingView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLr = searchParams.get('lr')?.trim() || '';

  const [lrInput, setLrInput] = useState(initialLr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackingResult | null>(null);

  const [recentShipments, setRecentShipments] = useState<Booking[]>([]);
  const [showingActiveOnly, setShowingActiveOnly] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const lastFetchedLrRef = useRef<string>('');

  const fetchTracking = useCallback(async (lrNumber: string) => {
    const trimmed = lrNumber.trim().toUpperCase();
    if (!trimmed) return;
    lastFetchedLrRef.current = trimmed;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: TrackingResult }>(
        `/tracking/${encodeURIComponent(trimmed)}`
      );
      setResult(res.data.data);
    } catch (err) {
      setResult(null);
      setError(extractErrorMessage(err, 'Unable to find shipment for this LR number.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingRecent(true);
    apiClient
      .get<{ success: boolean; data: PaginatedResponse<Booking> }>('/bookings', {
        params: { limit: 25 },
      })
      .then((res) => {
        if (!active) return;
        const items = res.data.data?.items || [];
        const activeItems = items.filter((b) => !TERMINAL_STATUSES.has(b.status));
        if (activeItems.length > 0) {
          setRecentShipments(activeItems.slice(0, 6));
          setShowingActiveOnly(true);
        } else {
          setRecentShipments(items.slice(0, 6));
          setShowingActiveOnly(false);
        }
      })
      .catch(() => {
        if (!active) return;
        setRecentShipments([]);
      })
      .finally(() => {
        if (active) setLoadingRecent(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const lrParam = searchParams.get('lr')?.trim().toUpperCase() || '';
    if (lrParam) {
      if (lrParam !== lastFetchedLrRef.current) {
        setLrInput(lrParam);
        void fetchTracking(lrParam);
      }
    } else if (lastFetchedLrRef.current) {
      lastFetchedLrRef.current = '';
      setLrInput('');
      setResult(null);
      setError(null);
    }
  }, [searchParams, fetchTracking]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = lrInput.trim().toUpperCase();
    if (!trimmed) return;
    setLrInput(trimmed);
    setSearchParams({ lr: trimmed }, { replace: true });
    await fetchTracking(trimmed);
  };

  const handleQuickPick = (lrNumber: string) => {
    const clean = lrNumber.trim().toUpperCase();
    setLrInput(clean);
    setSearchParams({ lr: clean }, { replace: true });
    void fetchTracking(clean);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Track Consignment by LR Number</h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter a Lorry Receipt number (for example, ZIPIT-LR-100001) or pick a recent shipment below to view checkpoint updates.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lrInput}
              onChange={(e) => setLrInput(e.target.value)}
              placeholder="Enter LR Number (e.g. ZIPIT-LR-100003)"
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !lrInput.trim()}
            className="w-full sm:w-auto px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loading ? 'Searching...' : 'Track Shipment'}
          </button>
        </form>

        {(loadingRecent || recentShipments.length > 0) && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">
              {showingActiveOnly ? 'Recent active shipments' : 'Recent shipments'}
            </p>
            {loadingRecent ? (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-8 w-44 rounded-lg bg-slate-100 animate-pulse shrink-0"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {recentShipments.map((b) => {
                  const isSelected = result?.lrNumber === b.lrNumber;
                  return (
                    <button
                      key={b._id}
                      type="button"
                      onClick={() => handleQuickPick(b.lrNumber)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <span className="font-mono font-semibold tabular-nums">{b.lrNumber}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-600">
                        {b.origin.city} → {b.destination.city}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className={isSelected ? 'font-medium text-blue-700' : 'text-slate-500'}>
                        {STATUS_SHORT_LABEL[b.status] || b.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {loading && <LoadingSkeleton rows={4} />}
      {error && <ErrorBanner message={error} />}

      {result && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {result.lrNumber}
                </span>
                <StatusBadge status={result.currentStatus} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1.5">
                <span className="font-mono">{result.bookingRef}</span>
                <span aria-hidden="true">·</span>
                <span>Booked {formatDateTime(result.bookingDate)}</span>
              </div>
            </div>

            {result.latestUpdate && (
              <div className="text-left sm:text-right">
                <p className="text-xs font-medium text-slate-500">Latest Update</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">
                  {result.latestUpdate.location}
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {formatDateTime(result.latestUpdate.eventTimestamp)}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-200 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">Origin / Pickup</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {result.origin.city} ({result.origin.pincode})
              </p>
              {result.sender && (
                <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                  <p className="font-medium text-slate-800">
                    {result.sender.companyName || result.sender.name}
                  </p>
                  <p>{result.sender.address}</p>
                  <p>
                    {result.sender.city}
                    {result.sender.state ? `, ${result.sender.state}` : ''} — {result.sender.pincode}
                  </p>
                  <p className="font-mono tabular-nums text-slate-500">
                    {result.sender.contactPerson ? `${result.sender.contactPerson} · ` : ''}
                    {result.sender.phone}
                  </p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Destination</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {result.destination.city} ({result.destination.pincode})
              </p>
              {result.receiver && (
                <p className="mt-1 text-xs text-slate-600">
                  Consignee: <span className="font-medium text-slate-800">{result.receiver.name}</span>
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Assigned Transporter</p>
              <p className="font-medium text-slate-900 mt-0.5">
                {result.transporter?.companyName || '—'}
              </p>
              {result.transporter?.phone && (
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {result.transporter.phone}
                </p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Shipment Timeline</h2>
            <TrackingTimeline events={result.timeline} />
          </div>
        </div>
      )}
    </div>
  );
}
