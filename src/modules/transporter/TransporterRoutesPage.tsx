// import React, { useCallback, useEffect, useState } from 'react';
// import { Link } from 'react-router-dom';
// import {
//   AlertTriangle,
//   CheckCircle2,
//   History,
//   PauseCircle,
//   Pencil,
//   Plus,
//   Route as RouteIcon,
//   Search,
//   Trash2,
// } from 'lucide-react';
// import { apiClient, extractErrorMessage } from '../../services/api.ts';
// import { useAuth } from '../../context/AuthContext.tsx';
// import { useToast } from '../../context/ToastContext.tsx';
// import { formatDateTime, formatINR } from '../../utils/formatters.ts';
// import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
// import { Modal } from '../../components/ui/Modal.tsx';
// import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
// import {
//   EntityStatus,
//   TransporterApprovalStatus,
//   type IntegratedRouteRate,
//   type PaginatedResponse,
//   type RouteAuditLogEntry,
//   type Transporter,
// } from '../../types/index.ts';

// interface RouteRateFormState {
//   originCity: string;
//   originPincode: string;
//   destinationCity: string;
//   destinationPincode: string;
//   distanceKm: string;
//   ratePerKg: string;
//   minimumFreight: string;
//   additionalCharges: string;
//   rtoCharges: string;
//   volumetricDivisor: string;
//   gstApplicable: boolean;
//   gstRatePercent: string;
//   estimatedDeliveryTime: string;
//   isActive: boolean;
// }

// const EMPTY_FORM: RouteRateFormState = {
//   originCity: '',
//   originPincode: '',
//   destinationCity: '',
//   destinationPincode: '',
//   distanceKm: '',
//   ratePerKg: '12',
//   minimumFreight: '500',
//   additionalCharges: '100',
//   rtoCharges: '350',
//   volumetricDivisor: '5000',
//   gstApplicable: true,
//   gstRatePercent: '18',
//   estimatedDeliveryTime: '18-24 Hours',
//   isActive: true,
// };

// export function TransporterRoutesPage() {
//   const { profile } = useAuth();
//   const { showToast } = useToast();
//   const transporter = profile as Transporter | null;
//   const approvalStatus = transporter?.approvalStatus;
//   const isApprovalBlocked =
//     Boolean(approvalStatus) && approvalStatus !== TransporterApprovalStatus.APPROVED;

//   const [routes, setRoutes] = useState<IntegratedRouteRate[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   const [search, setSearch] = useState('');
//   const [statusFilter, setStatusFilter] = useState<'ALL' | EntityStatus>('ALL');

//   const [modalOpen, setModalOpen] = useState(false);
//   const [editingItem, setEditingItem] = useState<IntegratedRouteRate | null>(null);
//   const [form, setForm] = useState<RouteRateFormState>(EMPTY_FORM);
//   const [saving, setSaving] = useState(false);

//   const [deleteTarget, setDeleteTarget] = useState<IntegratedRouteRate | null>(null);
//   const [deleting, setDeleting] = useState(false);
//   const [togglingId, setTogglingId] = useState<string | null>(null);

//   const [auditTarget, setAuditTarget] = useState<IntegratedRouteRate | null>(null);
//   const [auditLogs, setAuditLogs] = useState<RouteAuditLogEntry[]>([]);
//   const [loadingAudit, setLoadingAudit] = useState(false);

//   const loadRoutes = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await apiClient.get<{
//         success: boolean;
//         data: PaginatedResponse<IntegratedRouteRate>;
//       }>('/transporter/routes', {
//         params: {
//           limit: 100,
//           status: statusFilter !== 'ALL' ? statusFilter : undefined,
//           search: search.trim() || undefined,
//         },
//       });
//       setRoutes(res.data.data.items);
//     } catch (err) {
//       setError(extractErrorMessage(err, 'Failed to load transporter routes and rates.'));
//     } finally {
//       setLoading(false);
//     }
//   }, [statusFilter, search]);

//   useEffect(() => {
//     loadRoutes();
//   }, [loadRoutes]);

//   const openCreateModal = () => {
//     setEditingItem(null);
//     setForm(EMPTY_FORM);
//     setModalOpen(true);
//   };

//   const openEditModal = (item: IntegratedRouteRate) => {
//     setEditingItem(item);
//     setForm({
//       originCity: item.originCity,
//       originPincode: item.originPincode,
//       destinationCity: item.destinationCity,
//       destinationPincode: item.destinationPincode,
//       distanceKm: item.distanceKm ? String(item.distanceKm) : '',
//       ratePerKg: String(item.ratePerKg),
//       minimumFreight: String(item.minimumFreight),
//       additionalCharges: String(item.additionalCharges),
//       rtoCharges: String(item.rtoCharges),
//       volumetricDivisor: String(item.volumetricDivisor),
//       gstApplicable: item.gstApplicable,
//       gstRatePercent: String(item.gstRatePercent),
//       estimatedDeliveryTime: item.estimatedDeliveryTime,
//       isActive: item.isActive,
//     });
//     setModalOpen(true);
//   };

//   const handleSave = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (form.originPincode.trim() === form.destinationPincode.trim()) {
//       showToast('Origin and destination pincodes must be different.', 'error');
//       return;
//     }

//     setSaving(true);
//     try {
//       const payload = {
//         originCity: form.originCity.trim(),
//         originPincode: form.originPincode.trim(),
//         destinationCity: form.destinationCity.trim(),
//         destinationPincode: form.destinationPincode.trim(),
//         distanceKm: form.distanceKm.trim() ? Number(form.distanceKm) : undefined,
//         ratePerKg: Number(form.ratePerKg),
//         minimumFreight: Number(form.minimumFreight),
//         additionalCharges: Number(form.additionalCharges || 0),
//         rtoCharges: Number(form.rtoCharges || 0),
//         volumetricDivisor: Number(form.volumetricDivisor || 5000),
//         gstApplicable: form.gstApplicable,
//         gstRatePercent: form.gstApplicable ? Number(form.gstRatePercent || 0) : 0,
//         estimatedDeliveryTime: form.estimatedDeliveryTime.trim(),
//         isActive: form.isActive,
//       };

