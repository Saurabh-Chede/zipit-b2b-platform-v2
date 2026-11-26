import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatINR, formatWeight } from '../../utils/formatters.ts';
import { ErrorBanner } from '../../components/ui/States.tsx';
import { SellerApprovalStatus, type Booking, type SellerProfile } from '../../types/index.ts';

interface PreviewRow {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  routeLabel?: string;
  transporterName?: string;
  chargeableWeightKg?: number;
  estimatedAmount?: number;
}

interface PreviewResponse {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  totalEstimatedAmount: number;
  walletBalance: number;
  sufficientWalletBalance: boolean;
  rows: PreviewRow[];
}

interface BulkCreateResponse {
  batchId: string;
  createdCount: number;
  totalCharged: number;
  walletBalance: number;
  bookings: Booking[];
}

export function BulkBookingPage() {
  const { profile, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const sellerProfile = profile as SellerProfile | null;

  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [paymentMode, setPaymentMode] = useState<'WALLET' | 'INVOICE'>('WALLET');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<BulkCreateResponse | null>(null);
  const [downloadingBundle, setDownloadingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadSampleCsv = () => {
    const headers = [
      'originPincode',
      'destinationPincode',
      'senderName',
      'senderPhone',
      'senderAddress',
      'senderCity',
      'senderPincode',
      'receiverName',
      'receiverPhone',
      'receiverAddress',
      'receiverCity',
      'receiverPincode',
      'description',
      'actualWeightKg',
      'lengthCm',
      'widthCm',
      'heightCm',
      'numberOfPackages',
      'ewayBillNumber',
    ];
    const row1 = [
      sellerProfile?.pincode || '400001',
      '411001',
      sellerProfile?.businessName || 'Apex Industrial Supplies',
      sellerProfile?.phone || '9820012345',
      sellerProfile?.businessAddress || 'Plot 14, MIDC Andheri East',
      sellerProfile?.city || 'Mumbai',
      sellerProfile?.pincode || '400001',
      'Deccan Auto Parts Pvt Ltd',
      '9823011223',
      'Sector 7, Bhosari Industrial Area',
      'Pune',
      '411001',
      'Precision CNC Bearings',
      '45',
      '60',
      '40',
      '30',
      '2',
      '271009887766',
    ];
    const csv = `${headers.join(',')}\n${row1.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zipit-bulk-booking-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const runPreview = async (rows: Record<string, unknown>[], mode: 'WALLET' | 'INVOICE') => {
    setPreviewing(true);
    setError(null);
    setCreatedResult(null);
    try {
      const res = await apiClient.post<{ success: boolean; data: PreviewResponse }>(
        '/bookings/bulk/preview',
        { rows, paymentMode: mode }
      );
      setPreview(res.data.data);
    } catch (err) {
      setPreview(null);
      setError(extractErrorMessage(err, 'Unable to validate spreadsheet rows.'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        setError('Uploaded workbook does not contain any sheet.');
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
        defval: '',
      });
      if (rows.length === 0) {
        setError('Spreadsheet has no data rows.');
        return;
      }
      if (rows.length > 50) {
        setError('Maximum 50 shipments are allowed per batch.');
        return;
      }
      setParsedRows(rows);
      await runPreview(rows, paymentMode);
    } catch {
      setError('Could not parse file. Upload a valid CSV or Excel (.xlsx/.xls) file.');
    }
  };

  const handlePaymentModeChange = async (mode: 'WALLET' | 'INVOICE') => {
    setPaymentMode(mode);
    if (parsedRows.length > 0) {
      await runPreview(parsedRows, mode);
    }
  };

  const handleConfirmBatch = async () => {
    if (!preview || preview.invalidCount > 0 || parsedRows.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post<{ success: boolean; data: BulkCreateResponse }>(
        '/bookings/bulk',
        { rows: parsedRows, paymentMode }
      );
      setCreatedResult(res.data.data);
      setPreview(null);
      await refreshUser();
      showToast(`${res.data.data.createdCount} shipments booked cleanly.`, 'success');
    } catch (err) {
      const msg = extractErrorMessage(err, 'Bulk booking creation failed.');
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadCombinedLr = async () => {
    if (!createdResult || createdResult.bookings.length === 0) return;
    setDownloadingBundle(true);
    try {
      const res = await apiClient.post(
        '/bookings/bulk-lr',
        { bookingIds: createdResult.bookings.map((b) => b._id) },
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${createdResult.batchId}-LRs.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Downloaded combined multi-page LR PDF bundle.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download combined LR PDF.'), 'error');
    } finally {
      setDownloadingBundle(false);
    }
  };

  if (sellerProfile && sellerProfile.approvalStatus !== SellerApprovalStatus.APPROVED) {
    return (
      <ErrorBanner message="Your seller account must be approved by an administrator before creating bulk shipments." />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Bulk Shipment Booking (CSV / Excel)</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload up to 50 shipments per batch, validate lanes &amp; tariffs, and download combined LR labels
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadSampleCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
        >
          <FileDown className="w-4 h-4 text-blue-600" />
          <span>Download Sample CSV</span>
        </button>
      </div>

      {/* Upload & Payment Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold cursor-pointer hover:bg-blue-100 transition max-w-full">
            <Upload className="w-4 h-4 shrink-0" />
            <span className="truncate">{fileName ? `Replace File (${fileName})` : 'Choose CSV / Excel File'}</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span className="text-xs font-medium text-slate-600">Payment Mode</span>
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => handlePaymentModeChange('WALLET')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  paymentMode === 'WALLET'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span>Wallet ({formatINR(Number(sellerProfile?.walletBalance ?? 0))})</span>
              </button>
              <button
                type="button"
                onClick={() => handlePaymentModeChange('INVOICE')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  paymentMode === 'INVOICE'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                B2B Invoice
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Optional columns: <code className="font-mono text-slate-700">transporterGst</code>,{' '}
          <code className="font-mono text-slate-700">transporterEmail</code>,{' '}
          <code className="font-mono text-slate-700">ewayBillNumber</code>. If carrier is omitted,
          ZIPIT auto-selects the lowest active tariff for the route.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      {previewing && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 text-sm text-slate-600">
          Validating rows against active lanes &amp; carrier tariffs...
        </div>
      )}

      {/* Validation Preview Table */}
      {preview && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 sm:gap-4 bg-slate-50/70">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
              <span className="font-semibold text-slate-900">
                Batch Preview ({preview.totalRows} rows)
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                {preview.validCount} Valid
              </span>
              {preview.invalidCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                  <XCircle className="w-4 h-4" />
                  {preview.invalidCount} Invalid
                </span>
              )}
              <span className="font-mono font-bold text-blue-700">
                Total Est: {formatINR(preview.totalEstimatedAmount)}
              </span>
            </div>

            <button
              type="button"
              disabled={
                submitting ||
                preview.invalidCount > 0 ||
                preview.validCount === 0 ||
                !preview.sufficientWalletBalance
              }
              onClick={handleConfirmBatch}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Booking Batch...'
                  : `Confirm & Book ${preview.validCount} Shipment(s)`}
              </span>
            </button>
          </div>

          {!preview.sufficientWalletBalance && (
            <div className="px-4 sm:px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
              <span>
                Insufficient wallet balance ({formatINR(preview.walletBalance)}) for batch total{' '}
                {formatINR(preview.totalEstimatedAmount)}. Switch to B2B Invoice or recharge wallet.
              </span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('zipit:open-wallet-modal'))}
                className="font-semibold text-blue-700 underline whitespace-nowrap"
              >
                Recharge Wallet
              </button>
            </div>
          )}

          {/* Mobile & Portrait Tablet Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {preview.rows.map((r) => (
              <div key={r.rowNumber} className={`p-3.5 space-y-2 text-xs ${r.valid ? '' : 'bg-red-50/40'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-700">Row #{r.rowNumber}</span>
                  {r.valid ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                      <XCircle className="w-3.5 h-3.5" /> Invalid
                    </span>
                  )}
                </div>
                {!r.valid && r.errors.length > 0 && (
                  <div className="text-red-700 space-y-0.5 bg-red-50 border border-red-200 rounded-lg p-2">
                    {r.errors.map((er, i) => (
                      <p key={i}>{er}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-slate-600">
                  <span className="truncate">{r.routeLabel || '—'}</span>
                  <span className="font-mono font-semibold text-slate-900 shrink-0">
                    {r.estimatedAmount !== undefined ? formatINR(r.estimatedAmount) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-slate-500">
                  <span className="truncate font-medium text-slate-700">{r.transporterName || '—'}</span>
                  <span className="font-mono tabular-nums shrink-0">
                    {r.chargeableWeightKg !== undefined ? formatWeight(r.chargeableWeightKg) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">Row</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Route Lane</th>
                  <th className="py-3 px-4">Matched Carrier</th>
                  <th className="py-3 px-4">Chargeable Wt</th>
                  <th className="py-3 px-4 text-right">Est. Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} className={r.valid ? '' : 'bg-red-50/40'}>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">#{r.rowNumber}</td>
                    <td className="py-3 px-4">
                      {r.valid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      ) : (
                        <div className="text-xs text-red-700 space-y-0.5">
                          {r.errors.map((er, i) => (
                            <p key={i}>{er}</p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">{r.routeLabel || '—'}</td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-900">
                      {r.transporterName || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700">
                      {r.chargeableWeightKg !== undefined ? formatWeight(r.chargeableWeightKg) : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-right text-slate-900">
                      {r.estimatedAmount !== undefined ? formatINR(r.estimatedAmount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Batch Confirmation & Combined LR Download */}
      {createdResult && (
        <div className="bg-white border border-emerald-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Batch {createdResult.batchId} Confirmed</span>
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                {createdResult.createdCount} shipment(s) booked · Total Charged:{' '}
                <strong className="font-mono">{formatINR(createdResult.totalCharged)}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={downloadingBundle}
                onClick={handleDownloadCombinedLr}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                <span>
                  {downloadingBundle
                    ? 'Generating Bundle...'
                    : `Download All ${createdResult.createdCount} LRs (Single PDF)`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/seller/shipments')}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                View My Shipments
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {createdResult.bookings.map((b) => (
              <div
                key={b._id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs bg-white"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-blue-700">{b.lrNumber}</span>
                  <span className="text-slate-500 font-mono">{b.bookingId}</span>
                  <span className="text-slate-700">
                    {b.origin.city} → {b.destination.city}
                  </span>
                </div>
                <span className="font-mono font-semibold text-slate-900">
                  {formatINR(b.finalAmount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
