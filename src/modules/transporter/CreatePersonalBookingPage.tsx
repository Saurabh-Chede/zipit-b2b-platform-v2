// import React, { useCallback, useEffect, useMemo, useState } from 'react';
// import { Link, useNavigate } from 'react-router-dom';
// import {
//   AlertTriangle,
//   Barcode,
//   Calculator,
//   CheckCircle2,
//   FileDown,
//   MapPin,
//   Package,
//   RotateCcw,
//   Route as RouteIcon,
//   Search,
//   User,
// } from 'lucide-react';
// import { apiClient, extractErrorMessage } from '../../services/api.ts';
// import { useAuth } from '../../context/AuthContext.tsx';
// import { useToast } from '../../context/ToastContext.tsx';
// import { formatINR, formatWeight } from '../../utils/formatters.ts';
// import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
// import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
// import {
//   EntityStatus,
//   TransporterApprovalStatus,
//   type Booking,
//   type FreightBreakdown,
//   type IntegratedRouteRate,
//   type PaginatedResponse,
//   type Transporter,
// } from '../../types/index.ts';

// interface PartyForm {
//   name: string;
//   phone: string;
//   address: string;
//   city: string;
//   pincode: string;
// }

// interface ParcelForm {
//   description: string;
//   actualWeightKg: string;
//   lengthCm: string;
//   widthCm: string;
//   heightCm: string;
//   numberOfPackages: string;
// }

// export function CreatePersonalBookingPage() {
//   const navigate = useNavigate();
//   const { profile } = useAuth();
//   const { showToast } = useToast();
//   const transporter = profile as Transporter | null;
//   const approvalStatus = transporter?.approvalStatus;
//   const isApprovalBlocked =
//     Boolean(approvalStatus) && approvalStatus !== TransporterApprovalStatus.APPROVED;

//   const [routes, setRoutes] = useState<IntegratedRouteRate[]>([]);
//   const [loadingRoutes, setLoadingRoutes] = useState(true);
//   const [routesError, setRoutesError] = useState<string | null>(null);

//   const [selectedRateId, setSelectedRateId] = useState('');
//   const [paymentMode, setPaymentMode] = useState<'CASH' | 'TO_PAY' | 'INVOICE'>('CASH');

//   const [sender, setSender] = useState<PartyForm>({
//     name: '',
//     phone: '',
//     address: '',
//     city: '',
//     pincode: '',
//   });
//   const [receiver, setReceiver] = useState<PartyForm>({
//     name: '',
//     phone: '',
//     address: '',
//     city: '',
//     pincode: '',
//   });
//   const [parcel, setParcel] = useState<ParcelForm>({
//     description: 'B2B Commercial Consignment',
//     actualWeightKg: '25',
//     lengthCm: '50',
//     widthCm: '40',
//     heightCm: '30',
//     numberOfPackages: '1',
//   });
//   const [ewayBillNumber, setEwayBillNumber] = useState('');
//   const [ewayBillValidUpto, setEwayBillValidUpto] = useState('');
//   const [whatsappOptIn, setWhatsappOptIn] = useState(true);

//   const [calculatedBreakdown, setCalculatedBreakdown] = useState<FreightBreakdown | null>(null);
//   const [calculating, setCalculating] = useState(false);
//   const [submitting, setSubmitting] = useState(false);
//   const [formError, setFormError] = useState<string | null>(null);
//   const [idempotencyKey, setIdempotencyKey] = useState(() => `zpt-self-${crypto.randomUUID()}`);

//   const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
//   const [downloadingLr, setDownloadingLr] = useState(false);
//   const [downloadingBarcode, setDownloadingBarcode] = useState(false);

//   const loadRoutes = useCallback(async () => {
//     setLoadingRoutes(true);
//     setRoutesError(null);
//     try {
//       const res = await apiClient.get<{
//         success: boolean;
//         data: PaginatedResponse<IntegratedRouteRate>;
//       }>('/transporter/routes', { params: { status: EntityStatus.ACTIVE, limit: 100 } });
//       const activeList = res.data.data.items;
//       setRoutes(activeList);
//       if (activeList.length > 0) {
//         const first = activeList[0];
//         setSelectedRateId(first.rateId);
//         setSender((prev) => ({
//           ...prev,
//           city: prev.city || first.originCity,
//           pincode: prev.pincode || first.originPincode,
//         }));
//         setReceiver((prev) => ({
//           ...prev,
//           city: prev.city || first.destinationCity,
//           pincode: prev.pincode || first.destinationPincode,
//         }));
//       }
//     } catch (err) {
//       setRoutesError(extractErrorMessage(err, 'Failed to load your active routes.'));
//     } finally {
//       setLoadingRoutes(false);
//     }
//   }, []);

//   useEffect(() => {
//     loadRoutes();
//   }, [loadRoutes]);

//   const selectedRoute = useMemo(
//     () => routes.find((r) => r.rateId === selectedRateId) || null,
//     [routes, selectedRateId]
//   );

//   const handleSelectRoute = (nextRateId: string) => {
//     setSelectedRateId(nextRateId);
//     setCalculatedBreakdown(null);
//     setFormError(null);
//     const found = routes.find((r) => r.rateId === nextRateId);
//     if (found) {
//       setSender((prev) => ({
//         ...prev,
//         city: found.originCity,
//         pincode: found.originPincode,
//       }));
//       setReceiver((prev) => ({
//         ...prev,
//         city: found.destinationCity,
//         pincode: found.destinationPincode,
//       }));
//     }
//   };

//   const handleCalculate = async () => {
//     if (!selectedRateId) {
//       setFormError('Select one of your active routes first.');
//       return;
//     }
//     const wt = Number(parcel.actualWeightKg);
//     const l = Number(parcel.lengthCm);
//     const w = Number(parcel.widthCm);
//     const h = Number(parcel.heightCm);
//     const pkgs = Number(parcel.numberOfPackages);
//     if (!Number.isFinite(wt) || wt <= 0 || !Number.isFinite(l) || l <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
//       setFormError('Actual weight and dimensions must all be greater than 0.');
//       return;
//     }

//     setCalculating(true);
//     setFormError(null);
//     try {
//       const res = await apiClient.post<{
//         success: boolean;
//         data: { breakdown: FreightBreakdown };
//       }>('/transporter/bookings/calculate', {
//         rateId: selectedRateId,
//         actualWeightKg: wt,
//         lengthCm: l,
//         widthCm: w,
//         heightCm: h,
//         numberOfPackages: Number.isInteger(pkgs) && pkgs >= 1 ? pkgs : 1,
//       });
//       setCalculatedBreakdown(res.data.data.breakdown);
//     } catch (err) {
//       setFormError(extractErrorMessage(err, 'Failed to calculate freight for this route.'));
//     } finally {
//       setCalculating(false);
//     }
//   };

