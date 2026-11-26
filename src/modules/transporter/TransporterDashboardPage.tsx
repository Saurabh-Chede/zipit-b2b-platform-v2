// import React, { useCallback, useEffect, useState } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import { AlertTriangle, PackagePlus } from 'lucide-react';
// import { apiClient, extractErrorMessage } from '../../services/api.ts';
// import { formatDateTime, formatWeight } from '../../utils/formatters.ts';
// import { StatCard } from '../../components/ui/StatCard.tsx';
// import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
// import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
// import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
// import {
//   TransporterApprovalStatus,
//   type Booking,
//   type SellerProfile,
// } from '../../types/index.ts';

// interface TransporterStatsResponse {
//   approvalStatus?: TransporterApprovalStatus;
//   rejectionReason?: string;
//   metrics: {
//     totalAssigned: number;
//     pendingAcceptance: number;
//     inTransitShipments: number;
//     deliveredShipments: number;
//     platformOrdersCount?: number;
//     personalBookedCount?: number;
//   };
//   recentBookings: Booking[];
// }


// function ShineSweep({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
//   return (
//     <span
//       aria-hidden="true"
//       className={`pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent ${
//         tone === 'dark' ? 'via-white/25' : 'via-gray-300/45'
//       } to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full`}
//     />
//   );
// }

// export function TransporterDashboardPage() {
//   const navigate = useNavigate();
//   const [data, setData] = useState<TransporterStatsResponse | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   const load = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await apiClient.get<{ success: boolean; data: TransporterStatsResponse }>(
//         '/dashboard/stats'
//       );
//       setData(res.data.data);
//     } catch (err) {
//       setError(extractErrorMessage(err, 'Failed to load transporter dashboard.'));
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     load();
//   }, [load]);

//   if (loading) return <LoadingSkeleton rows={5} />;
//   if (error || !data) return <ErrorBanner message={error || 'Unable to load'} onRetry={load} />;

//   const isApproved =
//     !data.approvalStatus || data.approvalStatus === TransporterApprovalStatus.APPROVED;

//   const columns: ColumnDef<Booking>[] = [
//     {
//       key: 'lr',
//       header: 'LR Number',
//       render: (b) => <span className="font-mono font-medium text-slate-900 tabular-nums">{b.lrNumber}</span>,
//     },
//     {
//       key: 'source',
//       header: 'Source',
//       hideBelow: 'lg',
//       render: (b) => <StatusBadge status={b.bookingSource || 'PLATFORM'} />,
//     },
//     {
//       key: 'seller',
//       header: 'Consignor',
//       render: (b) => (b.sellerId as SellerProfile)?.businessName || b.sender.name,
//     },
//     {
//       key: 'route',
//       header: 'Lane',
//       render: (b) => `${b.origin.city} → ${b.destination.city}`,
//     },
//     {
//       key: 'wt',
//       header: 'Chargeable Wt',
//       align: 'right',
//       hideBelow: 'xl',
//       render: (b) => <span className="font-mono tabular-nums">{formatWeight(b.chargeableWeight)}</span>,
//     },
//     {
//       key: 'status',
//       header: 'Status',
//       render: (b) => <StatusBadge status={b.status} />,
//     },
//     {
//       key: 'created',
//       header: 'Assigned On',
//       hideBelow: 'xl',
//       render: (b) => <span className="text-xs font-mono tabular-nums text-slate-500">{formatDateTime(b.createdAt)}</span>,
//     },
//   ];

//   return (
//     <div className="space-y-6">
//       {data.approvalStatus === TransporterApprovalStatus.PENDING && (
//         <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-start justify-between gap-3">
//           <div className="flex items-start gap-3">
//             <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
//             <div>
//               <p className="text-sm font-semibold text-amber-900">Carrier Account Pending Admin Approval</p>
//               <p className="text-sm text-amber-800 mt-0.5">
//                 Upload your KYC compliance documents and configure serviceable pincodes while an administrator reviews your registration. Route publishing and bookings unlock upon approval.
//               </p>
//             </div>
//           </div>
//           <div className="flex flex-wrap items-center gap-2">
//             <Link
//               to="/transporter/profile"
//               className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
//             >
//               Complete KYC Profile
//             </Link>
//             <Link
//               to="/transporter/service-areas"
//               className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
//             >
//               Manage Service Areas
//             </Link>
//           </div>
//         </div>
//       )}

//       {data.approvalStatus === TransporterApprovalStatus.REJECTED && (
//         <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-wrap items-start justify-between gap-3">
//           <div className="flex items-start gap-3">
//             <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
//             <div>
//               <p className="text-sm font-semibold text-red-900">Transporter Application Rejected</p>
//               <p className="text-sm text-red-800 mt-0.5">
//                 Reason: {data.rejectionReason || 'Contact ZIPIT support for verification details.'}
//               </p>
//             </div>
//           </div>
//           <div className="flex flex-wrap items-center gap-2">
//             <Link
//               to="/transporter/profile"
//               className="px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
//             >
//               Review Profile &amp; KYC
//             </Link>
//             <Link
//               to="/transporter/support"
//               className="px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
//             >
//               Contact Support
//             </Link>
//           </div>
//         </div>
//       )}

