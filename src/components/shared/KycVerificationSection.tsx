import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Modal } from '../ui/Modal.tsx';
import { ErrorBanner, LoadingSkeleton } from '../ui/States.tsx';
import {
  KycDocumentType,
  KycVerificationStatus,
  type KycDocumentMeta,
  type SelfKycResponse,
} from '../../types/index.ts';

const DOC_SLOTS: {
  docType: KycDocumentType;
  title: string;
  description: string;
  required?: boolean;
}[] = [
  {
    docType: KycDocumentType.GST_CERTIFICATE,
    title: 'GST Registration Certificate',
    description: 'Official GST REG-06 PDF or clear scan matching registered GSTIN',
    required: true,
  },
  {
    docType: KycDocumentType.PAN_CARD,
    title: 'Company / Proprietor PAN Card',
    description: 'PAN document matching the 10-character PAN entered above',
    required: true,
  },
  {
    docType: KycDocumentType.CANCELLED_CHEQUE,
    title: 'Cancelled Cheque / Bank Mandate',
    description: 'Shows account number & IFSC for settlements and refunds',
    required: true,
  },
  {
    docType: KycDocumentType.ADDRESS_PROOF,
    title: 'Warehouse / Office Address Proof',
    description: 'Utility bill, rent agreement, or trade license (optional/recommended)',
  },
];

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function KycVerificationSection({
  onKycUpdated,
}: {
  onKycUpdated?: () => void;
}) {
  const { showToast } = useToast();
  const [data, setData] = useState<SelfKycResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [panNumber, setPanNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [uploadingDoc, setUploadingDoc] = useState<KycDocumentType | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    meta: KycDocumentMeta;
    url: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadKyc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: SelfKycResponse }>('/kyc/me');
      const d = res.data.data;
      setData(d);
      setPanNumber(d.kyc.panNumber || '');
      setBankAccountHolder(d.kyc.bankAccountHolder || d.displayName || '');
      setBankAccountNumber(d.kyc.bankAccountNumber || '');
      setIfscCode(d.kyc.ifscCode || '');
      setBankName(d.kyc.bankName || '');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load KYC status.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKyc();
  }, [loadKyc]);

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

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);
    try {
      const res = await apiClient.put<{ success: boolean; data: SelfKycResponse }>('/kyc/me', {
        panNumber: panNumber.trim().toUpperCase(),
        bankAccountHolder: bankAccountHolder.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        bankName: bankName.trim(),
      });
      setData(res.data.data);
      showToast('KYC PAN and bank details submitted for review.', 'success');
      onKycUpdated?.();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to submit KYC details.'), 'error');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleFileChange = async (
    docType: KycDocumentType,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      showToast('Only JPEG, PNG, WebP, or PDF files are accepted.', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast('File must be 5 MB or smaller.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('docType', docType);
    formData.append('document', file);

    setUploadingDoc(docType);
    try {
      const res = await apiClient.post<{ success: boolean; data: SelfKycResponse }>(
        '/kyc/me/documents',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );
      setData(res.data.data);
      showToast('KYC document uploaded and queued for review.', 'success');
      onKycUpdated?.();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to upload KYC document.'), 'error');
    } finally {
      setUploadingDoc(null);
    }
  };

  const openDocumentPreview = async (doc: KycDocumentMeta) => {
    if (!data) return;
    setPreviewLoading(true);
    try {
      const res = await apiClient.get(
        `/kyc/${data.entityType}/${data.profileId}/documents/${doc.docType}`,
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], { type: doc.mimeType });
      const url = URL.createObjectURL(blob);
      if (previewDoc?.url) {
        URL.revokeObjectURL(previewDoc.url);
      }
      setPreviewDoc({ meta: doc, url });
    } catch (err) {
      showToast(extractErrorMessage(err, 'Unable to load KYC document preview.'), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error || !data) {
    return <ErrorBanner message={error || 'KYC data unavailable'} onRetry={loadKyc} />;
  }

  const { kyc } = data;
  const docsByType = new Map(kyc.documents.map((d) => [d.docType, d]));

  return (
    <section className="space-y-5">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                KYC &amp; Bank Compliance Verification
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Submit company PAN, settlement bank account, and compliance documents for GSTIN{' '}
                <span className="font-mono text-slate-700">{data.gstNumber}</span>
              </p>
            </div>
          </div>
          <StatusBadge status={kyc.status} />
        </div>

        {kyc.status === KycVerificationStatus.REJECTED && kyc.rejectionReason && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="font-semibold">KYC Rejected — Action Required</p>
              <p className="mt-0.5">{kyc.rejectionReason}</p>
            </div>
          </div>
        )}

        {kyc.status === KycVerificationStatus.VERIFIED && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <div>
              <p className="font-semibold">KYC Verified by ZIPIT Compliance</p>
              <p className="mt-0.5">
                Verified on {kyc.reviewedAt ? formatDateTime(kyc.reviewedAt) : 'Record'}. Updating
                PAN, bank details, or documents will place KYC back in review.
              </p>
            </div>
          </div>
        )}

        {/* PAN & Bank Form */}
        <form onSubmit={handleSaveDetails} className="pt-2 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
            <Landmark className="w-3.5 h-3.5 text-slate-500" />
            <span>PAN &amp; Settlement Bank Details</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                PAN Number (10-char) *
              </label>
              <input
                type="text"
                required
                maxLength={10}
                pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bank Name *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="HDFC Bank / ICICI Bank"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Account Holder / Legal Name *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                placeholder="Legal business account name"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bank Account Number (9–18 digits) *
              </label>
              <input
                type="text"
                required
                minLength={9}
                maxLength={18}
                pattern="\d{9,18}"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="50100234567890"
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                IFSC Code (11-char) *
              </label>
              <input
                type="text"
                required
                maxLength={11}
                pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="HDFC0001234"
                className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={savingDetails}
                className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap"
              >
                {savingDetails
                  ? 'Saving KYC...'
                  : kyc.status === KycVerificationStatus.NOT_SUBMITTED
                    ? 'Submit PAN & Bank Details'
                    : 'Save & Resubmit Details'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Document Upload Slots */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Supporting KYC Documents</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload JPEG, PNG, WebP, or PDF documents (max 5 MB each). Uploaded files are encrypted in
            transit and accessible only to you and ZIPIT Compliance Admins.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DOC_SLOTS.map((slot) => {
            const uploaded = docsByType.get(slot.docType);
            const isUploading = uploadingDoc === slot.docType;

            return (
              <div
                key={slot.docType}
                className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 bg-slate-50/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {slot.title}
                        {slot.required && <span className="text-red-500 ml-1">*</span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{slot.description}</p>
                    </div>
                  </div>
                </div>

                {uploaded ? (
                  <div className="bg-white border border-emerald-200 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 truncate">{uploaded.fileName}</span>
                      <span className="text-emerald-700 font-semibold shrink-0">Uploaded</span>
                    </div>
                    <p className="text-slate-500 font-mono tabular-nums">
                      {formatFileSize(uploaded.sizeBytes)} · {formatDateTime(uploaded.uploadedAt)}
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-dashed border-slate-300 rounded-lg p-2.5 text-xs text-slate-500">
                    No document uploaded yet
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {uploaded ? (
                    <button
                      type="button"
                      disabled={previewLoading}
                      onClick={() => openDocumentPreview(uploaded)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">PDF / JPG / PNG / WebP</span>
                  )}

                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer transition">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Uploading...' : uploaded ? 'Replace File' : 'Upload File'}</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      disabled={Boolean(uploadingDoc)}
                      onChange={(e) => handleFileChange(slot.docType, e)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Document Preview Modal */}
      <Modal
        open={Boolean(previewDoc)}
        onClose={closePreview}
        title={previewDoc?.meta.fileName || 'KYC Document Preview'}
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
            <div className="flex flex-wrap justify-end gap-2.5 sm:gap-3">
              <a
                href={previewDoc.url}
                download={previewDoc.meta.fileName}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </a>
              <button
                type="button"
                onClick={closePreview}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
