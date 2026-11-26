import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Truck } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';
import { BrandMark } from '../components/ui/BrandMark.tsx';

const transporterRegisterSchema = z.object({
  companyName: z.string().min(2, 'Company name is required').max(160),
  contactPerson: z.string().min(2, 'Contact person name is required').max(120),
  email: z.string().email('Valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  gstNumber: z
    .string()
    .toUpperCase()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'Invalid 15-character GSTIN'
    ),
  address: z.string().min(5, 'Head office / hub address is required').max(400),
  city: z.string().min(2, 'Primary hub city is required').max(100),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
});

type TransporterRegisterForm = z.infer<typeof transporterRegisterSchema>;

export function TransporterRegisterPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TransporterRegisterForm>({
    resolver: zodResolver(transporterRegisterSchema),
  });

  const onFormSubmit = async (values: TransporterRegisterForm) => {
    setServerError(null);
    try {
      await apiClient.post('/transporters/register', {
        ...values,
        email: values.email.trim().toLowerCase(),
        gstNumber: values.gstNumber.toUpperCase(),
      });
      setSubmitted(true);
      showToast('Transporter application submitted for admin review.', 'success');
    } catch (err) {
      setServerError(extractErrorMessage(err, 'Registration failed. Please check your details.'));
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">
            Carrier Application Received
          </h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your transporter registration has been recorded with{' '}
            <strong>Pending Approval</strong> status. You can sign in to submit your KYC
            documents and service areas, and start receiving bookings once approved by an
            administrator.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-6 w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Proceed to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <BrandMark />
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Sign In</span>
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              B2B Transporter Registration
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Register your fleet company and primary hub to join the ZIPIT carrier network.
            </p>
          </div>

          {serverError && (
            <div className="mt-5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {serverError}
            </div>
          )}

          <form
            onSubmit={handleSubmit(onFormSubmit)}
            className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4"
            noValidate
          >
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-1">
                Company Name
              </label>
              <input
                id="companyName"
                type="text"
                {...register('companyName')}
                placeholder="Deccan Freight Carriers Pvt Ltd"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              {errors.companyName && (
                <p className="mt-1 text-xs text-red-600">{errors.companyName.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="contactPerson" className="block text-sm font-medium text-slate-700 mb-1">
                Primary Contact Person
              </label>
              <input
                id="contactPerson"
                type="text"
                {...register('contactPerson')}
                placeholder="Suresh Deshmukh"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              {errors.contactPerson && (
                <p className="mt-1 text-xs text-red-600">{errors.contactPerson.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Operations Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                placeholder="ops@carriercompany.in"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Account Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('password')}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3.5 py-2 pr-10 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                Dispatch Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                maxLength={10}
                {...register('phone')}
                placeholder="9822011223"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono tabular-nums"
              />
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
            </div>

            <div>
              <label htmlFor="gstNumber" className="block text-sm font-medium text-slate-700 mb-1">
                GSTIN
              </label>
              <input
                id="gstNumber"
                type="text"
                maxLength={15}
                {...register('gstNumber')}
                placeholder="27AAECD1234K1Z5"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono uppercase"
              />
              {errors.gstNumber && (
                <p className="mt-1 text-xs text-red-600">{errors.gstNumber.message}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="address" className="block text-sm font-medium text-slate-700 mb-1">
                Head Office / Hub Address
              </label>
              <input
                id="address"
                type="text"
                {...register('address')}
                placeholder="Plot 14, Transport Nagar, Nigdi"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              {errors.address && (
                <p className="mt-1 text-xs text-red-600">{errors.address.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="city" className="block text-sm font-medium text-slate-700 mb-1">
                Primary Hub City
              </label>
              <input
                id="city"
                type="text"
                {...register('city')}
                placeholder="Pune"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
            </div>

            <div>
              <label htmlFor="pincode" className="block text-sm font-medium text-slate-700 mb-1">
                Primary Hub Pincode
              </label>
              <input
                id="pincode"
                type="text"
                maxLength={6}
                {...register('pincode')}
                placeholder="411026"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono tabular-nums"
              />
              {errors.pincode && (
                <p className="mt-1 text-xs text-red-600">{errors.pincode.message}</p>
              )}
            </div>

            <div className="sm:col-span-2 pt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Additional serviceable pincodes and KYC documents can be added after sign-in.
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Truck className="w-4 h-4" />
                <span>{isSubmitting ? 'Submitting Application...' : 'Submit Registration'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