//       if (editingItem) {
//         await apiClient.patch(`/transporter/routes/${editingItem.rateId}`, payload);
//         showToast('Route and rate configuration updated.', 'success');
//       } else {
//         await apiClient.post('/transporter/routes', payload);
//         showToast('New route and rate added. Active routes are immediately live for bookings.', 'success');
//       }

//       setModalOpen(false);
//       await loadRoutes();
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to save route configuration.'), 'error');
//     } finally {
//       setSaving(false);
//     }
//   };

//   const handleToggleStatus = async (item: IntegratedRouteRate) => {
//     setTogglingId(item.rateId);
//     try {
//       await apiClient.patch(`/transporter/routes/${item.rateId}/status`, {
//         isActive: !item.isActive,
//       });
//       showToast(
//         `Route ${item.originCity} → ${item.destinationCity} ${!item.isActive ? 'activated' : 'deactivated'}.`,
//         'success'
//       );
//       await loadRoutes();
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to change route status.'), 'error');
//     } finally {
//       setTogglingId(null);
//     }
//   };

//   const handleDelete = async () => {
//     if (!deleteTarget) return;
//     setDeleting(true);
//     try {
//       await apiClient.delete(`/transporter/routes/${deleteTarget.rateId}`);
//       showToast('Route and rate configuration removed.', 'success');
//       setDeleteTarget(null);
//       await loadRoutes();
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to delete route.'), 'error');
//     } finally {
//       setDeleting(false);
//     }
//   };

//   const openAuditModal = async (item: IntegratedRouteRate) => {
//     setAuditTarget(item);
//     setAuditLogs([]);
//     setLoadingAudit(true);
//     try {
//       const res = await apiClient.get<{ success: boolean; data: RouteAuditLogEntry[] }>(
//         `/transporter/routes/${item.rateId}/audit`
//       );
//       setAuditLogs(res.data.data);
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to load change history.'), 'error');
//     } finally {
//       setLoadingAudit(false);
//     }
//   };

//   const activeCount = routes.filter((r) => r.isActive).length;

//   if (isApprovalBlocked) {
//     const isRejected = approvalStatus === TransporterApprovalStatus.REJECTED;
//     return (
//       <div className="space-y-6">
//         <div>
//           <h1 className="text-xl font-semibold text-slate-900">Routes &amp; Rate Configuration</h1>
//           <p className="text-sm text-slate-500 mt-0.5">
//             Manage your operating city/pincode corridors together with per-route freight, RTO, GST, and ETA pricing
//           </p>
//         </div>

//         <div
//           className={`rounded-xl border p-6 space-y-4 ${
//             isRejected ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
//           }`}
//         >
//           <div className="flex items-start gap-3">
//             <AlertTriangle
//               className={`w-5 h-5 shrink-0 mt-0.5 ${isRejected ? 'text-red-600' : 'text-amber-600'}`}
//             />
//             <div className="space-y-1">
//               <h2 className={`text-sm font-semibold ${isRejected ? 'text-red-900' : 'text-amber-900'}`}>
//                 {isRejected
//                   ? 'Carrier Registration Rejected — Route Publishing Unavailable'
//                   : 'Carrier Account Pending Admin Approval'}
//               </h2>
//               <p className={`text-sm ${isRejected ? 'text-red-800' : 'text-amber-800'}`}>
//                 {isRejected
//                   ? `Reason: ${transporter?.rejectionReason || 'Contact ZIPIT support for verification details.'}`
//                   : 'Your carrier registration is currently under administrator review. Route and rate card configuration will unlock once your account is approved.'}
//               </p>
//             </div>
//           </div>

//           <div className="flex flex-wrap items-center gap-2.5 pt-1">
//             <Link
//               to="/transporter/profile"
//               className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
//             >
//               Complete Profile &amp; KYC
//             </Link>
//             <Link
//               to="/transporter/service-areas"
//               className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
//             >
//               Manage Service Areas
//             </Link>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6">
//       {/* Header */}
//       <div className="flex flex-wrap items-center justify-between gap-4">
//         <div>
//           <h1 className="text-xl font-semibold text-slate-900">Routes &amp; Rate Configuration</h1>
//           <p className="text-sm text-slate-500 mt-0.5">
//             Manage your operating city/pincode corridors together with per-route freight, RTO, GST, and ETA pricing
//           </p>
//         </div>

//         <button
//           type="button"
//           onClick={openCreateModal}
//           className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
//         >
//           <Plus className="w-4 h-4" />
//           <span>Add Route &amp; Rate</span>
//         </button>
//       </div>

//       {/* Filters + Summary Strip */}
//       <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-sm">
//         <div className="flex flex-wrap items-center gap-2.5 flex-1 w-full sm:min-w-[260px]">
//           <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
//             <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
//             <input
//               type="text"
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               placeholder="Search city or 6-digit pincode..."
//               className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
//             />
//           </div>

//           <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
//             {(
//               [
//                 { id: 'ALL', label: 'All Routes' },
//                 { id: EntityStatus.ACTIVE, label: 'Active' },
//                 { id: EntityStatus.INACTIVE, label: 'Inactive' },
//               ] as const
//             ).map((opt) => (
//               <button
//                 key={opt.id}
//                 type="button"
//                 onClick={() => setStatusFilter(opt.id)}
//                 className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
//                   statusFilter === opt.id
//                     ? 'bg-white text-blue-700 shadow-sm'
//                     : 'text-slate-600 hover:text-slate-900'
//                 }`}
//               >
//                 {opt.label}
//               </button>
//             ))}
//           </div>
//         </div>

//         <div className="flex items-center gap-4 text-xs text-slate-600">
//           <span>
//             Total: <strong className="text-slate-900 font-mono tabular-nums">{routes.length}</strong>
//           </span>
//           <span>
//             Active for Bookings:{' '}
//             <strong className="text-emerald-700 font-mono tabular-nums">{activeCount}</strong>
//           </span>
//         </div>
//       </div>

