import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Ban, RotateCcw, Truck } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatINR } from '../../utils/formatters.ts';
import { Modal } from '../../components/ui/Modal.tsx';
import {
  ShipmentDetailView,
  type ShipmentDetailsPayload,
} from '../../components/shared/ShipmentDetailView.tsx';
import { BookingStatus } from '../../types/index.ts';

function SellerActionControls({
  data,
  reload,
}: {
  data: ShipmentDetailsPayload;
  reload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const { refreshUser } = useAuth();
  const { booking } = data;

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [ndrModalOpen, setNdrModalOpen] = useState(false);
  const [ndrAction, setNdrAction] = useState<'REATTEMPT' | 'INITIATE_RTO'>('REATTEMPT');
  const [ndrRemarks, setNdrRemarks] = useState('');
  const [submittingNdr, setSubmittingNdr] = useState(false);

  const canSelfCancel =
    booking.status === BookingStatus.BOOKED || booking.status === BookingStatus.ACCEPTED;
  const canResolveNdr = booking.status === BookingStatus.NDR;

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cancelReason.trim().length < 4) {
      showToast('Please enter a cancellation reason (at least 4 characters).', 'error');
      return;
    }

    setCancelling(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: { refundedAmount?: number };
      }>(`/bookings/${booking._id}/cancel`, {
        reason: cancelReason.trim(),
      });
      showToast(res.data.message || 'Booking cancelled.', 'info');
      setCancelModalOpen(false);
      setCancelReason('');
      await Promise.all([reload(), refreshUser()]);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to cancel booking.'), 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleNdrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ndrRemarks.trim().length < 4) {
      showToast('Please provide clear instructions or reason (at least 4 characters).', 'error');
      return;
    }

    setSubmittingNdr(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
      }>(`/bookings/${booking._id}/ndr-action`, {
        action: ndrAction,
        remarks: ndrRemarks.trim(),
      });
      showToast(res.data.message || 'NDR action submitted.', 'success');
      setNdrModalOpen(false);
      setNdrRemarks('');
      await Promise.all([reload(), refreshUser()]);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to submit NDR instruction.'), 'error');
    } finally {
      setSubmittingNdr(false);
    }
  };

  return (
    <>
      {canSelfCancel && (
        <button
          type="button"
          onClick={() => {
            setCancelReason('');
            setCancelModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-2 py-1  text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
        >
          <Ban className="w-3 h-3" />
          <span>Cancel Booking</span>
        </button>
      )}

      {canResolveNdr && (
        <button
          type="button"
          onClick={() => {
            setNdrAction('REATTEMPT');
            setNdrRemarks('');
            setNdrModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Submit NDR Action</span>
        </button>
      )}

      <Modal
        open={cancelModalOpen}
        onClose={() => !cancelling && setCancelModalOpen(false)}
        title="Cancel Shipment Booking"
        subtitle={`LR ${booking.lrNumber} · ${booking.origin.city} → ${booking.destination.city}`}
      >
        <form onSubmit={handleCancelSubmit} className="space-y-4">
          {booking.paymentMode === 'WALLET' ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
              Full prepaid freight of <strong>{formatINR(booking.finalAmount)}</strong> will be
              refunded immediately to your Zipit Wallet upon cancellation.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
              Self-cancellation is allowed only prior to dispatch. The assigned transporter will be
              notified immediately.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cancellation Reason *
            </label>
            <textarea
              rows={3}
              required
              minLength={4}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g., Buyer postponed order / incorrect carton weight entered"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={cancelling}
              onClick={() => setCancelModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Keep Booking
            </button>
            <button
              type="submit"
              disabled={cancelling}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={ndrModalOpen}
        onClose={() => !submittingNdr && setNdrModalOpen(false)}
        title="Resolve Non-Delivery Report (NDR)"
        subtitle={`LR ${booking.lrNumber} · Attempt #${booking.ndrAttempts || 1}`}
      >
        <form onSubmit={handleNdrSubmit} className="space-y-4">
          {booking.ndrReason && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-xs text-orange-950">
              <strong>Carrier NDR Remark:</strong> {booking.ndrReason}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setNdrAction('REATTEMPT')}
              className={`p-3 rounded-xl border text-left transition ${
                ndrAction === 'REATTEMPT'
                  ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>Request Re-Attempt</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Share updated consignee availability or gate pass instructions.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setNdrAction('INITIATE_RTO')}
              className={`p-3 rounded-xl border text-left transition ${
                ndrAction === 'INITIATE_RTO'
                  ? 'border-purple-600 bg-purple-50/70 ring-1 ring-purple-600'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <RotateCcw className="w-4 h-4 text-purple-600" />
                <span>Initiate RTO Return</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Return shipment to origin ({formatINR(booking.rtoCharges)} RTO fee).
              </p>
            </button>
          </div>

          {ndrAction === 'INITIATE_RTO' && booking.rtoCharges > 0 && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-3.5 py-2.5 text-xs text-purple-950">
              RTO return charge of <strong>{formatINR(booking.rtoCharges)}</strong> will be{' '}
              {booking.paymentMode === 'WALLET'
                ? 'debited from your wallet (or billed to invoice if balance is low).'
                : 'added to your invoice billing.'}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {ndrAction === 'REATTEMPT' ? 'Re-Attempt Instructions *' : 'RTO Authorization Reason *'}
            </label>
            <textarea
              rows={3}
              required
              minLength={4}
              value={ndrRemarks}
              onChange={(e) => setNdrRemarks(e.target.value)}
              placeholder={
                ndrAction === 'REATTEMPT'
                  ? 'e.g., Consignee warehouse open 9 AM–6 PM; contact Mr. Joshi on 9820011223'
                  : 'e.g., Buyer refused delivery; return consignment to Pune plant'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={submittingNdr}
              onClick={() => setNdrModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingNdr}
              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${
                ndrAction === 'INITIATE_RTO'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {submittingNdr
                ? 'Submitting...'
                : ndrAction === 'INITIATE_RTO'
                  ? 'Confirm RTO Return'
                  : 'Send Re-Attempt Instructions'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function SellerShipmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <ShipmentDetailView
      bookingId={id}
      backPath="/seller/shipments"
      renderActions={(data, reload) => <SellerActionControls data={data} reload={reload} />}
    />
  );
}
