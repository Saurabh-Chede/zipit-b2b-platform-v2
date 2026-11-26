import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileDown, Pencil, Plus, Upload } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDate, formatINR } from '../../utils/formatters.ts';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  EntityStatus,
  type PaginatedResponse,
  type TransportRate,
  type TransportRoute,
  type Transporter,
} from '../../types/index.ts';

export function AdminRatesPage() {
  const { showToast } = useToast();
  const [rates, setRates] = useState<TransportRate[]>([]);
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<TransportRate | null>(null);
  const [saving, setSaving] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [importFileName, setImportFileName] = useState('');

  const [transporterId, setTransporterId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [minimumFreight, setMinimumFreight] = useState('500');
  const [ratePerKg, setRatePerKg] = useState('12');
  const [volumetricDivisor, setVolumetricDivisor] = useState('5000');
  const [rtoCharges, setRtoCharges] = useState('350');
  const [additionalCharges, setAdditionalCharges] = useState('100');
  const [gstApplicable, setGstApplicable] = useState(true);
  const [gstRatePercent, setGstRatePercent] = useState('18');
  const [estimatedDeliveryTime, setEstimatedDeliveryTime] = useState('18-24 Hours');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ratesRes, transRes, routesRes] = await Promise.all([
        apiClient.get<{ success: boolean; data: PaginatedResponse<TransportRate> }>('/rates'),
        apiClient.get<{ success: boolean; data: PaginatedResponse<Transporter> }>('/transporters'),
        apiClient.get<{ success: boolean; data: PaginatedResponse<TransportRoute> }>('/routes'),
      ]);
      setRates(ratesRes.data.data.items);
      setTransporters(transRes.data.data.items);
      setRoutes(routesRes.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load rate matrix.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreateModal = () => {
    setEditingRate(null);
    setTransporterId('');
    setRouteId('');
    setMinimumFreight('500');
    setRatePerKg('12');
    setVolumetricDivisor('5000');
    setRtoCharges('350');
    setAdditionalCharges('100');
    setGstApplicable(true);
    setGstRatePercent('18');
    setEstimatedDeliveryTime('18-24 Hours');
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setEffectiveTo('');
    setModalOpen(true);
  };

  const openEditModal = (rate: TransportRate) => {
    setEditingRate(rate);
    setTransporterId(
      typeof rate.transporterId === 'string' ? rate.transporterId : rate.transporterId._id
    );
    setRouteId(typeof rate.routeId === 'string' ? rate.routeId : rate.routeId._id);
    setMinimumFreight(String(rate.minimumFreight));
    setRatePerKg(String(rate.ratePerKg));
    setVolumetricDivisor(String(rate.volumetricDivisor));
    setRtoCharges(String(rate.rtoCharges));
    setAdditionalCharges(String(rate.additionalCharges));
    setGstApplicable(rate.gstApplicable);
    setGstRatePercent(String(rate.gstRatePercent));
    setEstimatedDeliveryTime(rate.estimatedDeliveryTime);
    setEffectiveFrom(rate.effectiveFrom ? rate.effectiveFrom.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEffectiveTo(rate.effectiveTo ? rate.effectiveTo.slice(0, 10) : '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        transporterId,
        routeId,
        minimumFreight: Number(minimumFreight),
        ratePerKg: Number(ratePerKg),
        volumetricDivisor: Number(volumetricDivisor),
        rtoCharges: Number(rtoCharges),
        additionalCharges: Number(additionalCharges),
        gstApplicable,
        gstRatePercent: gstApplicable ? Number(gstRatePercent) : 0,
        estimatedDeliveryTime,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      };
      if (editingRate) {
        await apiClient.patch(`/rates/${editingRate._id}`, payload);
        showToast('Rate card updated successfully.', 'success');
      } else {
        await apiClient.post('/rates', { ...payload, isActive: true });
        showToast('Freight rate configured successfully.', 'success');
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save rate.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRate = async (rate: TransportRate) => {
    try {
      await apiClient.patch(`/rates/${rate._id}`, { isActive: !rate.isActive });
      showToast(`Rate ${rate.isActive ? 'deactivated' : 'activated'}.`, 'success');
      await loadAll();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update rate.'), 'error');
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await apiClient.get('/rates/export', { responseType: 'blob' });
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'zipit-rate-cards.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Exported active & archived rate cards CSV.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to export rate matrix CSV.'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadSampleRateCsv = () => {
    const firstTransporter = transporters[0];
    const firstRoute = routes[0];
    const headers = [
      'transporterEmail',
      'originPincode',
      'destinationPincode',
      'minimumFreight',
      'ratePerKg',
      'volumetricDivisor',
      'rtoCharges',
      'additionalCharges',
      'gstApplicable',
      'gstRatePercent',
      'estimatedDeliveryTime',
      'isActive',
    ];
    const sample = [
      firstTransporter?.email || 'dispatch@carrier.in',
      firstRoute?.originPincode || '400001',
      firstRoute?.destinationPincode || '411001',
      '500',
      '12',
      '5000',
      '350',
      '100',
      'true',
      '18',
      '18-24 Hours',
      'true',
    ];
    const csv = `${headers.join(',')}\n${sample.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zipit-rates-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleRateFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.SheetNames[0];
      if (!sheet) return;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: '' });
      setImportRows(rows);
    } catch {
      showToast('Failed to read CSV / Excel file.', 'error');
    }
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (importRows.length === 0) {
      showToast('Select a CSV or Excel file with at least 1 row.', 'error');
      return;
    }
    setImporting(true);
    try {
      const normalizedRows = importRows.map((row) => ({
        ...row,
        originPincode: row.originPincode !== undefined ? String(row.originPincode) : undefined,
        destinationPincode:
          row.destinationPincode !== undefined ? String(row.destinationPincode) : undefined,
        gstApplicable:
          typeof row.gstApplicable === 'string'
            ? row.gstApplicable.toLowerCase() !== 'false'
            : Boolean(row.gstApplicable ?? true),
        isActive:
          typeof row.isActive === 'string'
            ? row.isActive.toLowerCase() !== 'false'
            : Boolean(row.isActive ?? true),
      }));
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/rates/bulk-import',
        { rows: normalizedRows }
      );
      showToast(res.data.message || 'Rate matrix imported.', 'success');
      setImportModalOpen(false);
      setImportRows([]);
      setImportFileName('');
      await loadAll();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Bulk import failed.'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const columns: ColumnDef<TransportRate>[] = [
    {
      key: 'transporter',
      header: 'Transporter',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900">
            {(r.transporterId as Transporter)?.companyName || '—'}
          </p>
          {r.isSampleData && <span className="text-xs text-slate-500">Sample Data</span>}
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (r) => {
        const rt = r.routeId as TransportRoute;
        return rt ? `${rt.originCity} → ${rt.destinationCity}` : '—';
      },
    },
    {
      key: 'rate',
      header: 'Rate / Kg',
      align: 'right',
      render: (r) => <span className="font-mono tabular-nums">{formatINR(r.ratePerKg)}</span>,
    },
    {
      key: 'min',
      header: 'Min Freight',
      align: 'right',
      hideBelow: 'xl',
      render: (r) => <span className="font-mono tabular-nums">{formatINR(r.minimumFreight)}</span>,
    },
    {
      key: 'rto',
      header: 'RTO',
      align: 'right',
      hideBelow: 'lg',
      render: (r) => <span className="font-mono tabular-nums">{formatINR(r.rtoCharges)}</span>,
    },
    {
      key: 'eta',
      header: 'ETA & Effective',
      hideBelow: 'lg',
      render: (r) => (
        <div className="text-xs">
          <p className="text-slate-900 font-medium">{r.estimatedDeliveryTime}</p>
          <p className="text-slate-500 font-mono tabular-nums">From {formatDate(r.effectiveFrom)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <StatusBadge status={r.isActive ? EntityStatus.ACTIVE : EntityStatus.INACTIVE} />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal(r)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <Pencil className="w-3 h-3 text-blue-600" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => handleToggleRate(r)}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            {r.isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Rate Matrix Configuration</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Define per-kg tariffs, volumetric divisors, RTO charges, and GST per transporter and route
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <FileDown className="w-4 h-4 text-slate-600" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Bulk Import</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Rate Card</span>
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadAll} />
      ) : rates.length === 0 ? (
        <EmptyState title="No rates configured" description="Create a transporter rate card to enable booking quotes." />
      ) : (
        <DataTable
          columns={columns}
          rows={rates}
          rowKey={(r) => r._id}
          renderMobileCard={(r) => {
            const rt = r.routeId as TransportRoute;
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">
                      {(r.transporterId as Transporter)?.companyName || '—'}
                    </p>
                    <p className="text-xs text-slate-600 truncate mt-0.5">
                      {rt ? `${rt.originCity} → ${rt.destinationCity}` : '—'}
                    </p>
                  </div>
                  <StatusBadge status={r.isActive ? EntityStatus.ACTIVE : EntityStatus.INACTIVE} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-[11px] text-slate-500">Rate / Min Freight</p>
                    <p className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatINR(r.ratePerKg)}/kg · Min {formatINR(r.minimumFreight)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">RTO Charge</p>
                    <p className="font-mono tabular-nums text-slate-800">{formatINR(r.rtoCharges)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">ETA</p>
                    <p className="font-medium text-slate-800">{r.estimatedDeliveryTime}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Effective From</p>
                    <p className="font-mono tabular-nums text-slate-600">{formatDate(r.effectiveFrom)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openEditModal(r)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    <Pencil className="w-3 h-3 text-blue-600" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleRate(r)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    {r.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            );
          }}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRate ? 'Edit Transporter Rate' : 'Configure Transporter Rate'}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Transporter</label>
            <select
              required
              value={transporterId}
              onChange={(e) => setTransporterId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="">Select transporter...</option>
              {transporters.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.companyName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Route</label>
            <select
              required
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="">Select route...</option>
              {routes.map((rt) => (
                <option key={rt._id} value={rt._id}>
                  {rt.originCity} ({rt.originPincode}) → {rt.destinationCity} ({rt.destinationPincode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Minimum Freight (INR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={minimumFreight}
              onChange={(e) => setMinimumFreight(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rate Per Kg (INR)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={ratePerKg}
              onChange={(e) => setRatePerKg(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Volumetric Divisor</label>
            <input
              type="number"
              min="1"
              required
              value={volumetricDivisor}
              onChange={(e) => setVolumetricDivisor(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">RTO Charges (INR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={rtoCharges}
              onChange={(e) => setRtoCharges(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Additional Charges (INR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={additionalCharges}
              onChange={(e) => setAdditionalCharges(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Estimated Delivery Time</label>
            <input
              type="text"
              required
              value={estimatedDeliveryTime}
              onChange={(e) => setEstimatedDeliveryTime(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex items-center gap-3 pt-4">
            <input
              id="gst-app"
              type="checkbox"
              checked={gstApplicable}
              onChange={(e) => setGstApplicable(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <label htmlFor="gst-app" className="text-sm text-slate-700">
              GST Applicable
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">GST Rate (%)</label>
            <input
              type="number"
              min="0"
              max="28"
              disabled={!gstApplicable}
              value={gstRatePercent}
              onChange={(e) => setGstRatePercent(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Effective From</label>
            <input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Effective To (Optional)</label>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>

          <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Rate Card'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => !importing && setImportModalOpen(false)}
        title="Bulk Import Transporter Rate Cards"
        subtitle="Upload CSV or Excel (.xlsx/.xls) to create or update lane tariffs"
      >
        <form onSubmit={handleBulkImportSubmit} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <span>Match carriers by transporterId, transporterGst, or transporterEmail.</span>
            <button
              type="button"
              onClick={handleDownloadSampleRateCsv}
              className="font-semibold text-blue-600 hover:underline whitespace-nowrap"
            >
              Download Sample CSV
            </button>
          </div>
          <div>
            <input
              type="file"
              required
              accept=".csv,.xlsx,.xls"
              onChange={handleRateFileSelect}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50"
            />
            {importFileName && (
              <p className="text-xs text-slate-600 mt-2">
                Parsed <strong>{importRows.length}</strong> row(s) from {importFileName}.
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              disabled={importing}
              onClick={() => setImportModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importing || importRows.length === 0}
              className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${importRows.length || ''} Rate Row(s)`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
