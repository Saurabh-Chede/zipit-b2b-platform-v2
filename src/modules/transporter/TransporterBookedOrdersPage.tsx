// import React, { useCallback, useEffect, useMemo, useState } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import {
//   Barcode,
//   Check,
//   FileDown,
//   MapPin,
//   PackagePlus,
//   Search,
// } from 'lucide-react';
// import { apiClient, extractErrorMessage } from '../../services/api.ts';
// import { useToast } from '../../context/ToastContext.tsx';
// import { formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
// import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
// import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
// import {
//   BookingStatus,
//   NEXT_BOOKING_STATUS,
//   type Booking,
//   type PaginatedResponse,
// } from '../../types/index.ts';

// type StatusTab = 'ALL' | 'BOOKED_ACCEPTED' | 'IN_TRANSIT' | 'ARRIVED' | 'NDR_RTO' | 'DELIVERED';

// export function TransporterBookedOrdersPage() {
//   const navigate = useNavigate();
//   const { showToast } = useToast();

//   const [bookings, setBookings] = useState<Booking[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
//   const [search, setSearch] = useState('');
//   const [updatingId, setUpdatingId] = useState<string | null>(null);

//   const loadBookedOrders = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
//         '/transporter/bookings',
//         {
//           params: {
//             page: 1,
//             limit: 100,
//             bookingSource: 'TRANSPORTER_SELF',
//           },
//         }
//       );
//       setBookings(res.data.data.items);
//     } catch (err) {
//       setError(extractErrorMessage(err, 'Failed to load your booked orders.'));
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     loadBookedOrders();
//   }, [loadBookedOrders]);

//   const searchFiltered = useMemo(() => {
//     const q = search.trim().toLowerCase();
//     if (!q) return bookings;
//     return bookings.filter((b) => {
//       const hay = `${b.bookingId} ${b.lrNumber} ${b.origin.city} ${b.destination.city} ${b.sender.name} ${b.receiver.name}`.toLowerCase();
//       return hay.includes(q);
//     });
//   }, [bookings, search]);

//   const counts = useMemo(() => {
//     let bookedAccepted = 0;
//     let inTransit = 0;
//     let arrived = 0;
//     let ndrRto = 0;
//     let delivered = 0;

//     for (const b of searchFiltered) {
//       if (b.status === BookingStatus.BOOKED || b.status === BookingStatus.ACCEPTED) bookedAccepted += 1;
//       else if (b.status === BookingStatus.DISPATCHED) inTransit += 1;
//       else if (
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
//     }

//     return {
//       ALL: searchFiltered.length,
//       BOOKED_ACCEPTED: bookedAccepted,
//       IN_TRANSIT: inTransit,
//       ARRIVED: arrived,
//       NDR_RTO: ndrRto,
//       DELIVERED: delivered,
//     };
//   }, [searchFiltered]);

//   const visibleBookings = useMemo(() => {
//     return searchFiltered.filter((b) => {
//       if (activeTab === 'ALL') return true;
//       if (activeTab === 'BOOKED_ACCEPTED') {
//         return b.status === BookingStatus.BOOKED || b.status === BookingStatus.ACCEPTED;
//       }
//       if (activeTab === 'IN_TRANSIT') return b.status === BookingStatus.DISPATCHED;
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
//       return b.status === BookingStatus.DELIVERED;
//     });
//   }, [searchFiltered, activeTab]);

//   const handleQuickAdvance = async (booking: Booking, nextStatus: BookingStatus) => {
//     setUpdatingId(booking._id);
//     try {
//       const location =
//         nextStatus === BookingStatus.ARRIVED ||
//         nextStatus === BookingStatus.OUT_FOR_DELIVERY ||
//         nextStatus === BookingStatus.DELIVERED
//           ? `${booking.destination.city} (${booking.destination.pincode})`
//           : `${booking.origin.city} (${booking.origin.pincode})`;
//       await apiClient.patch(`/bookings/${booking._id}/status`, {
//         status: nextStatus,
//         location,
//       });
//       showToast(`Shipment ${booking.lrNumber} marked as ${nextStatus}.`, 'success');
//       await loadBookedOrders();
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to update status.'), 'error');
//     } finally {
//       setUpdatingId(null);
//     }
//   };