//       <div className="flex flex-wrap items-center justify-between gap-4">
//         <div>
//           <h1 className="text-xl font-semibold text-slate-900">Transporter Operations</h1>
//           <p className="text-sm text-slate-500 mt-0.5">
//             Accept or reject dispatches, scan carton barcodes, manage pickups &amp; service areas, and track settlements
//           </p>
//         </div>
//         {isApproved && (
//           // <Link
//           //   to="/transporter/create-order"
//           //   className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
//           // >
//           //   <PackagePlus className="w-4 h-4" />
//           //   <span>Create Order</span>
//           // </Link>

//           <Link
//             to="/transporter/create-order"
//             className="group relative overflow-hidden inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-b from-blue-600 to-blue-800 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_1px_2px_0_rgba(0,0,0,0.1)] hover:from-blue-500 hover:to-blue-700 transition-all whitespace-nowrap shrink-0"
//           >
//             <ShineSweep tone="dark" />
//             <PackagePlus className="relative z-10 w-4 h-4" />
//             <span className="relative z-10">Create Order</span>
//           </Link>
//         )}
//       </div>

//       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
//         <StatCard label="Total Active Orders" value={data.metrics.totalAssigned} />
//         <StatCard label="Awaiting Acceptance" value={data.metrics.pendingAcceptance} />
//         <StatCard label="Active In Transit" value={data.metrics.inTransitShipments} />
//         <StatCard label="Delivered" value={data.metrics.deliveredShipments} />
//       </div>

//       <div className="space-y-3">
//         <div className="flex items-center justify-between">
//           <h2 className="text-base font-semibold text-slate-900">Recent Assigned Shipments</h2>
//           <Link to="/transporter/assigned-bookings" className="text-sm font-medium text-blue-600 hover:underline">
//             View all assigned
//           </Link>
//         </div>

//         {data.recentBookings.length === 0 ? (
//           <EmptyState
//             title="No assigned bookings"
//             description="Shipments booked with your carrier rates will appear here."
//           />
//         ) : (
//           <DataTable
//             columns={columns}
//             rows={data.recentBookings}
//             rowKey={(b) => b._id}
//             onRowClick={(b) => navigate(`/transporter/bookings/${b._id}`)}
//             renderMobileCard={(b) => (
//               <div className="space-y-2.5">
//                 <div className="flex items-start justify-between gap-2">
//                   <div className="min-w-0">
//                     <p className="font-mono font-semibold text-sm text-slate-900 tabular-nums truncate">
//                       {b.lrNumber}
//                     </p>
//                     <p className="text-xs text-slate-600 mt-0.5 truncate">
//                       {(b.sellerId as SellerProfile)?.businessName || b.sender.name}
//                     </p>
//                   </div>
//                   <StatusBadge status={b.status} />
//                 </div>
//                 <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
//                   <span>
//                     {b.origin.city} → {b.destination.city}
//                   </span>
//                   <div className="flex items-center gap-2">
//                     <StatusBadge status={b.bookingSource || 'PLATFORM'} />
//                     <span className="font-mono font-semibold text-slate-900 tabular-nums">
//                       {formatWeight(b.chargeableWeight)}
//                     </span>
//                   </div>
//                 </div>
//               </div>
//             )}
//           />
//         )}
//       </div>
//     </div>
//   );
// }

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  PackagePlus,
  Truck,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatDateTime, formatWeight } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  TransporterApprovalStatus,
  type Booking,
  type SellerProfile,
} from '../../types/index.ts';

interface TransporterStatsResponse {
  approvalStatus?: TransporterApprovalStatus;
  rejectionReason?: string;
  metrics: {
    totalAssigned: number;
    pendingAcceptance: number;
    inTransitShipments: number;
    deliveredShipments: number;
    platformOrdersCount?: number;
    personalBookedCount?: number;
  };
  recentBookings: Booking[];
}

