import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  KycEntityType,
  KycVerificationStatus,
  type KycDocumentMeta,
  type KycQueueItem,
  type KycQueueResponse,
} from '../../types/index.ts';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminKycPage() {
  const { showToast } = useToast();
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<KycQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inspectItem, setInspectItem] = useState<KycQueueItem | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [alsoApproveSeller, setAlsoApproveSeller] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [previewDoc, setPreviewDoc] = useState<{
    meta: KycDocumentMeta;
    url: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: KycQueueResponse }>('/kyc/queue', {
        params: {
          page,
          limit: 15,
          entityType: entityFilter || undefined,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
        },
      });
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load KYC compliance queue.'));
    } finally {
      setLoading(false);
    }
  }, [page, entityFilter, statusFilter, search]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    return () => {
      if (previewDoc?.url) {
        URL.revokeObjectURL(previewDoc.url);
      }
    };
  }, [previewDoc]);

  const closePreview = () => {
    if (previewDoc?.url) {
      URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  const openDocumentPreview = async (item: KycQueueItem, doc: KycDocumentMeta) => {
    setPreviewLoading(true);
    try {
      const res = await apiClient.get(
        `/kyc/${item.entityType}/${item.profileId}/documents/${doc.docType}`,
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], { type: doc.mimeType });
      const url = URL.createObjectURL(blob);
      if (previewDoc?.url) {
        URL.revokeObjectURL(previewDoc.url);
      }
      setPreviewDoc({ meta: doc, url });
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to stream KYC document.'), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleVerify = async (item: KycQueueItem) => {
    setActionLoading(true);
    try {
      await apiClient.patch(`/kyc/${item.entityType}/${item.profileId}/review`, {
        status: KycVerificationStatus.VERIFIED,
        alsoApproveSeller: item.accountStatus === 'PENDING' ? alsoApproveSeller : undefined,
      });
      showToast(`${item.displayName} KYC marked as Verified.`, 'success');
      setInspectItem(null);
      await loadQueue();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to verify KYC.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectItem) return;
    setActionLoading(true);
    try {
      await apiClient.patch(
        `/kyc/${inspectItem.entityType}/${inspectItem.profileId}/review`,
        {
          status: KycVerificationStatus.REJECTED,
          rejectionReason: rejectionReason.trim(),
        }
      );
      showToast(`${inspectItem.displayName} KYC rejected.`, 'info');
      setRejectModalOpen(false);
      setRejectionReason('');
      setInspectItem(null);
      await loadQueue();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to reject KYC.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<KycQueueItem>[] = [
    {
      key: 'entity',
      header: 'Partner & Type',
      render: (item) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{item.displayName}</span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                item.entityType === KycEntityType.SELLER
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              }`}
            >
              {item.entityType}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {item.contactName} · {item.email}
          </p>
        </div>
      ),
    },
    {
      key: 'tax',
      header: 'GSTIN / PAN',
      hideBelow: 'xl',
      render: (item) => (
        <div className="font-mono text-xs space-y-0.5">
          <p className="text-slate-900">{item.gstNumber}</p>
          <p className="text-slate-500">
            PAN: {item.kyc.panNumber || <span className="italic font-sans">Not entered</span>}
          </p>
        </div>
      ),
    },
    {
      key: 'bank',
      header: 'Bank / IFSC',
      hideBelow: 'lg',
      render: (item) =>
        item.kyc.ifscCode ? (
          <div className="text-xs space-y-0.5">
            <p className="text-slate-900 font-medium">{item.kyc.bankName}</p>
            <p className="font-mono text-slate-500">
              ••••{item.kyc.bankAccountNumber?.slice(-4)} · {item.kyc.ifscCode}
            </p>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Not added</span>
        ),
    },
    {
      key: 'docs',
      header: 'Documents',
      hideBelow: 'lg',
      render: (item) => (
        <span className="font-mono tabular-nums text-xs font-medium text-slate-700">
          {item.kyc.documents.length} / 4 files
        </span>
      ),
    },
    {
      key: 'kycStatus',
      header: 'KYC Status',
      render: (item) => <StatusBadge status={item.kyc.status} />,
    },
    {
      key: 'actions',
      header: 'Review',
      align: 'right',
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setInspectItem(item);
          }}
          className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
        >
          Inspect KYC
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <span>KYC Compliance Review</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Verify PAN, settlement bank accounts, GST certificates, and compliance uploads for Sellers &amp; Transporters
          </p>
        </div>
      </div>

      {/* Summary Strip */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5">
            <p className="text-xs text-slate-500">Total Partners</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {data.summary.total}
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
            <p className="text-xs text-amber-800">Pending Review</p>
            <p className="text-lg font-bold font-mono tabular-nums text-amber-900 mt-0.5">
              {data.summary.pending}
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
            <p className="text-xs text-emerald-800">Verified</p>
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-900 mt-0.5">
              {data.summary.verified}
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
            <p className="text-xs text-red-800">Rejected</p>
            <p className="text-lg font-bold font-mono tabular-nums text-red-900 mt-0.5">
              {data.summary.rejected}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <p className="text-xs text-slate-600">Not Submitted</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-800 mt-0.5">
              {data.summary.notSubmitted}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
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
            placeholder="Search company, GSTIN, PAN, email..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none w-full sm:w-auto">
          {[
            { value: '', label: 'All Partners' },
            { value: KycEntityType.SELLER, label: 'Sellers' },
            { value: KycEntityType.TRANSPORTER, label: 'Transporters' },
          ].map((opt) => (
            <button
              key={opt.value || 'ALL_ENTITIES'}
              type="button"
              onClick={() => {
                setPage(1);
                setEntityFilter(opt.value);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                entityFilter === opt.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none w-full sm:w-auto">
          {[
            { value: '', label: 'All Statuses' },
            { value: KycVerificationStatus.PENDING, label: 'Pending' },
            { value: KycVerificationStatus.VERIFIED, label: 'Verified' },
            { value: KycVerificationStatus.REJECTED, label: 'Rejected' },
            { value: KycVerificationStatus.NOT_SUBMITTED, label: 'Not Submitted' },
          ].map((opt) => (
            <button
              key={opt.value || 'ALL_STATUSES'}
              type="button"
              onClick={() => {
                setPage(1);
                setStatusFilter(opt.value);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === opt.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadQueue} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No KYC records found"
          description="No Sellers or Transporters match the current KYC filter."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(item) => `${item.entityType}-${item.profileId}`}
          onRowClick={(item) => setInspectItem(item)}
          renderMobileCard={(item) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {item.displayName}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                        item.entityType === KycEntityType.SELLER
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}
                    >
                      {item.entityType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {item.contactName} · {item.email}
                  </p>
                </div>
                <StatusBadge status={item.kyc.status} />
              </div>

              <div className="text-xs pt-2 border-t border-slate-100 space-y-1">
                <div className="flex items-center justify-between gap-2 font-mono">
                  <span className="text-slate-800">{item.gstNumber}</span>
                  <span className="text-slate-500">PAN: {item.kyc.panNumber || '—'}</span>
                </div>
                <p className="text-slate-600 truncate">
                  {item.kyc.ifscCode
                    ? `${item.kyc.bankName} · ••••${item.kyc.bankAccountNumber?.slice(-4)} · ${item.kyc.ifscCode}`
                    : 'Bank details not added'}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <span className="font-mono tabular-nums text-xs font-medium text-slate-700">
                  {item.kyc.documents.length} / 4 files
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspectItem(item);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                >
                  Inspect KYC
                </button>
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

      {/* KYC Inspection Modal */}
      <Modal
        open={Boolean(inspectItem)}
        onClose={() => setInspectItem(null)}
        title={inspectItem?.displayName || 'Inspect KYC'}
        subtitle={
          inspectItem
            ? `${inspectItem.entityType} · GSTIN: ${inspectItem.gstNumber}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
      >
        {inspectItem && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="text-xs text-slate-500">
                Contact: <span className="font-medium text-slate-900">{inspectItem.contactName}</span> ·{' '}
                <span className="font-mono tabular-nums">{inspectItem.phone}</span>
              </div>
              <StatusBadge status={inspectItem.kyc.status} />
            </div>

            {inspectItem.kyc.rejectionReason && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                <strong>Rejection Reason:</strong> {inspectItem.kyc.rejectionReason}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <p className="text-xs text-slate-500">PAN Number</p>
                <p className="font-mono font-semibold text-slate-900 mt-0.5">
                  {inspectItem.kyc.panNumber || 'Not submitted'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Bank Name</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {inspectItem.kyc.bankName || 'Not submitted'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Account Holder</p>
                <p className="text-slate-900 mt-0.5">
                  {inspectItem.kyc.bankAccountHolder || 'Not submitted'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Account Number / IFSC</p>
                <p className="font-mono text-slate-900 mt-0.5">
                  {inspectItem.kyc.bankAccountNumber
                    ? `${inspectItem.kyc.bankAccountNumber} (${inspectItem.kyc.ifscCode})`
                    : 'Not submitted'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Uploaded Documents ({inspectItem.kyc.documents.length})
              </p>
              {inspectItem.kyc.documents.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 text-center">
                  No KYC documents uploaded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {inspectItem.kyc.documents.map((doc) => (
                    <div
                      key={doc.docType}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 p-3 bg-white border border-slate-200 rounded-lg"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900">
                            {doc.docType.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {doc.fileName} · {formatFileSize(doc.sizeBytes)} ·{' '}
                            {formatDateTime(doc.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={previewLoading}
                        onClick={() => openDocumentPreview(inspectItem, doc)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {inspectItem.accountStatus === 'PENDING' && (
              <label className="flex items-center gap-2 text-xs text-slate-700 bg-blue-50 border border-blue-200 rounded-lg p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoApproveSeller}
                  onChange={(e) => setAlsoApproveSeller(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>
                  Also approve this{' '}
                  {inspectItem.entityType === KycEntityType.SELLER ? 'Seller' : 'Transporter'}
                  &apos;s onboarding account upon KYC verification
                </span>
              </label>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  setRejectionReason('');
                  setRejectModalOpen(true);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject KYC</span>
              </button>
              <button
                type="button"
                disabled={
                  actionLoading ||
                  (!inspectItem.kyc.panNumber && inspectItem.kyc.documents.length === 0)
                }
                onClick={() => handleVerify(inspectItem)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{actionLoading ? 'Saving...' : 'Verify & Approve KYC'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject KYC Submission"
        subtitle={inspectItem?.displayName}
      >
        <form onSubmit={handleReject} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Rejection Reason (Shown to Partner)
            </label>
            <textarea
              required
              minLength={5}
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain what needs correction (e.g. Cancelled cheque IFSC mismatch or blurred PAN copy)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setRejectModalOpen(false)}
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

      {/* Document Preview Modal */}
      <Modal
        open={Boolean(previewDoc)}
        onClose={closePreview}
        title={previewDoc?.meta.fileName || 'KYC Document'}
        subtitle={
          previewDoc
            ? `${previewDoc.meta.docType.replace(/_/g, ' ')} · ${formatFileSize(previewDoc.meta.sizeBytes)}`
            : undefined
        }
        maxWidthClass="max-w-3xl"
      >
        {previewDoc && (
          <div className="space-y-4">
            <div className="bg-slate-100 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center min-h-[240px] sm:min-h-[360px]">
              {previewDoc.meta.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.meta.fileName}
                  className="w-full h-[55dvh] sm:h-[520px] bg-white"
                />
              ) : (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.meta.fileName}
                  className="max-h-[55dvh] sm:max-h-[520px] w-auto object-contain"
                />
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={closePreview}
                className="w-full sm:w-auto px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
              <a
                href={previewDoc.url}
                download={previewDoc.meta.fileName}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