//       {/* Routes Table */}
//       {loading ? (
//         <LoadingSkeleton rows={5} />
//       ) : error ? (
//         <ErrorBanner message={error} onRetry={loadRoutes} />
//       ) : routes.length === 0 ? (
//         <EmptyState
//           title="No routes configured yet"
//           description="Add a source-to-destination route with your freight rate card to start receiving platform and personal bookings."
//         />
//       ) : (
//         <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
//           {/* Mobile / Tablet Card View */}
//           <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
//             {routes.map((item) => (
//               <div
//                 key={item.rateId}
//                 className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2.5 flex flex-col justify-between"
//               >
//                 <div className="space-y-2">
//                   <div className="flex items-start justify-between gap-2">
//                     <div className="flex items-start gap-2 min-w-0">
//                       <RouteIcon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
//                       <div className="min-w-0">
//                         <p className="font-semibold text-sm text-slate-900 truncate">
//                           {item.originCity} → {item.destinationCity}
//                         </p>
//                         <p className="text-[11px] font-mono text-slate-500 tabular-nums">
//                           {item.originPincode} → {item.destinationPincode}
//                           {item.distanceKm ? ` · ${item.distanceKm} km` : ''}
//                         </p>
//                       </div>
//                     </div>
//                     <StatusBadge status={item.status} />
//                   </div>

//                   <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
//                     <div>
//                       <span className="text-slate-500">Rate / Kg: </span>
//                       <span className="font-mono font-semibold text-slate-900 tabular-nums">
//                         {formatINR(item.ratePerKg)}
//                       </span>
//                     </div>
//                     <div className="text-right">
//                       <span className="text-slate-500">Min: </span>
//                       <span className="font-mono tabular-nums text-slate-800">
//                         {formatINR(item.minimumFreight)}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="text-slate-500">Add&apos;l / RTO: </span>
//                       <span className="font-mono tabular-nums text-slate-700">
//                         {formatINR(item.additionalCharges)} / {formatINR(item.rtoCharges)}
//                       </span>
//                     </div>
//                     <div className="text-right">
//                       <span className="text-slate-500">GST: </span>
//                       <span className="font-mono tabular-nums text-slate-700">
//                         {item.gstApplicable ? `${item.gstRatePercent}%` : 'Exempt'}
//                       </span>
//                     </div>
//                   </div>
//                   <p className="text-[11px] text-slate-500">
//                     ETA: <span className="font-medium text-slate-700">{item.estimatedDeliveryTime}</span> · Div:{' '}
//                     <span className="font-mono tabular-nums">{item.volumetricDivisor}</span>
//                   </p>
//                 </div>

//                 <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
//                   <button
//                     type="button"
//                     onClick={() => openEditModal(item)}
//                     className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                   >
//                     <Pencil className="w-3.5 h-3.5 text-blue-600" />
//                     <span>Edit</span>
//                   </button>
//                   <button
//                     type="button"
//                     disabled={togglingId === item.rateId}
//                     onClick={() => handleToggleStatus(item)}
//                     className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
//                   >
//                     {item.isActive ? (
//                       <>
//                         <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
//                         <span>Deactivate</span>
//                       </>
//                     ) : (
//                       <>
//                         <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
//                         <span>Activate</span>
//                       </>
//                     )}
//                   </button>
//                   <button
//                     type="button"
//                     onClick={() => openAuditModal(item)}
//                     title="View audit log"
//                     className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                   >
//                     <History className="w-3.5 h-3.5" />
//                   </button>
//                   <button
//                     type="button"
//                     onClick={() => setDeleteTarget(item)}
//                     title="Delete route"
//                     className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
//                   >
//                     <Trash2 className="w-3.5 h-3.5" />
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>

