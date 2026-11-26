import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Barcode,
  CheckCircle2,
  FileDown,
  MapPin,
  Package,
  ScanLine,
  Search,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatWeight } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  BookingStatus,
  type Booking,
  type PaginatedResponse,
  type ScannedCarton,
} from '../../types/index.ts';

interface ScanApiResponse {
  booking: Booking;
  scannedCarton: ScannedCarton;
  alreadyScanned: boolean;
  scannedCount: number;
  totalCartons: number;
}

interface ScanLogItem {
  cartonCode: string;
  lrNumber: string;
  location: string;
  alreadyScanned: boolean;
  scannedCount: number;
  totalCartons: number;
  timestamp: string;
}

function formatCartonCode(lrNumber: string, cartonNumber: number): string {
  return `${lrNumber.toUpperCase()}-C${String(cartonNumber).padStart(2, '0')}`;
}

export function CartonScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const initialLr = searchParams.get('lr') || '';

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [barcodeInput, setBarcodeInput] = useState(initialLr ? `${initialLr}-C01` : '');
  const [checkpointLocation, setCheckpointLocation] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<ScanApiResponse | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanLogItem[]>([]);

  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [filterQuery, setFilterQuery] = useState(initialLr);
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
        '/transporter/bookings',
        { params: { page: 1, limit: 100 } }
      );
      const active = res.data.data.items.filter((b) => b.status !== BookingStatus.REJECTED);
      setBookings(active);

      setSelectedBookingId((prev) => {
        if (prev && active.some((b) => b._id === prev)) return prev;
        if (initialLr) {
          const matched = active.find(
            (b) => b.lrNumber.toUpperCase() === initialLr.trim().toUpperCase()
          );
          if (matched) return matched._id;
        }
        return active[0]?._id || '';
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load assigned shipments for carton scanning.'));
    } finally {
      setLoading(false);
    }
  }, [initialLr]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const filteredBookings = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) =>
      `${b.lrNumber} ${b.bookingId} ${b.origin.city} ${b.destination.city} ${b.receiver.name}`
        .toLowerCase()
        .includes(q)
    );
  }, [bookings, filterQuery]);

  const selectedBooking = useMemo(
    () =>
      bookings.find((b) => b._id === selectedBookingId) ||
      filteredBookings[0] ||
      bookings[0] ||
      null,
    [bookings, filteredBookings, selectedBookingId]
  );

  useEffect(() => {
    if (selectedBooking && !checkpointLocation) {
      setCheckpointLocation(`${selectedBooking.origin.city} (${selectedBooking.origin.pincode})`);
    }
  }, [selectedBooking, checkpointLocation]);

  const applyScanResult = useCallback(
    (payload: ScanApiResponse) => {
      setLastResult(payload);
      setBookings((prev) =>
        prev.map((b) => (b._id === payload.booking._id ? payload.booking : b))
      );
      setSelectedBookingId(payload.booking._id);
      setScanHistory((prev) => [
        {
          cartonCode: payload.scannedCarton.cartonCode,
          lrNumber: payload.booking.lrNumber,
          location: payload.scannedCarton.location || 'Hub Checkpoint',
          alreadyScanned: payload.alreadyScanned,
          scannedCount: payload.scannedCount,
          totalCartons: payload.totalCartons,
          timestamp: new Date().toISOString(),
        },
        ...prev.slice(0, 14),
      ]);

      showToast(
        payload.alreadyScanned
          ? `${payload.scannedCarton.cartonCode} already scanned (${payload.scannedCount}/${payload.totalCartons})`
          : `Scanned ${payload.scannedCarton.cartonCode} (${payload.scannedCount}/${payload.totalCartons})`,
        payload.alreadyScanned ? 'info' : 'success'
      );
    },
    [showToast]
  );

  const handleGlobalScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim().toUpperCase();
    if (!code) {
      showToast('Enter or scan a carton barcode first.', 'error');
      return;
    }

    setScanning(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: ScanApiResponse }>(
        '/transporter/cartons/scan',
        {
          cartonCode: code,
          location: checkpointLocation.trim() || undefined,
        }
      );
      applyScanResult(res.data.data);
      setBarcodeInput('');
      barcodeInputRef.current?.focus();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Unable to verify carton barcode.'), 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleScanSpecificCarton = async (booking: Booking, cartonNumber: number) => {
    const code = formatCartonCode(booking.lrNumber, cartonNumber);
    setScanning(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: ScanApiResponse }>(
        `/bookings/${booking._id}/cartons/scan`,
        {
          cartonNumber,
          location:
            checkpointLocation.trim() || `${booking.origin.city} (${booking.origin.pincode})`,
        }
      );
      applyScanResult(res.data.data);
    } catch (err) {
      showToast(extractErrorMessage(err, `Failed to scan ${code}.`), 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleDownloadCartonLabel = async (booking: Booking, cartonNumber: number) => {
    const code = formatCartonCode(booking.lrNumber, cartonNumber);
    setDownloadingCode(code);
    try {
      const res = await apiClient.get(`/bookings/${booking._id}/cartons/${cartonNumber}/barcode`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${code}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(extractErrorMessage(err, `Failed to download ${code} label.`), 'error');
    } finally {
      setDownloadingCode(null);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error) return <ErrorBanner message={error} onRetry={loadBookings} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Carton Barcode Scanner</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Scan individual multi-box carton barcodes (Code 128 format: <span className="font-mono">LR-NUMBER-C01</span>) at pickup, hub sort, or delivery
          </p>
        </div>
      </div>

      {/* Scanner Input Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <form
          onSubmit={handleGlobalScan}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-blue-600" />
              <span>USB Handheld / Manual Barcode Input</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">Format: ZIPIT-LR-XXXXXX-C01</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-7">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Carton Barcode *
              </label>
              <input
                ref={barcodeInputRef}
                type="text"
                autoFocus
                required
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan or type e.g. ZIPIT-LR-100001-C01"
                className="w-full px-3.5 py-2.5 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Scan Checkpoint Location
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={checkpointLocation}
                  onChange={(e) => setCheckpointLocation(e.target.value)}
                  placeholder="Pune Hub (411026)"
                  className="w-full pl-8 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Press <span className="font-mono font-semibold text-slate-700">Enter</span> after scanning to log immediately.
            </p>
            <button
              type="submit"
              disabled={scanning}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Barcode className="w-4 h-4" />
              <span>{scanning ? 'Verifying...' : 'Verify & Scan Carton'}</span>
            </button>
          </div>

          {lastResult && (
            <div
              className={`rounded-lg border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 ${
                lastResult.alreadyScanned
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 ${
                    lastResult.alreadyScanned ? 'text-slate-500' : 'text-emerald-600'
                  }`}
                />
                <span>
                  <strong className="font-mono">{lastResult.scannedCarton.cartonCode}</strong>{' '}
                  {lastResult.alreadyScanned ? 'already verified earlier' : 'scanned successfully'} ·{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    {lastResult.scannedCount}/{lastResult.totalCartons} boxes
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/transporter/bookings/${lastResult.booking._id}`)}
                className="font-semibold text-blue-600 hover:underline whitespace-nowrap"
              >
                Open LR {lastResult.booking.lrNumber}
              </button>
            </div>
          )}
        </form>

        {/* Session Scan Log */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent Session Scans</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {scanHistory.length} logged
            </span>
          </div>

          {scanHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              Scanned carton confirmations will appear here in real time.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {scanHistory.map((item, idx) => (
                <li
                  key={`${item.cartonCode}-${item.timestamp}-${idx}`}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-slate-900 truncate">
                      {item.cartonCode}
                    </p>
                    <p className="text-slate-500 truncate">
                      {item.location} · {item.alreadyScanned ? 'Duplicate scan' : 'Verified'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-semibold tabular-nums text-slate-800 block">
                      {item.scannedCount}/{item.totalCartons}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400">
                      {new Date(item.timestamp).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Shipment Carton Manifest */}
      {bookings.length === 0 ? (
        <EmptyState
          title="No active assigned shipments"
          description="Carton manifests appear once shipments are assigned to your carrier."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Shipment Selector */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-slate-100 bg-slate-50/70">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter by LR, Booking ID, or city..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[38dvh] lg:max-h-[420px] overflow-y-auto">
              {filteredBookings.map((b) => {
                const isSelected = selectedBooking?._id === b._id;
                const scanned = b.scannedCartons?.length ?? 0;
                const total = b.parcel.numberOfPackages;
                const allDone = scanned >= total && total > 0;

                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => {
                      setSelectedBookingId(b._id);
                      setCheckpointLocation(`${b.origin.city} (${b.origin.pincode})`);
                    }}
                    className={`w-full text-left p-3.5 transition-colors flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                          {b.lrNumber}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <p className="text-xs text-slate-600 mt-1 truncate">
                        {b.origin.city} → {b.destination.city} · {formatWeight(b.chargeableWeight)}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 px-2 py-0.5 rounded border ${
                        allDone
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {scanned}/{total}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Individual Carton Checklist */}
          {selectedBooking && (
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span>
                      Carton Manifest —{' '}
                      <span className="font-mono">{selectedBooking.lrNumber}</span>
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedBooking.parcel.description} · {selectedBooking.origin.city} →{' '}
                    {selectedBooking.destination.city}
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-700">
                  {selectedBooking.scannedCartons?.length ?? 0}/
                  {selectedBooking.parcel.numberOfPackages} cartons scanned
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from(
                  { length: selectedBooking.parcel.numberOfPackages },
                  (_, idx) => idx + 1
                ).map((cartonNumber) => {
                  const code = formatCartonCode(selectedBooking.lrNumber, cartonNumber);
                  const scanRecord = (selectedBooking.scannedCartons || []).find(
                    (c) => c.cartonNumber === cartonNumber
                  );

                  return (
                    <div
                      key={code}
                      className={`rounded-lg border p-3.5 space-y-2.5 ${
                        scanRecord
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-slate-50/50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{code}</span>
                        {scanRecord ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Scanned</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-500">Pending</span>
                        )}
                      </div>

                      {scanRecord ? (
                        <p className="text-[11px] text-slate-600 font-mono tabular-nums">
                          {scanRecord.location || 'Checkpoint'} · {formatDateTime(scanRecord.scannedAt)}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Box {cartonNumber} of {selectedBooking.parcel.numberOfPackages}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-0.5">
                        {!scanRecord && (
                          <button
                            type="button"
                            disabled={scanning}
                            onClick={() => handleScanSpecificCarton(selectedBooking, cartonNumber)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap"
                          >
                            <ScanLine className="w-3.5 h-3.5" />
                            <span>Mark Scanned</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={downloadingCode === code}
                          onClick={() => handleDownloadCartonLabel(selectedBooking, cartonNumber)}
                          className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>{downloadingCode === code ? 'Saving...' : 'Label PNG'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
