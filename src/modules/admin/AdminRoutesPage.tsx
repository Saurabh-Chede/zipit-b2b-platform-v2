import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  History,
  PauseCircle,
  Pencil,
  Plus,
  Route as RouteIcon,
  Search,
  Trash2,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  EntityStatus,
  type IntegratedRouteRate,
  type PaginatedResponse,
  type RouteAuditLogEntry,
  type Transporter,
} from '../../types/index.ts';

interface MasterRouteFormState {
  transporterId: string;
  originCity: string;
  originPincode: string;
  destinationCity: string;
  destinationPincode: string;
  distanceKm: string;
  ratePerKg: string;
  minimumFreight: string;
  additionalCharges: string;
  rtoCharges: string;
  volumetricDivisor: string;
  gstApplicable: boolean;
  gstRatePercent: string;
  estimatedDeliveryTime: string;
  isActive: boolean;
}

const EMPTY_FORM: MasterRouteFormState = {
  transporterId: '',
  originCity: '',
  originPincode: '',
  destinationCity: '',
  destinationPincode: '',
  distanceKm: '',
  ratePerKg: '12',
  minimumFreight: '500',
  additionalCharges: '100',
  rtoCharges: '350',
  volumetricDivisor: '5000',
  gstApplicable: true,
  gstRatePercent: '18',
  estimatedDeliveryTime: '18-24 Hours',
  isActive: true,
};

