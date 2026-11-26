import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { ChangePasswordCard } from '../../components/shared/ChangePasswordCard.tsx';

export function AdminProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Admin Account &amp; Security</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Administrator identity and password rotation controls
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Administrator</span>
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm shadow-sm">
        <div>
          <p className="text-xs text-slate-500">Name</p>
          <p className="font-semibold text-slate-900 mt-0.5 break-words">{user.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Email</p>
          <p className="text-slate-900 mt-0.5 break-all">{user.email}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Last Login</p>
          <p className="font-mono tabular-nums text-slate-900 mt-0.5">
            {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Active Session'}
          </p>
        </div>
      </div>

      <ChangePasswordCard />
    </div>
  );
}
