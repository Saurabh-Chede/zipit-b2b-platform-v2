// import React, { useCallback, useEffect, useMemo, useState } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import {
//   Calendar,
//   Check,
//   MapPin,
//   Search,
//   XCircle,
// } from 'lucide-react';
// import { apiClient, extractErrorMessage } from '../../services/api.ts';
// import { useToast } from '../../context/ToastContext.tsx';
// import { formatINR, formatWeight } from '../../utils/formatters.ts';
// import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
// import { Modal } from '../../components/ui/Modal.tsx';
// import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
// import {
//   BookingStatus,
//   NEXT_BOOKING_STATUS,
//   type Booking,
//   type PaginatedResponse,
//   type SellerProfile,
// } from '../../types/index.ts';

// type StatusTab = 'ALL' | 'NEW' | 'IN_TRANSIT' | 'ARRIVED' | 'NDR_RTO' | 'DELIVERED' | 'CLOSED';
// type DateRangeFilter = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

// function formatShortBookingTime(iso: string): string {
//   const date = new Date(iso);
//   if (Number.isNaN(date.getTime())) return '—';
//   return new Intl.DateTimeFormat('en-IN', {
//     day: '2-digit',
//     month: 'short',
//     hour: '2-digit',
//     minute: '2-digit',
//   }).format(date);
// }

// function getDefaultLocationForNextStatus(booking: Booking, next: BookingStatus): string {
//   if (
//     next === BookingStatus.ARRIVED ||
//     next === BookingStatus.OUT_FOR_DELIVERY ||
//     next === BookingStatus.DELIVERED
//   ) {
//     return `${booking.destination.city} (${booking.destination.pincode})`;
//   }
//   return `${booking.origin.city} (${booking.origin.pincode})`;
// }

// export function AssignedBookingsPage() {
//   const navigate = useNavigate();
//   const { showToast } = useToast();

//   const [bookings, setBookings] = useState<Booking[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
//   const [routeFilter, setRouteFilter] = useState<string>('ALL');
//   const [dateFilter, setDateFilter] = useState<DateRangeFilter>('ALL');
//   const [search, setSearch] = useState('');

//   const [updatingId, setUpdatingId] = useState<string | null>(null);

//   const [rejectTarget, setRejectTarget] = useState<Booking | null>(null);
//   const [rejectReason, setRejectReason] = useState('');
//   const [rejecting, setRejecting] = useState(false);

//   const loadBookings = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
//         '/transporter/bookings',
//         { params: { page: 1, limit: 100, bookingSource: 'PLATFORM' } }
//       );
//       setBookings(res.data.data.items);
//     } catch (err) {
//       setError(extractErrorMessage(err, 'Failed to load assigned bookings.'));
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     loadBookings();
//   }, [loadBookings]);

//   const routeOptions = useMemo(() => {
//     const map = new Map<string, string>();
//     for (const b of bookings) {
//       const label = `${b.origin.city} → ${b.destination.city}`;
//       map.set(label, label);
//     }
//     return Array.from(map.values());
//   }, [bookings]);

//   const dateAndRouteFiltered = useMemo(() => {
//     const now = new Date();
//     const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
//     const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
//     const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
//     const q = search.trim().toLowerCase();

//     return bookings.filter((b) => {
//       const laneLabel = `${b.origin.city} → ${b.destination.city}`;
//       if (routeFilter !== 'ALL' && laneLabel !== routeFilter) return false;

//       const createdMs = new Date(b.createdAt).getTime();
//       if (dateFilter === 'TODAY' && createdMs < startOfToday) return false;
//       if (dateFilter === 'LAST_7_DAYS' && createdMs < sevenDaysAgo) return false;
//       if (dateFilter === 'LAST_30_DAYS' && createdMs < thirtyDaysAgo) return false;

//       if (q) {
//         const sellerName = (
//           (b.sellerId as SellerProfile | null)?.businessName || b.sender.name
//         ).toLowerCase();
//         const hay = `${b.bookingId} ${b.lrNumber} ${laneLabel} ${sellerName} ${b.receiver.name} ${b.origin.city} ${b.destination.city}`.toLowerCase();
//         if (!hay.includes(q)) return false;
//       }

//       return true;
//     });
//   }, [bookings, routeFilter, dateFilter, search]);

//   const tabCounts = useMemo(() => {
//     let booked = 0;
//     let inTransit = 0;
//     let arrived = 0;
//     let ndrRto = 0;
//     let delivered = 0;
//     let closed = 0;

//     for (const b of dateAndRouteFiltered) {
//       if (b.status === BookingStatus.BOOKED) booked += 1;
//       else if (b.status === BookingStatus.ACCEPTED || b.status === BookingStatus.DISPATCHED) {
//         inTransit += 1;
//       } else if (
//         b.status === BookingStatus.ARRIVED ||
//         b.status === BookingStatus.OUT_FOR_DELIVERY
//       ) {
//         arrived += 1;
//       } else if (
//         b.status === BookingStatus.NDR ||
//         b.status === BookingStatus.RTO_INITIATED ||
//         b.status === BookingStatus.RTO_DELIVERED
//       ) {
//         ndrRto += 1;
//       } else if (b.status === BookingStatus.DELIVERED) delivered += 1;
//       else if (b.status === BookingStatus.REJECTED || b.status === BookingStatus.CANCELLED) {
//         closed += 1;
//       }
//     }

//     return {
//       ALL: dateAndRouteFiltered.length,
//       NEW: booked,
//       IN_TRANSIT: inTransit,
//       ARRIVED: arrived,
//       NDR_RTO: ndrRto,
//       DELIVERED: delivered,
//       CLOSED: closed,
//     };
//   }, [dateAndRouteFiltered]);