export function AdminRoutesPage() {
  const { showToast } = useToast();

  const [routes, setRoutes] = useState<IntegratedRouteRate[]>([]);
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transporterFilter, setTransporterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | EntityStatus>('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<IntegratedRouteRate | null>(null);
  const [form, setForm] = useState<MasterRouteFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<IntegratedRouteRate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [auditTarget, setAuditTarget] = useState<IntegratedRouteRate | null>(null);
  const [auditLogs, setAuditLogs] = useState<RouteAuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ success: boolean; data: PaginatedResponse<Transporter> }>('/transporters', {
        params: { limit: 100 },
      })
      .then((res) => setTransporters(res.data.data.items))
      .catch(() => {});
  }, []);

  const loadMasterRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: PaginatedResponse<IntegratedRouteRate>;
      }>('/routes/master', {
        params: {
          limit: 100,
          transporterId: transporterFilter || undefined,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
        },
      });
      setRoutes(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load master route & rate records.'));
    } finally {
      setLoading(false);
    }
  }, [transporterFilter, statusFilter, search]);

  useEffect(() => {
    loadMasterRoutes();
  }, [loadMasterRoutes]);

  const openCreateModal = () => {
    setEditingItem(null);
    setForm({
      ...EMPTY_FORM,
      transporterId: transporterFilter || transporters[0]?._id || '',
    });
    setModalOpen(true);
  };

  const openEditModal = (item: IntegratedRouteRate) => {
    setEditingItem(item);
    setForm({
      transporterId: item.transporterId,
      originCity: item.originCity,
      originPincode: item.originPincode,
      destinationCity: item.destinationCity,
      destinationPincode: item.destinationPincode,
      distanceKm: item.distanceKm ? String(item.distanceKm) : '',
      ratePerKg: String(item.ratePerKg),
      minimumFreight: String(item.minimumFreight),
      additionalCharges: String(item.additionalCharges),
      rtoCharges: String(item.rtoCharges),
      volumetricDivisor: String(item.volumetricDivisor),
      gstApplicable: item.gstApplicable,
      gstRatePercent: String(item.gstRatePercent),
      estimatedDeliveryTime: item.estimatedDeliveryTime,
      isActive: item.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.transporterId) {
      showToast('Select a transporter first.', 'error');
      return;
    }
    if (form.originPincode.trim() === form.destinationPincode.trim()) {
      showToast('Origin and destination pincodes must be different.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        transporterId: form.transporterId,
        originCity: form.originCity.trim(),
        originPincode: form.originPincode.trim(),
        destinationCity: form.destinationCity.trim(),
        destinationPincode: form.destinationPincode.trim(),
        distanceKm: form.distanceKm.trim() ? Number(form.distanceKm) : undefined,
        ratePerKg: Number(form.ratePerKg),
        minimumFreight: Number(form.minimumFreight),
        additionalCharges: Number(form.additionalCharges || 0),
        rtoCharges: Number(form.rtoCharges || 0),
        volumetricDivisor: Number(form.volumetricDivisor || 5000),
        gstApplicable: form.gstApplicable,
        gstRatePercent: form.gstApplicable ? Number(form.gstRatePercent || 0) : 0,
        estimatedDeliveryTime: form.estimatedDeliveryTime.trim(),
        isActive: form.isActive,
      };

      if (editingItem) {
        await apiClient.patch(`/routes/master/${editingItem.rateId}`, payload);
        showToast('Master route & rate changes synced to transporter.', 'success');
      } else {
        await apiClient.post('/routes/master', payload);
        showToast('Route & rate added for transporter.', 'success');
      }

      setModalOpen(false);
      await loadMasterRoutes();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save master route.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: IntegratedRouteRate) => {
    setTogglingId(item.rateId);
    try {
      await apiClient.patch(`/routes/master/${item.rateId}/status`, {
        isActive: !item.isActive,
      });
      showToast(
        `${item.transporterName}: ${item.originCity} → ${item.destinationCity} ${!item.isActive ? 'activated' : 'deactivated'}.`,
        'success'
      );
      await loadMasterRoutes();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update route status.'), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/routes/master/${deleteTarget.rateId}`);
      showToast('Route & rate removed from transporter master.', 'success');
      setDeleteTarget(null);
      await loadMasterRoutes();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to delete master route.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openAuditModal = async (item: IntegratedRouteRate) => {
    setAuditTarget(item);
    setAuditLogs([]);
    setLoadingAudit(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: RouteAuditLogEntry[] }>(
        `/routes/master/${item.rateId}/audit`
      );
      setAuditLogs(res.data.data);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load route audit history.'), 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Master Route &amp; Rate Control</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Inspect, add, edit, activate/deactivate, or audit any transporter&apos;s operating routes and freight tariffs
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Transporter Route</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-sm">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search city or pincode..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={transporterFilter}
          onChange={(e) => setTransporterFilter(e.target.value)}
          aria-label="Filter by transporter"
          className="w-full sm:w-auto flex-1 sm:flex-initial px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg sm:min-w-[210px]"
        >
          <option value="">All Transporters</option>
          {transporters.map((t) => (
            <option key={t._id} value={t._id}>
              {t.companyName}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | EntityStatus)}
          aria-label="Filter by status"
          className="w-full sm:w-auto flex-1 sm:flex-initial px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
        >
          <option value="">All Statuses</option>
          <option value={EntityStatus.ACTIVE}>Active</option>
          <option value={EntityStatus.INACTIVE}>Inactive</option>
        </select>
      </div>

      {/* Master List (Cards on Mobile/Tablet, Table on Desktop/Laptop) */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadMasterRoutes} />
      ) : routes.length === 0 ? (
        <EmptyState
          title="No transporter routes match"
          description="Select another transporter or create a new route & rate card."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4 md:hidden bg-slate-50/40">
            {routes.map((item) => (
              <div
                key={item.rateId}
                className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">
                      {item.transporterName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {item.transporterEmail || '—'}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <div className="flex items-start gap-2 pt-2 border-t border-slate-100">
                  <RouteIcon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium text-xs text-slate-900">
                      {item.originCity} → {item.destinationCity}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {item.originPincode} → {item.destinationPincode}
                      {item.distanceKm ? ` · ${item.distanceKm} km` : ''}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-[11px] text-slate-500">Rate / Min Freight</p>
                    <p className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatINR(item.ratePerKg)}/kg · Min {formatINR(item.minimumFreight)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Add&apos;l / RTO</p>
                    <p className="font-mono tabular-nums text-slate-700">
                      {formatINR(item.additionalCharges)} / {formatINR(item.rtoCharges)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Divisor &amp; GST</p>
                    <p className="font-mono tabular-nums text-slate-700">
                      {item.volumetricDivisor} ·{' '}
                      {item.gstApplicable ? `${item.gstRatePercent}%` : 'Exempt'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">ETA</p>
                    <p className="font-medium text-slate-800">{item.estimatedDeliveryTime}</p>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  Updated by{' '}
                  <span className="font-medium text-slate-700">
                    {item.lastModifiedByName || 'System'}
                    {item.lastModifiedByRole ? ` (${item.lastModifiedByRole})` : ''}
                  </span>
                  {item.lastModifiedAt ? ` · ${formatDateTime(item.lastModifiedAt)}` : ''}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    disabled={togglingId === item.rateId}
                    onClick={() => handleToggleStatus(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                  >
                    {item.isActive ? (
                      <>
                        <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Deactivate</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Activate</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuditModal(item)}
                    title="Audit Log"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Audit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    title="Delete route"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">Transporter</th>
                  <th className="py-3 px-4">Origin → Destination</th>
                  <th className="py-3 px-4 text-right">Rate / Kg</th>
                  <th className="py-3 px-4 text-right">Min Freight</th>
                  <th className="hidden xl:table-cell py-3 px-4 text-right">Add&apos;l / RTO</th>
                  <th className="hidden xl:table-cell py-3 px-4">Divisor &amp; GST</th>
                  <th className="hidden lg:table-cell py-3 px-4">ETA</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="hidden xl:table-cell py-3 px-4">Last Modified By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {routes.map((item) => (
                  <tr key={item.rateId} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 whitespace-nowrap">
                        {item.transporterName}
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-[180px]">
                        {item.transporterEmail || '—'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <RouteIcon className="w-4 h-4 text-blue-600 shrink-0" />
                        <div>
                          <p className="font-medium text-slate-900 whitespace-nowrap">
                            {item.originCity} → {item.destinationCity}
                          </p>
                          <p className="text-xs font-mono text-slate-500 tabular-nums">
                            {item.originPincode} → {item.destinationPincode}
                            {item.distanceKm ? ` · ${item.distanceKm} km` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                      {formatINR(item.ratePerKg)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatINR(item.minimumFreight)}
                    </td>
                    <td className="hidden xl:table-cell py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                      <div>Add&apos;l: {formatINR(item.additionalCharges)}</div>
                      <div>RTO: {formatINR(item.rtoCharges)}</div>
                    </td>
                    <td className="hidden xl:table-cell py-3.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                      <div className="font-mono tabular-nums">Div: {item.volumetricDivisor}</div>
                      <div>
                        GST:{' '}
                        <span className="font-mono tabular-nums font-medium">
                          {item.gstApplicable ? `${item.gstRatePercent}%` : 'Exempt'}
                        </span>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell py-3.5 px-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                      {item.estimatedDeliveryTime}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="hidden xl:table-cell py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                      <p className="font-medium text-slate-700">
                        {item.lastModifiedByName || 'System'}
                        {item.lastModifiedByRole ? ` (${item.lastModifiedByRole})` : ''}
                      </p>
                      <p className="font-mono tabular-nums text-[11px]">
                        {item.lastModifiedAt ? formatDateTime(item.lastModifiedAt) : '—'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          title="Edit route and rate"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          <Pencil className="w-3.5 h-3.5 text-blue-600" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          disabled={togglingId === item.rateId}
                          onClick={() => handleToggleStatus(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                        >
                          {item.isActive ? (
                            <>
                              <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Deactivate</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Activate</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAuditModal(item)}
                          title="Audit Log"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          title="Delete route"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unified Master Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingItem ? 'Master Edit: Route & Rate' : 'Master Add: Transporter Route & Rate'}
        subtitle="Admin updates reflect directly on the transporter's route and rate card with full audit attribution"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Transporter *</label>
            <select
              required
              disabled={Boolean(editingItem)}
              value={form.transporterId}
              onChange={(e) => setForm({ ...form, transporterId: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg disabled:bg-slate-100"
            >
              <option value="">Select transporter...</option>
              {transporters.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.companyName} ({t.email})
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Route Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Origin City *</label>
                <input
                  type="text"
                  required
                  value={form.originCity}
                  onChange={(e) => setForm({ ...form, originCity: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Origin Pincode *</label>
                <input
                  type="text"
                  required
                  pattern="\d{6}"
                  maxLength={6}
                  value={form.originPincode}
                  onChange={(e) =>
                    setForm({ ...form, originPincode: e.target.value.replace(/\D/g, '') })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Destination City *</label>
                <input
                  type="text"
                  required
                  value={form.destinationCity}
                  onChange={(e) => setForm({ ...form, destinationCity: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Destination Pincode *</label>
                <input
                  type="text"
                  required
                  pattern="\d{6}"
                  maxLength={6}
                  value={form.destinationPincode}
                  onChange={(e) =>
                    setForm({ ...form, destinationPincode: e.target.value.replace(/\D/g, '') })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Distance (km, Optional)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.distanceKm}
                  onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Master Rate Control
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Rate per KG (INR) *</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={form.ratePerKg}
                  onChange={(e) => setForm({ ...form, ratePerKg: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Minimum Freight (INR) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.minimumFreight}
                  onChange={(e) => setForm({ ...form, minimumFreight: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Additional Charges (INR) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.additionalCharges}
                  onChange={(e) => setForm({ ...form, additionalCharges: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">RTO Charges (INR) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.rtoCharges}
                  onChange={(e) => setForm({ ...form, rtoCharges: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Volumetric Divisor *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={form.volumetricDivisor}
                  onChange={(e) => setForm({ ...form, volumetricDivisor: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Estimated Delivery Time *</label>
                <input
                  type="text"
                  required
                  value={form.estimatedDeliveryTime}
                  onChange={(e) => setForm({ ...form, estimatedDeliveryTime: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <input
                  id="master-gst-app"
                  type="checkbox"
                  checked={form.gstApplicable}
                  onChange={(e) => setForm({ ...form, gstApplicable: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <label htmlFor="master-gst-app" className="text-sm font-medium text-slate-700">
                  GST Applicable
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">GST Percentage (%)</label>
                <input
                  type="number"
                  min="0"
                  max="28"
                  step="0.1"
                  disabled={!form.gstApplicable}
                  value={form.gstRatePercent}
                  onChange={(e) => setForm({ ...form, gstRatePercent: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums disabled:bg-slate-100"
                />
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <input
                  id="master-route-active"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <label htmlFor="master-route-active" className="text-sm font-medium text-slate-700">
                  Route Active
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={saving}
              onClick={() => setModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingItem ? 'Save Master Changes' : 'Create Route & Rate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Transporter Route"
        subtitle={
          deleteTarget
            ? `${deleteTarget.transporterName} · ${deleteTarget.originCity} → ${deleteTarget.destinationCity}`
            : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Removing this route &amp; rate configuration disables new quotes on this corridor for this transporter while preserving historical shipment records and writing an audit log entry.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Route'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit Log Modal */}
      <Modal
        open={Boolean(auditTarget)}
        onClose={() => setAuditTarget(null)}
        title="Master Route & Rate Audit History"
        subtitle={
          auditTarget
            ? `${auditTarget.transporterName} · ${auditTarget.originCity} (${auditTarget.originPincode}) → ${auditTarget.destinationCity} (${auditTarget.destinationPincode})`
            : undefined
        }
        maxWidthClass="max-w-xl"
      >
        {loadingAudit ? (
          <LoadingSkeleton rows={4} />
        ) : auditLogs.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No audit entries recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log._id} className="py-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {log.action} · {log.actorName} ({log.actorRole})
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>
                <p className="text-slate-600">{log.summary}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