//   const validateAll = (): string | null => {
//     const phoneRegex = /^[6-9]\d{9}$/;
//     const pinRegex = /^\d{6}$/;

//     if (!selectedRoute) return 'Select an active route first.';
//     if (sender.name.trim().length < 2) return 'Customer sender name is required.';
//     if (!phoneRegex.test(sender.phone.trim())) return 'Sender phone must be a valid 10-digit Indian mobile number.';
//     if (sender.address.trim().length < 5) return 'Sender pickup address must be at least 5 characters.';
//     if (sender.city.trim().length < 2 || !pinRegex.test(sender.pincode.trim())) {
//       return 'Sender city and 6-digit pincode are required.';
//     }
//     if (receiver.name.trim().length < 2) return 'Receiver name is required.';
//     if (!phoneRegex.test(receiver.phone.trim())) return 'Receiver phone must be a valid 10-digit Indian mobile number.';
//     if (receiver.address.trim().length < 5) return 'Receiver delivery address must be at least 5 characters.';
//     if (receiver.city.trim().length < 2 || !pinRegex.test(receiver.pincode.trim())) {
//       return 'Receiver city and 6-digit pincode are required.';
//     }
//     if (parcel.description.trim().length < 2) return 'Goods description is required.';
//     if (Number(parcel.actualWeightKg) <= 0 || Number(parcel.lengthCm) <= 0 || Number(parcel.widthCm) <= 0 || Number(parcel.heightCm) <= 0) {
//       return 'Weight and dimensions must be positive numbers.';
//     }
//     if (Number(parcel.numberOfPackages) < 1) return 'At least 1 package is required.';
//     if (ewayBillNumber.trim() && !/^\d{12}$/.test(ewayBillNumber.trim())) {
//       return 'E-Way Bill number must be exactly 12 digits.';
//     }
//     return null;
//   };

//   const handleCreateBooking = async (e: React.FormEvent) => {
//     e.preventDefault();
//     const err = validateAll();
//     if (err) {
//       setFormError(err);
//       return;
//     }
//     if (!selectedRoute) return;

//     setSubmitting(true);
//     setFormError(null);
//     try {
//       const res = await apiClient.post<{ success: boolean; data: Booking }>(
//         '/transporter/bookings',
//         {
//           routeId: selectedRoute.routeId,
//           rateId: selectedRoute.rateId,
//           idempotencyKey,
//           paymentMode,
//           ewayBillNumber: ewayBillNumber.trim() || undefined,
//           ewayBillValidUpto: ewayBillValidUpto || null,
//           whatsappOptIn,
//           sender: {
//             name: sender.name.trim(),
//             phone: sender.phone.trim(),
//             address: sender.address.trim(),
//             city: sender.city.trim(),
//             pincode: sender.pincode.trim(),
//           },
//           receiver: {
//             name: receiver.name.trim(),
//             phone: receiver.phone.trim(),
//             address: receiver.address.trim(),
//             city: receiver.city.trim(),
//             pincode: receiver.pincode.trim(),
//           },
//           parcel: {
//             description: parcel.description.trim(),
//             actualWeightKg: Number(parcel.actualWeightKg),
//             lengthCm: Number(parcel.lengthCm),
//             widthCm: Number(parcel.widthCm),
//             heightCm: Number(parcel.heightCm),
//             numberOfPackages: Number(parcel.numberOfPackages),
//           },
//         },
//         {
//           headers: { 'Idempotency-Key': idempotencyKey },
//         }
//       );