//   const visibleBookings = useMemo(() => {
//     return dateAndRouteFiltered.filter((b) => {
//       if (activeTab === 'ALL') return true;
//       if (activeTab === 'NEW') return b.status === BookingStatus.BOOKED;
//       if (activeTab === 'IN_TRANSIT') {
//         return b.status === BookingStatus.ACCEPTED || b.status === BookingStatus.DISPATCHED;
//       }
//       if (activeTab === 'ARRIVED') {
//         return (
//           b.status === BookingStatus.ARRIVED ||
//           b.status === BookingStatus.OUT_FOR_DELIVERY
//         );
//       }
//       if (activeTab === 'NDR_RTO') {
//         return (
//           b.status === BookingStatus.NDR ||
//           b.status === BookingStatus.RTO_INITIATED ||
//           b.status === BookingStatus.RTO_DELIVERED
//         );
//       }
//       if (activeTab === 'CLOSED') {
//         return b.status === BookingStatus.REJECTED || b.status === BookingStatus.CANCELLED;
//       }
//       return b.status === BookingStatus.DELIVERED;
//     });
//   }, [dateAndRouteFiltered, activeTab]);

//   const handleAdvanceStatus = async (booking: Booking, targetStatus: BookingStatus) => {
//     setUpdatingId(booking._id);
//     try {
//       await apiClient.patch(`/bookings/${booking._id}/status`, {
//         status: targetStatus,
//         location: getDefaultLocationForNextStatus(booking, targetStatus),
//       });
//       showToast(`Shipment ${booking.lrNumber} marked as ${targetStatus}.`, 'success');
//       await loadBookings();
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to update shipment status.'), 'error');
//     } finally {
//       setUpdatingId(null);
//     }
//   };

//   const handleRejectSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!rejectTarget) return;
//     if (rejectReason.trim().length < 4) {
//       showToast('Please provide a clear rejection reason (at least 4 characters).', 'error');
//       return;
//     }

//     setRejecting(true);
//     try {
//       await apiClient.patch(`/bookings/${rejectTarget._id}/status`, {
//         status: BookingStatus.REJECTED,
//         location: `${rejectTarget.origin.city} (${rejectTarget.origin.pincode})`,
//         remarks: rejectReason.trim(),
//       });
//       showToast(
//         rejectTarget.paymentMode === 'WALLET'
//           ? `Booking ${rejectTarget.lrNumber} rejected and ${formatINR(rejectTarget.finalAmount)} refunded to seller wallet.`
//           : `Booking ${rejectTarget.lrNumber} rejected.`,
//         'info'
//       );
//       setRejectTarget(null);
//       setRejectReason('');
//       await loadBookings();
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to reject booking.'), 'error');
//     } finally {
//       setRejecting(false);
//     }
//   };

//   return (
//     <div className="space-y-4">
//       {/* Header & Top Filters */}
//       <div className="flex flex-wrap items-center justify-between gap-3">
//         <div className="w-full lg:w-auto flex flex-wrap items-center gap-2.5">
//           <div className="relative w-full sm:w-60">
//             <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
//             <input
//               type="text"
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               placeholder="Search Booking ID, LR, party..."
//               className="pl-8 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none w-full"
//             />
//           </div>

//           <label className="relative inline-flex items-center flex-1 sm:flex-initial min-w-[130px]">
//             <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
//             <select
//               value={routeFilter}
//               onChange={(e) => setRouteFilter(e.target.value)}
//               className="w-full sm:w-auto pl-8 pr-7 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:border-blue-500 focus:outline-none"
//               aria-label="Filter by route"
//             >
//               <option value="ALL">All Routes</option>
//               {routeOptions.map((lane) => (
//                 <option key={lane} value={lane}>
//                   {lane}
//                 </option>
//               ))}
//             </select>
//           </label>

//           <label className="relative inline-flex items-center flex-1 sm:flex-initial min-w-[120px]">
//             <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
//             <select
//               value={dateFilter}
//               onChange={(e) => setDateFilter(e.target.value as DateRangeFilter)}
//               className="w-full sm:w-auto pl-8 pr-7 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:border-blue-500 focus:outline-none"
//               aria-label="Filter by date"
//             >
//               <option value="ALL">All Dates</option>
//               <option value="TODAY">Today</option>
//               <option value="LAST_7_DAYS">Last 7 Days</option>
//               <option value="LAST_30_DAYS">Last 30 Days</option>
//             </select>
//           </label>
//         </div>
//       </div>

//       {/* Status Filter Tabs */}
//       <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
//         {(
//           [
//             { id: 'ALL', label: `All (${tabCounts.ALL})` },
//             { id: 'NEW', label: `New (${tabCounts.NEW})` },
//             { id: 'IN_TRANSIT', label: `In Transit (${tabCounts.IN_TRANSIT})` },
//             { id: 'ARRIVED', label: `Arrived (${tabCounts.ARRIVED})` },
//             { id: 'NDR_RTO', label: `NDR / RTO (${tabCounts.NDR_RTO})` },
//             { id: 'DELIVERED', label: `Delivered (${tabCounts.DELIVERED})` },
//             { id: 'CLOSED', label: `Cancelled / Rejected (${tabCounts.CLOSED})` },
//           ] as const
//         ).map((tab) => {
//           const active = activeTab === tab.id;
//           return (
//             <button
//               key={tab.id}
//               type="button"
//               onClick={() => setActiveTab(tab.id)}
//               className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition whitespace-nowrap shrink-0 ${
//                 active
//                   ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
//                   : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
//               }`}
//             >
//               {tab.label}
//             </button>
//           );
//         })}
//       </div>

