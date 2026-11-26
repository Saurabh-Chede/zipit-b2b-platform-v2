import React, { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Edit3, MapPin, Phone, Plus, Star, Trash2, User } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { ConfirmDialog } from '../ui/Modal.tsx';
import { PickupAddressModal } from './PickupAddressModal.tsx';
import type { SavedAddress } from '../../types/index.ts';

interface PickupAddressesSectionProps {
  addresses: SavedAddress[];
  onAddressesChange: (next: SavedAddress[]) => void;
}

export function PickupAddressesSection({
  addresses,
  onAddressesChange,
}: PickupAddressesSectionProps) {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedAddress | null>(null);
  const [deleting, setDeleting] = useState(false);

  const pickupAddresses = useMemo(() => {
    const filtered = addresses.filter(
      (a) => a.addressType === 'PICKUP' || a.addressType === 'BOTH'
    );
    return [...filtered].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }, [addresses]);

  const handleOpenAdd = () => {
    setEditingAddress(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setModalOpen(true);
  };

  const handleMarkPrimary = async (addr: SavedAddress) => {
    setPromotingId(addr._id);
    try {
      const res = await apiClient.patch<{ success: boolean; data: SavedAddress[] }>(
        `/sellers/me/addresses/${addr._id}/primary`
      );
      onAddressesChange(res.data.data || []);
      showToast(`${addr.companyName || addr.name} is now your Primary pickup address.`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update primary pickup address.'), 'error');
    } finally {
      setPromotingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiClient.delete<{ success: boolean; data: SavedAddress[] }>(
        `/sellers/me/addresses/${deleteTarget._id}`
      );
      onAddressesChange(res.data.data || []);
      showToast('Pickup address deleted.', 'info');
      setDeleteTarget(null);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to delete pickup address.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pickup Addresses</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Your Primary pickup address auto-fills every new booking. Switch between Primary and Secondary locations anytime.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Pickup Address</span>
        </button>
      </div>

      {pickupAddresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center">
          <MapPin className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800">No pickup addresses saved yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Add your first warehouse, factory, or dispatch office. The first address you add automatically becomes your Primary pickup address.
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Pickup Address</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pickupAddresses.map((addr) => {
            const isPrimary = Boolean(addr.isDefault);
            const displayCompany = addr.companyName || addr.name;
            const displayContact = addr.contactPerson || addr.name;

            return (
              <div
                key={addr._id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${
                  isPrimary
                    ? 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-100'
                    : 'border-slate-200 bg-slate-50/40'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {addr.label || displayCompany}
                        </span>
                        {isPrimary ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-blue-600 text-white rounded">
                            <Star className="w-3 h-3 fill-current" />
                            Primary
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold bg-slate-200 text-slate-700 rounded">
                            Secondary
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-700">
                    <p className="flex items-center gap-1.5 font-medium text-slate-900">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{displayCompany}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{displayContact}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{addr.phone}</span>
                      </span>
                    </p>
                    <p className="text-slate-600 leading-relaxed pt-0.5">
                      {addr.address}
                    </p>
                    <p className="font-medium text-slate-800">
                      {addr.city}
                      {addr.state ? `, ${addr.state}` : ''} —{' '}
                      <span className="font-mono tabular-nums">{addr.pincode}</span>
                    </p>
                    {addr.gstin && (
                      <p className="text-[11px] font-mono text-slate-500">
                        GSTIN: {addr.gstin}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/70">
                  <div>
                    {!isPrimary ? (
                      <button
                        type="button"
                        disabled={promotingId === addr._id}
                        onClick={() => handleMarkPrimary(addr)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{promotingId === addr._id ? 'Updating...' : 'Mark as Primary'}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-blue-700">
                        Auto-selected on new bookings
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(addr)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(addr)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PickupAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editingAddress={editingAddress}
        hasExistingPickupAddresses={pickupAddresses.length > 0}
        onSaved={(updated) => onAddressesChange(updated)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        danger
        title="Delete Pickup Address"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.label || deleteTarget.companyName || deleteTarget.name}" (${deleteTarget.city} - ${deleteTarget.pincode}) from your saved pickup addresses? Historical bookings retain their original snapshot, while addresses linked to active shipments cannot be deleted.`
            : ''
        }
        confirmLabel="Delete Address"
      />
    </section>
  );
}
