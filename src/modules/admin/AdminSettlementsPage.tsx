import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  IndianRupee,
  Landmark,
  PackageCheck,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  KycVerificationStatus,
  type AdminSettlementCarrierSummary,
  type AdminSettlementRecord,
  type AdminSettlementsOverviewResponse,
  type AdminTransporterPendingResponse,
} from '../../types/index.ts';

function defaultPeriodLabel(): string {
  const now = new Date();
  const monthYear = now.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  return `${monthYear} Payout Batch`;
}

function maskAccountNumber(acc: string): string {
  const clean = acc.trim();
  if (!clean) return 'Not Provided';
  if (clean.length <= 4) return clean;
  return `${'•'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
}

export function AdminSettlementsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<AdminSettlementsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [showZeroPending, setShowZeroPending] = useState(false);

  // Settle Payout Modal state
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [pendingDetail, setPendingDetail] = useState<AdminTransporterPendingResponse | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [payoutMethod, setPayoutMethod] = useState<'NEFT' | 'RTGS' | 'IMPS'>('NEFT');
  const [utrNumber, setUtrNumber] = useState('');
  const [periodLabel, setPeriodLabel] = useState(defaultPeriodLabel);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: AdminSettlementsOverviewResponse;
      }>('/settlements');
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load transporter settlements overview.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const openSettleModal = async (carrier: AdminSettlementCarrierSummary) => {
    setSettleModalOpen(true);
    setPendingDetail(null);
    setPendingError(null);
    setPendingLoading(true);
    setSelectedBookingIds([]);
    setPayoutMethod('NEFT');
    setUtrNumber('');
    setPeriodLabel(defaultPeriodLabel());
    setRemarks('');

    try {
      const res = await apiClient.get<{
        success: boolean;
        data: AdminTransporterPendingResponse;
      }>(`/settlements/transporters/${carrier._id}/pending`);
      const detail = res.data.data;
      setPendingDetail(detail);
      setSelectedBookingIds(detail.pendingBookings.map((b) => b._id));
    } catch (err) {
      setPendingError(extractErrorMessage(err, 'Failed to load pending bookings for carrier.'));
    } finally {
      setPendingLoading(false);
    }
  };

  const selectedTotals = useMemo(() => {
    if (!pendingDetail) {
      return { count: 0, gross: 0, fee: 0, net: 0 };
    }
    const idSet = new Set(selectedBookingIds);
    let count = 0;
    let gross = 0;
    let fee = 0;
    let net = 0;
    for (const b of pendingDetail.pendingBookings) {
      if (!idSet.has(b._id)) continue;
      count += 1;
      gross += b.grossFreight;
      fee += b.platformFee;
      net += b.netEarning;
    }
    return {
      count,
      gross: Math.round(gross * 100) / 100,
      fee: Math.round(fee * 100) / 100,
      net: Math.round(net * 100) / 100,
    };
  }, [pendingDetail, selectedBookingIds]);

  const toggleBookingSelection = (id: string) => {
    setSelectedBookingIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingDetail || selectedBookingIds.length === 0) return;

    setSubmitting(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: AdminSettlementRecord;
      }>('/settlements', {
        transporterId: pendingDetail.transporter._id,
        bookingIds: selectedBookingIds,
        payoutMethod,
        utrNumber: utrNumber.trim().toUpperCase(),
        periodLabel: periodLabel.trim(),
        remarks: remarks.trim() || undefined,
      });

      showToast(res.data.message || 'Transporter payout settled successfully.', 'success');
      setSettleModalOpen(false);
      await loadOverview();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to record transporter settlement.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const visibleCarriers = useMemo(() => {
    if (!data) return [];
    if (showZeroPending) return data.transporters;
    return data.transporters.filter((c) => c.pendingCount > 0);
  }, [data, showZeroPending]);

  const carrierColumns: ColumnDef<AdminSettlementCarrierSummary>[] = [
    {
      key: 'company',
      header: 'Transporter',
      render: (c) => (
        <div>
          <p className="font-medium text-slate-900">{c.companyName}</p>
          <p className="text-xs text-slate-500 font-mono">
            {c.gstNumber} · {c.contactPerson}
          </p>
        </div>
      ),
    },
    {
      key: 'bank',
      header: 'Settlement Bank & KYC',
      hideBelow: 'lg',
      render: (c) => (
        <div className="space-y-1">
          <StatusBadge status={c.kycStatus} />
          {c.bankAccount.accountNumber ? (
            <p className="text-[11px] font-mono text-slate-600">
              {c.bankAccount.bankName} · {maskAccountNumber(c.bankAccount.accountNumber)} ·{' '}
              {c.bankAccount.ifscCode}
            </p>
          ) : (
            <p className="text-[11px] text-amber-700">Bank details not submitted</p>
          )}
        </div>
      ),
    },
    {
      key: 'pendingCount',
      header: 'Delivered Unsettled',
      align: 'right',
      hideBelow: 'xl',
      render: (c) => (
        <span className="font-mono text-xs font-semibold tabular-nums text-slate-800">
          {c.pendingCount} {c.pendingCount === 1 ? 'shipment' : 'shipments'}
        </span>
      ),
    },
    {
      key: 'gross',
      header: 'Gross / 5% Fee',
      align: 'right',
      hideBelow: 'xl',
      render: (c) => (
        <div className="text-right font-mono text-xs tabular-nums">
          <p className="text-slate-800">{formatINR(c.pendingGrossFreight)}</p>
          <p className="text-[11px] text-slate-500">Fee: -{formatINR(c.pendingPlatformFee)}</p>
        </div>
      ),
    },
    {
      key: 'net',
      header: 'Net Payable',
      align: 'right',
      render: (c) => (
        <span className="font-mono text-sm font-bold tabular-nums text-blue-700">
          {formatINR(c.pendingNetPayout)}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (c) => (
        <button
          type="button"
          disabled={c.pendingCount === 0}
          onClick={() => void openSettleModal(c)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Landmark className="w-3.5 h-3.5" />
          Settle Payout (UTR)
        </button>
      ),
    },
  ];

  const historyColumns: ColumnDef<AdminSettlementRecord>[] = [
    {
      key: 'settlementId',
      header: 'Settlement Batch',
      render: (st) => (
        <div>
          <p className="font-mono text-xs font-semibold text-slate-900">{st.settlementId}</p>
          <p className="text-xs text-slate-500">{st.periodLabel}</p>
        </div>
      ),
    },
    {
      key: 'transporter',
      header: 'Transporter',
      render: (st) => {
        const t = typeof st.transporterId === 'object' ? st.transporterId : null;
        return (
          <div>
            <p className="font-medium text-slate-900">{t?.companyName || 'Carrier'}</p>
            {t?.gstNumber && <p className="text-[11px] font-mono text-slate-500">{t.gstNumber}</p>}
          </div>
        );
      },
    },
    {
      key: 'count',
      header: 'Shipments',
      align: 'right',
      hideBelow: 'lg',
      render: (st) => (
        <span className="font-mono text-xs tabular-nums text-slate-800">{st.bookingCount}</span>
      ),
    },
    {
      key: 'amounts',
      header: 'Gross / Fee',
      align: 'right',
      hideBelow: 'xl',
      render: (st) => (
        <div className="text-right font-mono text-xs tabular-nums">
          <p className="text-slate-800">{formatINR(st.grossAmount)}</p>
          <p className="text-[11px] text-slate-500">
            -{formatINR(st.platformFee)} ({st.platformCommissionRate}%)
          </p>
        </div>
      ),
    },
    {
      key: 'net',
      header: 'Net Paid',
      align: 'right',
      render: (st) => (
        <span className="font-mono text-xs font-bold tabular-nums text-emerald-700">
          {formatINR(st.netPayoutAmount)}
        </span>
      ),
    },
    {
      key: 'utr',
      header: 'Method & UTR Reference',
      hideBelow: 'lg',
      render: (st) => (
        <div>
          <p className="font-mono text-xs font-semibold text-slate-900">
            {st.payoutMethod} · {st.utrNumber}
          </p>
          {st.remarks && <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{st.remarks}</p>}
        </div>
      ),
    },
    {
      key: 'settledAt',
      header: 'Settled On',
      hideBelow: 'xl',
      render: (st) => (
        <div className="space-y-1">
          <StatusBadge status={st.status} />
          <p className="text-[11px] font-mono tabular-nums text-slate-500">
            {formatDateTime(st.settledAt)}
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Transporter Payout Settlements</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review unsettled delivered shipments, verify carrier bank details, and record NEFT/RTGS/IMPS UTR payouts
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error || !data ? (
        <ErrorBanner message={error || 'Unable to load settlements'} onRetry={loadOverview} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Pending Carrier Payouts</span>
                <Landmark className="w-4 h-4 text-blue-600" />
              </div>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatINR(data.summary.totalPendingPayout)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Across {data.summary.totalPendingBookings} delivered shipment(s)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Settled to Carriers</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {formatINR(data.summary.totalSettledAmount)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {data.summary.settledBatchCount} completed UTR batch(es)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Carriers Awaiting Payout</span>
                <Building2 className="w-4 h-4 text-amber-600" />
              </div>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {data.summary.transportersAwaitingPayout}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Of {data.transporters.length} onboarded transporter(s)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Platform Commission</span>
                <IndianRupee className="w-4 h-4 text-slate-600" />
              </div>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {data.commissionRatePercent}%
              </p>
              <p className="text-xs text-slate-500 mt-1">Deducted on gross freight (excl. GST)</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none max-w-full w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('PENDING')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'PENDING'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pending Payouts ({data.summary.transportersAwaitingPayout})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('HISTORY')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'HISTORY'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Settled UTR History ({data.settlements.length})
              </button>
            </div>

            {activeTab === 'PENDING' && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showZeroPending}
                  onChange={(e) => setShowZeroPending(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                Show carriers with ₹0 pending balance
              </label>
            )}
          </div>

          {activeTab === 'PENDING' ? (
            visibleCarriers.length === 0 ? (
              <EmptyState
                title="All delivered shipments settled"
                description="No transporters currently have pending delivered shipments awaiting payout."
              />
            ) : (
              <DataTable
                columns={carrierColumns}
                rows={visibleCarriers}
                rowKey={(c) => c._id}
                renderMobileCard={(c) => (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {c.companyName}
                        </p>
                        <p className="text-xs text-slate-500 font-mono truncate">
                          {c.gstNumber} · {c.contactPerson}
                        </p>
                      </div>
                      <StatusBadge status={c.kycStatus} />
                    </div>

                    <div className="text-xs pt-2 border-t border-slate-100 space-y-1">
                      {c.bankAccount.accountNumber ? (
                        <p className="font-mono text-[11px] text-slate-600 truncate">
                          {c.bankAccount.bankName} · {maskAccountNumber(c.bankAccount.accountNumber)} ·{' '}
                          {c.bankAccount.ifscCode}
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-700">Bank details not submitted</p>
                      )}
                      <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                        <span className="text-slate-600">
                          {c.pendingCount} {c.pendingCount === 1 ? 'shipment' : 'shipments'}
                        </span>
                        <span className="text-slate-600">
                          Gross {formatINR(c.pendingGrossFreight)} (-{formatINR(c.pendingPlatformFee)})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div>
                        <p className="text-[11px] text-slate-500">Net Payable</p>
                        <p className="font-mono text-sm font-bold tabular-nums text-blue-700">
                          {formatINR(c.pendingNetPayout)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={c.pendingCount === 0}
                        onClick={() => void openSettleModal(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        <Landmark className="w-3.5 h-3.5" />
                        Settle Payout (UTR)
                      </button>
                    </div>
                  </div>
                )}
              />
            )
          ) : data.settlements.length === 0 ? (
            <EmptyState
              title="No settlement batches yet"
              description="Completed UTR payout batches will appear here once recorded."
            />
          ) : (
            <DataTable
              columns={historyColumns}
              rows={data.settlements}
              rowKey={(st) => st._id}
              renderMobileCard={(st) => {
                const t = typeof st.transporterId === 'object' ? st.transporterId : null;
                return (
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {st.settlementId}
                        </p>
                        <p className="text-xs text-slate-600 truncate">
                          {t?.companyName || 'Carrier'} · {st.periodLabel}
                        </p>
                      </div>
                      <StatusBadge status={st.status} />
                    </div>

                    <div className="text-xs pt-2 border-t border-slate-100 space-y-1">
                      <div className="flex items-center justify-between gap-2 font-mono tabular-nums">
                        <span className="text-slate-500">{st.bookingCount} shipment(s)</span>
                        <span className="text-slate-600">
                          Gross {formatINR(st.grossAmount)} (-{formatINR(st.platformFee)})
                        </span>
                      </div>
                      <p className="font-mono text-xs font-semibold text-slate-800 truncate">
                        {st.payoutMethod} · {st.utrNumber}
                      </p>
                      {st.remarks && <p className="text-[11px] text-slate-500 truncate">{st.remarks}</p>}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                      <span className="font-mono tabular-nums text-[11px] text-slate-500">
                        {formatDateTime(st.settledAt)}
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums text-emerald-700">
                        {formatINR(st.netPayoutAmount)}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </>
      )}

      {/* Settle Transporter Payout (UTR) Modal */}
      <Modal
        open={settleModalOpen}
        onClose={() => !submitting && setSettleModalOpen(false)}
        title={
          pendingDetail
            ? `Settle Payout · ${pendingDetail.transporter.companyName}`
            : 'Settle Transporter Payout (UTR)'
        }
        subtitle={
          pendingDetail
            ? `GSTIN: ${pendingDetail.transporter.gstNumber} · ${pendingDetail.commissionRatePercent}% Platform Fee`
            : undefined
        }
        maxWidthClass="max-w-4xl"
      >
        {pendingLoading ? (
          <LoadingSkeleton rows={5} />
        ) : pendingError || !pendingDetail ? (
          <ErrorBanner message={pendingError || 'Could not load carrier pending shipments'} />
        ) : (
          <form onSubmit={handleConfirmSettlement} className="space-y-5">
            {/* Beneficiary Bank Details */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-600" />
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                    Beneficiary Bank Account
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={pendingDetail.transporter.kycStatus} />
                  {pendingDetail.transporter.kycStatus !== KycVerificationStatus.VERIFIED && (
                    <Link
                      to="/admin/kyc"
                      onClick={() => setSettleModalOpen(false)}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Verify in KYC Queue
                    </Link>
                  )}
                </div>
              </div>

              {pendingDetail.transporter.kycStatus !== KycVerificationStatus.VERIFIED && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Carrier bank KYC is currently <strong>{pendingDetail.transporter.kycStatus}</strong>.
                    Confirm account details below before releasing NEFT/RTGS transfer.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">Account Holder</p>
                  <p className="font-semibold text-slate-900 mt-0.5 break-words">
                    {pendingDetail.transporter.bankAccount.accountHolder || 'Not Provided'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Bank Name</p>
                  <p className="font-medium text-slate-900 mt-0.5 break-words">
                    {pendingDetail.transporter.bankAccount.bankName || 'Not Provided'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Account Number</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5 break-all">
                    {pendingDetail.transporter.bankAccount.accountNumber || 'Not Provided'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">IFSC Code</p>
                  <p className="font-mono font-semibold text-slate-900 mt-0.5">
                    {pendingDetail.transporter.bankAccount.ifscCode || 'Not Provided'}
                  </p>
                </div>
              </div>
            </div>

            {/* Selectable Unsettled Delivered Bookings */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-semibold text-slate-800">
                    Unsettled Delivered Shipments ({pendingDetail.pendingBookings.length})
                  </h3>
                </div>
                {pendingDetail.pendingBookings.length > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedBookingIds(pendingDetail.pendingBookings.map((b) => b._id))
                      }
                      className="font-medium text-blue-600 hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBookingIds([])}
                      className="font-medium text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {pendingDetail.pendingBookings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  No unsettled delivered bookings remain for this transporter.
                </div>
              ) : (
                <>
                  {/* Mobile Selectable Cards */}
                  <div className="sm:hidden border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto bg-white">
                    {pendingDetail.pendingBookings.map((b) => {
                      const checked = selectedBookingIds.includes(b._id);
                      return (
                        <div
                          key={b._id}
                          onClick={() => toggleBookingSelection(b._id)}
                          className={`p-3 cursor-pointer space-y-1.5 ${
                            checked ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleBookingSelection(b._id)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-slate-300 text-blue-600 shrink-0"
                              />
                              <span className="font-mono text-xs font-semibold text-slate-900 truncate">
                                {b.lrNumber}
                              </span>
                            </div>
                            <span className="font-mono text-xs font-bold tabular-nums text-emerald-700 shrink-0">
                              {formatINR(b.netEarning)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] pl-6 text-slate-500">
                            <span className="truncate">{b.lane}</span>
                            <span className="font-mono tabular-nums shrink-0">
                              Gross {formatINR(b.grossFreight)} (-{formatINR(b.platformFee)})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tablet / Desktop Selectable Table */}
                  <div className="hidden sm:block border border-slate-200 rounded-lg overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 w-8"></th>
                          <th className="px-3 py-2">LR Number</th>
                          <th className="px-3 py-2">Lane</th>
                          <th className="px-3 py-2 text-right">Gross Freight</th>
                          <th className="px-3 py-2 text-right">5% Fee</th>
                          <th className="px-3 py-2 text-right">Net Payable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {pendingDetail.pendingBookings.map((b) => {
                          const checked = selectedBookingIds.includes(b._id);
                          return (
                            <tr
                              key={b._id}
                              onClick={() => toggleBookingSelection(b._id)}
                              className={`cursor-pointer transition-colors ${
                                checked ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleBookingSelection(b._id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border-slate-300 text-blue-600"
                                />
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                                {b.lrNumber}
                              </td>
                              <td className="px-3 py-2 text-slate-700">{b.lane}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                                {formatINR(b.grossFreight)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                                -{formatINR(b.platformFee)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                                {formatINR(b.netEarning)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Selected Totals Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs">
              <div>
                <p className="text-slate-600">Selected Shipments</p>
                <p className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                  {selectedTotals.count}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Gross Freight</p>
                <p className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {formatINR(selectedTotals.gross)}
                </p>
              </div>
              <div>
                <p className="text-slate-600">Platform Fee (5%)</p>
                <p className="text-sm font-bold font-mono tabular-nums text-slate-700 mt-0.5">
                  -{formatINR(selectedTotals.fee)}
                </p>
              </div>
              <div>
                <p className="text-blue-800 font-semibold">Net Payout Amount</p>
                <p className="text-base font-bold font-mono tabular-nums text-blue-700 mt-0.5">
                  {formatINR(selectedTotals.net)}
                </p>
              </div>
            </div>

            {/* UTR & Payout Metadata Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payout Method
                </label>
                <select
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value as 'NEFT' | 'RTGS' | 'IMPS')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="IMPS">IMPS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bank UTR / Reference Number
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  maxLength={50}
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC261121009944"
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Settlement Period Label
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={100}
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  placeholder="e.g. Nov 2026 Cycle #1"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Released via corporate banking batch #44"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSettleModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  submitting ||
                  selectedBookingIds.length === 0 ||
                  utrNumber.trim().length < 6 ||
                  periodLabel.trim().length < 3
                }
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting
                  ? 'Recording Payout...'
                  : `Mark ${formatINR(selectedTotals.net)} Settled`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
