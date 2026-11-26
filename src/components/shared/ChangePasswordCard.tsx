import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { setStoredAuthToken } from '../../utils/apiConfig.ts';
import { useToast } from '../../context/ToastContext.tsx';

export function ChangePasswordCard() {
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data?: { token?: string; csrfToken?: string };
      }>('/auth/change-password', { currentPassword, newPassword });
      if (res.data.data?.token) {
        setStoredAuthToken(res.data.data.token);
      }
      const msg =
        res.data.message || 'Password updated. All other active sessions have been signed out.';
      setSuccessMsg(msg);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully.', 'success');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to update password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Account Security &amp; Password</h2>
            <p className="text-xs text-slate-500">
              Changing your password invalidates older login sessions across other devices
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowPasswords((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{showPasswords ? 'Hide' : 'Show'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Current Password *
          </label>
          <input
            type={showPasswords ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            New Password (min 8 chars) *
          </label>
          <input
            type={showPasswords ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Confirm New Password *
          </label>
          <input
            type={showPasswords ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-3 flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <KeyRound className="w-4 h-4" />
            <span>{saving ? 'Updating...' : 'Update Password'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