//       {/* Assigned Bookings Table */}
//       {loading ? (
//         <LoadingSkeleton rows={5} />
//       ) : error ? (
//         <ErrorBanner message={error} onRetry={loadBookings} />
//       ) : visibleBookings.length === 0 ? (
//         <EmptyState
//           title="No assigned bookings match"
//           description="Try switching the status tab, route filter, or date range."
//         />
//       ) : (
//         <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
//           {/* Mobile / Tablet Card View */}
//           <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
//             {visibleBookings.map((b) => {
//               const rowNext = NEXT_BOOKING_STATUS[b.status];
//               const isUpdating = updatingId === b._id;
//               const sellerName = (b.sellerId as SellerProfile)?.businessName || b.sender.name;
//               const rowScanned = b.scannedCartons?.length ?? 0;

//               return (
//                 <div
//                   key={b._id}
//                   onClick={() =>
//                     navigate(`/transporter/bookings/${b._id}`, {
//                       state: { from: '/transporter/assigned-bookings' },
//                     })
//                   }
//                   className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-slate-300 transition-colors cursor-pointer space-y-2.5 flex flex-col justify-between"
//                 >
//                   <div className="space-y-2">
//                     <div className="flex items-start justify-between gap-2">
//                       <div className="min-w-0">
//                         <p className="font-mono font-semibold text-sm text-blue-600 tabular-nums truncate">
//                           {b.bookingId}
//                         </p>
//                         <p className="font-mono text-[11px] text-slate-500 tabular-nums truncate">
//                           {b.lrNumber}
//                         </p>
//                       </div>
//                       <StatusBadge status={b.status} />
//                     </div>

//                     <div className="text-xs space-y-1">
//                       <p className="font-semibold text-slate-800">
//                         {b.origin.city} → {b.destination.city}
//                       </p>
//                       <p className="text-slate-600 truncate">
//                         From: <span className="font-medium text-slate-800">{sellerName}</span>
//                       </p>
//                       <p className="text-slate-600 truncate">
//                         To: <span className="font-medium text-slate-800">{b.receiver.name}</span> ({b.receiver.city})
//                       </p>
//                     </div>

//                     <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums pt-2 border-t border-slate-100 text-slate-700">
//                       <span>
//                         {b.parcel.numberOfPackages} {b.parcel.numberOfPackages === 1 ? 'Box' : 'Boxes'} ({rowScanned}/{b.parcel.numberOfPackages} scanned)
//                       </span>
//                       <span className="font-semibold text-slate-900">{formatWeight(b.chargeableWeight)}</span>
//                     </div>
//                   </div>

//                   <div
//                     className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100"
//                     onClick={(e) => e.stopPropagation()}
//                   >
//                     <span className="text-[11px] font-mono tabular-nums text-slate-400">
//                       {formatShortBookingTime(b.createdAt)}
//                     </span>
//                     <div className="flex flex-wrap items-center gap-1.5">
//                       {rowNext && (
//                         <button
//                           type="button"
//                           disabled={isUpdating}
//                           onClick={() => handleAdvanceStatus(b, rowNext)}
//                           className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap"
//                         >
//                           <Check className="w-3.5 h-3.5" />
//                           <span>
//                             {isUpdating
//                               ? 'Updating...'
//                               : rowNext === BookingStatus.ACCEPTED
//                                 ? 'Accept'
//                                 : rowNext === BookingStatus.DISPATCHED
//                                   ? 'Dispatch'
//                                   : rowNext === BookingStatus.ARRIVED
//                                     ? 'Arrived'
//                                     : rowNext === BookingStatus.RTO_DELIVERED
//                                       ? 'RTO Delivered'
//                                       : 'Deliver'}
//                           </span>
//                         </button>
//                       )}
//                       {b.status === BookingStatus.BOOKED && (
//                         <button
//                           type="button"
//                           disabled={isUpdating}
//                           onClick={() => {
//                             setRejectTarget(b);
//                             setRejectReason('');
//                           }}
//                           className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition disabled:opacity-50 whitespace-nowrap"
//                         >
//                           <XCircle className="w-3.5 h-3.5" />
//                           <span>Reject</span>
//                         </button>
//                       )}
//                       <button
//                         type="button"
//                         onClick={() =>
//                           navigate(`/transporter/bookings/${b._id}`, {
//                             state: { from: '/transporter/assigned-bookings' },
//                           })
//                         }
//                         className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition whitespace-nowrap"
//                       >
//                         View
//                       </button>
//                     </div>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>

//           <div className="hidden md:block overflow-x-auto">
//             <table className="w-full text-left border-collapse">
//               <thead>
//                 <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
//                   <th className="py-3 pl-4 pr-3">Booking ID</th>
//                   <th className="py-3 px-3">Route</th>
//                   <th className="py-3 px-3 hidden xl:table-cell">Sender</th>
//                   <th className="py-3 px-3">Receiver</th>
//                   <th className="py-3 px-3 hidden xl:table-cell">Packages</th>
//                   <th className="py-3 px-3 hidden lg:table-cell">Weight</th>
//                   <th className="py-3 px-3">Status</th>
//                   <th className="py-3 px-3 hidden xl:table-cell">Booking Time</th>
//                   <th className="py-3 pl-3 pr-4 text-right">Action</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-slate-100 text-sm">
//                 {visibleBookings.map((b) => {
//                   const rowNext = NEXT_BOOKING_STATUS[b.status];
//                   const isUpdating = updatingId === b._id;
//                   const sellerName =
//                     (b.sellerId as SellerProfile)?.businessName || b.sender.name;
//                   const rowScanned = b.scannedCartons?.length ?? 0;

