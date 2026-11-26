import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  EntityStatus,
  KycVerificationStatus,
  TransporterApprovalStatus,
  type PaginatedResponse,
  type Transporter,
} from '../../types/index.ts';

export function AdminTransportersPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<PaginatedResponse<Transporter> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [approvalFilter, setApprovalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transporter | null>(null);
  const [inspectTarget, setInspectTarget] = useState<Transporter | null>(null);
  const [approveTarget, setApproveTarget] = useState<Transporter | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Transporter | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [toggleTarget, setToggleTarget] = useState<Transporter | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [address, setAddress] = useState('');
  const [serviceAreasText, setServiceAreasText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Transporter> }>(
        '/transporters',
        {
          params: {
            page,
            limit: 15,
            approvalStatus: approvalFilter || undefined,
            search: search.trim() || undefined,
          },
        }
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load transporters.'));
    } finally {
      setLoading(false);
    }
  }, [page, approvalFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = () => {
    setEditing(null);
    setCompanyName('');
    setContactPerson('');
    setEmail('');
    setPassword('');
    setPhone('');
    setGstNumber('');
    setAddress('');
    setServiceAreasText('Pune:411026, Mumbai:400013');
    setModalOpen(true);
  };

  const openEditModal = (t: Transporter) => {
    setEditing(t);
    setCompanyName(t.companyName);
    setContactPerson(t.contactPerson);
    setEmail(t.email);
    setPassword('');
    setPhone(t.phone);
    setGstNumber(t.gstNumber);
    setAddress(t.address);
    setServiceAreasText(t.serviceAreas.map((sa) => `${sa.city}:${sa.pincode}`).join(', '));
    setModalOpen(true);
  };

  const parseServiceAreas = (text: string) =>
    text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((pair) => {
        const [city, pincode] = pair.split(':').map((s) => s.trim());
        return { city: city || '', pincode: pincode || '' };
      });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const serviceAreas = parseServiceAreas(serviceAreasText);
      if (editing) {
        await apiClient.patch(`/transporters/${editing._id}`, {
          companyName,
          contactPerson,
          phone,
          address,
          serviceAreas,
          newPassword: password.trim() ? password : undefined,
        });
        showToast('Transporter updated.', 'success');
      } else {
        await apiClient.post('/transporters', {
          companyName,
          contactPerson,
          email,
          password,
          phone,
          gstNumber: gstNumber.toUpperCase(),
          address,
          serviceAreas,
        });
        showToast('Transporter created and credentials assigned.', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save transporter.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSaving(true);
    try {
      await apiClient.patch(`/transporters/${approveTarget._id}/approve`);
      showToast(`${approveTarget.companyName} approved and activated.`, 'success');
      setApproveTarget(null);
      setInspectTarget(null);
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to approve transporter.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await apiClient.patch(`/transporters/${rejectTarget._id}/reject`, {
        rejectionReason: rejectionReason.trim(),
      });
      showToast(`${rejectTarget.companyName} application rejected.`, 'info');
      setRejectTarget(null);
      setInspectTarget(null);
      setRejectionReason('');
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to reject transporter.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!toggleTarget) return;
    setSaving(true);
    try {
      const nextStatus =
        toggleTarget.status === EntityStatus.ACTIVE ? EntityStatus.INACTIVE : EntityStatus.ACTIVE;
      await apiClient.patch(`/transporters/${toggleTarget._id}`, { status: nextStatus });
      showToast(`Transporter marked ${nextStatus}.`, 'success');
      setToggleTarget(null);
      await load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update status.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<Transporter>[] = [
    {
      key: 'company',
      header: 'Company',
      render: (t) => (
        <div>
          <p className="font-medium text-slate-900">{t.companyName}</p>
          <p className="text-xs text-slate-500">
            {t.contactPerson} · {t.email}
          </p>
        </div>
      ),
    },
    {
      key: 'gst',
      header: 'GSTIN',
      hideBelow: 'lg',
      render: (t) => <span className="font-mono text-xs text-slate-800">{t.gstNumber}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      hideBelow: 'lg',
      render: (t) => <span className="font-mono tabular-nums">{t.phone}</span>,
    },
    {
      key: 'areas',
      header: 'Service Areas',
      hideBelow: 'xl',
      render: (t) => (
        <span className="text-xs font-mono text-slate-600">
          {t.serviceAreas
            .slice(0, 3)
            .map((sa) => `${sa.city} (${sa.pincode})`)
            .join(', ')}
          {t.serviceAreas.length > 3 ? ` +${t.serviceAreas.length - 3}` : ''}
        </span>
      ),
    },
    {
      key: 'approval',
      header: 'Approval',
      hideBelow: 'xl',
      render: (t) => (
        <StatusBadge status={t.approvalStatus || TransporterApprovalStatus.APPROVED} />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (t) => {
        const approval = t.approvalStatus || TransporterApprovalStatus.APPROVED;
        return (
          <div
            className="flex items-center justify-end gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setInspectTarget(t)}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
            >
              View
            </button>
            {approval === TransporterApprovalStatus.PENDING ? (
              <>
                <button
                  type="button"
                  onClick={() => setApproveTarget(t)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setRejectTarget(t)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 whitespace-nowrap"
                >
                  Reject
                </button>
              </>
            ) : approval === TransporterApprovalStatus.REJECTED ? (
              <button
                type="button"
                onClick={() => setApproveTarget(t)}
                className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 whitespace-nowrap"
              >
                Approve
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openEditModal(t)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setToggleTarget(t)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap ${
                    t.status === EntityStatus.ACTIVE
                      ? 'text-red-700 border-red-200 bg-red-50 hover:bg-red-100'
                      : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  {t.status === EntityStatus.ACTIVE ? 'Deactivate' : 'Activate'}
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Transporter Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review carrier registrations, approve fleet partners, and manage service areas
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Transporter
        </button>
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
            placeholder="Search company, GSTIN, city..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none w-full sm:w-auto">
          {[
            '',
            TransporterApprovalStatus.PENDING,
            TransporterApprovalStatus.APPROVED,
            TransporterApprovalStatus.REJECTED,
          ].map((st) => (
            <button
              key={st || 'ALL'}
              type="button"
              onClick={() => {
                setPage(1);
                setApprovalFilter(st);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                approvalFilter === st
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={load} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No transporters found"
          description="No carrier accounts match the selected filter, or add a transporter directly."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(t) => t._id}
          onRowClick={(t) => setInspectTarget(t)}
          renderMobileCard={(t) => {
            const approval = t.approvalStatus || TransporterApprovalStatus.APPROVED;
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{t.companyName}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {t.contactPerson} · {t.email}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-100">
                  <span className="font-mono text-slate-700">{t.gstNumber}</span>
                  <span className="font-mono tabular-nums text-slate-600">{t.phone}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-slate-600 truncate max-w-[200px]">
                    {t.serviceAreas
                      .slice(0, 2)
                      .map((sa) => `${sa.city} (${sa.pincode})`)
                      .join(', ')}
                    {t.serviceAreas.length > 2 ? ` +${t.serviceAreas.length - 2}` : ''}
                  </span>
                  <StatusBadge status={approval} />
                </div>

                <div
                  className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setInspectTarget(t)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    View
                  </button>
                  {approval === TransporterApprovalStatus.PENDING ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setApproveTarget(t)}
                        className="px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectTarget(t)}
                        className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </>
                  ) : approval === TransporterApprovalStatus.REJECTED ? (
                    <button
                      type="button"
                      onClick={() => setApproveTarget(t)}
                      className="px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditModal(t)}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setToggleTarget(t)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border ${
                          t.status === EntityStatus.ACTIVE
                            ? 'text-red-700 border-red-200 bg-red-50 hover:bg-red-100'
                            : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                      >
                        {t.status === EntityStatus.ACTIVE ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }}
          pagination={{
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }}
        />
      )}

      {/* Inspect Carrier Application Modal */}
      <Modal
        open={Boolean(inspectTarget)}
        onClose={() => setInspectTarget(null)}
        title={inspectTarget?.companyName || 'Transporter Details'}
        subtitle={inspectTarget ? `GSTIN: ${inspectTarget.gstNumber}` : undefined}
      >
        {inspectTarget && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Approval:</span>
                <StatusBadge
                  status={inspectTarget.approvalStatus || TransporterApprovalStatus.APPROVED}
                />
                <StatusBadge status={inspectTarget.status} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">KYC:</span>
                <StatusBadge
                  status={inspectTarget.kyc?.status || KycVerificationStatus.NOT_SUBMITTED}
                />
                <Link
                  to="/admin/kyc"
                  onClick={() => setInspectTarget(null)}
                  className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                >
                  Open KYC Queue
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500">Contact Person</p>
                <p className="font-medium text-slate-900">{inspectTarget.contactPerson}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Dispatch Phone</p>
                <p className="font-mono tabular-nums text-slate-900">{inspectTarget.phone}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="text-slate-900 break-words">{inspectTarget.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Registered On</p>
                <p className="font-mono tabular-nums text-slate-700 text-xs">
                  {formatDateTime(inspectTarget.createdAt)}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Head Office / Hub Address</p>
                <p className="text-slate-900">{inspectTarget.address}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Service Areas</p>
                <p className="text-xs font-mono text-slate-800 mt-0.5">
                  {inspectTarget.serviceAreas
                    .map((sa) => `${sa.city} (${sa.pincode})`)
                    .join(', ')}
                </p>
              </div>
              {inspectTarget.rejectionReason && (
                <div className="sm:col-span-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs">
                  <strong>Rejection Reason:</strong> {inspectTarget.rejectionReason}
                </div>
              )}
            </div>

            {(inspectTarget.approvalStatus || TransporterApprovalStatus.APPROVED) ===
              TransporterApprovalStatus.PENDING && (
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectTarget(inspectTarget)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setApproveTarget(inspectTarget)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  Approve Transporter
                </button>
              </div>
            )}

            {inspectTarget.approvalStatus === TransporterApprovalStatus.REJECTED && (
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApproveTarget(inspectTarget)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  Approve Transporter
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Transporter' : 'Add Transporter'}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Company Name</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contact Person</label>
            <input
              type="text"
              required
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Login Email</label>
            <input
              type="email"
              required
              disabled={Boolean(editing)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {editing ? 'New Password (Optional)' : 'Login Password'}
            </label>
            <input
              type="password"
              required={!editing}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editing ? 'Leave blank to keep current' : 'Min 8 characters'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone (10-digit)</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">GSTIN</label>
            <input
              type="text"
              required
              disabled={Boolean(editing)}
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase disabled:bg-slate-50"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Hub Address</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Service Areas (Comma-separated City:Pincode)
            </label>
            <input
              type="text"
              required
              value={serviceAreasText}
              onChange={(e) => setServiceAreasText(e.target.value)}
              placeholder="Pune:411026, Mumbai:400013"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
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
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Transporter'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApprove}
        title="Approve B2B Transporter"
        description={`Approve ${approveTarget?.companyName}? Once approved and active, this carrier can configure routes, appear in seller rate quotes, and create bookings.`}
        confirmLabel="Approve Transporter"
        loading={saving}
      />

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Transporter Application"
        subtitle={rejectTarget?.companyName}
      >
        <form onSubmit={handleReject} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Rejection Reason (Shown to Transporter)
            </label>
            <textarea
              required
              minLength={5}
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why the application was declined (e.g. invalid GSTIN or unverified hub address)"
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
              disabled={saving || rejectionReason.trim().length < 5}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleStatus}
        title={
          toggleTarget?.status === EntityStatus.ACTIVE ? 'Deactivate Transporter' : 'Activate Transporter'
        }
        description={`Change status for ${toggleTarget?.companyName}? Deactivated transporters cannot sign in or receive new quotes.`}
        confirmLabel="Update Status"
        danger={toggleTarget?.status === EntityStatus.ACTIVE}
        loading={saving}
      />
    </div>
  );
}
