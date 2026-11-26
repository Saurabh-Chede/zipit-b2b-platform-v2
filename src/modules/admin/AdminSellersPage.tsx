import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Search, Wallet } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  KycVerificationStatus,
  SellerApprovalStatus,
  WalletPaymentMethod,
  WalletTransactionType,
  type AdminSellerWalletResponse,
  type PaginatedResponse,
  type SellerProfile,
} from '../../types/index.ts';

function formatTxnMethod(method: WalletPaymentMethod): string {
  switch (method) {
    case WalletPaymentMethod.ADMIN_ADJUSTMENT:
      return 'Admin Adjustment';
    case WalletPaymentMethod.WALLET_BOOKING:
      return 'Booking Debit';
    case WalletPaymentMethod.WALLET_REFUND:
      return 'Refund Credit';
    case WalletPaymentMethod.RTO_CHARGE:
      return 'RTO Charge';
    case WalletPaymentMethod.OPENING_CREDIT:
      return 'Opening Credit';
    default:
      return method;
  }
}

export function AdminSellersPage() {
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<SellerProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inspectSeller, setInspectSeller] = useState<SellerProfile | null>(null);
  const [approveTarget, setApproveTarget] = useState<SellerProfile | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SellerProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Manual wallet adjustment modal state
  const [walletTarget, setWalletTarget] = useState<SellerProfile | null>(null);
  const [walletData, setWalletData] = useState<AdminSellerWalletResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [adjustType, setAdjustType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustAmount, setAdjustAmount] = useState('1000');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustReference, setAdjustReference] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustIdemKey, setAdjustIdemKey] = useState(() => `adm-wlt-${crypto.randomUUID()}`);

  const loadSellers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<SellerProfile> }>(
        '/sellers',
        {
          params: {
            page,
            limit: 15,
            status: statusFilter || undefined,
            search: search.trim() || undefined,
          },
        }
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load sellers.'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  const loadSellerWallet = useCallback(async (sellerId: string) => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: AdminSellerWalletResponse }>(
        `/sellers/${sellerId}/wallet`
      );
      setWalletData(res.data.data);
    } catch (err) {
      setWalletError(extractErrorMessage(err, 'Failed to load seller wallet ledger.'));
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const openWalletModal = (seller: SellerProfile) => {
    setWalletTarget(seller);
    setWalletData(null);
    setAdjustType('CREDIT');
    setAdjustAmount('1000');
    setAdjustReason('');
    setAdjustReference('');
    setAdjustIdemKey(`adm-wlt-${crypto.randomUUID()}`);
    void loadSellerWallet(seller._id);
  };

  const handleWalletAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletTarget) return;
    const numericAmount = Number(adjustAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showToast('Enter a valid adjustment amount greater than zero.', 'error');
      return;
    }

    setAdjustSubmitting(true);
    try {
      await apiClient.post(
        `/sellers/${walletTarget._id}/wallet-adjust`,
        {
          type: adjustType,
          amount: numericAmount,
          reason: adjustReason.trim(),
          referenceNote: adjustReference.trim() || undefined,
        },
        {
          headers: { 'Idempotency-Key': adjustIdemKey },
        }
      );
      showToast(
        `${walletTarget.businessName} wallet ${adjustType === 'CREDIT' ? 'credited' : 'debited'} by ${formatINR(numericAmount)}.`,
        'success'
      );
      setAdjustReason('');
      setAdjustReference('');
      setAdjustIdemKey(`adm-wlt-${crypto.randomUUID()}`);
      await Promise.all([loadSellerWallet(walletTarget._id), loadSellers()]);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to adjust seller wallet.'), 'error');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      await apiClient.patch(`/sellers/${approveTarget._id}/approve`);
      showToast(`${approveTarget.businessName} approved.`, 'success');
      setApproveTarget(null);
      setInspectSeller(null);
      await loadSellers();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to approve seller.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await apiClient.patch(`/sellers/${rejectTarget._id}/reject`, {
        rejectionReason: rejectionReason.trim(),
      });
      showToast(`${rejectTarget.businessName} rejected.`, 'info');
      setRejectTarget(null);
      setInspectSeller(null);
      setRejectionReason('');
      await loadSellers();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to reject seller.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<SellerProfile>[] = [
    {
      key: 'business',
      header: 'Business Name',
      render: (s) => (
        <div>
          <p className="font-medium text-slate-900">{s.businessName}</p>
          <p className="text-xs text-slate-500">{s.ownerName}</p>
        </div>
      ),
    },
    {
      key: 'gst',
      header: 'GSTIN',
      hideBelow: 'lg',
      render: (s) => <span className="font-mono text-xs text-slate-800">{s.gstNumber}</span>,
    },
    {
      key: 'city',
      header: 'Location',
      hideBelow: 'lg',
      render: (s) => (
        <span>
          {s.city} ({s.pincode})
        </span>
      ),
    },
    {
      key: 'wallet',
      header: 'Wallet Balance',
      align: 'right',
      render: (s) => (
        <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
          {formatINR(Number(s.walletBalance ?? 0))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Approval Status',
      render: (s) => <StatusBadge status={s.approvalStatus} />,
    },
    {
      key: 'created',
      header: 'Applied On',
      hideBelow: 'xl',
      render: (s) => (
        <span className="text-xs font-mono tabular-nums text-slate-500">
          {formatDateTime(s.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openWalletModal(s)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
          >
            <Wallet className="w-3 h-3" />
            Wallet
          </button>
          <button
            type="button"
            onClick={() => setInspectSeller(s)}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            View
          </button>
          {s.approvalStatus === SellerApprovalStatus.PENDING && (
            <>
              <button
                type="button"
                onClick={() => setApproveTarget(s)}
                className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejectTarget(s)}
                className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Reject
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const currentWalletBalance =
    walletData?.walletBalance ?? Number(walletTarget?.walletBalance ?? 0);
  const parsedAdjustAmount = Number(adjustAmount);
  const validAmount = Number.isFinite(parsedAdjustAmount) && parsedAdjustAmount > 0 && parsedAdjustAmount <= 1000000;
  const projectedBalance =
    adjustType === 'CREDIT'
      ? currentWalletBalance + (validAmount ? parsedAdjustAmount : 0)
      : currentWalletBalance - (validAmount ? parsedAdjustAmount : 0);
  const debitExceedsBalance = adjustType === 'DEBIT' && validAmount && parsedAdjustAmount > currentWalletBalance;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Seller Management</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Inspect GST profiles, approve or reject B2B seller applications, and audit or adjust prepaid wallets
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[240px] sm:max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search business, GSTIN, city..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none w-full sm:w-auto">
          {['', SellerApprovalStatus.PENDING, SellerApprovalStatus.APPROVED, SellerApprovalStatus.REJECTED].map(
            (st) => (
              <button
                key={st || 'ALL'}
                type="button"
                onClick={() => {
                  setPage(1);
                  setStatusFilter(st);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st || 'All'}
              </button>
            )
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadSellers} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No sellers found" description="No seller profiles match the selected filter." />
      ) : (
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(s) => s._id}
          onRowClick={(s) => setInspectSeller(s)}
          renderMobileCard={(s) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{s.businessName}</p>
                  <p className="text-xs text-slate-500 truncate">{s.ownerName}</p>
                </div>
                <StatusBadge status={s.approvalStatus} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100">
                <span className="font-mono text-slate-700">{s.gstNumber}</span>
                <span className="text-slate-600">
                  {s.city} ({s.pincode})
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">Wallet Balance</span>
                <span className="font-mono font-bold tabular-nums text-slate-900">
                  {formatINR(Number(s.walletBalance ?? 0))}
                </span>
              </div>

              <div
                className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => openWalletModal(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                >
                  <Wallet className="w-3 h-3" />
                  Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setInspectSeller(s)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  View
                </button>
                {s.approvalStatus === SellerApprovalStatus.PENDING && (
                  <>
                    <button
                      type="button"
                      onClick={() => setApproveTarget(s)}
                      className="px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectTarget(s)}
                      className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          pagination={{
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }}
        />
      )}

      <Modal
        open={Boolean(inspectSeller)}
        onClose={() => setInspectSeller(null)}
        title={inspectSeller?.businessName || 'Seller Details'}
        subtitle={inspectSeller ? `GSTIN: ${inspectSeller.gstNumber}` : undefined}
      >
        {inspectSeller && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Account:</span>
                <StatusBadge status={inspectSeller.approvalStatus} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">KYC:</span>
                <StatusBadge status={inspectSeller.kyc?.status || KycVerificationStatus.NOT_SUBMITTED} />
                <Link
                  to="/admin/kyc"
                  onClick={() => setInspectSeller(null)}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Open KYC Queue
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div>
                <p className="text-xs text-slate-500">Prepaid Wallet Balance</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {formatINR(Number(inspectSeller.walletBalance ?? 0))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const target = inspectSeller;
                  setInspectSeller(null);
                  openWalletModal(target);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                <Wallet className="w-3.5 h-3.5" />
                Adjust Wallet
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500">Owner</p>
                <p className="font-medium text-slate-900">{inspectSeller.ownerName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Phone</p>
                <p className="font-mono tabular-nums text-slate-900">{inspectSeller.phone}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="text-slate-900 break-words">{inspectSeller.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">City / Pincode</p>
                <p className="text-slate-900">
                  {inspectSeller.city} — {inspectSeller.pincode}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Business Address</p>
                <p className="text-slate-900">{inspectSeller.businessAddress}</p>
              </div>
              {inspectSeller.rejectionReason && (
                <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs">
                  <strong>Rejection Reason:</strong> {inspectSeller.rejectionReason}
                </div>
              )}
            </div>

            {inspectSeller.approvalStatus === SellerApprovalStatus.PENDING && (
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectTarget(inspectSeller)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setApproveTarget(inspectSeller)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  Approve Seller
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Admin Manual Seller Wallet Adjustment & Ledger Modal */}
      <Modal
        open={Boolean(walletTarget)}
        onClose={() => !adjustSubmitting && setWalletTarget(null)}
        title={`Seller Wallet Adjustment · ${walletTarget?.businessName || ''}`}
        subtitle={
          walletTarget
            ? `GSTIN: ${walletTarget.gstNumber} · Current Balance: ${formatINR(currentWalletBalance)}`
            : undefined
        }
        maxWidthClass="max-w-3xl"
      >
        {walletTarget && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form onSubmit={handleWalletAdjust} className="lg:col-span-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Current Balance</span>
                <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {formatINR(currentWalletBalance)}
                </span>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Adjustment Type
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('CREDIT')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      adjustType === 'CREDIT'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    Credit (+ Add)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('DEBIT')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      adjustType === 'DEBIT'
                        ? 'border-red-600 bg-red-50 text-red-800 ring-1 ring-red-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Debit (- Deduct)
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-adjust-amount"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Amount (INR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-500">
                    ₹
                  </span>
                  <input
                    id="admin-adjust-amount"
                    type="number"
                    min={1}
                    max={1000000}
                    step="0.01"
                    required
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white pl-7 pr-3 py-2 text-sm font-bold font-mono tabular-nums text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-adjust-ref"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Reference / UTR / Ticket # <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  id="admin-adjust-ref"
                  type="text"
                  maxLength={100}
                  value={adjustReference}
                  onChange={(e) => setAdjustReference(e.target.value)}
                  placeholder="e.g. NEFT-HDFC8821 or ZPT-SUP-102"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-adjust-reason"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Mandatory Audit Reason
                </label>
                <textarea
                  id="admin-adjust-reason"
                  required
                  minLength={5}
                  maxLength={200}
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Explain credit/debit reason (shown in Seller ledger & audit log)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              {debitExceedsBalance && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  Debit amount exceeds available balance ({formatINR(currentWalletBalance)}).
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs text-slate-500">
                  Projected:{' '}
                  <span className="font-mono font-semibold tabular-nums text-slate-900">
                    {formatINR(Math.max(0, projectedBalance))}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={
                    adjustSubmitting ||
                    !validAmount ||
                    debitExceedsBalance ||
                    adjustReason.trim().length < 5
                  }
                  className={`w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50 ${
                    adjustType === 'CREDIT'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {adjustSubmitting
                    ? 'Applying...'
                    : adjustType === 'CREDIT'
                      ? 'Confirm Credit'
                      : 'Confirm Debit'}
                </button>
              </div>
            </form>

            <div className="lg:col-span-6 lg:border-l lg:border-slate-200 lg:pl-5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-800">Recent Seller Ledger</h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {walletData?.transactions.length ?? 0} entries
                </span>
              </div>

              {walletLoading ? (
                <LoadingSkeleton rows={4} />
              ) : walletError ? (
                <ErrorBanner message={walletError} onRetry={() => loadSellerWallet(walletTarget._id)} />
              ) : !walletData || walletData.transactions.length === 0 ? (
                <div className="flex-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 flex items-center justify-center text-xs text-slate-500">
                  No wallet transactions recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-y-auto max-h-[340px]">
                  {walletData.transactions.map((txn) => {
                    const isCredit = txn.type === WalletTransactionType.CREDIT;
                    return (
                      <div
                        key={txn._id || txn.transactionId}
                        className="flex items-start justify-between gap-2.5 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">
                            {txn.description}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 truncate">
                            {formatTxnMethod(txn.paymentMethod)} · {formatDateTime(txn.createdAt)}
                          </p>
                          {txn.referenceNote && (
                            <p className="text-[11px] text-slate-500 truncate">
                              Ref: {txn.referenceNote}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-xs font-bold font-mono tabular-nums ${
                              isCredit ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {isCredit ? '+' : '-'}
                            {formatINR(txn.amount)}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500">
                            Bal: {formatINR(txn.balanceAfter)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        title="Approve B2B Seller"
        description={`Approve ${approveTarget?.businessName}? Once approved, this seller can immediately book shipments.`}
        confirmLabel="Approve Seller"
        loading={actionLoading}
      />

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Seller Application"
        subtitle={rejectTarget?.businessName}
      >
        <form onSubmit={handleReject} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Rejection Reason (Shown to Seller)
            </label>
            <textarea
              required
              minLength={5}
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why the application was declined (e.g. invalid GSTIN or incomplete address)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading || rejectionReason.trim().length < 5}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