//           <div className="hidden md:block overflow-x-auto">
//             <table className="w-full text-left border-collapse">
//               <thead>
//                 <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
//                   <th className="py-3 px-4">Origin → Destination</th>
//                   <th className="py-3 px-4 text-right">Rate / Kg</th>
//                   <th className="py-3 px-4 text-right">Min Freight</th>
//                   <th className="py-3 px-4 text-right hidden xl:table-cell">Add&apos;l / RTO</th>
//                   <th className="py-3 px-4 hidden xl:table-cell">Divisor &amp; GST</th>
//                   <th className="py-3 px-4 hidden lg:table-cell">ETA</th>
//                   <th className="py-3 px-4">Status</th>
//                   <th className="py-3 px-4 hidden xl:table-cell">Last Modified</th>
//                   <th className="py-3 px-4 text-right">Actions</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-slate-100 text-sm">
//                 {routes.map((item) => (
//                   <tr key={item.rateId} className="hover:bg-slate-50/70">
//                     <td className="py-3.5 px-4">
//                       <div className="flex items-center gap-2">
//                         <RouteIcon className="w-4 h-4 text-blue-600 shrink-0" />
//                         <div>
//                           <p className="font-semibold text-slate-900 whitespace-nowrap">
//                             {item.originCity} → {item.destinationCity}
//                           </p>
//                           <p className="text-xs font-mono text-slate-500 tabular-nums">
//                             {item.originPincode} → {item.destinationPincode}
//                             {item.distanceKm ? ` · ${item.distanceKm} km` : ''}
//                           </p>
//                         </div>
//                       </div>
//                     </td>
//                     <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
//                       {formatINR(item.ratePerKg)}
//                     </td>
//                     <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
//                       {formatINR(item.minimumFreight)}
//                     </td>
//                     <td className="py-3.5 px-4 hidden xl:table-cell text-right font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
//                       <div>Add&apos;l: {formatINR(item.additionalCharges)}</div>
//                       <div>RTO: {formatINR(item.rtoCharges)}</div>
//                     </td>
//                     <td className="py-3.5 px-4 hidden xl:table-cell text-xs text-slate-700 whitespace-nowrap">
//                       <div className="font-mono tabular-nums">Div: {item.volumetricDivisor}</div>
//                       <div>
//                         GST:{' '}
//                         <span className="font-mono tabular-nums font-medium">
//                           {item.gstApplicable ? `${item.gstRatePercent}%` : 'Exempt'}
//                         </span>
//                       </div>
//                     </td>
//                     <td className="py-3.5 px-4 hidden lg:table-cell text-xs font-medium text-slate-800 whitespace-nowrap">
//                       {item.estimatedDeliveryTime}
//                     </td>
//                     <td className="py-3.5 px-4 whitespace-nowrap">
//                       <StatusBadge status={item.status} />
//                     </td>
//                     <td className="py-3.5 px-4 hidden xl:table-cell text-xs text-slate-500 whitespace-nowrap">
//                       <p className="font-medium text-slate-700">
//                         {item.lastModifiedByName || 'System'}
//                         {item.lastModifiedByRole ? ` (${item.lastModifiedByRole})` : ''}
//                       </p>
//                       <p className="font-mono tabular-nums text-[11px]">
//                         {item.lastModifiedAt ? formatDateTime(item.lastModifiedAt) : '—'}
//                       </p>
//                     </td>
//                     <td className="py-3.5 px-4 text-right whitespace-nowrap">
//                       <div className="inline-flex items-center gap-1.5">
//                         <button
//                           type="button"
//                           onClick={() => openEditModal(item)}
//                           title="Edit route and rate"
//                           className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                         >
//                           <Pencil className="w-3.5 h-3.5 text-blue-600" />
//                           <span>Edit</span>
//                         </button>
//                         <button
//                           type="button"
//                           disabled={togglingId === item.rateId}
//                           onClick={() => handleToggleStatus(item)}
//                           className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
//                         >
//                           {item.isActive ? (
//                             <>
//                               <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
//                               <span>Deactivate</span>
//                             </>
//                           ) : (
//                             <>
//                               <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
//                               <span>Activate</span>
//                             </>
//                           )}
//                         </button>
//                         <button
//                           type="button"
//                           onClick={() => openAuditModal(item)}
//                           title="View audit log"
//                           className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
//                         >
//                           <History className="w-3.5 h-3.5" />
//                         </button>
//                         <button
//                           type="button"
//                           onClick={() => setDeleteTarget(item)}
//                           title="Delete route"
//                           className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
//                         >
//                           <Trash2 className="w-3.5 h-3.5" />
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>
//       )}

//       {/* Integrated Route & Rate Modal */}
//       <Modal
//         open={modalOpen}
//         onClose={() => !saving && setModalOpen(false)}
//         title={editingItem ? 'Edit Route & Rate Configuration' : 'Add Route & Rate Configuration'}
//         subtitle="Configure source/destination corridor and pricing together in a single step"
//         maxWidthClass="max-w-2xl"
//       >
//         <form onSubmit={handleSave} className="space-y-5">
//           {editingItem?.isSharedRoute && (
//             <div className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs text-blue-900">
//               Saving changes will create a dedicated route copy owned by your carrier account without affecting other transporters.
//             </div>
//           )}

//           <div>
//             <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
//               Route Details
//             </h3>
//             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Source City *</label>
//                 <input
//                   type="text"
//                   required
//                   value={form.originCity}
//                   onChange={(e) => setForm({ ...form, originCity: e.target.value })}
//                   placeholder="Pune"
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Source Pincode *</label>
//                 <input
//                   type="text"
//                   required
//                   pattern="\d{6}"
//                   maxLength={6}
//                   value={form.originPincode}
//                   onChange={(e) => setForm({ ...form, originPincode: e.target.value.replace(/\D/g, '') })}
//                   placeholder="411026"
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Destination City *</label>
//                 <input
//                   type="text"
//                   required
//                   value={form.destinationCity}
//                   onChange={(e) => setForm({ ...form, destinationCity: e.target.value })}
//                   placeholder="Mumbai"
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Destination Pincode *</label>
//                 <input
//                   type="text"
//                   required
//                   pattern="\d{6}"
//                   maxLength={6}
//                   value={form.destinationPincode}
//                   onChange={(e) =>
//                     setForm({ ...form, destinationPincode: e.target.value.replace(/\D/g, '') })
//                   }
//                   placeholder="400013"
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div className="sm:col-span-2">
//                 <label className="block text-xs font-medium text-slate-700 mb-1">
//                   Approx. Distance (km, Optional)
//                 </label>
//                 <input
//                   type="number"
//                   min="1"
//                   step="1"
//                   value={form.distanceKm}
//                   onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
//                   placeholder="155"
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//             </div>
//           </div>