//   const triggerDownload = async (endpoint: string, filename: string, mime: string) => {
//     try {
//       const res = await apiClient.get(endpoint, { responseType: 'blob' });
//       const blob = new Blob([res.data as BlobPart], { type: mime });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = filename;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(url);
//       showToast(`Downloaded ${filename}`, 'success');
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Download failed.'), 'error');
//     }
//   };

//   return (
//     <div className="space-y-5">
//       <div className="flex flex-wrap items-center justify-end gap-4">

//         <Link
//           to="/transporter/create-order"
//           className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap shrink-0"
//         >
//           <PackagePlus className="w-4 h-4" />
//           <span>Create Order</span>
//         </Link>
//       </div>

//       {/* Filter Strip */}
//       <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
//         <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
//           {(
//             [
//               { id: 'ALL', label: `All (${counts.ALL})` },
//               { id: 'BOOKED_ACCEPTED', label: `Ready to Dispatch (${counts.BOOKED_ACCEPTED})` },
//               { id: 'IN_TRANSIT', label: `In Transit (${counts.IN_TRANSIT})` },
//               { id: 'ARRIVED', label: `Arrived (${counts.ARRIVED})` },
//               { id: 'NDR_RTO', label: `NDR / RTO (${counts.NDR_RTO})` },
//               { id: 'DELIVERED', label: `Delivered (${counts.DELIVERED})` },
//             ] as const
//           ).map((tab) => (
//             <button
//               key={tab.id}
//               type="button"
//               onClick={() => setActiveTab(tab.id)}
//               className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition whitespace-nowrap ${
//                 activeTab === tab.id
//                   ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
//                   : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
//               }`}
//             >
//               {tab.label}
//             </button>
//           ))}
//         </div>

//         <div className="relative w-full lg:w-64 lg:min-w-[240px]">
//           <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
//           <input
//             type="text"
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             placeholder="Search LR, Booking ID, party..."
//             className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
//           />
//         </div>
//       </div>

//       {loading ? (
//         <LoadingSkeleton rows={5} />
//       ) : error ? (
//         <ErrorBanner message={error} onRetry={loadBookedOrders} />
//       ) : visibleBookings.length === 0 ? (
//         <EmptyState
//           title="No personal booked orders yet"
//           description="Create a shipment for your direct customers from the Create Order panel to manage LR and tracking here."
//         />
//       ) : (
//         <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
//           {/* Mobile / Tablet Card View */}
//           <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
//             {visibleBookings.map((b) => {
//               const nextStatus =
//                 b.status === BookingStatus.BOOKED
//                   ? BookingStatus.DISPATCHED
//                   : NEXT_BOOKING_STATUS[b.status];
//               const isUpdating = updatingId === b._id;
//               return (
//                 <div
//                   key={b._id}
//                   onClick={() =>
//                     navigate(`/transporter/bookings/${b._id}`, {
//                       state: { from: '/transporter/booked-orders' },
//                     })
//                   }
//                   className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-slate-300 transition-colors cursor-pointer space-y-2.5 flex flex-col justify-between"
//                 >
//                   <div className="space-y-2">
//                     <div className="flex items-start justify-between gap-2">
//                       <div className="min-w-0">
//                         <p className="font-mono font-semibold text-sm text-blue-600 tabular-nums truncate">
//                           {b.lrNumber}
//                         </p>
//                         <p className="font-mono text-[11px] text-slate-400 tabular-nums truncate">
//                           {b.bookingId}
//                         </p>
//                       </div>
//                       <StatusBadge status={b.status} />
//                     </div>

//                     <div className="text-xs space-y-1">
//                       <p className="font-semibold text-slate-900">
//                         {b.origin.city} → {b.destination.city}
//                       </p>
//                       <p className="text-slate-600 truncate">
//                         {b.sender.name} → {b.receiver.name} ({b.paymentMode || 'CASH'})
//                       </p>
//                     </div>

