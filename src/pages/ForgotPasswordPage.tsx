import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail, RefreshCw } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';
import { BrandMark } from '../components/ui/BrandMark.tsx';

export function ForgotPasswordPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<'EMAIL' | 'RESET' | 'DONE'>('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSec]);

  const requestOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid work email address.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: {
          email: string;
          expiresInMinutes: number;
          deliveryMode: 'SMTP' | 'SANDBOX';
          sandboxOtp?: string;
        };
      }>('/auth/forgot-password', { email: cleanEmail });

      setSandboxOtp(res.data.data?.sandboxOtp || null);
      setCooldownSec(30);
      setStep('RESET');
      showToast('If an active account exists, a 6-digit reset OTP has been sent.', 'info');
    } catch (err) {
      setError(extractErrorMessage(err, 'Unable to send password reset code.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestOtp();
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit OTP sent to your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword,
      });
      setStep('DONE');
      showToast('Password updated! Sign in with your new password.', 'success');
    } catch (err) {
      setError(extractErrorMessage(err, 'Password reset failed. Check OTP and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'DONE') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Password Reset Complete</h1>
          <p className="text-sm text-slate-600 mt-2">
            Your password for <strong>{email.trim().toLowerCase()}</strong> has been updated. All
            earlier sessions have been signed out for security.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-6 w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center">
          <BrandMark />
        </div>
        <h1 className="mt-6 text-center text-xl font-semibold text-slate-900">
          {step === 'EMAIL' ? 'Forgot your password?' : 'Enter OTP & Set New Password'}
        </h1>
        <p className="mt-1.5 text-center text-sm text-slate-600">
          {step === 'EMAIL'
            ? 'We will send a 6-digit verification code to your registered work email.'
            : `Verification code requested for ${email.trim().toLowerCase()}`}
        </p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}

          {step === 'EMAIL' ? (
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.in"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" />
                <span>{submitting ? 'Sending OTP...' : 'Send Reset OTP'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              {sandboxOtp && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                  <strong>Sandbox Email Preview:</strong> SMTP is not configured in local dev, so use OTP{' '}
                  <span className="font-mono font-bold tracking-wider px-1.5 py-0.5 bg-white border border-blue-200 rounded">
                    {sandboxOtp}
                  </span>{' '}
                  (valid 10 mins).
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="reset-otp" className="block text-sm font-medium text-slate-700">
                    6-Digit Email OTP
                  </label>
                  <button
                    type="button"
                    disabled={cooldownSec > 0 || submitting}
                    onClick={() => void requestOtp()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline disabled:text-slate-400 disabled:no-underline"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {cooldownSec > 0 ? `Resend in ${cooldownSec}s` : 'Resend OTP'}
                  </button>
                </div>
                <input
                  id="reset-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="w-full px-3.5 py-2.5 text-base font-mono font-bold tracking-[0.35em] text-center bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('EMAIL');
                    setOtp('');
                    setSandboxOtp(null);
                    setError(null);
                  }}
                  className="w-full sm:w-auto px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Change Email
                </button>
                <button
                  type="submit"
                  disabled={submitting || otp.length !== 6}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Resetting Password...' : 'Reset Password'}
                </button>
              </div>
            </form>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
