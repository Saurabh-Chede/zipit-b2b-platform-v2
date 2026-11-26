import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRightCircle, Check, MapPin, PackageCheck, RotateCcw, ScanLine, Truck, XCircle } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatINR, formatWeight } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  BookingStatus,
  NEXT_BOOKING_STATUS,
  type Booking,
  type PaginatedResponse,
  type SellerProfile,
} from '../../types/index.ts';

type QueueTab = 'ALL_ACTIVE' | 'PICKUPS' | 'DELIVERIES';

function defaultCheckpoint(booking: Booking, next: BookingStatus | null): string {
  if (
    next === BookingStatus.ARRIVED ||
    next === BookingStatus.OUT_FOR_DELIVERY ||
    next === BookingStatus.DELIVERED
  ) {
    return `${booking.destination.city} (${booking.destination.pincode})`;
  }
  return `${booking.origin.city} (${booking.origin.pincode})`;
}

export function UpdateShipmentStatusPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<QueueTab>('ALL_ACTIVE');

  const [selectedId, setSelectedId] = useState('');
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const [exceptionTarget, setExceptionTarget] = useState<
    BookingStatus.NDR | BookingStatus.RTO_INITIATED | null
  >(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [submittingException, setSubmittingException] = useState(false);

  const loadOpenBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
        '/transporter/bookings',
        { params: { limit: 100 } }
      );
      const active = res.data.data.items.filter(
        (b) =>
          b.status !== BookingStatus.DELIVERED &&
          b.status !== BookingStatus.REJECTED &&
          b.status !== BookingStatus.CANCELLED &&
          b.status !== BookingStatus.RTO_DELIVERED
      );
      setBookings(active);
      setSelectedId((prev) => {
        if (prev && active.some((b) => b._id === prev)) return prev;
        return active[0]?._id || '';
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load pickup and delivery queue.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOpenBookings();
  }, [loadOpenBookings]);

  const queueCounts = useMemo(() => {
    const pickups = bookings.filter(
      (b) => b.status === BookingStatus.BOOKED || b.status === BookingStatus.ACCEPTED
    ).length;
    const deliveries = bookings.filter(
      (b) =>
        b.status === BookingStatus.DISPATCHED ||
        b.status === BookingStatus.ARRIVED ||
        b.status === BookingStatus.OUT_FOR_DELIVERY ||
        b.status === BookingStatus.NDR ||
        b.status === BookingStatus.RTO_INITIATED
    ).length;
    return {
      ALL_ACTIVE: bookings.length,
      PICKUPS: pickups,
      DELIVERIES: deliveries,
    };
  }, [bookings]);

  const visibleQueue = useMemo(() => {
    if (queueTab === 'PICKUPS') {
      return bookings.filter(
        (b) => b.status === BookingStatus.BOOKED || b.status === BookingStatus.ACCEPTED
      );
    }
    if (queueTab === 'DELIVERIES') {
      return bookings.filter(
        (b) =>
          b.status === BookingStatus.DISPATCHED ||
          b.status === BookingStatus.ARRIVED ||
          b.status === BookingStatus.OUT_FOR_DELIVERY ||
          b.status === BookingStatus.NDR ||
          b.status === BookingStatus.RTO_INITIATED
      );
    }
    return bookings;
  }, [bookings, queueTab]);

  useEffect(() => {
    if (visibleQueue.length > 0 && !visibleQueue.some((b) => b._id === selectedId)) {
      setSelectedId(visibleQueue[0]._id);
    }
  }, [visibleQueue, selectedId]);

  const selectedBooking =
    visibleQueue.find((b) => b._id === selectedId) || visibleQueue[0] || null;
  const isSelectedPersonal = selectedBooking?.bookingSource === 'TRANSPORTER_SELF';
  const nextStatus = selectedBooking
    ? isSelectedPersonal && selectedBooking.status === BookingStatus.BOOKED
      ? BookingStatus.DISPATCHED
      : NEXT_BOOKING_STATUS[selectedBooking.status]
    : null;

  useEffect(() => {
    if (selectedBooking) {
      setLocation(defaultCheckpoint(selectedBooking, nextStatus));
    }
  }, [selectedBooking, nextStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking || !nextStatus) return;
    setSubmitting(true);
    try {
      await apiClient.patch(`/bookings/${selectedBooking._id}/status`, {
        status: nextStatus,
        location,
        remarks: remarks.trim() || undefined,
      });
      showToast(`${selectedBooking.lrNumber} updated to ${nextStatus}.`, 'success');
      setRemarks('');
      await loadOpenBookings();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update status.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking || rejectReason.trim().length < 4) {
      showToast('Enter a valid rejection reason (min 4 characters).', 'error');
      return;
    }
    setRejecting(true);
    try {
      await apiClient.patch(`/bookings/${selectedBooking._id}/status`, {
        status: BookingStatus.REJECTED,
        location: `${selectedBooking.origin.city} (${selectedBooking.origin.pincode})`,
        remarks: rejectReason.trim(),
      });
      showToast(
        selectedBooking.paymentMode === 'WALLET'
          ? `Rejected & refunded ${formatINR(selectedBooking.finalAmount)} to seller wallet.`
          : 'Booking rejected.',
        'info'
      );
      setRejectModalOpen(false);
      setRejectReason('');
      await loadOpenBookings();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to reject booking.'), 'error');
    } finally {
      setRejecting(false);
    }
  };

  const handleExceptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking || !exceptionTarget || exceptionReason.trim().length < 4) {
      showToast('Enter a valid reason (min 4 characters).', 'error');
      return;
    }
    setSubmittingException(true);
    try {
      await apiClient.patch(`/bookings/${selectedBooking._id}/status`, {
        status: exceptionTarget,
        location: `${selectedBooking.destination.city} (${selectedBooking.destination.pincode})`,
        remarks: exceptionReason.trim(),
      });
      showToast(
        exceptionTarget === BookingStatus.NDR
          ? `${selectedBooking.lrNumber} marked as NDR.`
          : `${selectedBooking.lrNumber} RTO initiated.`,
        'info'
      );
      setExceptionTarget(null);
      setExceptionReason('');
      await loadOpenBookings();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to record exception.'), 'error');
    } finally {
      setSubmittingException(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error) return <ErrorBanner message={error} onRetry={loadOpenBookings} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pickup & Delivery Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Coordinate origin pickups (Booked → Dispatched) and destination deliveries (Arrived → Delivered + POD)
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/transporter/scanner')}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <ScanLine className="w-4 h-4 text-blue-600" />
          <span>Carton Barcode Scanner</span>
        </button>
      </div>

      {/* Queue Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {(
          [
            { id: 'ALL_ACTIVE', label: `All Active (${queueCounts.ALL_ACTIVE})` },
            { id: 'PICKUPS', label: `Origin Pickups (${queueCounts.PICKUPS})` },
            { id: 'DELIVERIES', label: `Destination Deliveries (${queueCounts.DELIVERIES})` },
          ] as const
        ).map((tab) => {
          const active = queueTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setQueueTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition whitespace-nowrap shrink-0 ${
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

      {visibleQueue.length === 0 ? (
        <EmptyState
          title="No shipments in this queue"
          description="All active consignments in the selected pickup/delivery queue have been completed."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Queue List */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Active Consignments Queue</h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {visibleQueue.length} shipments
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[42dvh] lg:max-h-[640px] overflow-y-auto">
              {visibleQueue.map((b) => {
                const isSelected = selectedBooking?._id === b._id;
                const sellerName = (b.sellerId as SellerProfile)?.businessName || b.sender.name;
                const isPickupStage =
                  b.status === BookingStatus.BOOKED || b.status === BookingStatus.ACCEPTED;

                return (
                  <div
                    key={b._id}
                    onClick={() => setSelectedId(b._id)}
                    className={`p-4 cursor-pointer transition-colors flex flex-wrap items-center justify-between gap-3 ${
                      isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                          {b.lrNumber}
                        </span>
                        <StatusBadge status={b.status} />
                        <span className="text-[11px] font-medium text-slate-500">
                          {isPickupStage ? 'Pickup Queue' : 'Delivery Queue'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 truncate">
                        {isPickupStage
                          ? `Pickup: ${sellerName} · ${b.sender.address}, ${b.sender.city}`
                          : `Drop: ${b.receiver.name} · ${b.receiver.address}, ${b.receiver.city}`}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {b.origin.city} ({b.origin.pincode}) → {b.destination.city} ({b.destination.pincode}) ·{' '}
                        {b.scannedCartons?.length ?? 0}/{b.parcel.numberOfPackages} cartons ·{' '}
                        {formatWeight(b.chargeableWeight)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(b._id);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Manage'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Checkpoint Action Form */}
          {selectedBooking && (
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-5">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <p className="text-xs font-medium text-slate-500">Selected Consignment</p>
                  <h2 className="text-base font-bold font-mono text-slate-900 tabular-nums mt-0.5">
                    {selectedBooking.lrNumber}
                  </h2>
                </div>
                <StatusBadge status={selectedBooking.status} />
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <Truck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800">
                      Pickup: {selectedBooking.sender.name} ({selectedBooking.sender.phone})
                    </p>
                    <p className="text-slate-600">
                      {selectedBooking.sender.address}, {selectedBooking.sender.city} —{' '}
                      {selectedBooking.sender.pincode}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 pt-2 border-t border-slate-200">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800">
                      Delivery: {selectedBooking.receiver.name} ({selectedBooking.receiver.phone})
                    </p>
                    <p className="text-slate-600">
                      {selectedBooking.receiver.address}, {selectedBooking.receiver.city} —{' '}
                      {selectedBooking.receiver.pincode}
                    </p>
                  </div>
                </div>
              </div>

              {nextStatus && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs sm:text-sm font-semibold text-blue-900 flex items-center justify-between">
                    <span>Transition</span>
                    <span>
                      {selectedBooking.status} → {nextStatus}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Checkpoint Location *
                    </label>
                    <input
                      type="text"
                      required
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Operational Remarks (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Vehicle number, driver phone, seal ID, or gate arrival note"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap"
                    >
                      {nextStatus === BookingStatus.ACCEPTED ? (
                        <Check className="w-4 h-4" />
                      ) : nextStatus === BookingStatus.DELIVERED ? (
                        <PackageCheck className="w-4 h-4" />
                      ) : (
                        <ArrowRightCircle className="w-4 h-4" />
                      )}
                      <span>
                        {submitting
                          ? 'Updating...'
                          : nextStatus === BookingStatus.RTO_DELIVERED
                            ? 'Mark RTO Delivered'
                            : selectedBooking.status === BookingStatus.NDR
                              ? 'Retry & Mark Delivered'
                              : `Mark ${nextStatus}`}
                      </span>
                    </button>

                    {!isSelectedPersonal && selectedBooking.status === BookingStatus.BOOKED && (
                      <button
                        type="button"
                        onClick={() => {
                          setRejectReason('');
                          setRejectModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    )}

                    {selectedBooking.status === BookingStatus.ARRIVED && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={async () => {
                          setSubmitting(true);
                          try {
                            await apiClient.patch(`/bookings/${selectedBooking._id}/status`, {
                              status: BookingStatus.OUT_FOR_DELIVERY,
                              location:
                                location.trim() ||
                                `${selectedBooking.destination.city} (${selectedBooking.destination.pincode})`,
                              remarks: remarks.trim() || undefined,
                            });
                            showToast(
                              `${selectedBooking.lrNumber} marked Out for Delivery.`,
                              'success'
                            );
                            setRemarks('');
                            await loadOpenBookings();
                          } catch (err) {
                            showToast(extractErrorMessage(err, 'Failed to update status.'), 'error');
                          } finally {
                            setSubmitting(false);
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Out for Delivery</span>
                      </button>
                    )}

                    {(selectedBooking.status === BookingStatus.ARRIVED ||
                      selectedBooking.status === BookingStatus.OUT_FOR_DELIVERY) && (
                      <button
                        type="button"
                        onClick={() => {
                          setExceptionReason('');
                          setExceptionTarget(BookingStatus.NDR);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-orange-800 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 whitespace-nowrap shrink-0"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Report NDR</span>
                      </button>
                    )}

                    {(selectedBooking.status === BookingStatus.ARRIVED ||
                      selectedBooking.status === BookingStatus.OUT_FOR_DELIVERY ||
                      selectedBooking.status === BookingStatus.NDR) && (
                      <button
                        type="button"
                        onClick={() => {
                          setExceptionReason('');
                          setExceptionTarget(BookingStatus.RTO_INITIATED);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-purple-800 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Initiate RTO</span>
                      </button>
                    )}
                  </div>
                </form>
              )}

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/transporter/scanner?lr=${encodeURIComponent(selectedBooking.lrNumber)}`)
                  }
                  className="font-medium text-blue-600 hover:underline"
                >
                  Scan Cartons ({selectedBooking.scannedCartons?.length ?? 0}/
                  {selectedBooking.parcel.numberOfPackages})
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/transporter/bookings/${selectedBooking._id}`)}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Open Full Details & POD →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={rejectModalOpen}
        onClose={() => !rejecting && setRejectModalOpen(false)}
        title="Reject Booking"
        subtitle={selectedBooking ? `LR ${selectedBooking.lrNumber}` : undefined}
      >
        <form onSubmit={handleReject} className="space-y-4">
          {selectedBooking?.paymentMode === 'WALLET' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              Prepaid Wallet amount ({formatINR(selectedBooking.finalAmount)}) will be refunded automatically.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rejection Reason *</label>
            <textarea
              rows={3}
              required
              minLength={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this pickup cannot be fulfilled"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setRejectModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={rejecting}
              className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {rejecting ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(exceptionTarget)}
        onClose={() => !submittingException && setExceptionTarget(null)}
        title={
          exceptionTarget === BookingStatus.NDR
            ? 'Report Non-Delivery (NDR)'
            : 'Initiate Return to Origin (RTO)'
        }
        subtitle={selectedBooking ? `LR ${selectedBooking.lrNumber}` : undefined}
      >
        <form onSubmit={handleExceptionSubmit} className="space-y-4">
          {exceptionTarget === BookingStatus.RTO_INITIATED &&
            selectedBooking &&
            selectedBooking.rtoCharges > 0 && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 px-3.5 py-2.5 text-xs text-purple-950">
                RTO charge ({formatINR(selectedBooking.rtoCharges)}) will be applied to seller&apos;s{' '}
                {selectedBooking.paymentMode === 'WALLET' ? 'wallet / invoice.' : 'invoice account.'}
              </div>
            )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {exceptionTarget === BookingStatus.NDR ? 'NDR Failure Reason *' : 'RTO Reason *'}
            </label>
            <textarea
              rows={3}
              required
              minLength={4}
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              placeholder={
                exceptionTarget === BookingStatus.NDR
                  ? 'e.g., Consignee premise closed / contact unreachable'
                  : 'e.g., Consignee refused delivery; returning consignment to origin'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setExceptionTarget(null)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingException}
              className={`w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${
                exceptionTarget === BookingStatus.NDR
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {submittingException
                ? 'Saving...'
                : exceptionTarget === BookingStatus.NDR
                  ? 'Submit NDR'
                  : 'Confirm RTO'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