//                     <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums pt-2 border-t border-slate-100 text-slate-700">
//                       <span>
//                         {formatWeight(b.chargeableWeight)} · {b.parcel.numberOfPackages} box{b.parcel.numberOfPackages === 1 ? '' : 'es'}
//                       </span>
//                       <span className="font-semibold text-slate-900">{formatINR(b.finalAmount)}</span>
//                     </div>
//                   </div>

//                   <div
//                     className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100"
//                     onClick={(e) => e.stopPropagation()}
//                   >
//                     {b.status === BookingStatus.ARRIVED && (
//                       <button
//                         type="button"
//                         disabled={isUpdating}
//                         onClick={() => handleQuickAdvance(b, BookingStatus.OUT_FOR_DELIVERY)}
//                         className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 disabled:opacity-50"
//                       >
//                         <span>Out for Delivery</span>
//                       </button>
//                     )}
//                     {nextStatus && (
//                       <button
//                         type="button"
//                         disabled={isUpdating}
//                         onClick={() => handleQuickAdvance(b, nextStatus)}
//                         className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
//                       >
//                         <Check className="w-3.5 h-3.5" />
//                         <span>{isUpdating ? '...' : nextStatus}</span>
//                       </button>
//                     )}
//                     <button
//                       type="button"
//                       title="Download LR PDF"
//                       onClick={() =>
//                         triggerDownload(
//                           `/bookings/${b._id}/lr`,
//                           `${b.lrNumber}.pdf`,
//                           'application/pdf'
//                         )
//                       }
//                       className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                     >
//                       <FileDown className="w-3.5 h-3.5 text-blue-600" />
//                       <span>LR</span>
//                     </button>
//                     <button
//                       type="button"
//                       title="Download Barcode PNG"
//                       onClick={() =>
//                         triggerDownload(
//                           `/bookings/${b._id}/barcode?download=1`,
//                           `${b.lrNumber}-barcode.png`,
//                           'image/png'
//                         )
//                       }
//                       className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                     >
//                       <Barcode className="w-3.5 h-3.5 text-slate-700" />
//                     </button>
//                     <button
//                       type="button"
//                       title="Track LR"
//                       onClick={() =>
//                         navigate(`/transporter/tracking?lr=${encodeURIComponent(b.lrNumber)}`)
//                       }
//                       className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                     >
//                       <MapPin className="w-3.5 h-3.5 text-emerald-600" />
//                     </button>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>

