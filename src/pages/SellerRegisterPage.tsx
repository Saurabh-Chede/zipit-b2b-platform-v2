import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, UserPlus } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';
import { BrandMark } from '../components/ui/BrandMark.tsx';

const sellerRegisterSchema = z.object({
  businessName: z.string().min(2, 'Business name is required').max(160),
  ownerName: z.string().min(2, 'Owner name is required').max(120),
  email: z.string().email('Valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  gstNumber: z
    .string()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid 15-character GSTIN'),
  businessAddress: z.string().min(5, 'Full business address is required').max(400),
  city: z.string().min(2, 'City is required').max(100),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
});

type SellerRegisterForm = z.infer<typeof sellerRegisterSchema>;

export function SellerRegisterPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SellerRegisterForm>({
    resolver: zodResolver(sellerRegisterSchema),
  });

  const onFormSubmit = async (values: SellerRegisterForm) => {
    setServerError(null);
    try {
      await apiClient.post('/sellers/register', {
        ...values,
        email: values.email.trim().toLowerCase(),
        gstNumber: values.gstNumber.toUpperCase(),
      });
      setSubmitted(true);
      showToast('Seller application submitted for admin review.', 'success');
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
          <h1 className="text-lg font-semibold text-slate-900">Registration Application Received</h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Your B2B seller registration has been recorded with{' '}
            <strong>Pending Approval</strong> status. You can sign in to view your status, and create
            shipments once approved by an administrator.
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
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center">
            <BrandMark />
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sign In
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">B2B Seller Registration</h1>
            <p className="text-sm text-slate-600 mt-1">
              Submit your business and GST details to register your B2B seller account.
            </p>
          </div>

          {serverError && (
            <div className="mt-5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onFormSubmit)} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                <input
                  type="text"
                  {...register('businessName')}
                  placeholder="Apex Industrial Pvt Ltd"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {errors.businessName && <p className="mt-1 text-xs text-red-600">{errors.businessName.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name</label>
                <input
                  type="text"
                  {...register('ownerName')}
                  placeholder="Rajesh Kulkarni"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {errors.ownerName && <p className="mt-1 text-xs text-red-600">{errors.ownerName.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Email</label>
                <input
                  type="email"
                  {...register('email')}
                  placeholder="dispatch@company.in"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account Password</label>
                <input
                  type="password"
                  {...register('password')}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  {...register('phone')}
                  placeholder="9823011223"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono tabular-nums"
                />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">GSTIN</label>
                <input
                  type="text"
                  {...register('gstNumber')}
                  placeholder="27AABCA4521K1Z5"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono uppercase"
                />
                {errors.gstNumber && <p className="mt-1 text-xs text-red-600">{errors.gstNumber.message}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Business Address</label>
                <input
                  type="text"
                  {...register('businessAddress')}
                  placeholder="Plot B-42, MIDC Industrial Area"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {errors.businessAddress && (
                  <p className="mt-1 text-xs text-red-600">{errors.businessAddress.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  {...register('city')}
                  placeholder="Pune"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
                {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pincode</label>
                <input
                  type="text"
                  {...register('pincode')}
                  placeholder="411026"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono tabular-nums"
                />
                {errors.pincode && <p className="mt-1 text-xs text-red-600">{errors.pincode.message}</p>}
              </div>

              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isSubmitting ? 'Submitting Application...' : 'Submit Registration'}</span>
                </button>
              </div>
            </form>
        </div>
      </div>
    </div>
  );
}
