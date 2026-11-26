import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileImage, Scale, ShieldAlert } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
import {
  UserRole,
  WeightDiscrepancyStatus,
  type Booking,
  type WeightDiscrepancy,
} from '../../types/index.ts';

function ScaleProofImage({ bookingId, lrNumber }: { bookingId: string; lrNumber: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    apiClient
      .get(`/bookings/${bookingId}/weight-discrepancy/image`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objUrl = URL.createObjectURL(res.data as Blob);
        setUrl(objUrl);
      })
      .catch(() => {
        if (active) setErr(true);
      });

    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [bookingId]);

  if (err) {
    return (
      <div className="flex items-center justify-center h-36 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 gap-2">
        <FileImage className="w-4 h-4" />
        <span>Scale proof image unavailable</span>
      </div>
    );
  }
  if (!url) return <div className="h-36 bg-slate-100 rounded-lg animate-pulse" />;

  return (
    <img
      src={url}
      alt={`Weighing scale proof for ${lrNumber}`}
      referrerPolicy="no-referrer"
      className="max-h-56 w-auto rounded-lg border border-slate-200 object-contain bg-slate-50"
    />
  );
}

export function WeightDiscrepancyCard({
  booking,
  discrepancy,
  onUpdated,
}: {
  booking: Booking;
  discrepancy: WeightDiscrepancy | null;
  onUpdated: () => Promise<void>;
}) {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [disputeReason, setDisputeReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!discrepancy) return null;

  const isSeller = user?.role === UserRole.SELLER;
  const isAdmin = user?.role === UserRole.ADMIN;

  const statusMeta: Record<
    WeightDiscrepancyStatus,
    { label: string; badgeCls: string }
  > = {
    [WeightDiscrepancyStatus.OPEN]: {
      label: 'Action Required (Open)',
      badgeCls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    [WeightDiscrepancyStatus.ACCEPTED]: {
      label: 'Accepted by Seller',
      badgeCls: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    [WeightDiscrepancyStatus.DISPUTED]: {
      label: 'Disputed · Under Admin Review',
      badgeCls: 'bg-red-50 text-red-800 border-red-200',
    },
    [WeightDiscrepancyStatus.RESOLVED_CHARGED]: {
      label: 'Resolved · Carrier Weight Approved',
      badgeCls: 'bg-slate-100 text-slate-800 border-slate-300',
    },
    [WeightDiscrepancyStatus.RESOLVED_WAIVED]: {
      label: 'Resolved · Waived in Favor of Seller',
      badgeCls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
  };

  const handleSellerResponse = async (action: 'ACCEPT' | 'DISPUTE') => {
    if (action === 'DISPUTE' && disputeReason.trim().length < 4) {
      showToast('Please explain why you are disputing the weight (min 4 characters).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        `/bookings/${booking._id}/weight-discrepancy/respond`,
        {
          action,
          reason: action === 'DISPUTE' ? disputeReason.trim() : undefined,
        }
      );
      showToast(res.data.message, action === 'ACCEPT' ? 'success' : 'info');
      await Promise.all([onUpdated(), refreshUser()]);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to submit weight discrepancy response.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminResolve = async (decision: 'CHARGE_SELLER' | 'WAIVE') => {
    if (adminNotes.trim().length < 4) {
      showToast('Enter resolution notes (min 4 characters).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        `/bookings/${booking._id}/weight-discrepancy/resolve`,
        {
          decision,
          notes: adminNotes.trim(),
        }
      );
      showToast(res.data.message, 'success');
      await onUpdated();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to resolve weight discrepancy.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const meta = statusMeta[discrepancy.status];
  const weightDifferenceKg = Math.max(
    0,
    Number((discrepancy.reportedChargeableWeightKg - discrepancy.declaredChargeableWeightKg).toFixed(2))
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <Scale className="w-4 h-4 text-amber-600 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Weight Discrepancy &amp; Re-Weigh Verification ({discrepancy.discrepancyId})
            </h2>
            <p className="text-xs text-slate-500">
              Reported on {formatDateTime(discrepancy.createdAt)}
            </p>
          </div>
        </div>
        <span className={`px-2.5 py-1 text-xs font-semibold border rounded-md ${meta.badgeCls}`}>
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/70">
          <p className="text-xs text-slate-500">Declared Chargeable</p>
          <p className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
            {formatWeight(discrepancy.declaredChargeableWeightKg)}
          </p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200/70">
          <p className="text-xs text-amber-800">Scale Verified Wt</p>
          <p className="font-mono font-semibold text-amber-900 mt-0.5 tabular-nums">
            {formatWeight(discrepancy.reportedChargeableWeightKg)}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/70">
          <p className="text-xs text-slate-500">Weight Excess</p>
          <p className="font-mono font-semibold text-red-700 mt-0.5 tabular-nums">
            +{formatWeight(weightDifferenceKg)}
          </p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200/70">
          <p className="text-xs text-blue-800">Differential Freight</p>
          <p className="font-mono font-bold text-blue-900 mt-0.5 tabular-nums">
            {formatINR(discrepancy.additionalDifferenceAmount)}
          </p>
          <p className="text-[11px] text-blue-700 mt-0.5">
            {discrepancy.paymentBilledStatus === 'NONE'
              ? 'UNBILLED'
              : discrepancy.paymentBilledStatus.replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      {discrepancy.transporterRemarks && (
        <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
          <strong>Carrier Note:</strong> {discrepancy.transporterRemarks}
        </p>
      )}

      {discrepancy.sellerDisputeReason && (
        <p className="text-xs text-red-900 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>
            <strong>Seller Dispute Reason:</strong> {discrepancy.sellerDisputeReason}
          </span>
        </p>
      )}

      {discrepancy.adminResolutionNotes && (
        <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            <strong>Admin Resolution Notes:</strong> {discrepancy.adminResolutionNotes}
          </span>
        </p>
      )}

      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">Weighing Scale Proof</p>
        <ScaleProofImage bookingId={booking._id} lrNumber={booking.lrNumber} />
      </div>

      {isSeller && discrepancy.status === WeightDiscrepancyStatus.OPEN && (
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Accept to settle differential freight ({formatINR(discrepancy.additionalDifferenceAmount)}),
              or dispute for Admin inspection.
            </p>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSellerResponse('ACCEPT')}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              Accept &amp; Pay Difference ({formatINR(discrepancy.additionalDifferenceAmount)})
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Reason to dispute (e.g., packed carton calibrated weight was 20 kg on dispatch)"
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-red-500"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSellerResponse('DISPUTE')}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"
            >
              Raise Dispute
            </button>
          </div>
        </div>
      )}

      {isAdmin &&
        (discrepancy.status === WeightDiscrepancyStatus.DISPUTED ||
          discrepancy.status === WeightDiscrepancyStatus.OPEN) && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <ShieldAlert className="w-4 h-4 text-blue-600" />
              <span>Admin Dispute Resolution</span>
            </div>
            <input
              type="text"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Enter audit notes (scale verification result, final decision)"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleAdminResolve('WAIVE')}
                className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
              >
                Waive Difference (Favor Seller)
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleAdminResolve('CHARGE_SELLER')}
                className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                Approve Carrier Scale &amp; Bill ({formatINR(discrepancy.additionalDifferenceAmount)})
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