function ShineSweep({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent ${tone === 'dark' ? 'via-white/25' : 'via-gray-300/45'
        } to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full`}
    />
  );
}

export function TransporterDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<TransporterStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: TransporterStatsResponse }>(
        '/dashboard/stats'
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load transporter dashboard.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data) return <ErrorBanner message={error || 'Unable to load'} onRetry={load} />;

  const isApproved =
    !data.approvalStatus || data.approvalStatus === TransporterApprovalStatus.APPROVED;

  const metricCards = [
    {
      label: 'Total Active Orders',
      value: data.metrics.totalAssigned,
      icon: Package,
      cardClass:
        'bg-gradient-to-br from-indigo-50/90 via-white to-slate-100/80 border-indigo-200/75',
      iconClass: 'bg-indigo-100/90 text-indigo-700 border-indigo-200/80',
    },
    {
      label: 'Awaiting Acceptance',
      value: data.metrics.pendingAcceptance,
      icon: Clock,
      cardClass:
        'bg-gradient-to-br from-amber-50/90 via-white to-orange-50/80 border-amber-200/75',
      iconClass: 'bg-amber-100/90 text-amber-700 border-amber-200/80',
    },
    {
      label: 'Active In Transit',
      value: data.metrics.inTransitShipments,
      icon: Truck,
      cardClass:
        'bg-gradient-to-br from-sky-50/90 via-white to-blue-50/80 border-sky-200/75',
      iconClass: 'bg-sky-100/90 text-sky-700 border-sky-200/80',
    },
    {
      label: 'Delivered',
      value: data.metrics.deliveredShipments,
      icon: CheckCircle2,
      cardClass:
        'bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/80 border-emerald-200/75',
      iconClass: 'bg-emerald-100/90 text-emerald-700 border-emerald-200/80',
    },
  ];

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
      header: 'Consignor',
      render: (b) => (b.sellerId as SellerProfile)?.businessName || b.sender.name,
    },
    {
      key: 'route',
      header: 'Lane',
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
      key: 'status',
      header: 'Status',
      render: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: 'created',
      header: 'Assigned On',
      hideBelow: 'xl',
      render: (b) => <span className="text-xs font-mono tabular-nums text-slate-500">{formatDateTime(b.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {data.approvalStatus === TransporterApprovalStatus.PENDING && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Carrier Account Pending Admin Approval</p>
              <p className="text-sm text-amber-800 mt-0.5">
                Upload your KYC compliance documents and configure serviceable pincodes while an administrator reviews your registration. Route publishing and bookings unlock upon approval.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/transporter/profile"
              className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
            >
              Complete KYC Profile
            </Link>
            <Link
              to="/transporter/service-areas"
              className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
            >
              Manage Service Areas
            </Link>
          </div>
        </div>
      )}

      {data.approvalStatus === TransporterApprovalStatus.REJECTED && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Transporter Application Rejected</p>
              <p className="text-sm text-red-800 mt-0.5">
                Reason: {data.rejectionReason || 'Contact ZIPIT support for verification details.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/transporter/profile"
              className="px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              Review Profile &amp; KYC
            </Link>
            <Link
              to="/transporter/support"
              className="px-3 py-1.5 text-xs font-semibold text-red-900 bg-white border border-red-300 rounded-lg hover:bg-red-100 whitespace-nowrap shrink-0"
            >
              Contact Support
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            className="text-xl font-semibold tracking-tight inline-block bg-clip-text text-transparent"
            style={{
              backgroundImage:
                'linear-gradient(110deg, #0f172a 40%, #2563eb 47%, #e0f2fe 50%, #2563eb 53%, #0f172a 60%)',
              backgroundSize: '300% 100%',
              WebkitBackgroundClip: 'text',
              animation: 'zipitTextShine 3.8s ease-in-out infinite',
            }}
          >
            Transporter Operations
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Accept or reject dispatches, scan carton barcodes, manage pickups &amp; service areas, and track settlements
          </p>
          <style>{`
            @keyframes zipitTextShine {
              0% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
          `}</style>
        </div>
        {isApproved && (
          <Link
            to="/transporter/create-order"
            className="group relative overflow-hidden inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-b from-blue-600 to-blue-800 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_1px_2px_0_rgba(0,0,0,0.1)] hover:from-blue-500 hover:to-blue-700 transition-all whitespace-nowrap shrink-0"
          >
            <ShineSweep tone="dark" />
            <PackagePlus className="relative z-10 w-4 h-4" />
            <span className="relative z-10">Create Order</span>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`relative overflow-hidden rounded-lg border p-4 sm:p-5 shadow-xs transition-all hover:shadow-sm ${card.cardClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-600 truncate">{card.label}</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 tabular-nums mt-2">
                    {card.value}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl border shrink-0 ${card.iconClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Recent Assigned Shipments</h2>
          <Link to="/transporter/assigned-bookings" className="text-sm font-medium text-blue-600 hover:underline">
            View all assigned
          </Link>
        </div>

        {data.recentBookings.length === 0 ? (
          <EmptyState
            title="No assigned bookings"
            description="Shipments booked with your carrier rates will appear here."
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.recentBookings}
            rowKey={(b) => b._id}
            onRowClick={(b) =>
              navigate(`/transporter/bookings/${b._id}`, {
                state: { from: '/transporter' },
              })
            }
            renderMobileCard={(b) => (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-sm text-slate-900 tabular-nums truncate">
                      {b.lrNumber}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                      {(b.sellerId as SellerProfile)?.businessName || b.sender.name}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span>
                    {b.origin.city} → {b.destination.city}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={b.bookingSource || 'PLATFORM'} />
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatWeight(b.chargeableWeight)}
                    </span>
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
