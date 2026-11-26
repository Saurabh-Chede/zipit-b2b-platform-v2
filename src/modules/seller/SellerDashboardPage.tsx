import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, PackagePlus } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
import { StatCard } from '../../components/ui/StatCard.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import { SellerApprovalStatus, type Booking, type Transporter } from '../../types/index.ts';

interface SellerStatsResponse {
  approvalStatus: SellerApprovalStatus;
  rejectionReason?: string;
  metrics: {
    totalShipments: number;
    pendingShipments: number;
    inTransitShipments: number;
    deliveredShipments: number;
  };
  recentBookings: Booking[];
}

export function SellerDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SellerStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: SellerStatsResponse }>(
        '/dashboard/stats'
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load seller dashboard.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error || !data) return <ErrorBanner message={error || 'Unable to load'} onRetry={loadStats} />;

  const columns: ColumnDef<Booking>[] = [
    {
      key: 'lrNumber',
      header: 'LR Number',
      render: (b) => <span className="font-mono font-medium text-slate-900 tabular-nums">{b.lrNumber}</span>,
    },
    {
      key: 'route',
      header: 'Route',
      render: (b) => (
        <span className="text-slate-700">
          {b.origin.city} → {b.destination.city}
        </span>
      ),
    },
    {
      key: 'transporter',
      header: 'Transporter',
      hideBelow: 'lg',
      render: (b) => (b.transporterId as Transporter)?.companyName || '—',
    },
    {
      key: 'weight',
      header: 'Chargeable Wt',
      align: 'right',
      hideBelow: 'xl',
      render: (b) => <span className="font-mono tabular-nums">{formatWeight(b.chargeableWeight)}</span>,
    },
    {
      key: 'amount',
      header: 'Freight Total',
      align: 'right',
      render: (b) => <span className="font-mono tabular-nums font-medium">{formatINR(b.finalAmount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: 'created',
      header: 'Booked On',
      hideBelow: 'xl',
      render: (b) => <span className="text-xs font-mono tabular-nums text-slate-500">{formatDateTime(b.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {data.approvalStatus === SellerApprovalStatus.PENDING && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Account Pending Admin Approval</p>
            <p className="text-sm text-amber-800 mt-0.5">
              You can calculate freight rates and view transporters, while shipment booking unlocks once an administrator approves your business profile.
            </p>
          </div>
        </div>
      )}

      {data.approvalStatus === SellerApprovalStatus.REJECTED && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">Seller Application Rejected</p>
            <p className="text-sm text-red-800 mt-0.5">
              Reason: {data.rejectionReason || 'Contact ZIPIT support for verification details.'}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Seller Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monitor shipments, dispatches, and active deliveries</p>
        </div>
        {data.approvalStatus === SellerApprovalStatus.APPROVED && (
          <Link
            to="/seller/create-booking"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <PackagePlus className="w-4 h-4" />
            Create Booking
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Shipments" value={data.metrics.totalShipments} />
        <StatCard label="Pending Dispatch" value={data.metrics.pendingShipments} />
        <StatCard label="In Transit" value={data.metrics.inTransitShipments} />
        <StatCard label="Delivered" value={data.metrics.deliveredShipments} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent Shipments</h2>
          <Link to="/seller/shipments" className="text-sm font-medium text-blue-600 hover:underline">
            View all shipments
          </Link>
        </div>

        {data.recentBookings.length === 0 ? (
          <EmptyState
            title="No shipments booked yet"
            description="Calculate freight rates and confirm your first B2B transport booking."
            action={
              data.approvalStatus === SellerApprovalStatus.APPROVED ? (
                <Link
                  to="/seller/create-booking"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Create First Booking
                </Link>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.recentBookings}
            rowKey={(b) => b._id}
            onRowClick={(b) => navigate(`/seller/shipments/${b._id}`)}
            renderMobileCard={(b) => (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-sm text-slate-900 tabular-nums truncate">
                      {b.lrNumber}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {b.origin.city} → {b.destination.city}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span className="truncate max-w-[160px]">
                    {(b.transporterId as Transporter)?.companyName || '—'}
                  </span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span>{formatWeight(b.chargeableWeight)}</span>
                    <span className="font-semibold text-slate-900">{formatINR(b.finalAmount)}</span>
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