//           <div className="hidden md:block overflow-x-auto">
//             <table className="w-full text-left border-collapse">
//               <thead>
//                 <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
//                   <th className="py-3 px-4">LR &amp; Booking ID</th>
//                   <th className="py-3 px-4">Route</th>
//                   <th className="py-3 px-4 hidden xl:table-cell">Sender → Receiver</th>
//                   <th className="py-3 px-4 text-right hidden xl:table-cell">Wt / Boxes</th>
//                   <th className="py-3 px-4 text-right">Amount</th>
//                   <th className="py-3 px-4">Status</th>
//                   <th className="py-3 px-4 hidden xl:table-cell">Created</th>
//                   <th className="py-3 px-4 text-right">Actions</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-slate-100 text-sm">
//                 {visibleBookings.map((b) => {
//                   const nextStatus =
//                     b.status === BookingStatus.BOOKED
//                       ? BookingStatus.DISPATCHED
//                       : NEXT_BOOKING_STATUS[b.status];
//                   const isUpdating = updatingId === b._id;
//                   return (
//                     <tr
//                       key={b._id}
//                       onClick={() =>
//                         navigate(`/transporter/bookings/${b._id}`, {
//                           state: { from: '/transporter/booked-orders' },
//                         })
//                       }
//                       className="hover:bg-slate-50/70 cursor-pointer"
//                     >
//                       <td className="py-3 px-4 whitespace-nowrap">
//                         <span className="font-mono font-semibold text-blue-600 tabular-nums block">
//                           {b.lrNumber}
//                         </span>
//                         <span className="font-mono text-[11px] text-slate-400 tabular-nums">
//                           {b.bookingId}
//                         </span>
//                       </td>
//                       <td className="py-3 px-4 whitespace-nowrap">
//                         <span className="font-medium text-slate-900">
//                           {b.origin.city} → {b.destination.city}
//                         </span>
//                         <span className="block text-[11px] font-mono text-slate-400 tabular-nums">
//                           {b.origin.pincode} → {b.destination.pincode}
//                         </span>
//                       </td>
//                       <td className="py-3 px-4 hidden xl:table-cell">
//                         <p className="font-medium text-slate-900 truncate max-w-[200px]">
//                           {b.sender.name} → {b.receiver.name}
//                         </p>
//                         <p className="text-xs text-slate-500">{b.paymentMode || 'CASH'}</p>
//                       </td>
//                       <td className="py-3 px-4 hidden xl:table-cell text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
//                         <div>{formatWeight(b.chargeableWeight)}</div>
//                         <div className="text-[11px] text-slate-400">
//                           {b.parcel.numberOfPackages} box{b.parcel.numberOfPackages === 1 ? '' : 'es'}
//                         </div>
//                       </td>
//                       <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
//                         <div>{formatINR(b.finalAmount)}</div>
//                         {Number(b.platformCharge ?? b.pricingSnapshot?.platformCharge ?? 0) > 0 && (
//                           <div className="text-[11px] font-normal text-slate-500">
//                             incl. {formatINR(b.platformCharge ?? b.pricingSnapshot?.platformCharge ?? 0)} fee
//                           </div>
//                         )}
//                       </td>
//                       <td className="py-3 px-4 whitespace-nowrap">
//                         <StatusBadge status={b.status} />
//                       </td>
//                       <td className="py-3 px-4 hidden xl:table-cell font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
//                         {formatDateTime(b.createdAt)}
//                       </td>
//                       <td
//                         className="py-3 px-4 text-right whitespace-nowrap"
//                         onClick={(e) => e.stopPropagation()}
//                       >
//                         <div className="inline-flex items-center gap-1.5">
//                           {b.status === BookingStatus.ARRIVED && (
//                             <button
//                               type="button"
//                               disabled={isUpdating}
//                               onClick={() => handleQuickAdvance(b, BookingStatus.OUT_FOR_DELIVERY)}
//                               className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 disabled:opacity-50"
//                             >
//                               <span>Out for Delivery</span>
//                             </button>
//                           )}
//                           {nextStatus && (
//                             <button
//                               type="button"
//                               disabled={isUpdating}
//                               onClick={() => handleQuickAdvance(b, nextStatus)}
//                               className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
//                             >
//                               <Check className="w-3.5 h-3.5" />
//                               <span>
//                                 {isUpdating ? '...' : nextStatus}
//                               </span>
//                             </button>
//                           )}
//                           <button
//                             type="button"
//                             title="Download LR PDF"
//                             onClick={() =>
//                               triggerDownload(
//                                 `/bookings/${b._id}/lr`,
//                                 `${b.lrNumber}.pdf`,
//                                 'application/pdf'
//                               )
//                             }
//                             className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                           >
//                             <FileDown className="w-3.5 h-3.5 text-blue-600" />
//                             <span>LR</span>
//                           </button>
//                           <button
//                             type="button"
//                             title="Download Barcode PNG"
//                             onClick={() =>
//                               triggerDownload(
//                                 `/bookings/${b._id}/barcode?download=1`,
//                                 `${b.lrNumber}-barcode.png`,
//                                 'image/png'
//                               )
//                             }
//                             className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                           >
//                             <Barcode className="w-3.5 h-3.5 text-slate-700" />
//                           </button>
//                           <button
//                             type="button"
//                             title="Track LR"
//                             onClick={() =>
//                               navigate(`/transporter/tracking?lr=${encodeURIComponent(b.lrNumber)}`)
//                             }
//                             className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                           >
//                             <MapPin className="w-3.5 h-3.5 text-emerald-600" />
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
//     </div>
//   );
// }


