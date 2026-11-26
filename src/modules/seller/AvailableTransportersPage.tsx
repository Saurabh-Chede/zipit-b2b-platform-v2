import React, { useCallback, useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import type { PaginatedResponse, Transporter } from '../../types/index.ts';

export function AvailableTransportersPage() {
  const [items, setItems] = useState<Transporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Transporter> }>(
        '/transporters'
      );
      setItems(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load transporters.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Available Transporters</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Verified local freight carriers operating on ZIPIT B2B routes
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No active transporters"
          description="Transporters onboarded by the administrator will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((t) => (
            <div key={t._id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{t.companyName}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Contact: {t.contactPerson} · <span className="font-mono tabular-nums">{t.phone}</span>
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <p className="text-sm text-slate-600">{t.address}</p>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-1">Service Areas</p>
                <p className="text-xs text-slate-700 font-mono tabular-nums">
                  {t.serviceAreas.map((sa) => `${sa.city} (${sa.pincode})`).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
