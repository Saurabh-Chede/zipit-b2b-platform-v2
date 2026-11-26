import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  FileDown,
  MapPin,
  Search,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatINR, formatWeight } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  BookingStatus,
  type Booking,
  type PaginatedResponse,
  type Transporter,
} from '../../types/index.ts';

type StatusTab = 'ALL' | 'NEW' | 'IN_TRANSIT' | 'ARRIVED' | 'NDR_RTO' | 'DELIVERED' | 'CLOSED';
type DateRangeFilter = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

function formatShortBookingTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function MyShipmentsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [routeFilter, setRouteFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('ALL');
  const [search, setSearch] = useState('');

  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [downloadingLrId, setDownloadingLrId] = useState<string | null>(null);
  const [downloadingBulkLr, setDownloadingBulkLr] = useState(false);

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
        '/bookings',
        { params: { page: 1, limit: 100 } }
      );
      setBookings(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load bookings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  const routeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookings) {
      const label = `${b.origin.city} → ${b.destination.city}`;
      map.set(label, label);
    }
    return Array.from(map.values());
  }, [bookings]);

  const dateAndRouteFiltered = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const q = search.trim().toLowerCase();

    return bookings.filter((b) => {
      const laneLabel = `${b.origin.city} → ${b.destination.city}`;
      if (routeFilter !== 'ALL' && laneLabel !== routeFilter) return false;

      const createdMs = new Date(b.createdAt).getTime();
      if (dateFilter === 'TODAY' && createdMs < startOfToday) return false;
      if (dateFilter === 'LAST_7_DAYS' && createdMs < sevenDaysAgo) return false;
      if (dateFilter === 'LAST_30_DAYS' && createdMs < thirtyDaysAgo) return false;

      if (q) {
        const transporterName = ((b.transporterId as Transporter)?.companyName || '').toLowerCase();
        const hay = `${b.bookingId} ${b.lrNumber} ${laneLabel} ${b.sender.name} ${b.receiver.name} ${transporterName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [bookings, routeFilter, dateFilter, search]);

  const tabCounts = useMemo(() => {
    let booked = 0;
    let inTransit = 0;
    let arrived = 0;
    let ndrRto = 0;
    let delivered = 0;
    let closed = 0;

    for (const b of dateAndRouteFiltered) {
      if (b.status === BookingStatus.BOOKED) booked += 1;
      else if (b.status === BookingStatus.ACCEPTED || b.status === BookingStatus.DISPATCHED) {
        inTransit += 1;
      } else if (
        b.status === BookingStatus.ARRIVED ||
        b.status === BookingStatus.OUT_FOR_DELIVERY
      ) {
        arrived += 1;
      } else if (
        b.status === BookingStatus.NDR ||
        b.status === BookingStatus.RTO_INITIATED ||
        b.status === BookingStatus.RTO_DELIVERED
      ) {
        ndrRto += 1;
      } else if (b.status === BookingStatus.DELIVERED) delivered += 1;
      else if (b.status === BookingStatus.REJECTED || b.status === BookingStatus.CANCELLED) {
        closed += 1;
      }
    }

    return {
      ALL: dateAndRouteFiltered.length,
      NEW: booked,
      IN_TRANSIT: inTransit,
      ARRIVED: arrived,
      NDR_RTO: ndrRto,
      DELIVERED: delivered,
      CLOSED: closed,
    };
  }, [dateAndRouteFiltered]);

  const visibleBookings = useMemo(() => {
    return dateAndRouteFiltered.filter((b) => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'NEW') return b.status === BookingStatus.BOOKED;
      if (activeTab === 'IN_TRANSIT') {
        return b.status === BookingStatus.ACCEPTED || b.status === BookingStatus.DISPATCHED;
      }
      if (activeTab === 'ARRIVED') {
        return (
          b.status === BookingStatus.ARRIVED ||
          b.status === BookingStatus.OUT_FOR_DELIVERY
        );
      }
      if (activeTab === 'NDR_RTO') {
        return (
          b.status === BookingStatus.NDR ||
          b.status === BookingStatus.RTO_INITIATED ||
          b.status === BookingStatus.RTO_DELIVERED
        );
      }
      if (activeTab === 'CLOSED') {
        return b.status === BookingStatus.REJECTED || b.status === BookingStatus.CANCELLED;
      }
      return b.status === BookingStatus.DELIVERED;
    });
  }, [dateAndRouteFiltered, activeTab]);

  const triggerBlobDownload = async (endpoint: string, filename: string, mime: string) => {
    const res = await apiClient.get(endpoint, { responseType: 'blob' });
    const blob = new Blob([res.data as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadLr = async (booking: Booking) => {
    setDownloadingLrId(booking._id);
    try {
      await triggerBlobDownload(
        `/bookings/${booking._id}/lr`,
        `${booking.lrNumber}.pdf`,
        'application/pdf'
      );
      showToast(`Downloaded ${booking.lrNumber}.pdf`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download LR PDF.'), 'error');
    } finally {
      setDownloadingLrId(null);
    }
  };

  const toggleBulkRow = (bookingId: string) => {
    setBulkSelectedIds((prev) =>
      prev.includes(bookingId) ? prev.filter((id) => id !== bookingId) : [...prev, bookingId]
    );
  };

  const allVisibleChecked =
    visibleBookings.length > 0 && visibleBookings.every((b) => bulkSelectedIds.includes(b._id));

  const toggleAllVisible = () => {
    if (allVisibleChecked) {
      const visibleSet = new Set(visibleBookings.map((b) => b._id));
      setBulkSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = new Set([...bulkSelectedIds, ...visibleBookings.map((b) => b._id)]);
      setBulkSelectedIds(Array.from(merged));
    }
  };

  const handleDownloadBulkLr = async () => {
    if (bulkSelectedIds.length === 0) return;
    setDownloadingBulkLr(true);
    try {
      const res = await apiClient.post(
        '/bookings/bulk-lr',
        { bookingIds: bulkSelectedIds },
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ZIPIT-LR-BUNDLE-${bulkSelectedIds.length}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded combined PDF for ${bulkSelectedIds.length} LRs.`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download selected LR bundle.'), 'error');
    } finally {
      setDownloadingBulkLr(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Top Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">My Bookings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect shipment status, download LR receipts &amp; barcodes, and view proof of delivery
          </p>
        </div>

        <div className="w-full lg:w-auto flex flex-wrap items-center gap-2.5">
          {bulkSelectedIds.length > 0 && (
            <button
              type="button"
              disabled={downloadingBulkLr}
              onClick={handleDownloadBulkLr}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition disabled:opacity-50 whitespace-nowrap"
            >
              <FileDown className="w-4 h-4" />
              <span>
                {downloadingBulkLr
                  ? 'Bundling...'
                  : `Download Selected LRs (${bulkSelectedIds.length})`}
              </span>
            </button>
          )}
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Booking ID, LR, receiver..."
              className="pl-8 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none w-full"
            />
          </div>

          <label className="relative inline-flex items-center flex-1 sm:flex-initial min-w-[140px]">
            <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full sm:w-auto pl-8 pr-7 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:border-blue-500 focus:outline-none"
              aria-label="Filter by route"
            >
              <option value="ALL">All Routes</option>
              {routeOptions.map((lane) => (
                <option key={lane} value={lane}>
                  {lane}
                </option>
              ))}
            </select>
          </label>

          <label className="relative inline-flex items-center flex-1 sm:flex-initial min-w-[130px]">
            <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateRangeFilter)}
              className="w-full sm:w-auto pl-8 pr-7 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:border-blue-500 focus:outline-none"
              aria-label="Filter by date"
            >
              <option value="ALL">All Dates</option>
              <option value="TODAY">Today</option>
              <option value="LAST_7_DAYS">Last 7 Days</option>
              <option value="LAST_30_DAYS">Last 30 Days</option>
            </select>
          </label>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {(
          [
            { id: 'ALL', label: `All (${tabCounts.ALL})` },
            { id: 'NEW', label: `New (${tabCounts.NEW})` },
            { id: 'IN_TRANSIT', label: `In Transit (${tabCounts.IN_TRANSIT})` },
            { id: 'ARRIVED', label: `Arrived (${tabCounts.ARRIVED})` },
            { id: 'NDR_RTO', label: `NDR / RTO (${tabCounts.NDR_RTO})` },
            { id: 'DELIVERED', label: `Delivered (${tabCounts.DELIVERED})` },
            { id: 'CLOSED', label: `Cancelled / Rejected (${tabCounts.CLOSED})` },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition whitespace-nowrap ${
                active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Bookings Table */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadShipments} />
      ) : visibleBookings.length === 0 ? (
        <EmptyState
          title="No matching bookings"
          description="No bookings match your current status tab, route, or search filter."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Mobile / Tablet Card View */}
          <div className="md:hidden">
            <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 text-xs text-slate-600">
              <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  onChange={toggleAllVisible}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Select all visible ({visibleBookings.length})</span>
              </label>
              {bulkSelectedIds.length > 0 && (
                <span className="font-mono font-semibold text-blue-700 tabular-nums">
                  {bulkSelectedIds.length} selected
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
              {visibleBookings.map((b) => {
                const isChecked = bulkSelectedIds.includes(b._id);
                const transporterName = (b.transporterId as Transporter)?.companyName || '—';

                return (
                  <div
                    key={b._id}
                    onClick={() => navigate(`/seller/shipments/${b._id}`)}
                    className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-slate-300 transition-colors cursor-pointer space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleBulkRow(b._id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select booking ${b.bookingId} for batch LR PDF`}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-mono font-semibold text-sm text-blue-600 tabular-nums truncate">
                              {b.bookingId}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 tabular-nums truncate">
                              {b.lrNumber}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>

                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-slate-800">
                          {b.origin.city} → {b.destination.city}
                        </p>
                        <p className="text-slate-600 truncate">
                          Carrier: <span className="font-medium text-slate-800">{transporterName}</span>
                        </p>
                        <p className="text-slate-600 truncate">
                          To: <span className="font-medium text-slate-800">{b.receiver.name}</span> ({b.receiver.city})
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums pt-2 border-t border-slate-100 text-slate-700">
                        <span>
                          {b.parcel.numberOfPackages} {b.parcel.numberOfPackages === 1 ? 'Box' : 'Boxes'} · {formatWeight(b.chargeableWeight)}
                        </span>
                        <span className="font-semibold text-slate-900">{formatINR(b.finalAmount)}</span>
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {formatShortBookingTime(b.createdAt)}
                      </span>
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={downloadingLrId === b._id}
                          onClick={() => handleDownloadLr(b)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>{downloadingLrId === b._id ? 'PDF...' : 'LR PDF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/seller/shipments/${b._id}`)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={toggleAllVisible}
                      aria-label="Select all visible shipments for batch LR download"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="py-3 px-3">Booking ID</th>
                  <th className="py-3 px-3">Route</th>
                  <th className="py-3 px-3 hidden xl:table-cell">Transporter</th>
                  <th className="py-3 px-3">Receiver</th>
                  <th className="py-3 px-3 hidden xl:table-cell">Packages</th>
                  <th className="py-3 px-3 hidden lg:table-cell">Weight</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 hidden xl:table-cell">Booking Time</th>
                  <th className="py-3 pl-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibleBookings.map((b) => {
                  const isChecked = bulkSelectedIds.includes(b._id);
                  const transporterName = (b.transporterId as Transporter)?.companyName || '—';

                  return (
                    <tr
                      key={b._id}
                      onClick={() => navigate(`/seller/shipments/${b._id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleBulkRow(b._id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select booking ${b.bookingId} for batch LR PDF`}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/seller/shipments/${b._id}`);
                          }}
                          className="font-mono font-semibold text-blue-600 hover:underline tabular-nums block text-left"
                        >
                          {b.bookingId}
                        </button>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {b.lrNumber}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
                        {b.origin.city} → {b.destination.city}
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell">
                        <p className="font-medium text-slate-800 leading-tight truncate max-w-[180px]">
                          {transporterName}
                        </p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-800 leading-tight">
                          {b.receiver.name}
                        </p>
                        <p className="text-xs text-slate-500">{b.receiver.city}</p>
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {b.parcel.numberOfPackages}{' '}
                        {b.parcel.numberOfPackages === 1 ? 'Box' : 'Boxes'}
                      </td>
                      <td className="py-3 px-3 hidden lg:table-cell font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatWeight(b.chargeableWeight)}
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatINR(b.finalAmount)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {formatShortBookingTime(b.createdAt)}
                      </td>
                      <td
                        className="py-3 pl-3 pr-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={downloadingLrId === b._id}
                            onClick={() => handleDownloadLr(b)}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            <span>{downloadingLrId === b._id ? 'PDF...' : 'LR PDF'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/seller/shipments/${b._id}`)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