//           <div className="border-t border-slate-100 pt-4">
//             <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
//               Rate Configuration
//             </h3>
//             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Rate per KG (INR) *</label>
//                 <input
//                   type="number"
//                   required
//                   min="0.01"
//                   step="0.01"
//                   value={form.ratePerKg}
//                   onChange={(e) => setForm({ ...form, ratePerKg: e.target.value })}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Minimum Freight (INR) *</label>
//                 <input
//                   type="number"
//                   required
//                   min="0"
//                   step="0.01"
//                   value={form.minimumFreight}
//                   onChange={(e) => setForm({ ...form, minimumFreight: e.target.value })}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Additional Charges (INR) *</label>
//                 <input
//                   type="number"
//                   required
//                   min="0"
//                   step="0.01"
//                   value={form.additionalCharges}
//                   onChange={(e) => setForm({ ...form, additionalCharges: e.target.value })}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">RTO Charges (INR) *</label>
//                 <input
//                   type="number"
//                   required
//                   min="0"
//                   step="0.01"
//                   value={form.rtoCharges}
//                   onChange={(e) => setForm({ ...form, rtoCharges: e.target.value })}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Volumetric Divisor *</label>
//                 <input
//                   type="number"
//                   required
//                   min="1"
//                   step="1"
//                   value={form.volumetricDivisor}
//                   onChange={(e) => setForm({ ...form, volumetricDivisor: e.target.value })}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">Estimated Delivery Time *</label>
//                 <input
//                   type="text"
//                   required
//                   value={form.estimatedDeliveryTime}
//                   onChange={(e) => setForm({ ...form, estimatedDeliveryTime: e.target.value })}
//                   placeholder="18-24 Hours"
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                 />
//               </div>
//               <div className="flex items-center gap-2.5 pt-2">
//                 <input
//                   id="transporter-route-gst-app"
//                   type="checkbox"
//                   checked={form.gstApplicable}
//                   onChange={(e) => setForm({ ...form, gstApplicable: e.target.checked })}
//                   className="w-4 h-4 rounded border-slate-300 text-blue-600"
//                 />
//                 <label htmlFor="transporter-route-gst-app" className="text-sm font-medium text-slate-700">
//                   GST Applicable
//                 </label>
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-700 mb-1">GST Percentage (%)</label>
//                 <input
//                   type="number"
//                   min="0"
//                   max="28"
//                   step="0.1"
//                   disabled={!form.gstApplicable}
//                   value={form.gstRatePercent}
//                   onChange={(e) => setForm({ ...form, gstRatePercent: e.target.value })}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums disabled:bg-slate-100"
//                 />
//               </div>
//               <div className="flex items-center gap-2.5 pt-2">
//                 <input
//                   id="transporter-route-active"
//                   type="checkbox"
//                   checked={form.isActive}
//                   onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
//                   className="w-4 h-4 rounded border-slate-300 text-blue-600"
//                 />
//                 <label htmlFor="transporter-route-active" className="text-sm font-medium text-slate-700">
//                   Route Active (Live for bookings)
//                 </label>
//               </div>
//             </div>
//           </div>

//           <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3 pt-2 border-t border-slate-100">
//             <button
//               type="button"
//               disabled={saving}
//               onClick={() => setModalOpen(false)}
//               className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
//             >
//               Cancel
//             </button>
//             <button
//               type="submit"
//               disabled={saving}
//               className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
//             >
//               {saving ? 'Saving...' : editingItem ? 'Save Route & Rate' : 'Create Route & Rate'}
//             </button>
//           </div>
//         </form>
//       </Modal>

//       {/* Delete Confirmation Modal */}
//       <Modal
//         open={Boolean(deleteTarget)}
//         onClose={() => !deleting && setDeleteTarget(null)}
//         title="Delete Route & Rate"
//         subtitle={
//           deleteTarget
//             ? `${deleteTarget.originCity} (${deleteTarget.originPincode}) → ${deleteTarget.destinationCity} (${deleteTarget.destinationPincode})`
//             : undefined
//         }
//       >
//         <div className="space-y-4">
//           <p className="text-sm text-slate-600">
//             Are you sure you want to remove this route and its rate configuration? Existing shipment records linked to this route remain intact for audit and tracking.
//           </p>
//           <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3">
//             <button
//               type="button"
//               disabled={deleting}
//               onClick={() => setDeleteTarget(null)}
//               className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
//             >
//               Cancel
//             </button>
//             <button
//               type="button"
//               disabled={deleting}
//               onClick={handleDelete}
//               className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
//             >
//               {deleting ? 'Deleting...' : 'Delete Route'}
//             </button>
//           </div>
//         </div>
//       </Modal>

//       {/* Audit History Modal */}
//       <Modal
//         open={Boolean(auditTarget)}
//         onClose={() => setAuditTarget(null)}
//         title="Route & Rate Change History"
//         subtitle={
//           auditTarget
//             ? `${auditTarget.originCity} (${auditTarget.originPincode}) → ${auditTarget.destinationCity} (${auditTarget.destinationPincode})`
//             : undefined
//         }
//         maxWidthClass="max-w-xl"
//       >
//         {loadingAudit ? (
//           <LoadingSkeleton rows={4} />
//         ) : auditLogs.length === 0 ? (
//           <p className="text-sm text-slate-500 py-4 text-center">No audit changes recorded for this route yet.</p>
//         ) : (
//           <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
//             {auditLogs.map((log) => (
//               <div key={log._id} className="py-3 text-xs space-y-1">
//                 <div className="flex items-center justify-between gap-2">
//                   <span className="font-semibold text-slate-900">
//                     {log.action} · {log.actorName} ({log.actorRole})
//                   </span>
//                   <span className="font-mono tabular-nums text-slate-500">
//                     {formatDateTime(log.createdAt)}
//                   </span>
//                 </div>
//                 <p className="text-slate-600">{log.summary}</p>
//               </div>
//             ))}
//           </div>
//         )}
//       </Modal>
//     </div>
//   );
// }


import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  LayoutGrid,
  MoreVertical,
  PauseCircle,
  Pencil,
  Plus,
  Route as RouteIcon,
  Search,
  Trash2,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import {
  EntityStatus,
  TransporterApprovalStatus,
  type IntegratedRouteRate,
  type PaginatedResponse,
  type RouteAuditLogEntry,
  type Transporter,
} from '../../types/index.ts';

interface RouteRateFormState {
  originCity: string;
  originPincode: string;
  destinationCity: string;
  destinationPincode: string;
  distanceKm: string;
  ratePerKg: string;
  minimumFreight: string;
  additionalCharges: string;
  rtoCharges: string;
  volumetricDivisor: string;
  gstApplicable: boolean;
  gstRatePercent: string;
  estimatedDeliveryTime: string;
  isActive: boolean;
}

const EMPTY_FORM: RouteRateFormState = {
  originCity: '',
  originPincode: '',
  destinationCity: '',
  destinationPincode: '',
  distanceKm: '',
  ratePerKg: '12',
  minimumFreight: '500',
  additionalCharges: '100',
  rtoCharges: '350',
  volumetricDivisor: '5000',
  gstApplicable: true,
  gstRatePercent: '18',
  estimatedDeliveryTime: '18-24 Hours',
  isActive: true,
};

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

const inputClass =
  'w-full h-9 px-3 text-[13px] bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 transition';