import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  Barcode,
  CheckCircle2,
  Eye,
  FileDown,
  LayoutGrid,
  MapPin,
  Package,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  MoreVertical,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  BookingStatus,
  NEXT_BOOKING_STATUS,
  type Booking,
  type PaginatedResponse,
} from '../../types/index.ts';

type StatusTab = 'ALL' | 'BOOKED_ACCEPTED' | 'IN_TRANSIT' | 'ARRIVED' | 'NDR_RTO' | 'DELIVERED';

type RowMenuItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

const MENU_WIDTH = 176;
const ITEM_HEIGHT = 36;

// Menu body me render hota hai, taaki table ke overflow se cut na ho
function RowMenu({ items }: { items: RowMenuItem[] }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = position !== null;

  const toggle = () => {
    if (open) return setPosition(null);
    const rect = buttonRef.current!.getBoundingClientRect();
    const height = items.length * ITEM_HEIGHT + 10;
    const openUp = rect.bottom + height + 8 > window.innerHeight;
    setPosition({
      top: openUp ? rect.top - height - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - MENU_WIDTH),
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      buttonRef.current?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center h-8 w-8 shrink-0 text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-50 py-1 bg-white border border-gray-200 rounded-lg shadow-lg"
          >
            {items.map(({ label, icon: Icon, onClick, danger, disabled }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setPosition(null);
                  onClick();
                }}
                className={`flex w-full items-center gap-2 h-9 px-3 text-[13px] font-medium text-left disabled:opacity-40 ${
                  danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

export function TransporterBookedOrdersPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadBookedOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PaginatedResponse<Booking> }>(
        '/transporter/bookings',
        {
          params: {
            page: 1,
            limit: 100,
            bookingSource: 'TRANSPORTER_SELF',
          },
        }
      );
      setBookings(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load your booked orders.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookedOrders();
  }, [loadBookedOrders]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const hay = `${b.bookingId} ${b.lrNumber} ${b.origin.city} ${b.destination.city} ${b.sender.name} ${b.receiver.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bookings, search]);

  const counts = useMemo(() => {
    let bookedAccepted = 0;
    let inTransit = 0;
    let arrived = 0;
    let ndrRto = 0;
    let delivered = 0;

    for (const b of searchFiltered) {
      if (b.status === BookingStatus.BOOKED || b.status === BookingStatus.ACCEPTED) bookedAccepted += 1;
      else if (b.status === BookingStatus.DISPATCHED) inTransit += 1;
      else if (
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
    }

    return {
      ALL: searchFiltered.length,
      BOOKED_ACCEPTED: bookedAccepted,
      IN_TRANSIT: inTransit,
      ARRIVED: arrived,
      NDR_RTO: ndrRto,
      DELIVERED: delivered,
    };
  }, [searchFiltered]);

  const visibleBookings = useMemo(() => {
    return searchFiltered.filter((b) => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'BOOKED_ACCEPTED') {
        return b.status === BookingStatus.BOOKED || b.status === BookingStatus.ACCEPTED;
      }
      if (activeTab === 'IN_TRANSIT') return b.status === BookingStatus.DISPATCHED;
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
      return b.status === BookingStatus.DELIVERED;
    });
  }, [searchFiltered, activeTab]);

  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Active tab ko center me laata hai
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!strip || !tab) return;
    strip.scrollTo({
      left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [activeTab]);

  // Sliding underline ko active tab ke neeche rakhta hai
  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!tab) return;
    const measure = () => setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [activeTab, counts]);

  const handleQuickAdvance = async (booking: Booking, nextStatus: BookingStatus) => {
    setUpdatingId(booking._id);
    try {
      const location =
        nextStatus === BookingStatus.ARRIVED ||
        nextStatus === BookingStatus.OUT_FOR_DELIVERY ||
        nextStatus === BookingStatus.DELIVERED
          ? `${booking.destination.city} (${booking.destination.pincode})`
          : `${booking.origin.city} (${booking.origin.pincode})`;
      await apiClient.patch(`/bookings/${booking._id}/status`, {
        status: nextStatus,
        location,
      });
      showToast(`Shipment ${booking.lrNumber} marked as ${nextStatus}.`, 'success');
      await loadBookedOrders();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update status.'), 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const triggerDownload = async (endpoint: string, filename: string, mime: string) => {
    try {
      const res = await apiClient.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([res.data as BlobPart], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Download failed.'), 'error');
    }
  };

  const statusTabs: Array<{
    id: StatusTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'ALL', label: 'All', icon: LayoutGrid },
    { id: 'BOOKED_ACCEPTED', label: 'Ready to Dispatch', icon: Package },
    { id: 'IN_TRANSIT', label: 'In Transit', icon: Truck },
    { id: 'ARRIVED', label: 'Arrived', icon: MapPin },
    { id: 'NDR_RTO', label: 'NDR / RTO', icon: RotateCcw },
    { id: 'DELIVERED', label: 'Delivered', icon: CheckCircle2 },
  ];

  const openBooking = (id: string) =>
    navigate(`/transporter/bookings/${id}`, {
      state: { from: '/transporter/booked-orders' },
    });

  const renderActions = (b: Booking) => {
    const nextStatus =
      b.status === BookingStatus.BOOKED
        ? BookingStatus.DISPATCHED
        : NEXT_BOOKING_STATUS[b.status];
    const isUpdating = updatingId === b._id;
    const statusButton =
      'inline-flex items-center justify-center h-8 px-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 whitespace-nowrap';

    return (
      <div className="inline-flex flex-wrap items-center justify-end gap-1.5 text-[13px]">
        {b.status === BookingStatus.ARRIVED && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => handleQuickAdvance(b, BookingStatus.OUT_FOR_DELIVERY)}
            className="inline-flex items-center justify-center h-8 px-3 font-semibold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-40 whitespace-nowrap"
          >
            Out for Delivery
          </button>
        )}
        {nextStatus && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => handleQuickAdvance(b, nextStatus)}
            className={statusButton}
          >
            {isUpdating ? 'Updating...' : nextStatus}
          </button>
        )}
        <button
          type="button"
          title="Download LR PDF"
          onClick={() =>
            triggerDownload(`/bookings/${b._id}/lr`, `${b.lrNumber}.pdf`, 'application/pdf')
          }
          className="inline-flex items-center justify-center gap-1 h-8 px-2.5 font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 transition-colors"
        >
          <FileDown className="w-3.5 h-3.5 text-blue-600" />
          <span>LR</span>
        </button>
        <RowMenu
          items={[
            { label: 'View', icon: Eye, onClick: () => openBooking(b._id) },
            {
              label: 'Download Barcode',
              icon: Barcode,
              onClick: () =>
                triggerDownload(
                  `/bookings/${b._id}/barcode?download=1`,
                  `${b.lrNumber}-barcode.png`,
                  'image/png'
                ),
            },
            {
              label: 'Track LR',
              icon: MapPin,
              onClick: () => navigate(`/transporter/tracking?lr=${encodeURIComponent(b.lrNumber)}`),
            },
          ]}
        />
      </div>
    );
  };

  return (
    <div
      className="space-y-4 text-gray-900 antialiased"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {/* Desktop: tabs upar. Mobile: search/actions upar, tabs list ke just upar */}
      <div className="flex flex-col gap-3.5">
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
                aria-pressed={active}
                onClick={() => setActiveTab(tab.id)}
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
                  {counts[tab.id]}
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

        <div className="order-1 md:order-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search LR, Booking ID, party..."
              className="w-full pl-8 pr-3 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={loadBookedOrders}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/transporter/create-order"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors whitespace-nowrap"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              Create Order
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadBookedOrders} />
      ) : visibleBookings.length === 0 ? (
        <EmptyState
          title="No personal booked orders yet"
          description="Create a shipment for your direct customers from the Create Order panel to manage LR and tracking here."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
          {/* Mobile Card View */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
            {visibleBookings.map((b) => (
              <div
                key={b._id}
                onClick={() => openBooking(b._id)}
                className="border border-gray-200 rounded-xl p-3.5 bg-white text-[13px] hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer space-y-2.5 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 tabular-nums">
                      <p className="font-semibold text-blue-700 truncate">{b.lrNumber}</p>
                      <p className="text-gray-500 truncate">{b.bookingId}</p>
                    </div>
                    <span className="shrink-0 [&>*]:!text-[13px]">
                      <StatusBadge status={b.status} />
                    </span>
                  </div>

                  <p className="font-semibold text-gray-900">
                    {b.origin.city} <span className="text-gray-400">→</span> {b.destination.city}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-gray-500">Sender</p>
                      <p className="font-medium text-gray-800 truncate">{b.sender.name}</p>
                      <p className="text-gray-500 tabular-nums">{b.origin.pincode}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-gray-500">Receiver</p>
                      <p className="font-medium text-gray-800 truncate">{b.receiver.name}</p>
                      <p className="text-gray-500 tabular-nums">{b.destination.pincode}</p>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2 tabular-nums pt-2 border-t border-gray-100">
                    <p className="text-gray-500">
                      {formatWeight(b.chargeableWeight)} · {b.parcel.numberOfPackages} box
                      {b.parcel.numberOfPackages === 1 ? '' : 'es'}
                    </p>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatINR(b.finalAmount)}</p>
                      <p className="text-gray-500">{b.paymentMode || 'CASH'}</p>
                    </div>
                  </div>
                  <p className="text-gray-500 tabular-nums">{formatDateTime(b.createdAt)}</p>
                </div>

                <div
                  className="flex justify-end pt-2 border-t border-gray-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderActions(b)}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px] leading-5">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="py-3 pl-4 pr-3">Booking</th>
                  <th className="py-3 px-3">Route</th>
                  <th className="py-3 px-3">Sender</th>
                  <th className="py-3 px-3">Receiver</th>
                  <th className="py-3 px-3">Shipment</th>
                  <th className="py-3 px-3">Amount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleBookings.map((b) => {
                  const platformFee =
                    b.platformCharge ?? b.pricingSnapshot?.platformCharge ?? 0;
                  return (
                    <tr
                      key={b._id}
                      onClick={() => openBooking(b._id)}
                      className="align-top cursor-pointer hover:bg-blue-50/40 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-3 whitespace-nowrap tabular-nums">
                        <p className="font-semibold text-blue-700">{b.lrNumber}</p>
                        <p className="text-gray-500">{b.bookingId}</p>
                        <p className="text-gray-500">{formatDateTime(b.createdAt)}</p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-gray-900">
                          {b.origin.city} <span className="text-gray-400">→</span>{' '}
                          {b.destination.city}
                        </p>
                        <p className="text-gray-500 tabular-nums">
                          {b.origin.pincode} → {b.destination.pincode}
                        </p>
                      </td>
                      <td className="py-3 px-3 font-medium text-gray-900">{b.sender.name}</td>
                      <td className="py-3 px-3 font-medium text-gray-900">{b.receiver.name}</td>
                      <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                        <p className="font-semibold text-gray-900">
                          {formatWeight(b.chargeableWeight)}
                        </p>
                        <p className="text-gray-500">
                          {b.parcel.numberOfPackages} box
                          {b.parcel.numberOfPackages === 1 ? '' : 'es'}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                        <p className="font-semibold text-gray-900">{formatINR(b.finalAmount)}</p>
                        <p className="text-gray-500">{b.paymentMode || 'CASH'}</p>
                        {Number(platformFee) > 0 && (
                          <p className="text-gray-500">incl. {formatINR(platformFee)} fee</p>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap [&>*]:!text-[13px]">
                        <StatusBadge status={b.status} />
                      </td>
                      <td
                        className="py-3 pl-3 pr-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderActions(b)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
