import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { extractErrorMessage } from '../services/api.ts';
import { getStoredAuthToken } from '../utils/apiConfig.ts';
import { UserRole } from '../types/index.ts';
import { BrandMark } from '../components/ui/BrandMark.tsx';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function getRoleHome(role: UserRole): string {
  if (role === UserRole.ADMIN) return '/admin';
  if (role === UserRole.SELLER) return '/seller';
  return '/transporter';
}

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  if (loading && getStoredAuthToken()) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Verifying session...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const loggedUser = await login(values.email, values.password);
      showToast(`Signed in as ${loggedUser.name}`, 'success');
      navigate(getRoleHome(loggedUser.role), { replace: true });
    } catch (err) {
      setServerError(extractErrorMessage(err, 'Invalid credentials.'));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex items-center justify-center">
          <BrandMark />
        </div>
        <h1 className="mt-6 text-center text-xl font-semibold text-slate-900">
          Sign in to your workspace
        </h1>
        <p className="mt-1.5 text-center text-sm text-slate-600">
          Unified dispatch, freight calculation, and consignment tracking
        </p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8">
          {serverError && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Work Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@company.in"
                {...register('email')}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password')}
                  className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200 space-y-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-slate-600">New B2B seller?</span>
              <Link
                to="/register-seller"
                className="font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
              >
                Register your business
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-slate-600">New transport partner?</span>
              <Link
                to="/register-transporter"
                className="font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
              >
                Register as transporter
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-slate-600">Consignee checking delivery?</span>
              <Link
                to="/track"
                className="font-medium text-slate-800 hover:text-blue-600 hover:underline whitespace-nowrap"
              >
                Track a shipment →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
