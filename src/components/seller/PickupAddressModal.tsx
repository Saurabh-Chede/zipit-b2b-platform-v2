import React, { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { Modal } from '../ui/Modal.tsx';
import type { SavedAddress } from '../../types/index.ts';

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

interface PickupAddressModalProps {
  open: boolean;
  onClose: () => void;
  editingAddress?: SavedAddress | null;
  hasExistingPickupAddresses: boolean;
  onSaved: (addresses: SavedAddress[], savedId?: string) => void;
}

export function PickupAddressModal({
  open,
  onClose,
  editingAddress,
  hasExistingPickupAddresses,
  onSaved,
}: PickupAddressModalProps) {
  const { showToast } = useToast();
  const isEditing = Boolean(editingAddress);

  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstin, setGstin] = useState('');
  const [label, setLabel] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (editingAddress) {
      setCompanyName(editingAddress.companyName || editingAddress.name || '');
      setContactPerson(editingAddress.contactPerson || editingAddress.name || '');
      setPhone(editingAddress.phone || '');
      setAddress(editingAddress.address || '');
      setState(editingAddress.state || '');
      setCity(editingAddress.city || '');
      setPincode(editingAddress.pincode || '');
      setGstin(editingAddress.gstin || '');
      setLabel(editingAddress.label || '');
      setIsPrimary(Boolean(editingAddress.isDefault));
    } else {
      setCompanyName('');
      setContactPerson('');
      setPhone('');
      setAddress('');
      setState('');
      setCity('');
      setPincode('');
      setGstin('');
      setLabel('');
      setIsPrimary(!hasExistingPickupAddresses);
    }
  }, [open, editingAddress, hasExistingPickupAddresses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanCompany = companyName.trim();
    const cleanContact = contactPerson.trim();
    const cleanPhone = phone.trim();
    const cleanAddress = address.trim();
    const cleanState = state.trim();
    const cleanCity = city.trim();
    const cleanPin = pincode.trim();
    const cleanGstin = gstin.trim().toUpperCase();
    const cleanLabel = label.trim();

    if (cleanCompany.length < 2) {
      setFormError('Company / Business Name must be at least 2 characters.');
      return;
    }
    if (cleanContact.length < 2) {
      setFormError('Contact Person Name must be at least 2 characters.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setFormError('Mobile number must be a valid 10-digit Indian mobile number.');
      return;
    }
    if (cleanAddress.length < 5) {
      setFormError('Complete pickup address must be at least 5 characters.');
      return;
    }
    if (cleanState.length < 2) {
      setFormError('Please select or enter a valid State.');
      return;
    }
    if (cleanCity.length < 2) {
      setFormError('City is required.');
      return;
    }
    if (!/^\d{6}$/.test(cleanPin)) {
      setFormError('Pincode must be a 6-digit number.');
      return;
    }
    if (cleanGstin && !GSTIN_REGEX.test(cleanGstin)) {
      setFormError('GSTIN must be a valid 15-character Indian GST number.');
      return;
    }

    const payload = {
      label: cleanLabel || cleanCompany,
      addressType: editingAddress?.addressType === 'BOTH' ? 'BOTH' : 'PICKUP',
      companyName: cleanCompany,
      contactPerson: cleanContact,
      name: cleanCompany,
      phone: cleanPhone,
      address: cleanAddress,
      state: cleanState,
      city: cleanCity,
      pincode: cleanPin,
      gstin: cleanGstin || undefined,
      isPrimary: !isEditing && !hasExistingPickupAddresses ? true : isPrimary,
      isDefault: !isEditing && !hasExistingPickupAddresses ? true : isPrimary,
    };

    setSaving(true);
    try {
      const res = isEditing
        ? await apiClient.put<{ success: boolean; data: SavedAddress[] }>(
            `/sellers/me/addresses/${editingAddress!._id}`,
            payload
          )
        : await apiClient.post<{ success: boolean; data: SavedAddress[] }>(
            '/sellers/me/addresses',
            payload
          );

      const updatedList = res.data.data || [];
      const savedId = isEditing
        ? editingAddress!._id
        : updatedList[updatedList.length - 1]?._id;

      showToast(
        isEditing ? 'Pickup address updated.' : 'Pickup address added successfully.',
        'success'
      );
      onSaved(updatedList, savedId);
      onClose();
    } catch (err) {
      const msg = extractErrorMessage(err, 'Failed to save pickup address.');
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const stateOptions = state && !INDIAN_STATES.includes(state)
    ? [state, ...INDIAN_STATES]
    : INDIAN_STATES;

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={isEditing ? 'Edit Pickup Address' : 'Add Pickup Address'}
      subtitle={
        !isEditing && !hasExistingPickupAddresses
          ? 'Your first pickup address will automatically become your Primary pickup location'
          : 'Manage warehouse or factory dispatch points for quick booking pre-fill'
      }
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {formError && (
          <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {formError}
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Company / Business Name *
          </label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={160}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g., Apex Industrial Hardware Pvt Ltd"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Contact Person Name *
          </label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={120}
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            placeholder="e.g., Rajesh Kulkarni"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Mobile Number *
          </label>
          <input
            type="tel"
            required
            pattern="[6-9]\d{9}"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="9823011223"
            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Complete Address *
          </label>
          <textarea
            required
            minLength={5}
            maxLength={400}
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Plot No., MIDC / Industrial Estate, Landmark"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">State *</label>
          <select
            required
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          >
            <option value="">Select state...</option>
            {stateOptions.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">City *</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g., Pune"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Pincode *</label>
          <input
            type="text"
            required
            pattern="\d{6}"
            maxLength={6}
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
            placeholder="411026"
            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            GSTIN (Optional)
          </label>
          <input
            type="text"
            maxLength={15}
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
            placeholder="27AABCA4521K1Z5"
            className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Nickname / Warehouse Label (Optional)
          </label>
          <input
            type="text"
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Bhosari Plant / Chakan Dock 2 (defaults to Company Name)"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
          />
        </div>

        <div className="sm:col-span-2 flex items-center gap-2 pt-1">
          <input
            id="pickup-addr-primary"
            type="checkbox"
            checked={!isEditing && !hasExistingPickupAddresses ? true : isPrimary}
            disabled={!isEditing && !hasExistingPickupAddresses}
            onChange={(e) => setIsPrimary(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600"
          />
          <label htmlFor="pickup-addr-primary" className="text-xs text-slate-700">
            {!isEditing && !hasExistingPickupAddresses
              ? 'Primary pickup address (automatically set for your first address)'
              : 'Set as Primary pickup address (automatically changes current Primary to Secondary)'}
          </label>
        </div>

        <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Pickup Address'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