//       setConfirmedBooking(res.data.data);
//       setIdempotencyKey(`zpt-self-${crypto.randomUUID()}`);
//       showToast(`Personal order created! LR: ${res.data.data.lrNumber}`, 'success');
//     } catch (submitErr) {
//       const msg = extractErrorMessage(submitErr, 'Failed to create personal booking.');
//       setFormError(msg);
//       showToast(msg, 'error');
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   const handleBookAnother = () => {
//     setConfirmedBooking(null);
//     setCalculatedBreakdown(null);
//     setFormError(null);
//     setSender((prev) => ({
//       ...prev,
//       name: '',
//       phone: '',
//       address: '',
//     }));
//     setReceiver((prev) => ({
//       ...prev,
//       name: '',
//       phone: '',
//       address: '',
//     }));
//     setEwayBillNumber('');
//     setEwayBillValidUpto('');
//     setIdempotencyKey(`zpt-self-${crypto.randomUUID()}`);
//   };

//   const downloadBlob = async (url: string, filename: string, mime: string) => {
//     const res = await apiClient.get(url, { responseType: 'blob' });
//     const blob = new Blob([res.data as BlobPart], { type: mime });
//     const objUrl = URL.createObjectURL(blob);
//     const a = document.createElement('a');
//     a.href = objUrl;
//     a.download = filename;
//     document.body.appendChild(a);
//     a.click();
//     a.remove();
//     URL.revokeObjectURL(objUrl);
//   };

//   const handleDownloadLr = async () => {
//     if (!confirmedBooking) return;
//     setDownloadingLr(true);
//     try {
//       await downloadBlob(`/bookings/${confirmedBooking._id}/lr`, `${confirmedBooking.lrNumber}.pdf`, 'application/pdf');
//       showToast(`Downloaded ${confirmedBooking.lrNumber}.pdf`, 'success');
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to download LR PDF.'), 'error');
//     } finally {
//       setDownloadingLr(false);
//     }
//   };

//   const handleDownloadBarcode = async () => {
//     if (!confirmedBooking) return;
//     setDownloadingBarcode(true);
//     try {
//       await downloadBlob(
//         `/bookings/${confirmedBooking._id}/barcode?download=1`,
//         `${confirmedBooking.lrNumber}-barcode.png`,
//         'image/png'
//       );
//       showToast(`Downloaded barcode label for ${confirmedBooking.lrNumber}`, 'success');
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to download barcode PNG.'), 'error');
//     } finally {
//       setDownloadingBarcode(false);
//     }
//   };

//   if (isApprovalBlocked) {
//     const isRejected = approvalStatus === TransporterApprovalStatus.REJECTED;
//     return (
//       <div className="space-y-6">
//         <div>
//           <h1 className="text-xl font-semibold text-slate-900">Create Personal Customer Order</h1>
//           <p className="text-sm text-slate-500 mt-0.5">
//             Book direct consignments for your own customers using your active route rates and generate LR &amp; barcode labels
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
//                   ? 'Carrier Registration Rejected — Personal Booking Unavailable'
//                   : 'Carrier Account Pending Admin Approval'}
//               </h2>
//               <p className={`text-sm ${isRejected ? 'text-red-800' : 'text-amber-800'}`}>
//                 {isRejected
//                   ? `Reason: ${transporter?.rejectionReason || 'Contact ZIPIT support for verification details.'}`
//                   : 'Creating personal customer bookings and generating LR slips will unlock as soon as an administrator approves your carrier account.'}
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
//               to="/transporter"
//               className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
//             >
//               Back to Dashboard
//             </Link>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="space-y-6">
//       {loadingRoutes ? (
//         <LoadingSkeleton rows={5} />
//       ) : routesError ? (
//         <ErrorBanner message={routesError} onRetry={loadRoutes} />
//       ) : routes.length === 0 ? (
//         <div className="space-y-4">
//           <EmptyState
//             title="No active routes configured"
//             description="Add and activate at least one route with rate configuration before creating personal customer bookings."
//           />
//           <div className="flex justify-center">
//             <Link
//               to="/transporter/routes"
//               className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
//             >
//               Configure Routes &amp; Rates
//             </Link>
//           </div>
//         </div>
//       ) : confirmedBooking ? (
//         <div className="bg-white border border-emerald-200 rounded-xl p-6 shadow-sm space-y-5">
//           <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
//             <div className="flex items-start gap-3">
//               <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 shrink-0">
//                 <CheckCircle2 className="w-5 h-5" />
//               </div>
//               <div>
//                 <div className="flex flex-wrap items-center gap-2">
//                   <h2 className="text-lg font-bold text-slate-900 font-mono tabular-nums">
//                     {confirmedBooking.lrNumber}
//                   </h2>
//                   <StatusBadge status={confirmedBooking.status} />
//                   <StatusBadge status="TRANSPORTER_SELF" />
//                 </div>
//                 <p className="text-xs text-slate-500 mt-0.5">
//                   Booking ID: <span className="font-mono">{confirmedBooking.bookingId}</span> ·{' '}
//                   {confirmedBooking.origin.city} → {confirmedBooking.destination.city} · Total:{' '}
//                   <strong className="font-mono text-slate-900">{formatINR(confirmedBooking.finalAmount)}</strong>
//                 </p>
//               </div>
//             </div>

//             <button
//               type="button"
//               onClick={handleBookAnother}
//               className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
//             >
//               <RotateCcw className="w-3.5 h-3.5" />
//               <span>Book Another Order</span>
//             </button>
//           </div>

//           <div className="flex flex-wrap items-center gap-3">
//             <button
//               type="button"
//               disabled={downloadingLr}
//               onClick={handleDownloadLr}
//               className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
//             >
//               <FileDown className="w-4 h-4" />
//               <span>{downloadingLr ? 'Generating PDF...' : 'Download LR Document (PDF)'}</span>
//             </button>

//             <button
//               type="button"
//               disabled={downloadingBarcode}
//               onClick={handleDownloadBarcode}
//               className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
//             >
//               <Barcode className="w-4 h-4 text-slate-700" />
//               <span>{downloadingBarcode ? 'Generating PNG...' : 'Download Barcode Label'}</span>
//             </button>

//             <button
//               type="button"
//               onClick={() =>
//                 navigate(`/transporter/tracking?lr=${encodeURIComponent(confirmedBooking.lrNumber)}`)
//               }
//               className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
//             >
//               <Search className="w-4 h-4 text-blue-600" />
//               <span>Track Shipment</span>
//             </button>

//             <button
//               type="button"
//               onClick={() =>
//                 navigate(`/transporter/bookings/${confirmedBooking._id}`, {
//                   state: { from: '/transporter/booked-orders' },
//                 })
//               }
//               className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
//             >
//               <span>Manage Shipment</span>
//             </button>
//           </div>
//         </div>
//       ) : (
//         <form onSubmit={handleCreateBooking} className="space-y-5">
//           {formError && <ErrorBanner message={formError} />}

//           {/* Route Selection */}
//           <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
//             <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
//               <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
//                 <RouteIcon className="w-4 h-4 text-blue-600" />
//                 <span>1. Select Active Carrier Route</span>
//               </h2>
//               <Link to="/transporter/routes" className="text-xs font-medium text-blue-600 hover:underline">
//                 Manage Routes &amp; Rates
//               </Link>
//             </div>

//             <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-end">
//               <div className="xl:col-span-6">
//                 <label className="block text-xs font-medium text-slate-600 mb-1.5">
//                   Operating Route *
//                 </label>
//                 <select
//                   value={selectedRateId}
//                   onChange={(e) => handleSelectRoute(e.target.value)}
//                   className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
//                 >
//                   {routes.map((r) => (
//                     <option key={r.rateId} value={r.rateId}>
//                       {r.originCity} ({r.originPincode}) → {r.destinationCity} ({r.destinationPincode}) ·{' '}
//                       {formatINR(r.ratePerKg)}/kg · Min {formatINR(r.minimumFreight)}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               {selectedRoute && (
//                 <div className="xl:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
//                   <div>
//                     <span className="text-slate-500 block">Rate / Kg</span>
//                     <strong className="font-mono tabular-nums text-slate-900">
//                       {formatINR(selectedRoute.ratePerKg)}
//                     </strong>
//                   </div>
//                   <div>
//                     <span className="text-slate-500 block">Min Freight</span>
//                     <strong className="font-mono tabular-nums text-slate-900">
//                       {formatINR(selectedRoute.minimumFreight)}
//                     </strong>
//                   </div>
//                   <div>
//                     <span className="text-slate-500 block">GST / Divisor</span>
//                     <strong className="font-mono tabular-nums text-slate-900">
//                       {selectedRoute.gstApplicable ? `${selectedRoute.gstRatePercent}%` : 'Exempt'} ·{' '}
//                       {selectedRoute.volumetricDivisor}
//                     </strong>
//                   </div>
//                   <div>
//                     <span className="text-slate-500 block">ETA</span>
//                     <strong className="text-slate-900">{selectedRoute.estimatedDeliveryTime}</strong>
//                   </div>
//                 </div>
//               )}
//             </div>
//           </section>

//           {/* Sender & Receiver Details */}
//           <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
//             <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3.5">
//               <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
//                 <User className="w-4 h-4 text-blue-600" />
//                 <span>2. Sender (Customer) Details</span>
//               </h2>
//               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Sender Name *</label>
//                   <input
//                     type="text"
//                     required
//                     value={sender.name}
//                     onChange={(e) => setSender({ ...sender, name: e.target.value })}
//                     placeholder="Direct Customer / Business Name"
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
//                   <input
//                     type="tel"
//                     required
//                     value={sender.phone}
//                     onChange={(e) => setSender({ ...sender, phone: e.target.value })}
//                     placeholder="9822001122"
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                   />
//                 </div>
//                 <div className="sm:col-span-2">
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Pickup Address *</label>
//                   <input
//                     type="text"
//                     required
//                     value={sender.address}
//                     onChange={(e) => setSender({ ...sender, address: e.target.value })}
//                     placeholder="Factory / Shop / Godown Street Address"
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Origin City *</label>
//                   <input
//                     type="text"
//                     required
//                     value={sender.city}
//                     onChange={(e) => setSender({ ...sender, city: e.target.value })}
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Pincode *</label>
//                   <input
//                     type="text"
//                     required
//                     pattern="\d{6}"
//                     maxLength={6}
//                     value={sender.pincode}
//                     onChange={(e) => setSender({ ...sender, pincode: e.target.value.replace(/\D/g, '') })}
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums bg-slate-50"
//                   />
//                 </div>
//               </div>
//             </section>

//             <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3.5">
//               <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
//                 <MapPin className="w-4 h-4 text-emerald-600" />
//                 <span>3. Receiver (Consignee) Details</span>
//               </h2>
//               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Receiver Name *</label>
//                   <input
//                     type="text"
//                     required
//                     value={receiver.name}
//                     onChange={(e) => setReceiver({ ...receiver, name: e.target.value })}
//                     placeholder="Consignee Company / Name"
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
//                   <input
//                     type="tel"
//                     required
//                     value={receiver.phone}
//                     onChange={(e) => setReceiver({ ...receiver, phone: e.target.value })}
//                     placeholder="9820033445"
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                   />
//                 </div>
//                 <div className="sm:col-span-2">
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Delivery Address *</label>
//                   <input
//                     type="text"
//                     required
//                     value={receiver.address}
//                     onChange={(e) => setReceiver({ ...receiver, address: e.target.value })}
//                     placeholder="Warehouse / Industrial Estate Address"
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Destination City *</label>
//                   <input
//                     type="text"
//                     required
//                     value={receiver.city}
//                     onChange={(e) => setReceiver({ ...receiver, city: e.target.value })}
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-xs font-medium text-slate-600 mb-1">Pincode *</label>
//                   <input
//                     type="text"
//                     required
//                     pattern="\d{6}"
//                     maxLength={6}
//                     value={receiver.pincode}
//                     onChange={(e) =>
//                       setReceiver({ ...receiver, pincode: e.target.value.replace(/\D/g, '') })
//                     }
//                     className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums bg-slate-50"
//                   />
//                 </div>
//               </div>
//             </section>
//           </div>

//           {/* Parcel Specs + Calculate + Confirm */}
//           <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
//             <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
//               <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
//                 <Package className="w-4 h-4 text-blue-600" />
//                 <span>4. Parcel Specifications &amp; Freight Calculation</span>
//               </h2>
//               <button
//                 type="button"
//                 disabled={calculating || !selectedRateId}
//                 onClick={handleCalculate}
//                 className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
//               >
//                 <Calculator className="w-4 h-4" />
//                 <span>{calculating ? 'Calculating...' : 'Calculate Freight'}</span>
//               </button>
//             </div>

//             <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3.5">
//               <div className="col-span-2 sm:col-span-4 xl:col-span-2">
//                 <label className="block text-xs font-medium text-slate-600 mb-1">Goods Description *</label>
//                 <input
//                   type="text"
//                   required
//                   value={parcel.description}
//                   onChange={(e) => setParcel({ ...parcel, description: e.target.value })}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-600 mb-1">Packages *</label>
//                 <input
//                   type="number"
//                   min="1"
//                   step="1"
//                   required
//                   value={parcel.numberOfPackages}
//                   onChange={(e) => {
//                     setParcel({ ...parcel, numberOfPackages: e.target.value });
//                     setCalculatedBreakdown(null);
//                   }}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div>
//                 <label className="block text-xs font-medium text-slate-600 mb-1">Actual Wt (kg) *</label>
//                 <input
//                   type="number"
//                   min="0.1"
//                   step="0.1"
//                   required
//                   value={parcel.actualWeightKg}
//                   onChange={(e) => {
//                     setParcel({ ...parcel, actualWeightKg: e.target.value });
//                     setCalculatedBreakdown(null);
//                   }}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div className="col-span-2 sm:col-span-2 xl:col-span-1">
//                 <label className="block text-xs font-medium text-slate-600 mb-1">L × W × H (cm) *</label>
//                 <div className="grid grid-cols-3 gap-1.5">
//                   <input
//                     type="number"
//                     min="1"
//                     required
//                     value={parcel.lengthCm}
//                     onChange={(e) => {
//                       setParcel({ ...parcel, lengthCm: e.target.value });
//                       setCalculatedBreakdown(null);
//                     }}
//                     aria-label="Length in cm"
//                     className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono tabular-nums"
//                   />
//                   <input
//                     type="number"
//                     min="1"
//                     required
//                     value={parcel.widthCm}
//                     onChange={(e) => {
//                       setParcel({ ...parcel, widthCm: e.target.value });
//                       setCalculatedBreakdown(null);
//                     }}
//                     aria-label="Width in cm"
//                     className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono tabular-nums"
//                   />
//                   <input
//                     type="number"
//                     min="1"
//                     required
//                     value={parcel.heightCm}
//                     onChange={(e) => {
//                       setParcel({ ...parcel, heightCm: e.target.value });
//                       setCalculatedBreakdown(null);
//                     }}
//                     aria-label="Height in cm"
//                     className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono tabular-nums"
//                   />
//                 </div>
//               </div>
//               <div className="col-span-2 sm:col-span-2 xl:col-span-1">
//                 <label className="block text-xs font-medium text-slate-600 mb-1">Payment Mode</label>
//                 <select
//                   value={paymentMode}
//                   onChange={(e) => setPaymentMode(e.target.value as 'CASH' | 'TO_PAY' | 'INVOICE')}
//                   className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
//                 >
//                   <option value="CASH">Cash / Paid</option>
//                   <option value="TO_PAY">To-Pay (Consignee)</option>
//                   <option value="INVOICE">Customer Invoice</option>
//                 </select>
//               </div>
//               <div className="col-span-2 sm:col-span-2 xl:col-span-2">
//                 <label className="block text-xs font-medium text-slate-600 mb-1">
//                   E-Way Bill No. (Optional, 12 digits)
//                 </label>
//                 <input
//                   type="text"
//                   maxLength={12}
//                   value={ewayBillNumber}
//                   onChange={(e) => setEwayBillNumber(e.target.value.replace(/\D/g, ''))}
//                   placeholder="271009887766"
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//               <div className="col-span-2 sm:col-span-2 xl:col-span-1">
//                 <label className="block text-xs font-medium text-slate-600 mb-1">
//                   E-Way Valid Upto
//                 </label>
//                 <input
//                   type="date"
//                   value={ewayBillValidUpto}
//                   onChange={(e) => setEwayBillValidUpto(e.target.value)}
//                   className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
//                 />
//               </div>
//             </div>

//             {calculatedBreakdown && (
//               <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
//                 <div>
//                   <span className="text-slate-500 block">Chargeable Weight</span>
//                   <strong className="font-mono tabular-nums text-slate-900">
//                     {formatWeight(calculatedBreakdown.chargeableWeightKg)}
//                   </strong>
//                   <span className="block text-[11px] text-slate-500 font-mono tabular-nums">
//                     Vol: {formatWeight(calculatedBreakdown.volumetricWeightKg)}
//                   </span>
//                 </div>
//                 <div>
//                   <span className="text-slate-500 block">Base Freight</span>
//                   <strong className="font-mono tabular-nums text-slate-900">
//                     {formatINR(calculatedBreakdown.baseFreight)}
//                   </strong>
//                 </div>
//                 <div>
//                   <span className="text-slate-500 block">Additional Charges</span>
//                   <strong className="font-mono tabular-nums text-slate-900">
//                     {formatINR(calculatedBreakdown.additionalCharges)}
//                   </strong>
//                 </div>
//                 {Number(calculatedBreakdown.platformCharge ?? 0) > 0 && (
//                   <div>
//                     <span className="text-slate-500 block">
//                       Platform Charge
//                       {calculatedBreakdown.platformChargeType === 'PERCENTAGE' &&
//                       calculatedBreakdown.platformChargeValue
//                         ? ` (${calculatedBreakdown.platformChargeValue}%)`
//                         : ''}
//                     </span>
//                     <strong className="font-mono tabular-nums text-slate-900">
//                       {formatINR(calculatedBreakdown.platformCharge || 0)}
//                     </strong>
//                   </div>
//                 )}
//                 <div>
//                   <span className="text-slate-500 block">
//                     GST ({calculatedBreakdown.gstApplicable ? `${calculatedBreakdown.gstRatePercent}%` : 'Exempt'})
//                   </span>
//                   <strong className="font-mono tabular-nums text-slate-900">
//                     {formatINR(calculatedBreakdown.taxAmount)}
//                   </strong>
//                 </div>
//                 <div>
//                   <span className="text-slate-500 block">Total Amount</span>
//                   <strong className="text-base font-mono tabular-nums text-blue-700">
//                     {formatINR(calculatedBreakdown.finalAmount)}
//                   </strong>
//                 </div>
//               </div>
//             )}

//             <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
//               <div className="space-y-1.5">
//                 <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
//                   <input
//                     type="checkbox"
//                     checked={whatsappOptIn}
//                     onChange={(e) => setWhatsappOptIn(e.target.checked)}
//                     className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
//                   />
//                   <span>Customer opted in for automated WhatsApp shipment tracking alerts</span>
//                 </label>
//                 <p className="text-xs text-slate-500">
//                   Freight, GST, and any enabled platform charges are verified server-side from your selected route configuration.
//                 </p>
//               </div>
//               <button
//                 type="submit"
//                 disabled={submitting || !selectedRoute}
//                 className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
//               >
//                 <CheckCircle2 className="w-4 h-4" />
//                 <span>
//                   {submitting
//                     ? 'Confirming Booking...'
//                     : calculatedBreakdown
//                       ? `Confirm & Generate LR (${formatINR(calculatedBreakdown.finalAmount)})`
//                       : 'Confirm & Generate LR'}
//                 </span>
//               </button>
//             </div>
//           </section>
//         </form>
//       )}
//     </div>
//   );
// }


import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Barcode,
  Calculator,
  CheckCircle2,
  FileDown,
  MapPin,
  Package,
  RotateCcw,
  Route as RouteIcon,
  Search,
  User,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatINR, formatWeight } from '../../utils/formatters.ts';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import {
  EntityStatus,
  TransporterApprovalStatus,
  type Booking,
  type FreightBreakdown,
  type IntegratedRouteRate,
  type PaginatedResponse,
  type Transporter,
} from '../../types/index.ts';