//                   return (
//                     <tr
//                       key={b._id}
//                       onClick={() =>
//                         navigate(`/transporter/bookings/${b._id}`, {
//                           state: { from: '/transporter/assigned-bookings' },
//                         })
//                       }
//                       className="cursor-pointer transition-colors hover:bg-slate-50/80"
//                     >
//                       <td className="py-3 pl-4 pr-3">
//                         <button
//                           type="button"
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             navigate(`/transporter/bookings/${b._id}`, {
//                               state: { from: '/transporter/assigned-bookings' },
//                             });
//                           }}
//                           className="font-mono font-semibold text-blue-600 hover:underline tabular-nums block text-left"
//                         >
//                           {b.bookingId}
//                         </button>
//                         <span className="font-mono text-[11px] text-slate-400 tabular-nums">
//                           {b.lrNumber}
//                         </span>
//                       </td>
//                       <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">
//                         {b.origin.city} → {b.destination.city}
//                       </td>
//                       <td className="py-3 px-3 hidden xl:table-cell">
//                         <p className="font-semibold text-slate-800 leading-tight">{sellerName}</p>
//                         <p className="text-xs text-slate-500">{b.sender.city}</p>
//                       </td>
//                       <td className="py-3 px-3">
//                         <p className="font-semibold text-slate-800 leading-tight">
//                           {b.receiver.name}
//                         </p>
//                         <p className="text-xs text-slate-500">{b.receiver.city}</p>
//                       </td>
//                       <td className="py-3 px-3 hidden xl:table-cell font-mono tabular-nums text-slate-700 whitespace-nowrap">
//                         <span>
//                           {b.parcel.numberOfPackages}{' '}
//                           {b.parcel.numberOfPackages === 1 ? 'Box' : 'Boxes'}
//                         </span>
//                         <span className="block text-[11px] text-slate-400">
//                           {rowScanned}/{b.parcel.numberOfPackages} scanned
//                         </span>
//                       </td>
//                       <td className="py-3 px-3 hidden lg:table-cell font-mono tabular-nums text-slate-700 whitespace-nowrap">
//                         {formatWeight(b.chargeableWeight)}
//                       </td>
//                       <td className="py-3 px-3 whitespace-nowrap">
//                         <StatusBadge status={b.status} />
//                       </td>
//                       <td className="py-3 px-3 hidden xl:table-cell font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
//                         {formatShortBookingTime(b.createdAt)}
//                       </td>
//                       <td
//                         className="py-3 pl-3 pr-4 text-right whitespace-nowrap"
//                         onClick={(e) => e.stopPropagation()}
//                       >
//                         <div className="inline-flex items-center gap-1.5">
//                           {rowNext && (
//                             <button
//                               type="button"
//                               disabled={isUpdating}
//                               onClick={() => handleAdvanceStatus(b, rowNext)}
//                               className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap shrink-0"
//                             >
//                               <Check className="w-3.5 h-3.5" />
//                               <span>
//                                 {isUpdating
//                                   ? 'Updating...'
//                                   : rowNext === BookingStatus.ACCEPTED
//                                     ? 'Accept'
//                                     : rowNext === BookingStatus.DISPATCHED
//                                       ? 'Dispatch'
//                                       : rowNext === BookingStatus.ARRIVED
//                                         ? 'Arrived'
//                                         : rowNext === BookingStatus.RTO_DELIVERED
//                                           ? 'RTO Delivered'
//                                           : 'Deliver'}
//                               </span>
//                             </button>
//                           )}
//                           {b.status === BookingStatus.BOOKED && (
//                             <button
//                               type="button"
//                               disabled={isUpdating}
//                               onClick={() => {
//                                 setRejectTarget(b);
//                                 setRejectReason('');
//                               }}
//                               className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition disabled:opacity-50 whitespace-nowrap shrink-0"
//                             >
//                               <XCircle className="w-3.5 h-3.5" />
//                               <span>Reject</span>
//                             </button>
//                           )}
//                           <button
//                             type="button"
//                             onClick={() =>
//                               navigate(`/transporter/bookings/${b._id}`, {
//                                 state: { from: '/transporter/assigned-bookings' },
//                               })
//                             }
//                             className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition whitespace-nowrap shrink-0"
//                           >
//                             View
//                           </button>
//                         </div>
//                       </td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       )}

//       {/* Reject Booking Modal */}
//       <Modal
//         open={Boolean(rejectTarget)}
//         onClose={() => !rejecting && setRejectTarget(null)}
//         title="Reject Assigned Booking"
//         subtitle={
//           rejectTarget
//             ? `LR ${rejectTarget.lrNumber} · ${rejectTarget.origin.city} → ${rejectTarget.destination.city}`
//             : undefined
//         }
//       >
//         <form onSubmit={handleRejectSubmit} className="space-y-4">
//           {rejectTarget?.paymentMode === 'WALLET' && (
//             <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
//               This shipment was prepaid via Seller Wallet ({formatINR(rejectTarget.finalAmount)}).
//               Rejecting will automatically refund the full amount back to the seller&apos;s wallet.
//             </div>
//           )}

//           <div>
//             <label className="block text-sm font-medium text-slate-700 mb-1.5">
//               Rejection Reason *
//             </label>
//             <textarea
//               rows={3}
//               required
//               minLength={4}
//               value={rejectReason}
//               onChange={(e) => setRejectReason(e.target.value)}
//               placeholder="e.g., No vehicle capacity available for Pune MIDC pickup today"
//               className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-red-500 focus:outline-none"
//             />
//           </div>

//           <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
//             <button
//               type="button"
//               disabled={rejecting}
//               onClick={() => setRejectTarget(null)}
//               className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={rejecting}
//               className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
//             >
//               <XCircle className="w-4 h-4" />
//               <span>{rejecting ? 'Rejecting...' : 'Confirm Reject'}</span>
//             </button>
//           </div>
//         </form>
//       </Modal>

//     </div>
//   );
// }


import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  LayoutGrid,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatINR, formatWeight } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  BookingStatus,
  NEXT_BOOKING_STATUS,
  type Booking,
  type PaginatedResponse,
  type SellerProfile,
} from '../../types/index.ts';