const primaryButton =
  'inline-flex items-center justify-center gap-2 h-9 px-4 text-[13px] font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap';

const secondaryButton =
  'inline-flex items-center justify-center gap-2 h-9 px-4 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap';

const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3';

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] font-medium text-gray-600 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function TransporterRoutesPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const transporter = profile as Transporter | null;
  const approvalStatus = transporter?.approvalStatus;
  const isApprovalBlocked =
    Boolean(approvalStatus) && approvalStatus !== TransporterApprovalStatus.APPROVED;

  const [routes, setRoutes] = useState<IntegratedRouteRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EntityStatus>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<IntegratedRouteRate | null>(null);
  const [form, setForm] = useState<RouteRateFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<IntegratedRouteRate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [auditTarget, setAuditTarget] = useState<IntegratedRouteRate | null>(null);
  const [auditLogs, setAuditLogs] = useState<RouteAuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: PaginatedResponse<IntegratedRouteRate>;
      }>('/transporter/routes', {
        params: {
          limit: 100,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: search.trim() || undefined,
        },
      });
      setRoutes(res.data.data.items);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load transporter routes and rates.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const openCreateModal = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (item: IntegratedRouteRate) => {
    setEditingItem(item);
    setForm({
      originCity: item.originCity,
      originPincode: item.originPincode,
      destinationCity: item.destinationCity,
      destinationPincode: item.destinationPincode,
      distanceKm: item.distanceKm ? String(item.distanceKm) : '',
      ratePerKg: String(item.ratePerKg),
      minimumFreight: String(item.minimumFreight),
      additionalCharges: String(item.additionalCharges),
      rtoCharges: String(item.rtoCharges),
      volumetricDivisor: String(item.volumetricDivisor),
      gstApplicable: item.gstApplicable,
      gstRatePercent: String(item.gstRatePercent),
      estimatedDeliveryTime: item.estimatedDeliveryTime,
      isActive: item.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.originPincode.trim() === form.destinationPincode.trim()) {
      showToast('Origin and destination pincodes must be different.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        originCity: form.originCity.trim(),
        originPincode: form.originPincode.trim(),
        destinationCity: form.destinationCity.trim(),
        destinationPincode: form.destinationPincode.trim(),
        distanceKm: form.distanceKm.trim() ? Number(form.distanceKm) : undefined,
        ratePerKg: Number(form.ratePerKg),
        minimumFreight: Number(form.minimumFreight),
        additionalCharges: Number(form.additionalCharges || 0),
        rtoCharges: Number(form.rtoCharges || 0),
        volumetricDivisor: Number(form.volumetricDivisor || 5000),
        gstApplicable: form.gstApplicable,
        gstRatePercent: form.gstApplicable ? Number(form.gstRatePercent || 0) : 0,
        estimatedDeliveryTime: form.estimatedDeliveryTime.trim(),
        isActive: form.isActive,
      };

      if (editingItem) {
        await apiClient.patch(`/transporter/routes/${editingItem.rateId}`, payload);
        showToast('Route and rate configuration updated.', 'success');
      } else {
        await apiClient.post('/transporter/routes', payload);
        showToast('New route and rate added. Active routes are immediately live for bookings.', 'success');
      }

      setModalOpen(false);
      await loadRoutes();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save route configuration.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: IntegratedRouteRate) => {
    setTogglingId(item.rateId);
    try {
      await apiClient.patch(`/transporter/routes/${item.rateId}/status`, {
        isActive: !item.isActive,
      });
      showToast(
        `Route ${item.originCity} → ${item.destinationCity} ${!item.isActive ? 'activated' : 'deactivated'}.`,
        'success'
      );
      await loadRoutes();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to change route status.'), 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/transporter/routes/${deleteTarget.rateId}`);
      showToast('Route and rate configuration removed.', 'success');
      setDeleteTarget(null);
      await loadRoutes();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to delete route.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openAuditModal = async (item: IntegratedRouteRate) => {
    setAuditTarget(item);
    setAuditLogs([]);
    setLoadingAudit(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: RouteAuditLogEntry[] }>(
        `/transporter/routes/${item.rateId}/audit`
      );
      setAuditLogs(res.data.data);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to load change history.'), 'error');
    } finally {
      setLoadingAudit(false);
    }
  };

  const activeCount = routes.filter((r) => r.isActive).length;

  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // Sliding underline ko active tab ke neeche rakhta hai
  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${statusFilter}"]`);
    if (!tab) return;
    const measure = () => setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [statusFilter]);

  if (isApprovalBlocked) {
    const isRejected = approvalStatus === TransporterApprovalStatus.REJECTED;
    return (
      <div className="space-y-4 text-gray-900 antialiased">
        <div>
          <h1 className="text-xl font-semibold">Routes &amp; Rate Configuration</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Manage your operating city/pincode corridors together with per-route freight, RTO, GST, and ETA pricing
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 space-y-4 ${
            isRejected ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-5 h-5 shrink-0 mt-0.5 ${isRejected ? 'text-red-600' : 'text-amber-600'}`}
            />
            <div className="space-y-1">
              <h2 className={`text-sm font-semibold ${isRejected ? 'text-red-900' : 'text-amber-900'}`}>
                {isRejected
                  ? 'Carrier Registration Rejected — Route Publishing Unavailable'
                  : 'Carrier Account Pending Admin Approval'}
              </h2>
              <p className={`text-[13px] ${isRejected ? 'text-red-800' : 'text-amber-800'}`}>
                {isRejected
                  ? `Reason: ${transporter?.rejectionReason || 'Contact ZIPIT support for verification details.'}`
                  : 'Your carrier registration is currently under administrator review. Route and rate card configuration will unlock once your account is approved.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/transporter/profile" className={secondaryButton}>
              Complete Profile &amp; KYC
            </Link>
            <Link to="/transporter/service-areas" className={secondaryButton}>
              Manage Service Areas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const renderActions = (item: IntegratedRouteRate) => (
    <div className="inline-flex items-center justify-end gap-1.5 text-[13px]">
      <button
        type="button"
        disabled={togglingId === item.rateId}
        onClick={() => handleToggleStatus(item)}
        className={`inline-flex items-center justify-center gap-1.5 h-8 w-28 font-semibold rounded-lg transition-colors disabled:opacity-40 ${
          item.isActive
            ? 'text-amber-800 bg-amber-100 hover:bg-amber-200'
            : 'text-white bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {item.isActive ? (
          <PauseCircle className="w-3.5 h-3.5" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5" />
        )}
        {item.isActive ? 'Deactivate' : 'Activate'}
      </button>
      <button
        type="button"
        onClick={() => openEditModal(item)}
        className="inline-flex items-center justify-center gap-1 h-8 px-2.5 font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5 text-blue-600" />
        Edit
      </button>
      <RowMenu
        items={[
          { label: 'Change History', icon: History, onClick: () => openAuditModal(item) },
          { label: 'Delete Route', icon: Trash2, danger: true, onClick: () => setDeleteTarget(item) },
        ]}
      />
    </div>
  );

  return (
    <div
      className="space-y-4 text-gray-900 antialiased"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Routes &amp; Rate Configuration</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Manage your operating city/pincode corridors together with per-route freight, RTO, GST, and ETA pricing
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className={`w-full sm:w-auto ${primaryButton}`}>
          <Plus className="w-4 h-4" />
          Add Route &amp; Rate
        </button>
      </div>

      {/* Desktop: tabs upar. Mobile: search upar, tabs list ke just upar */}
      <div className="flex flex-col gap-3.5">
        <div
          ref={tabsRef}
          className="relative order-2 md:order-1 border-b border-gray-200 flex items-center gap-5 overflow-x-auto scrollbar-none"
        >
          {(
            [
              { id: 'ALL', label: 'All Routes', icon: LayoutGrid },
              { id: EntityStatus.ACTIVE, label: 'Active', icon: CheckCircle2 },
              { id: EntityStatus.INACTIVE, label: 'Inactive', icon: PauseCircle },
            ] as const
          ).map((opt) => {
            const active = statusFilter === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                data-tab={opt.id}
                aria-pressed={active}
                onClick={() => setStatusFilter(opt.id)}
                className={`inline-flex items-center gap-2 pb-3 pt-1 text-xs sm:text-sm font-medium transition-colors duration-300 ease-out whitespace-nowrap shrink-0 ${
                  active ? 'text-blue-700' : 'text-gray-500 hover:text-blue-600'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                {opt.label}
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
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search city or 6-digit pincode..."
              className={`${inputClass} !pl-8`}
            />
          </div>

          <div className="flex items-center gap-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-blue-50 text-blue-700">
              Total <strong className="tabular-nums">{routes.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-50 text-emerald-700">
              Active for Bookings <strong className="tabular-nums">{activeCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadRoutes} />
      ) : routes.length === 0 ? (
        <EmptyState
          title="No routes configured yet"
          description="Add a source-to-destination route with your freight rate card to start receiving platform and personal bookings."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
          {/* Mobile Card View */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
            {routes.map((item) => (
              <div
                key={item.rateId}
                className="border border-gray-200 rounded-xl p-3.5 bg-white text-[13px] space-y-2.5 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {item.originCity} <span className="text-gray-400">→</span> {item.destinationCity}
                      </p>
                      <p className="text-gray-500 tabular-nums">
                        {item.originPincode} → {item.destinationPincode}
                        {item.distanceKm ? ` · ${item.distanceKm} km` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 [&>*]:!text-[13px]">
                      <StatusBadge status={item.status} />
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2.5 border-t border-gray-100 tabular-nums">
                    {[
                      ['Rate / Kg', formatINR(item.ratePerKg)],
                      ['Min Freight', formatINR(item.minimumFreight)],
                      ["Add'l Charges", formatINR(item.additionalCharges)],
                      ['RTO Charges', formatINR(item.rtoCharges)],
                      ['GST', item.gstApplicable ? `${item.gstRatePercent}%` : 'Exempt'],
                      ['Divisor', item.volumetricDivisor],
                      ['ETA', item.estimatedDeliveryTime],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="font-semibold text-gray-900">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <p className="text-gray-500">
                    Updated by {item.lastModifiedByName || 'System'}
                    {item.lastModifiedByRole ? ` (${item.lastModifiedByRole})` : ''} ·{' '}
                    {item.lastModifiedAt ? formatDateTime(item.lastModifiedAt) : '—'}
                  </p>
                </div>

                <div className="flex justify-end pt-2 border-t border-gray-100">{renderActions(item)}</div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px] leading-5">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="py-3 pl-4 pr-3">Route</th>
                  <th className="py-3 px-3">Freight</th>
                  <th className="py-3 px-3">Charges</th>
                  <th className="py-3 px-3">GST &amp; ETA</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Last Modified</th>
                  <th className="py-3 pl-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {routes.map((item) => (
                  <tr key={item.rateId} className="align-top hover:bg-blue-50/40 transition-colors">
                    <td className="py-3 pl-4 pr-3">
                      <p className="font-semibold">
                        {item.originCity} <span className="text-gray-400">→</span> {item.destinationCity}
                      </p>
                      <p className="text-gray-500 tabular-nums">
                        {item.originPincode} → {item.destinationPincode}
                      </p>
                      {item.distanceKm ? (
                        <p className="text-gray-500 tabular-nums">{item.distanceKm} km</p>
                      ) : null}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap tabular-nums">
                      <p className="font-semibold">{formatINR(item.ratePerKg)}/kg</p>
                      <p className="text-gray-500">Min {formatINR(item.minimumFreight)}</p>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap tabular-nums text-gray-500">
                      <p>
                        Add&apos;l <span className="font-medium text-gray-900">{formatINR(item.additionalCharges)}</span>
                      </p>
                      <p>
                        RTO <span className="font-medium text-gray-900">{formatINR(item.rtoCharges)}</span>
                      </p>
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      <p className="font-medium">
                        GST {item.gstApplicable ? `${item.gstRatePercent}%` : 'Exempt'}
                      </p>
                      <p className="text-gray-500">Div {item.volumetricDivisor}</p>
                      <p className="text-gray-500">{item.estimatedDeliveryTime}</p>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap [&>*]:!text-[13px]">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium">
                        {item.lastModifiedByName || 'System'}
                        {item.lastModifiedByRole ? ` (${item.lastModifiedByRole})` : ''}
                      </p>
                      <p className="text-gray-500 tabular-nums">
                        {item.lastModifiedAt ? formatDateTime(item.lastModifiedAt) : '—'}
                      </p>
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right whitespace-nowrap">{renderActions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Integrated Route & Rate Modal */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingItem ? 'Edit Route & Rate Configuration' : 'Add Route & Rate Configuration'}
        subtitle="Configure source/destination corridor and pricing together in a single step"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-5">
          {editingItem?.isSharedRoute && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[13px] text-blue-900">
              Saving changes will create a dedicated route copy owned by your carrier account without affecting other transporters.
            </div>
          )}

          <div>
            <h3 className={sectionTitle}>Route Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Source City *">
                <input
                  type="text"
                  required
                  value={form.originCity}
                  onChange={(e) => setForm({ ...form, originCity: e.target.value })}
                  placeholder="Pune"
                  className={inputClass}
                />
              </Field>
              <Field label="Source Pincode *">
                <input
                  type="text"
                  required
                  pattern="\d{6}"
                  maxLength={6}
                  value={form.originPincode}
                  onChange={(e) => setForm({ ...form, originPincode: e.target.value.replace(/\D/g, '') })}
                  placeholder="411026"
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="Destination City *">
                <input
                  type="text"
                  required
                  value={form.destinationCity}
                  onChange={(e) => setForm({ ...form, destinationCity: e.target.value })}
                  placeholder="Mumbai"
                  className={inputClass}
                />
              </Field>
              <Field label="Destination Pincode *">
                <input
                  type="text"
                  required
                  pattern="\d{6}"
                  maxLength={6}
                  value={form.destinationPincode}
                  onChange={(e) =>
                    setForm({ ...form, destinationPincode: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder="400013"
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="Approx. Distance (km, Optional)" className="sm:col-span-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.distanceKm}
                  onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                  placeholder="155"
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className={sectionTitle}>Rate Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Rate per KG (INR) *">
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={form.ratePerKg}
                  onChange={(e) => setForm({ ...form, ratePerKg: e.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="Minimum Freight (INR) *">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.minimumFreight}
                  onChange={(e) => setForm({ ...form, minimumFreight: e.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="Additional Charges (INR) *">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.additionalCharges}
                  onChange={(e) => setForm({ ...form, additionalCharges: e.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="RTO Charges (INR) *">
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.rtoCharges}
                  onChange={(e) => setForm({ ...form, rtoCharges: e.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="Volumetric Divisor *">
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={form.volumetricDivisor}
                  onChange={(e) => setForm({ ...form, volumetricDivisor: e.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <Field label="Estimated Delivery Time *">
                <input
                  type="text"
                  required
                  value={form.estimatedDeliveryTime}
                  onChange={(e) => setForm({ ...form, estimatedDeliveryTime: e.target.value })}
                  placeholder="18-24 Hours"
                  className={inputClass}
                />
              </Field>
              <label className="flex items-center gap-2.5 self-end h-9 text-[13px] font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.gstApplicable}
                  onChange={(e) => setForm({ ...form, gstApplicable: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                />
                GST Applicable
              </label>
              <Field label="GST Percentage (%)">
                <input
                  type="number"
                  min="0"
                  max="28"
                  step="0.1"
                  disabled={!form.gstApplicable}
                  value={form.gstRatePercent}
                  onChange={(e) => setForm({ ...form, gstRatePercent: e.target.value })}
                  className={`${inputClass} tabular-nums`}
                />
              </Field>
              <label className="flex items-center gap-2.5 self-end h-9 text-[13px] font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                />
                Route Active (Live for bookings)
              </label>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-100">
            <button
              type="button"
              disabled={saving}
              onClick={() => setModalOpen(false)}
              className={`w-full sm:w-auto ${secondaryButton}`}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`w-full sm:w-auto ${primaryButton}`}>
              {saving ? 'Saving...' : editingItem ? 'Save Route & Rate' : 'Create Route & Rate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Route & Rate"
        subtitle={
          deleteTarget
            ? `${deleteTarget.originCity} (${deleteTarget.originPincode}) → ${deleteTarget.destinationCity} (${deleteTarget.destinationPincode})`
            : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-gray-600">
            Are you sure you want to remove this route and its rate configuration? Existing shipment records linked to this route remain intact for audit and tracking.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className={`w-full sm:w-auto ${secondaryButton}`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="w-full sm:w-auto inline-flex items-center justify-center h-9 px-4 text-[13px] font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Route'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit History Modal */}
      <Modal
        open={Boolean(auditTarget)}
        onClose={() => setAuditTarget(null)}
        title="Route & Rate Change History"
        subtitle={
          auditTarget
            ? `${auditTarget.originCity} (${auditTarget.originPincode}) → ${auditTarget.destinationCity} (${auditTarget.destinationPincode})`
            : undefined
        }
        maxWidthClass="max-w-xl"
      >
        {loadingAudit ? (
          <LoadingSkeleton rows={4} />
        ) : auditLogs.length === 0 ? (
          <p className="text-[13px] text-gray-500 py-4 text-center">No audit changes recorded for this route yet.</p>
        ) : (
          <ol className="max-h-96 overflow-y-auto">
            {auditLogs.map((log) => (
              <li key={log._id} className="relative pl-5 pb-4 last:pb-0 text-[13px]">
                <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-blue-600" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {log.action} · {log.actorName} ({log.actorRole})
                  </span>
                  <span className="tabular-nums text-gray-500">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="text-gray-600">{log.summary}</p>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </div>
  );
}