interface PartyForm {
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
}

interface ParcelForm {
  description: string;
  actualWeightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  numberOfPackages: string;
}

const inputClass =
  'w-full h-9 px-3 text-[13px] bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none transition';

const cardClass = 'bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-4';

const secondaryButton =
  'inline-flex items-center justify-center gap-2 h-9 px-4 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 transition-colors';

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

function SectionTitle({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2.5 text-sm font-semibold text-gray-900">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        {title}
      </h2>
      {action}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 text-right tabular-nums">{value}</dd>
    </div>
  );
}

export function CreatePersonalBookingPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const transporter = profile as Transporter | null;
  const approvalStatus = transporter?.approvalStatus;
  const isApprovalBlocked =
    Boolean(approvalStatus) && approvalStatus !== TransporterApprovalStatus.APPROVED;

  const [routes, setRoutes] = useState<IntegratedRouteRate[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);

  const [selectedRateId, setSelectedRateId] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'TO_PAY' | 'INVOICE'>('CASH');

  const [sender, setSender] = useState<PartyForm>({
    name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
  });
  const [receiver, setReceiver] = useState<PartyForm>({
    name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
  });
  const [parcel, setParcel] = useState<ParcelForm>({
    description: 'B2B Commercial Consignment',
    actualWeightKg: '25',
    lengthCm: '50',
    widthCm: '40',
    heightCm: '30',
    numberOfPackages: '1',
  });
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [ewayBillValidUpto, setEwayBillValidUpto] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);

  const [calculatedBreakdown, setCalculatedBreakdown] = useState<FreightBreakdown | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `zpt-self-${crypto.randomUUID()}`);

  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [downloadingLr, setDownloadingLr] = useState(false);
  const [downloadingBarcode, setDownloadingBarcode] = useState(false);

  const loadRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    setRoutesError(null);
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: PaginatedResponse<IntegratedRouteRate>;
      }>('/transporter/routes', { params: { status: EntityStatus.ACTIVE, limit: 100 } });
      const activeList = res.data.data.items;
      setRoutes(activeList);
      if (activeList.length > 0) {
        const first = activeList[0];
        setSelectedRateId(first.rateId);
        setSender((prev) => ({
          ...prev,
          city: prev.city || first.originCity,
          pincode: prev.pincode || first.originPincode,
        }));
        setReceiver((prev) => ({
          ...prev,
          city: prev.city || first.destinationCity,
          pincode: prev.pincode || first.destinationPincode,
        }));
      }
    } catch (err) {
      setRoutesError(extractErrorMessage(err, 'Failed to load your active routes.'));
    } finally {
      setLoadingRoutes(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const selectedRoute = useMemo(
    () => routes.find((r) => r.rateId === selectedRateId) || null,
    [routes, selectedRateId]
  );

  const handleSelectRoute = (nextRateId: string) => {
    setSelectedRateId(nextRateId);
    setCalculatedBreakdown(null);
    setFormError(null);
    const found = routes.find((r) => r.rateId === nextRateId);
    if (found) {
      setSender((prev) => ({
        ...prev,
        city: found.originCity,
        pincode: found.originPincode,
      }));
      setReceiver((prev) => ({
        ...prev,
        city: found.destinationCity,
        pincode: found.destinationPincode,
      }));
    }
  };

  const handleCalculate = async () => {
    if (!selectedRateId) {
      setFormError('Select one of your active routes first.');
      return;
    }
    const wt = Number(parcel.actualWeightKg);
    const l = Number(parcel.lengthCm);
    const w = Number(parcel.widthCm);
    const h = Number(parcel.heightCm);
    const pkgs = Number(parcel.numberOfPackages);
    if (!Number.isFinite(wt) || wt <= 0 || !Number.isFinite(l) || l <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      setFormError('Actual weight and dimensions must all be greater than 0.');
      return;
    }

    setCalculating(true);
    setFormError(null);
    try {
      const res = await apiClient.post<{
        success: boolean;
        data: { breakdown: FreightBreakdown };
      }>('/transporter/bookings/calculate', {
        rateId: selectedRateId,
        actualWeightKg: wt,
        lengthCm: l,
        widthCm: w,
        heightCm: h,
        numberOfPackages: Number.isInteger(pkgs) && pkgs >= 1 ? pkgs : 1,
      });
      setCalculatedBreakdown(res.data.data.breakdown);
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Failed to calculate freight for this route.'));
    } finally {
      setCalculating(false);
    }
  };

  const validateAll = (): string | null => {
    const phoneRegex = /^[6-9]\d{9}$/;
    const pinRegex = /^\d{6}$/;

    if (!selectedRoute) return 'Select an active route first.';
    if (sender.name.trim().length < 2) return 'Customer sender name is required.';
    if (!phoneRegex.test(sender.phone.trim())) return 'Sender phone must be a valid 10-digit Indian mobile number.';
    if (sender.address.trim().length < 5) return 'Sender pickup address must be at least 5 characters.';
    if (sender.city.trim().length < 2 || !pinRegex.test(sender.pincode.trim())) {
      return 'Sender city and 6-digit pincode are required.';
    }
    if (receiver.name.trim().length < 2) return 'Receiver name is required.';
    if (!phoneRegex.test(receiver.phone.trim())) return 'Receiver phone must be a valid 10-digit Indian mobile number.';
    if (receiver.address.trim().length < 5) return 'Receiver delivery address must be at least 5 characters.';
    if (receiver.city.trim().length < 2 || !pinRegex.test(receiver.pincode.trim())) {
      return 'Receiver city and 6-digit pincode are required.';
    }
    if (parcel.description.trim().length < 2) return 'Goods description is required.';
    if (Number(parcel.actualWeightKg) <= 0 || Number(parcel.lengthCm) <= 0 || Number(parcel.widthCm) <= 0 || Number(parcel.heightCm) <= 0) {
      return 'Weight and dimensions must be positive numbers.';
    }
    if (Number(parcel.numberOfPackages) < 1) return 'At least 1 package is required.';
    if (ewayBillNumber.trim() && !/^\d{12}$/.test(ewayBillNumber.trim())) {
      return 'E-Way Bill number must be exactly 12 digits.';
    }
    return null;
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateAll();
    if (err) {
      setFormError(err);
      return;
    }
    if (!selectedRoute) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiClient.post<{ success: boolean; data: Booking }>(
        '/transporter/bookings',
        {
          routeId: selectedRoute.routeId,
          rateId: selectedRoute.rateId,
          idempotencyKey,
          paymentMode,
          ewayBillNumber: ewayBillNumber.trim() || undefined,
          ewayBillValidUpto: ewayBillValidUpto || null,
          whatsappOptIn,
          sender: {
            name: sender.name.trim(),
            phone: sender.phone.trim(),
            address: sender.address.trim(),
            city: sender.city.trim(),
            pincode: sender.pincode.trim(),
          },
          receiver: {
            name: receiver.name.trim(),
            phone: receiver.phone.trim(),
            address: receiver.address.trim(),
            city: receiver.city.trim(),
            pincode: receiver.pincode.trim(),
          },
          parcel: {
            description: parcel.description.trim(),
            actualWeightKg: Number(parcel.actualWeightKg),
            lengthCm: Number(parcel.lengthCm),
            widthCm: Number(parcel.widthCm),
            heightCm: Number(parcel.heightCm),
            numberOfPackages: Number(parcel.numberOfPackages),
          },
        },
        {
          headers: { 'Idempotency-Key': idempotencyKey },
        }
      );

      setConfirmedBooking(res.data.data);
      setIdempotencyKey(`zpt-self-${crypto.randomUUID()}`);
      showToast(`Personal order created! LR: ${res.data.data.lrNumber}`, 'success');
    } catch (submitErr) {
      const msg = extractErrorMessage(submitErr, 'Failed to create personal booking.');
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookAnother = () => {
    setConfirmedBooking(null);
    setCalculatedBreakdown(null);
    setFormError(null);
    setSender((prev) => ({
      ...prev,
      name: '',
      phone: '',
      address: '',
    }));
    setReceiver((prev) => ({
      ...prev,
      name: '',
      phone: '',
      address: '',
    }));
    setEwayBillNumber('');
    setEwayBillValidUpto('');
    setIdempotencyKey(`zpt-self-${crypto.randomUUID()}`);
  };

  const downloadBlob = async (url: string, filename: string, mime: string) => {
    const res = await apiClient.get(url, { responseType: 'blob' });
    const blob = new Blob([res.data as BlobPart], { type: mime });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  };

  const handleDownloadLr = async () => {
    if (!confirmedBooking) return;
    setDownloadingLr(true);
    try {
      await downloadBlob(`/bookings/${confirmedBooking._id}/lr`, `${confirmedBooking.lrNumber}.pdf`, 'application/pdf');
      showToast(`Downloaded ${confirmedBooking.lrNumber}.pdf`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download LR PDF.'), 'error');
    } finally {
      setDownloadingLr(false);
    }
  };

  const handleDownloadBarcode = async () => {
    if (!confirmedBooking) return;
    setDownloadingBarcode(true);
    try {
      await downloadBlob(
        `/bookings/${confirmedBooking._id}/barcode?download=1`,
        `${confirmedBooking.lrNumber}-barcode.png`,
        'image/png'
      );
      showToast(`Downloaded barcode label for ${confirmedBooking.lrNumber}`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download barcode PNG.'), 'error');
    } finally {
      setDownloadingBarcode(false);
    }
  };

  if (isApprovalBlocked) {
    const isRejected = approvalStatus === TransporterApprovalStatus.REJECTED;
    return (
      <div className="space-y-4 text-gray-900 antialiased">
        <div>
          <h1 className="text-xl font-semibold">Create Personal Customer Order</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Book direct consignments for your own customers using your active route rates and generate LR &amp; barcode labels
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
                  ? 'Carrier Registration Rejected — Personal Booking Unavailable'
                  : 'Carrier Account Pending Admin Approval'}
              </h2>
              <p className={`text-[13px] ${isRejected ? 'text-red-800' : 'text-amber-800'}`}>
                {isRejected
                  ? `Reason: ${transporter?.rejectionReason || 'Contact ZIPIT support for verification details.'}`
                  : 'Creating personal customer bookings and generating LR slips will unlock as soon as an administrator approves your carrier account.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/transporter/profile" className={secondaryButton}>
              Complete Profile &amp; KYC
            </Link>
            <Link to="/transporter" className={secondaryButton}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-4 text-gray-900 antialiased"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {loadingRoutes ? (
        <LoadingSkeleton rows={5} />
      ) : routesError ? (
        <ErrorBanner message={routesError} onRetry={loadRoutes} />
      ) : routes.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="No active routes configured"
            description="Add and activate at least one route with rate configuration before creating personal customer bookings."
          />
          <div className="flex justify-center">
            <Link
              to="/transporter/routes"
              className="inline-flex items-center h-9 px-4 text-[13px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Configure Routes &amp; Rates
            </Link>
          </div>
        </div>
      ) : confirmedBooking ? (
        <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold tabular-nums">{confirmedBooking.lrNumber}</h2>
            <div className="flex flex-wrap justify-center gap-2">
              <StatusBadge status={confirmedBooking.status} />
              <StatusBadge status="TRANSPORTER_SELF" />
            </div>
          </div>

          <dl className="rounded-xl bg-gray-50 p-4 space-y-2 text-[13px]">
            <SummaryRow label="Booking ID" value={confirmedBooking.bookingId} />
            <SummaryRow
              label="Route"
              value={`${confirmedBooking.origin.city} → ${confirmedBooking.destination.city}`}
            />
            <SummaryRow label="Total" value={formatINR(confirmedBooking.finalAmount)} />
          </dl>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={downloadingLr}
              onClick={handleDownloadLr}
              className="inline-flex items-center justify-center gap-2 h-9 px-4 text-[13px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <FileDown className="w-4 h-4" />
              <span>{downloadingLr ? 'Generating PDF...' : 'Download LR Document (PDF)'}</span>
            </button>

            <button
              type="button"
              disabled={downloadingBarcode}
              onClick={handleDownloadBarcode}
              className={secondaryButton}
            >
              <Barcode className="w-4 h-4 text-blue-600" />
              <span>{downloadingBarcode ? 'Generating PNG...' : 'Download Barcode Label'}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(`/transporter/tracking?lr=${encodeURIComponent(confirmedBooking.lrNumber)}`)
              }
              className={secondaryButton}
            >
              <Search className="w-4 h-4 text-blue-600" />
              <span>Track Shipment</span>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(`/transporter/bookings/${confirmedBooking._id}`, {
                  state: { from: '/transporter/booked-orders' },
                })
              }
              className={secondaryButton}
            >
              <span>Manage Shipment</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleBookAnother}
            className="w-full inline-flex items-center justify-center gap-2 h-9 text-[13px] font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Book Another Order</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreateBooking} className="space-y-4">
          {formError && <ErrorBanner message={formError} />}

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            <div className="space-y-4 min-w-0">
              {/* 1. Route */}
              <section className={cardClass}>
                <SectionTitle
                  icon={RouteIcon}
                  title="Select Route"
                  action={
                    <Link to="/transporter/routes" className="text-[13px] font-medium text-blue-600 hover:underline">
                      Manage Routes &amp; Rates
                    </Link>
                  }
                />
                <Field label="Operating Route *">
                  <select
                    value={selectedRateId}
                    onChange={(e) => handleSelectRoute(e.target.value)}
                    className={inputClass}
                  >
                    {routes.map((r) => (
                      <option key={r.rateId} value={r.rateId}>
                        {r.originCity} ({r.originPincode}) → {r.destinationCity} ({r.destinationPincode}) ·{' '}
                        {formatINR(r.ratePerKg)}/kg · Min {formatINR(r.minimumFreight)}
                      </option>
                    ))}
                  </select>
                </Field>

                {selectedRoute && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-blue-50/60 p-3 text-[13px]">
                    {[
                      ['Rate / Kg', formatINR(selectedRoute.ratePerKg)],
                      ['Min Freight', formatINR(selectedRoute.minimumFreight)],
                      [
                        'GST / Divisor',
                        `${selectedRoute.gstApplicable ? `${selectedRoute.gstRatePercent}%` : 'Exempt'} · ${selectedRoute.volumetricDivisor}`,
                      ],
                      ['ETA', selectedRoute.estimatedDeliveryTime],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <span className="block text-gray-500">{label}</span>
                        <strong className="font-semibold tabular-nums">{value}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 2 & 3. Sender / Receiver */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className={cardClass}>
                  <SectionTitle icon={User} title="Sender Details" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Sender Name *" className="sm:col-span-2">
                      <input
                        type="text"
                        required
                        value={sender.name}
                        onChange={(e) => setSender({ ...sender, name: e.target.value })}
                        placeholder="Direct Customer / Business Name"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Phone *" className="sm:col-span-2">
                      <input
                        type="tel"
                        required
                        value={sender.phone}
                        onChange={(e) => setSender({ ...sender, phone: e.target.value })}
                        placeholder="9822001122"
                        className={`${inputClass} tabular-nums`}
                      />
                    </Field>
                    <Field label="Pickup Address *" className="sm:col-span-2">
                      <input
                        type="text"
                        required
                        value={sender.address}
                        onChange={(e) => setSender({ ...sender, address: e.target.value })}
                        placeholder="Factory / Shop / Godown Street Address"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Origin City *">
                      <input
                        type="text"
                        required
                        value={sender.city}
                        onChange={(e) => setSender({ ...sender, city: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Pincode *">
                      <input
                        type="text"
                        required
                        pattern="\d{6}"
                        maxLength={6}
                        value={sender.pincode}
                        onChange={(e) => setSender({ ...sender, pincode: e.target.value.replace(/\D/g, '') })}
                        className={`${inputClass} tabular-nums`}
                      />
                    </Field>
                  </div>
                </section>

                <section className={cardClass}>
                  <SectionTitle icon={MapPin} title="Receiver Details" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Receiver Name *" className="sm:col-span-2">
                      <input
                        type="text"
                        required
                        value={receiver.name}
                        onChange={(e) => setReceiver({ ...receiver, name: e.target.value })}
                        placeholder="Consignee Company / Name"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Phone *" className="sm:col-span-2">
                      <input
                        type="tel"
                        required
                        value={receiver.phone}
                        onChange={(e) => setReceiver({ ...receiver, phone: e.target.value })}
                        placeholder="9820033445"
                        className={`${inputClass} tabular-nums`}
                      />
                    </Field>
                    <Field label="Delivery Address *" className="sm:col-span-2">
                      <input
                        type="text"
                        required
                        value={receiver.address}
                        onChange={(e) => setReceiver({ ...receiver, address: e.target.value })}
                        placeholder="Warehouse / Industrial Estate Address"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Destination City *">
                      <input
                        type="text"
                        required
                        value={receiver.city}
                        onChange={(e) => setReceiver({ ...receiver, city: e.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Pincode *">
                      <input
                        type="text"
                        required
                        pattern="\d{6}"
                        maxLength={6}
                        value={receiver.pincode}
                        onChange={(e) =>
                          setReceiver({ ...receiver, pincode: e.target.value.replace(/\D/g, '') })
                        }
                        className={`${inputClass} tabular-nums`}
                      />
                    </Field>
                  </div>
                </section>
              </div>

              {/* 4. Parcel */}
              <section className={cardClass}>
                <SectionTitle icon={Package} title="Parcel Details" />
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                  <Field label="Goods Description *" className="col-span-2 sm:col-span-6">
                    <input
                      type="text"
                      required
                      value={parcel.description}
                      onChange={(e) => setParcel({ ...parcel, description: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Packages *" className="sm:col-span-3">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={parcel.numberOfPackages}
                      onChange={(e) => {
                        setParcel({ ...parcel, numberOfPackages: e.target.value });
                        setCalculatedBreakdown(null);
                      }}
                      className={`${inputClass} tabular-nums`}
                    />
                  </Field>
                  <Field label="Actual Wt (kg) *" className="sm:col-span-3">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      required
                      value={parcel.actualWeightKg}
                      onChange={(e) => {
                        setParcel({ ...parcel, actualWeightKg: e.target.value });
                        setCalculatedBreakdown(null);
                      }}
                      className={`${inputClass} tabular-nums`}
                    />
                  </Field>
                  {(
                    [
                      ['lengthCm', 'Length (cm) *'],
                      ['widthCm', 'Width (cm) *'],
                      ['heightCm', 'Height (cm) *'],
                    ] as const
                  ).map(([key, label]) => (
                    <Field
                      key={key}
                      label={label}
                      className={`sm:col-span-2 ${key === 'heightCm' ? 'col-span-2' : ''}`}
                    >
                      <input
                        type="number"
                        min="1"
                        required
                        value={parcel[key]}
                        onChange={(e) => {
                          setParcel({ ...parcel, [key]: e.target.value });
                          setCalculatedBreakdown(null);
                        }}
                        className={`${inputClass} tabular-nums`}
                      />
                    </Field>
                  ))}
                  <Field label="E-Way Bill No. (Optional)" className="col-span-2 sm:col-span-3">
                    <input
                      type="text"
                      maxLength={12}
                      value={ewayBillNumber}
                      onChange={(e) => setEwayBillNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="12 digits"
                      className={`${inputClass} tabular-nums`}
                    />
                  </Field>
                  <Field label="E-Way Valid Upto" className="col-span-2 sm:col-span-3">
                    <input
                      type="date"
                      value={ewayBillValidUpto}
                      onChange={(e) => setEwayBillValidUpto(e.target.value)}
                      className={`${inputClass} tabular-nums`}
                    />
                  </Field>
                </div>
              </section>
            </div>

            {/* Summary: desktop par right side sticky, mobile par neeche */}
            <aside className={`${cardClass} xl:sticky xl:top-4`}>
              <SectionTitle icon={Calculator} title="Freight Summary" />

              <div>
                <span className="block text-[13px] font-medium text-gray-600 mb-1.5">Payment Mode</span>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
                  {(
                    [
                      ['CASH', 'Cash / Paid'],
                      ['TO_PAY', 'To-Pay'],
                      ['INVOICE', 'Invoice'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={paymentMode === value}
                      onClick={() => setPaymentMode(value)}
                      className={`h-8 rounded-md text-[13px] font-semibold transition-colors duration-300 ${
                        paymentMode === value
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:text-blue-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={calculating || !selectedRateId}
                onClick={handleCalculate}
                className="w-full inline-flex items-center justify-center gap-2 h-9 text-[13px] font-semibold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition-colors"
              >
                <Calculator className="w-4 h-4" />
                <span>{calculating ? 'Calculating...' : 'Calculate Freight'}</span>
              </button>

              {calculatedBreakdown ? (
                <dl className="space-y-2 text-[13px] border-t border-gray-100 pt-4">
                  <SummaryRow
                    label="Chargeable Weight"
                    value={formatWeight(calculatedBreakdown.chargeableWeightKg)}
                  />
                  <SummaryRow
                    label="Volumetric Weight"
                    value={formatWeight(calculatedBreakdown.volumetricWeightKg)}
                  />
                  <SummaryRow label="Base Freight" value={formatINR(calculatedBreakdown.baseFreight)} />
                  <SummaryRow
                    label="Additional Charges"
                    value={formatINR(calculatedBreakdown.additionalCharges)}
                  />
                  {Number(calculatedBreakdown.platformCharge ?? 0) > 0 && (
                    <SummaryRow
                      label={`Platform Charge${
                        calculatedBreakdown.platformChargeType === 'PERCENTAGE' &&
                        calculatedBreakdown.platformChargeValue
                          ? ` (${calculatedBreakdown.platformChargeValue}%)`
                          : ''
                      }`}
                      value={formatINR(calculatedBreakdown.platformCharge || 0)}
                    />
                  )}
                  <SummaryRow
                    label={`GST (${calculatedBreakdown.gstApplicable ? `${calculatedBreakdown.gstRatePercent}%` : 'Exempt'})`}
                    value={formatINR(calculatedBreakdown.taxAmount)}
                  />
                  <div className="flex items-center justify-between gap-3 border-t border-dashed border-gray-200 pt-3">
                    <dt className="font-semibold">Total Amount</dt>
                    <dd className="text-lg font-bold text-blue-700 tabular-nums">
                      {formatINR(calculatedBreakdown.finalAmount)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-[13px] text-gray-500">
                  Click Calculate Freight to see the breakdown.
                </p>
              )}

              <label className="flex items-start gap-2 text-[13px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappOptIn}
                  onChange={(e) => setWhatsappOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600"
                />
                <span>Customer opted in for automated WhatsApp shipment tracking alerts</span>
              </label>

              <button
                type="submit"
                disabled={submitting || !selectedRoute}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 text-[13px] font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Confirming Booking...'
                    : calculatedBreakdown
                      ? `Confirm & Generate LR (${formatINR(calculatedBreakdown.finalAmount)})`
                      : 'Confirm & Generate LR'}
                </span>
              </button>

              <p className="text-xs text-gray-500">
                Freight, GST, and any enabled platform charges are verified server-side from your selected route configuration.
              </p>
            </aside>
          </div>
        </form>
      )}
    </div>
  );
}