type StatusTab = 'ALL' | 'NEW' | 'IN_TRANSIT' | 'ARRIVED' | 'NDR_RTO' | 'DELIVERED' | 'CLOSED';

function formatShortBookingTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getDefaultLocationForNextStatus(booking: Booking, next: BookingStatus): string {
  if (
    next === BookingStatus.ARRIVED ||
    next === BookingStatus.OUT_FOR_DELIVERY ||
    next === BookingStatus.DELIVERED
  ) {
    return `${booking.destination.city} (${booking.destination.pincode})`;
  }
  return `${booking.origin.city} (${booking.origin.pincode})`;
}

function getNextActionLabel(next: BookingStatus): string {
  switch (next) {
    case BookingStatus.ACCEPTED:
      return 'Accept';
    case BookingStatus.DISPATCHED:
      return 'Dispatch';
    case BookingStatus.ARRIVED:
      return 'Arrived';
    case BookingStatus.RTO_DELIVERED:
      return 'RTO Delivered';
    default:
      return 'Deliver';
  }
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function downloadBookingsCsv(rows: Booking[], filename: string) {
  const headers = [
    'Booking ID',
    'LR Number',
    'Origin',
    'Destination',
    'Consignor',
    'Receiver',
    'Packages',
    'Chargeable Weight',
    'Status',
    'Created At',
  ];

  const lines = rows.map((b) => {
    const sellerName = (b.sellerId as SellerProfile)?.businessName || b.sender.name;
    return [
      b.bookingId,
      b.lrNumber,
      b.origin.city,
      b.destination.city,
      sellerName,
      b.receiver.name,
      b.parcel.numberOfPackages,
      b.chargeableWeight,
      b.status,
      b.createdAt,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csv = [headers.map(escapeCsvCell).join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// LR ko hidden iframe me print karta hai; print dialog se "Save as PDF" hota hai
function downloadLr(b: Booking) {
  const sellerName = (b.sellerId as SellerProfile)?.businessName || b.sender.name;
  const rows: Array<[string, string | number]> = [
    ['LR Number', b.lrNumber],
    ['Booking ID', b.bookingId],
    ['Booking Time', formatShortBookingTime(b.createdAt)],
    ['Origin', `${b.origin.city} (${b.origin.pincode})`],
    ['Destination', `${b.destination.city} (${b.destination.pincode})`],
    ['Sender', `${sellerName}, ${b.sender.city}`],
    ['Receiver', `${b.receiver.name}, ${b.receiver.city}`],
    ['Packages', b.parcel.numberOfPackages],
    ['Chargeable Weight', formatWeight(b.chargeableWeight)],
    ['Payment Mode', b.paymentMode || 'CASH'],
    ['Amount', formatINR(b.finalAmount)],
  ];

  const body = rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.onafterprint = () => frame.remove();
    win.focus();
    win.print();
  };
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>LR-${escapeHtml(b.lrNumber)}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#111}
h1{font-size:18px;margin:0 0 16px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border:1px solid #ccc;padding:8px 10px;text-align:left}
th{width:35%;background:#f5f5f5}
</style></head><body><h1>Lorry Receipt (LR)</h1><table>${body}</table></body></html>`;
  document.body.appendChild(frame);
}

function ShineSweep({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent ${
        tone === 'dark' ? 'via-white/25' : 'via-gray-300/45'
      } to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full`}
    />
  );
}

export function AssignedBookingsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [routeFilter, setRouteFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<Booking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Active tab ko strip ke center me laata hai (sirf horizontal scroll, page nahi hilta)
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!strip || !tab) return;

    const offset = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollTo({
      left: strip.scrollLeft + offset - (strip.clientWidth - tab.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [activeTab]);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
        '/transporter/bookings',
        { params: { page: 1, limit: 100, bookingSource: 'PLATFORM' } }
      );
      setBookings(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load assigned bookings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const routeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookings) {
      const label = `${b.origin.city} → ${b.destination.city}`;
      map.set(label, label);
    }
    return Array.from(map.values());
  }, [bookings]);

  const dateAndRouteFiltered = useMemo(() => {
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    const q = search.trim().toLowerCase();

    return bookings.filter((b) => {
      const laneLabel = `${b.origin.city} → ${b.destination.city}`;
      if (routeFilter !== 'ALL' && laneLabel !== routeFilter) return false;

      const createdMs = new Date(b.createdAt).getTime();
      if (fromMs !== null && !Number.isNaN(fromMs) && createdMs < fromMs) return false;
      if (toMs !== null && !Number.isNaN(toMs) && createdMs > toMs) return false;

      if (q) {
        const sellerName = (
          (b.sellerId as SellerProfile | null)?.businessName || b.sender.name
        ).toLowerCase();
        const hay = `${b.bookingId} ${b.lrNumber} ${laneLabel} ${sellerName} ${b.receiver.name} ${b.origin.city} ${b.destination.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [bookings, routeFilter, dateFrom, dateTo, search]);

  const tabCounts = useMemo(() => {
    let booked = 0;
    let inTransit = 0;
    let arrived = 0;
    let ndrRto = 0;
    let delivered = 0;
    let closed = 0;

    for (const b of dateAndRouteFiltered) {
      if (b.status === BookingStatus.BOOKED) booked += 1;
      else if (b.status === BookingStatus.ACCEPTED || b.status === BookingStatus.DISPATCHED) {
        inTransit += 1;
      } else if (
        b.status === BookingStatus.ARRIVED ||
        b.status === BookingStatus.OUT_FOR_DELIVERY
      ) {
        arrived += 1;
      } else if (
        b.status === BookingStatus.NDR ||
        b.status === BookingStatus.RTO_INITIATED ||
        b.status === BookingStatus.RTO_DELIVERED
      ) {
        ndrRto += 1;
      } else if (b.status === BookingStatus.DELIVERED) delivered += 1;
      else if (b.status === BookingStatus.REJECTED || b.status === BookingStatus.CANCELLED) {
        closed += 1;
      }
    }

    return {
      ALL: dateAndRouteFiltered.length,
      NEW: booked,
      IN_TRANSIT: inTransit,
      ARRIVED: arrived,
      NDR_RTO: ndrRto,
      DELIVERED: delivered,
      CLOSED: closed,
    };
  }, [dateAndRouteFiltered]);

  // Sliding underline ko active tab ke neeche rakhta hai
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!tab) return;

    const measure = () => setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [activeTab, tabCounts]);

  const visibleBookings = useMemo(() => {
    return dateAndRouteFiltered.filter((b) => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'NEW') return b.status === BookingStatus.BOOKED;
      if (activeTab === 'IN_TRANSIT') {
        return b.status === BookingStatus.ACCEPTED || b.status === BookingStatus.DISPATCHED;
      }
      if (activeTab === 'ARRIVED') {
        return (
          b.status === BookingStatus.ARRIVED ||
          b.status === BookingStatus.OUT_FOR_DELIVERY
        );
      }
      if (activeTab === 'NDR_RTO') {
        return (
          b.status === BookingStatus.NDR ||
          b.status === BookingStatus.RTO_INITIATED ||
          b.status === BookingStatus.RTO_DELIVERED
        );
      }
      if (activeTab === 'CLOSED') {
        return b.status === BookingStatus.REJECTED || b.status === BookingStatus.CANCELLED;
      }
      return b.status === BookingStatus.DELIVERED;
    });
  }, [dateAndRouteFiltered, activeTab]);

  const selectedVisibleBookings = useMemo(
    () => visibleBookings.filter((b) => selectedIds.has(b._id)),
    [visibleBookings, selectedIds]
  );

  const allVisibleSelected =
    visibleBookings.length > 0 && selectedVisibleBookings.length === visibleBookings.length;

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const b of visibleBookings) next.delete(b._id);
      } else {
        for (const b of visibleBookings) next.add(b._id);
      }
      return next;
    });
  };

  const navigateToBooking = (bookingId: string) => {
    navigate(`/transporter/bookings/${bookingId}`, {
      state: { from: '/transporter/assigned-bookings' },
    });
  };

  const handleAdvanceStatus = async (booking: Booking, targetStatus: BookingStatus) => {
    setUpdatingId(booking._id);
    try {
      await apiClient.patch(`/bookings/${booking._id}/status`, {
        status: targetStatus,
        location: getDefaultLocationForNextStatus(booking, targetStatus),
      });
      showToast(`Shipment ${booking.lrNumber} marked as ${targetStatus}.`, 'success');
      await loadBookings();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update shipment status.'), 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 4) {
      showToast('Please provide a clear rejection reason (at least 4 characters).', 'error');
      return;
    }

    setRejecting(true);
    try {
      await apiClient.patch(`/bookings/${rejectTarget._id}/status`, {
        status: BookingStatus.REJECTED,
        location: `${rejectTarget.origin.city} (${rejectTarget.origin.pincode})`,
        remarks: rejectReason.trim(),
      });
      showToast(
        rejectTarget.paymentMode === 'WALLET'
          ? `Booking ${rejectTarget.lrNumber} rejected and ${formatINR(rejectTarget.finalAmount)} refunded to seller wallet.`
          : `Booking ${rejectTarget.lrNumber} rejected.`,
        'info'
      );
      setRejectTarget(null);
      setRejectReason('');
      await loadBookings();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to reject booking.'), 'error');
    } finally {
      setRejecting(false);
    }
  };

  const renderInlineActions = (b: Booking) => {
    const rowNext = NEXT_BOOKING_STATUS[b.status];
    const isUpdating = updatingId === b._id;
    const canReject = b.status === BookingStatus.BOOKED;

    return (
      <div className="inline-flex items-center flex-nowrap gap-2 whitespace-nowrap text-[13px]">
        {rowNext && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => handleAdvanceStatus(b, rowNext)}
            className="inline-flex items-center justify-center h-8 px-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            {isUpdating ? 'Updating...' : getNextActionLabel(rowNext)}
          </button>
        )}

        {canReject && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => {
              setRejectTarget(b);
              setRejectReason('');
            }}
            className="inline-flex items-center justify-center h-8 px-3 font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            Reject
          </button>
        )}

        <button
          type="button"
          onClick={() => downloadLr(b)}
          aria-label={`Download LR ${b.lrNumber}`}
          className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-blue-700 transition-colors whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          LR
        </button>

        <button
          type="button"
          onClick={() => navigateToBooking(b._id)}
          className="font-medium text-gray-600 hover:text-blue-700 underline decoration-transparent underline-offset-4 hover:decoration-blue-600 hover:decoration-2 transition-all whitespace-nowrap"
        >
          View
        </button>
      </div>
    );
  };

  const statusTabs: Array<{
    id: StatusTab;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'ALL', label: 'All', count: tabCounts.ALL, icon: LayoutGrid },
    { id: 'NEW', label: 'New', count: tabCounts.NEW, icon: Package },
    { id: 'IN_TRANSIT', label: 'In transit', count: tabCounts.IN_TRANSIT, icon: Truck },
    { id: 'ARRIVED', label: 'Arrived', count: tabCounts.ARRIVED, icon: MapPin },
    { id: 'DELIVERED', label: 'Delivered', count: tabCounts.DELIVERED, icon: CheckCircle2 },
    { id: 'NDR_RTO', label: 'NDR / RTO', count: tabCounts.NDR_RTO, icon: RotateCcw },
    { id: 'CLOSED', label: 'Cancelled', count: tabCounts.CLOSED, icon: XCircle },
  ];

  return (
    <div
      className="space-y-4 text-gray-900 antialiased"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {/* Top Bar: Desktop par Tabs upar; Mobile par Filters upar aur Tabs table ke just upar */}
      <div className="flex flex-col gap-3.5">
        {/* Underline Status Tabs */}
        <div
          ref={tabsRef}
          className="relative order-2 md:order-1 border-b border-gray-200 flex items-center gap-5 overflow-x-auto scrollbar-none"
        >
          {statusTabs.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                data-tab={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 pb-3 pt-1 text-xs sm:text-sm font-medium transition-colors duration-300 ease-out whitespace-nowrap shrink-0 ${
                  active ? 'text-blue-700' : 'text-gray-500 hover:text-blue-600'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors duration-300 ${
                    active ? 'text-blue-600' : 'text-gray-400'
                  }`}
                />
                <span>{tab.label}</span>
                <span
                  className={`inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[11px] font-semibold tabular-nums leading-none transition-colors duration-300 ease-out ${
                    active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-0 h-0.5 rounded-full bg-blue-600 transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
          />
        </div>

        {/* Filters (Left) + Action Buttons (Right) */}
        <div className="order-1 md:order-2 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Left: Search + Date Range (From / To) + Route */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Booking ID, LR, party..."
                className="pl-8 pr-3 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none w-full transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="From date"
                className="flex-1 min-w-0 sm:w-36 px-2.5 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 tabular-nums focus:border-blue-600 focus:outline-none transition-colors"
              />
              <span className="text-xs font-medium text-gray-400 select-none">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="To date"
                className="flex-1 min-w-0 sm:w-36 px-2.5 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-700 tabular-nums focus:border-blue-600 focus:outline-none transition-colors"
              />
            </div>

            <label className="relative inline-flex items-center w-full sm:w-auto min-w-[140px]">
              <MapPin className="w-3.5 h-3.5 text-gray-400 absolute left-3 pointer-events-none" />
              <select
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                className="w-full sm:w-auto pl-8 pr-7 py-2 text-xs sm:text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 focus:border-blue-600 focus:outline-none transition-colors"
                aria-label="Filter by route"
              >
                <option value="ALL">All Routes</option>
                {routeOptions.map((lane) => (
                  <option key={lane} value={lane}>
                    {lane}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Right: Download selected, CSV, Refresh */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={selectedVisibleBookings.length === 0}
              onClick={() =>
                downloadBookingsCsv(selectedVisibleBookings, 'assigned-bookings-selected.csv')
              }
              className="group relative overflow-hidden inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-lg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] hover:border-blue-300 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {selectedVisibleBookings.length > 0 && <ShineSweep tone="light" />}
              <Download className="relative z-10 w-3.5 h-3.5 text-blue-600" />
              <span className="relative z-10">
                Download selected
                {selectedVisibleBookings.length > 0 ? ` (${selectedVisibleBookings.length})` : ''}
              </span>
            </button>

            <button
              type="button"
              disabled={visibleBookings.length === 0}
              onClick={() => downloadBookingsCsv(visibleBookings, 'assigned-bookings.csv')}
              className="group relative overflow-hidden inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-gray-800 bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-lg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] hover:border-blue-300 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {visibleBookings.length > 0 && <ShineSweep tone="light" />}
              <Download className="relative z-10 w-3.5 h-3.5 text-blue-600" />
              <span className="relative z-10">CSV</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={loadBookings}
              className="group relative overflow-hidden inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-600 rounded-lg shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_1px_2px_0_rgba(0,0,0,0.1)] hover:from-blue-600 hover:to-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <ShineSweep tone="dark" />
              <RefreshCw className={`relative z-10 w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="relative z-10">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Assigned Bookings Table */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadBookings} />
      ) : visibleBookings.length === 0 ? (
        <EmptyState
          title="No assigned bookings match"
          description="Try switching the status tab, route filter, or date range."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
          {/* Mobile Card View */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
            {visibleBookings.map((b) => {
              const sellerName = (b.sellerId as SellerProfile)?.businessName || b.sender.name;
              const isSelected = selectedIds.has(b._id);

              return (
                <div
                  key={b._id}
                  onClick={() => navigateToBooking(b._id)}
                  className={`border rounded-xl p-3.5 bg-white text-[13px] hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer space-y-2.5 flex flex-col justify-between ${
                    isSelected ? 'border-blue-600 bg-blue-50/60' : 'border-gray-200'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(b._id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select booking ${b.bookingId}`}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-blue-600 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 tabular-nums truncate">
                            {b.bookingId}
                          </p>
                          <p className="text-gray-500 tabular-nums truncate">{b.lrNumber}</p>
                        </div>
                      </div>
                      <span className="shrink-0 [&>*]:!text-[13px]">
                        <StatusBadge status={b.status} />
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p className="font-semibold text-gray-800">
                        {b.origin.city} <span className="text-gray-400">→</span> {b.destination.city}
                      </p>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="min-w-0">
                          <p className="text-gray-500">Sender</p>
                          <p className="font-medium text-gray-800 truncate">{sellerName}</p>
                          <p className="text-gray-500 truncate">{b.sender.city}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-gray-500">Receiver</p>
                          <p className="font-medium text-gray-800 truncate">{b.receiver.name}</p>
                          <p className="text-gray-500 truncate">{b.receiver.city}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums pt-2 border-t border-gray-100 text-gray-500">
                      <span>
                        {b.parcel.numberOfPackages} {b.parcel.numberOfPackages === 1 ? 'Box' : 'Boxes'}
                      </span>
                      <span className="font-semibold text-gray-900">{formatWeight(b.chargeableWeight)}</span>
                    </div>
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="tabular-nums text-gray-500">
                      {formatShortBookingTime(b.createdAt)}
                    </span>
                    {renderInlineActions(b)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (merged columns) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px] leading-5">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="py-3 pl-4 pr-2 w-9">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible bookings"
                      className="h-4 w-4 rounded border-gray-300 accent-blue-600 cursor-pointer align-middle"
                    />
                  </th>
                  <th className="py-3 px-3">Booking</th>
                  <th className="py-3 px-3">Route</th>
                  <th className="py-3 px-3">Sender</th>
                  <th className="py-3 px-3">Receiver</th>
                  <th className="py-3 px-3">Shipment</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleBookings.map((b) => {
                  const sellerName =
                    (b.sellerId as SellerProfile)?.businessName || b.sender.name;
                  const isSelected = selectedIds.has(b._id);

                  return (
                    <tr
                      key={b._id}
                      onClick={() => navigateToBooking(b._id)}
                      className={`cursor-pointer align-top transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-blue-50/40'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(b._id)}
                          aria-label={`Select booking ${b.bookingId}`}
                          className="h-4 w-4 rounded border-gray-300 accent-blue-600 cursor-pointer align-middle"
                        />
                      </td>

                      {/* Booking ID + LR + Time */}
                      <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToBooking(b._id);
                          }}
                          className="font-semibold text-gray-900 underline decoration-transparent hover:decoration-blue-600 underline-offset-4 transition-all block text-left"
                        >
                          {b.bookingId}
                        </button>
                        <p className="text-gray-500">{b.lrNumber}</p>
                        <p className="text-gray-500">{formatShortBookingTime(b.createdAt)}</p>
                      </td>

                      <td className="py-3 px-3 font-semibold text-gray-900">
                        {b.origin.city} <span className="text-gray-400">→</span> {b.destination.city}
                      </td>

                      <td className="py-3 px-3">
                        <p className="font-medium text-gray-900">{sellerName}</p>
                        <p className="text-gray-500">{b.sender.city}</p>
                      </td>

                      <td className="py-3 px-3">
                        <p className="font-medium text-gray-900">{b.receiver.name}</p>
                        <p className="text-gray-500">{b.receiver.city}</p>
                      </td>

                      {/* Packages + Weight */}
                      <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                        <p className="font-semibold text-gray-900">
                          {formatWeight(b.chargeableWeight)}
                        </p>
                        <p className="text-gray-500">
                          {b.parcel.numberOfPackages}{' '}
                          {b.parcel.numberOfPackages === 1 ? 'Box' : 'Boxes'}
                        </p>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap [&>*]:!text-[13px]">
                        <StatusBadge status={b.status} />
                      </td>
                      <td
                        className="py-3 pl-3 pr-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderInlineActions(b)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Booking Modal */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => !rejecting && setRejectTarget(null)}
        title="Reject Assigned Booking"
        subtitle={
          rejectTarget
            ? `LR ${rejectTarget.lrNumber} · ${rejectTarget.origin.city} → ${rejectTarget.destination.city}`
            : undefined
        }
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          {rejectTarget?.paymentMode === 'WALLET' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              This shipment was prepaid via Seller Wallet ({formatINR(rejectTarget.finalAmount)}).
              Rejecting will automatically refund the full amount back to the seller&apos;s wallet.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Rejection Reason *
            </label>
            <textarea
              rows={3}
              required
              minLength={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., No vehicle capacity available for Pune MIDC pickup today"
              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-xl focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={rejecting}
              onClick={() => setRejectTarget(null)}
              className="group relative overflow-hidden w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] hover:border-gray-300 transition-colors"
            >
              <ShineSweep tone="light" />
              <span className="relative z-10">Cancel</span>
            </button>
            <button
              type="submit"
              disabled={rejecting}
              className="group relative overflow-hidden w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-red-500 to-red-600 rounded-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.28),0_1px_2px_0_rgba(0,0,0,0.1)] hover:from-red-600 hover:to-red-700 disabled:opacity-50 transition-colors"
            >
              <ShineSweep tone="dark" />
              <XCircle className="relative z-10 w-4 h-4" />
              <span className="relative z-10">{rejecting ? 'Rejecting...' : 'Confirm Reject'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
