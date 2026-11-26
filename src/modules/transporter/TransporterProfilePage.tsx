import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, LifeBuoy, MapPin, Save } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import { KycVerificationSection } from '../../components/shared/KycVerificationSection.tsx';
import { ChangePasswordCard } from '../../components/shared/ChangePasswordCard.tsx';
import { TransporterApprovalStatus, type Transporter } from '../../types/index.ts';

export function TransporterProfilePage() {
  const { refreshUser } = useAuth();
  const { showToast } = useToast();

  const [profile, setProfile] = useState<Transporter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: Transporter }>(
        '/transporter/profile'
      );
      const p = res.data.data;
      setProfile(p);
      setCompanyName(p.companyName);
      setContactPerson(p.contactPerson);
      setPhone(p.phone);
      setAddress(p.address);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load company profile.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiClient.patch<{ success: boolean; data: Transporter }>(
        '/transporter/profile',
        {
          companyName: companyName.trim(),
          contactPerson: contactPerson.trim(),
          phone: phone.trim(),
          address: address.trim(),
        }
      );
      setProfile(res.data.data);
      await refreshUser();
      showToast('Company profile updated successfully.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update company profile.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !profile) {
    return <ErrorBanner message={error || 'Profile not found'} onRetry={loadProfile} />;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Transporter Company Profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Carrier registration, dispatch contact details, and quick operational links
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {profile.approvalStatus && <StatusBadge status={profile.approvalStatus} />}
          <StatusBadge status={profile.status} />
        </div>
      </div>

      {profile.approvalStatus === TransporterApprovalStatus.PENDING && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Onboarding Verification in Progress</p>
            <p className="text-sm text-amber-800 mt-0.5">
              Please complete your KYC PAN, bank settlement details, and compliance documents below. Once verified and approved by an administrator, your carrier account becomes active for route rate publishing and bookings.
            </p>
          </div>
        </div>
      )}

      {profile.approvalStatus === TransporterApprovalStatus.REJECTED && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">Transporter Registration Rejected</p>
            <p className="text-sm text-red-800 mt-0.5">
              <strong>Rejection Reason:</strong>{' '}
              {profile.rejectionReason || 'Contact ZIPIT support for verification details.'}
            </p>
          </div>
        </div>
      )}

      {/* Verified Identity Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm shadow-sm">
        <div>
          <p className="text-xs text-slate-500">Registered GSTIN</p>
          <p className="font-mono font-medium text-slate-900 mt-0.5">{profile.gstNumber}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Account Email</p>
          <p className="text-slate-900 mt-0.5">{profile.email}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Onboarded On</p>
          <p className="font-mono tabular-nums text-slate-900 mt-0.5">
            {formatDateTime(profile.createdAt)}
          </p>
        </div>
      </div>

      {/* Editable Contact & HQ Form */}
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-5"
      >
        <div className="pb-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Carrier Details</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Updates reflect across seller rate quotes, LR consignee slips, and support tickets
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Company Name *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Primary Operations Contact *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Dispatch Phone (10 digits) *
            </label>
            <input
              type="tel"
              required
              maxLength={10}
              pattern="[6-9]\d{9}"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Configured Service Areas
            </label>
            <div className="px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <span className="font-mono tabular-nums text-slate-800">
                {profile.serviceAreas.length} active pincode{profile.serviceAreas.length === 1 ? '' : 's'}
              </span>
              <Link to="/transporter/service-areas" className="text-xs font-semibold text-blue-600 hover:underline">
                Manage
              </Link>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Head Office / Hub Address *
            </label>
            <textarea
              rows={2}
              required
              minLength={5}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Link
              to="/transporter/service-areas"
              className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-blue-600"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Service Areas & CSV Import</span>
            </Link>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <Link
              to="/transporter/support"
              className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-blue-600"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>Contact ZIPIT Support</span>
            </Link>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </div>
      </form>

      <ChangePasswordCard />

      <KycVerificationSection onKycUpdated={loadProfile} />
    </div>
  );
}
