import React, { useCallback, useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import { PickupAddressesSection } from '../../components/seller/PickupAddressesSection.tsx';
import type { SavedAddress } from '../../types/index.ts';

export function SellerPickupAddressesPage() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: SavedAddress[] }>(
        '/sellers/me/addresses'
      );
      setAddresses(res.data.data || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load pickup addresses.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error) return <ErrorBanner message={error} onRetry={loadAddresses} />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pickup Address Management</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage Primary and Secondary dispatch locations used automatically during shipment booking
        </p>
      </div>

      <PickupAddressesSection
        addresses={addresses}
        onAddressesChange={setAddresses}
      />
    </div>
  );
}
