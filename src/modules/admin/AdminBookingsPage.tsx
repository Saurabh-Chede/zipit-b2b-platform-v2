import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  BookingStatus,
  type Booking,
  type PaginatedResponse,
  type SellerProfile,
  type Transporter,
} from '../../types/index.ts';

export function AdminBookingsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<Booking> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
        '/bookings',
        {
          params: {
            page,
            limit: 15,
            status: statusFilter || undefined,
            bookingSource: sourceFilter || undefined,
            lrNumber: search.trim() || undefined,
          },
        }
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load bookings.'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, sourceFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: ColumnDef<Booking>[] = [
    {
      key: 'lr',
      header: 'LR Number',
      render: (b) => <span className="font-mono font-medium text-slate-900 tabular-nums">{b.lrNumber}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      hideBelow: 'lg',
      render: (b) => <StatusBadge status={b.bookingSource || 'PLATFORM'} />,
    },
    {
      key: 'seller',
      header: 'Seller / Consignor',
      hideBelow: 'xl',
      render: (b) => (b.sellerId as SellerProfile)?.businessName || `Direct: ${b.sender.name}`,
    },
    {
      key: 'transporter',
      header: 'Transporter',
      hideBelow: 'lg',
      render: (b) => (b.transporterId as Transporter)?.companyName || '—',
    },
    {
      key: 'lane',
      header: 'Route',
      render: (b) => `${b.origin.city} → ${b.destination.city}`,
    },
    {
      key: 'wt',
      header: 'Chargeable Wt',
      align: 'right',
      hideBelow: 'xl',
      render: (b) => <span className="font-mono tabular-nums">{formatWeight(b.chargeableWeight)}</span>,
    },
    {
      key: 'total',
      header: 'Total Freight',
      align: 'right',
      render: (b) => <span className="font-mono tabular-nums font-medium">{formatINR(b.finalAmount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: 'date',
      header: 'Booked On',
      hideBelow: 'xl',
      render: (b) => <span className="text-xs font-mono tabular-nums text-slate-500">{formatDateTime(b.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">All System Bookings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Search by LR number, filter by status, and inspect manifests</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[240px] sm:max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search by LR number or city..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
          aria-label="Filter by status"
          className="w-full sm:w-auto flex-1 sm:flex-initial px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
        >
          <option value="">All Statuses</option>
          {Object.values(BookingStatus).map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => {
            setPage(1);
            setSourceFilter(e.target.value);
          }}
          aria-label="Filter by booking source"
          className="w-full sm:w-auto flex-1 sm:flex-initial px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
        >
          <option value="">All Sources</option>
          <option value="PLATFORM">Platform Orders (Seller)</option>
          <option value="TRANSPORTER_SELF">Transporter Self Bookings</option>
        </select>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={load} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No bookings found" description="No bookings match your search or status filter." />
      ) : (
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(b) => b._id}
          onRowClick={(b) => navigate(`/admin/bookings/${b._id}`)}
          renderMobileCard={(b) => (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                    {b.lrNumber}
                  </p>
                  <p className="text-xs font-medium text-slate-800 mt-0.5 truncate">
                    {b.origin.city} → {b.destination.city}
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </div>

              <div className="text-xs text-slate-600 space-y-0.5 pt-2 border-t border-slate-100">
                <p className="truncate">
                  <span className="text-slate-400">Seller: </span>
                  {(b.sellerId as SellerProfile)?.businessName || `Direct: ${b.sender.name}`}
                </p>
                <p className="truncate">
                  <span className="text-slate-400">Carrier: </span>
                  {(b.transporterId as Transporter)?.companyName || '—'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <StatusBadge status={b.bookingSource || 'PLATFORM'} />
                <div className="text-right font-mono tabular-nums">
                  <span className="text-slate-500 mr-2">{formatWeight(b.chargeableWeight)}</span>
                  <span className="font-bold text-slate-900">{formatINR(b.finalAmount)}</span>
                </div>
              </div>
            </div>
          )}
          pagination={{
            page: data.pagination.page,
            totalPages: data.pagination.totalPages,
            total: data.pagination.total,
            onPageChange: setPage,
          }}
        />
      )}
    </div>
  );
}
