import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Server,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { StatCard } from '../../components/ui/StatCard.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import type { Booking, SellerProfile, Transporter } from '../../types/index.ts';

interface AdminStatsResponse {
  metrics: {
    totalSellers: number;
    pendingSellerApprovals: number;
    totalTransporters: number;
    pendingTransporterApprovals?: number;
    activeRoutes: number;
    totalBookings: number;
    pendingBookings: number;
    deliveredShipments: number;
  };
  recentBookings: Booking[];
}

interface BackendHealthResponse {
  status: 'healthy' | 'degraded';
  service: string;
  environment: string;
  uptimeSeconds: number;
  checkedAt: string;
  database: {
    connected: boolean;
    state: string;
    pingMs: number | null;
    error?: string;
  };
  storage: {
    writable: boolean;
    provider: string;
  };
  runtime: {
    nodeVersion: string;
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
}

function formatUptime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLatencyMs, setHealthLatencyMs] = useState<number | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    setHealthChecking(true);
    setHealthError(null);
    const started = performance.now();
    try {
      const res = await apiClient.get<{ success: boolean; data: BackendHealthResponse }>(
        '/dashboard/health'
      );
      setHealthLatencyMs(Math.round(performance.now() - started));
      setHealth(res.data.data);
    } catch (err) {
      setHealthLatencyMs(null);
      setHealthError(extractErrorMessage(err, 'Backend health check failed.'));
    } finally {
      setHealthChecking(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: AdminStatsResponse }>(
        '/dashboard/stats'
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load admin metrics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    runHealthCheck();
  }, [load, runHealthCheck]);

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error || !data) return <ErrorBanner message={error || 'Unable to load'} onRetry={load} />;

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
      key: 'total',
      header: 'Amount',
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
      header: 'Booked At',
      hideBelow: 'xl',
      render: (b) => <span className="text-xs font-mono tabular-nums text-slate-500">{formatDateTime(b.createdAt)}</span>,
    },
  ];

  const isHealthy = !healthError && health?.status === 'healthy';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Operations Control Center</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor seller onboarding, fleet capacity, active freight lanes, and booking throughput
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {data.metrics.pendingSellerApprovals > 0 && (
            <Link
              to="/admin/sellers"
              className="flex-1 sm:flex-initial text-center px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0"
            >
              Review Pending Sellers ({data.metrics.pendingSellerApprovals})
            </Link>
          )}
          {(data.metrics.pendingTransporterApprovals ?? 0) > 0 && (
            <Link
              to="/admin/transporters"
              className="flex-1 sm:flex-initial text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              Review Pending Transporters ({data.metrics.pendingTransporterApprovals})
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sellers" value={data.metrics.totalSellers} />
        <StatCard label="Pending Seller Approvals" value={data.metrics.pendingSellerApprovals} />
        <StatCard label="Total Transporters" value={data.metrics.totalTransporters} />
        <StatCard
          label="Pending Transporter Approvals"
          value={data.metrics.pendingTransporterApprovals ?? 0}
        />
        <StatCard label="Active Routes" value={data.metrics.activeRoutes} />
        <StatCard label="Total Bookings" value={data.metrics.totalBookings} />
        <StatCard label="Pending Bookings" value={data.metrics.pendingBookings} />
        <StatCard label="Delivered Shipments" value={data.metrics.deliveredShipments} />
      </div>

      {/* Backend Health Check Panel */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <Server className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Backend Health Check</h2>
              <p className="text-xs text-slate-500">
                Live API, MongoDB connectivity, file storage, and server runtime diagnostics
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {health && !healthError ? (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  isHealthy ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {isHealthy ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{isHealthy ? 'All Systems Healthy' : 'System Degraded'}</span>
              </span>
            ) : healthError ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Unreachable</span>
              </span>
            ) : null}

            <button
              type="button"
              onClick={runHealthCheck}
              disabled={healthChecking}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${healthChecking ? 'animate-spin' : ''}`} />
              <span>{healthChecking ? 'Checking...' : 'Run Health Check'}</span>
            </button>
          </div>
        </div>

        {healthError ? (
          <div className="p-4 sm:p-5">
            <ErrorBanner message={healthError} onRetry={runHealthCheck} />
          </div>
        ) : !health ? (
          <div className="p-4 sm:p-5 text-xs text-slate-500">Running initial backend health check...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            <div className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-slate-500" />
                  API &amp; Runtime
                </span>
                <span className="font-mono text-emerald-700 font-semibold">HTTP 200</span>
              </div>
              <dl className="grid grid-cols-2 gap-y-1 text-xs pt-1">
                <dt className="text-slate-500">API Round-Trip</dt>
                <dd className="text-right font-mono tabular-nums text-slate-900">
                  {healthLatencyMs !== null ? `${healthLatencyMs} ms` : '—'}
                </dd>
                <dt className="text-slate-500">Server Uptime</dt>
                <dd className="text-right font-mono tabular-nums text-slate-900">
                  {formatUptime(health.uptimeSeconds)}
                </dd>
                <dt className="text-slate-500">Runtime / Env</dt>
                <dd className="text-right font-mono tabular-nums text-slate-700 truncate">
                  {health.runtime.nodeVersion} · {health.environment}
                </dd>
              </dl>
            </div>

            <div className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-slate-500" />
                  MongoDB Database
                </span>
                <span
                  className={`font-semibold ${
                    health.database.connected ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {health.database.state}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-y-1 text-xs pt-1">
                <dt className="text-slate-500">Ping Latency</dt>
                <dd className="text-right font-mono tabular-nums text-slate-900">
                  {health.database.pingMs !== null ? `${health.database.pingMs} ms` : '—'}
                </dd>
                <dt className="text-slate-500">Memory (Heap / RSS)</dt>
                <dd className="text-right font-mono tabular-nums text-slate-900">
                  {health.runtime.heapUsedMb} MB / {health.runtime.rssMb} MB
                </dd>
                <dt className="text-slate-500">Database Status</dt>
                <dd className="text-right text-slate-700 truncate">
                  {health.database.error || 'Operational'}
                </dd>
              </dl>
            </div>

            <div className="p-4 sm:p-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                  Delivery Proof Storage
                </span>
                <span
                  className={`font-semibold ${
                    health.storage.writable ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {health.storage.writable ? 'Writable' : 'Unavailable'}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-y-1 text-xs pt-1">
                <dt className="text-slate-500">Storage Provider</dt>
                <dd className="text-right font-mono text-slate-900">{health.storage.provider}</dd>
                <dt className="text-slate-500">Service ID</dt>
                <dd className="text-right font-mono text-slate-700 truncate">{health.service}</dd>
                <dt className="text-slate-500">Last Checked</dt>
                <dd className="text-right font-mono tabular-nums text-slate-700">
                  {formatDateTime(health.checkedAt)}
                </dd>
              </dl>
            </div>
          </div>
        )}
      </section>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Recent Bookings</h2>
          <Link to="/admin/bookings" className="text-sm font-medium text-blue-600 hover:underline whitespace-nowrap">
            View all bookings
          </Link>
        </div>

        {data.recentBookings.length === 0 ? (
          <EmptyState title="No bookings yet" description="Bookings created by approved sellers will appear here." />
        ) : (
          <DataTable
            columns={columns}
            rows={data.recentBookings}
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

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  <StatusBadge status={b.bookingSource || 'PLATFORM'} />
                  <span className="font-mono font-bold tabular-nums text-slate-900">
                    {formatINR(b.finalAmount)}
                  </span>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
