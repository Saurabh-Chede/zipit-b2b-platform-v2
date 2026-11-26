// import React, { useCallback, useEffect, useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { AlertTriangle, ArrowLeft, Ban, Barcode, CheckCircle2, Download, FileText, RotateCcw, ScanLine, XCircle } from 'lucide-react';
// import { apiClient, extractErrorMessage } from '../../services/api.ts';
// import { formatDate, formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
// import { StatusBadge } from '../ui/StatusBadge.tsx';
// import { TrackingTimeline } from '../ui/TrackingTimeline.tsx';
// import { ErrorBanner, LoadingSkeleton } from '../ui/States.tsx';
// import { AuthenticatedProofImage } from './AuthenticatedProofImage.tsx';
// import { WeightDiscrepancyCard } from './WeightDiscrepancyCard.tsx';
// import { useToast } from '../../context/ToastContext.tsx';
// import { useAuth } from '../../context/AuthContext.tsx';
// import {
//   BookingStatus,
//   UserRole,
//   type Booking,
//   type DeliveryProof,
//   type SellerProfile,
//   type TrackingEvent,
//   type Transporter,
//   type WeightDiscrepancy,
// } from '../../types/index.ts';

// export interface ShipmentDetailsPayload {
//   booking: Booking;
//   trackingEvents: TrackingEvent[];
//   deliveryProof: DeliveryProof | null;
//   weightDiscrepancy?: WeightDiscrepancy | null;
// }

// interface ShipmentDetailViewProps {
//   bookingId: string;
//   backPath: string;
//   renderActions?: (
//     data: ShipmentDetailsPayload,
//     reload: () => Promise<void>
//   ) => React.ReactNode;
// }

// export function ShipmentDetailView({
//   bookingId,
//   backPath,
//   renderActions,
// }: ShipmentDetailViewProps) {
//   const navigate = useNavigate();
//   const { showToast } = useToast();
//   const { user } = useAuth();
//   const [data, setData] = useState<ShipmentDetailsPayload | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [downloadingLr, setDownloadingLr] = useState(false);
//   const [downloadingInvoice, setDownloadingInvoice] = useState(false);
//   const [downloadingBarcode, setDownloadingBarcode] = useState(false);
//   const [cartonScanInput, setCartonScanInput] = useState('');
//   const [scanningCarton, setScanningCarton] = useState(false);

//   const loadDetails = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await apiClient.get<{ success: boolean; data: ShipmentDetailsPayload }>(
//         `/bookings/${bookingId}`
//       );
//       setData(res.data.data);
//     } catch (err) {
//       setError(extractErrorMessage(err, 'Failed to load shipment details.'));
//     } finally {
//       setLoading(false);
//     }
//   }, [bookingId]);

//   useEffect(() => {
//     loadDetails();
//   }, [loadDetails]);

//   const handleDownloadLr = async () => {
//     if (!data) return;
//     setDownloadingLr(true);
//     try {
//       const res = await apiClient.get(`/bookings/${bookingId}/lr`, { responseType: 'blob' });
//       const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = `${data.booking.lrNumber}.pdf`;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(url);
//       showToast(`Downloaded ${data.booking.lrNumber}.pdf`, 'success');
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to download LR PDF'), 'error');
//     } finally {
//       setDownloadingLr(false);
//     }
//   };

//   const handleDownloadTaxInvoice = async () => {
//     if (!data) return;
//     setDownloadingInvoice(true);
//     try {
//       const res = await apiClient.get(`/bookings/${bookingId}/tax-invoice`, { responseType: 'blob' });
//       const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = `${data.booking.invoiceNumber || data.booking.lrNumber}-TAX-INVOICE.pdf`;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(url);
//       showToast('Downloaded GST Tax Invoice PDF', 'success');
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to download Tax Invoice PDF'), 'error');
//     } finally {
//       setDownloadingInvoice(false);
//     }
//   };

//   const handleDownloadBarcode = async () => {
//     if (!data) return;
//     setDownloadingBarcode(true);
//     try {
//       const res = await apiClient.get(`/bookings/${bookingId}/barcode?download=1`, {
//         responseType: 'blob',
//       });
//       const blob = new Blob([res.data as BlobPart], { type: 'image/png' });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = `${data.booking.lrNumber}-barcode.png`;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(url);
//       showToast(`Downloaded barcode label for ${data.booking.lrNumber}`, 'success');
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to download barcode PNG'), 'error');
//     } finally {
//       setDownloadingBarcode(false);
//     }
//   };


//   const handleDownloadCartonBarcode = async (cartonNumber: number, cartonCode: string) => {
//     try {
//       const res = await apiClient.get(
//         `/bookings/${bookingId}/cartons/${cartonNumber}/barcode?download=1`,
//         { responseType: 'blob' }
//       );
//       const blob = new Blob([res.data as BlobPart], { type: 'image/png' });
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement('a');
//       a.href = url;
//       a.download = `${cartonCode}-barcode.png`;
//       document.body.appendChild(a);
//       a.click();
//       a.remove();
//       URL.revokeObjectURL(url);
//       showToast(`Downloaded barcode for ${cartonCode}`, 'success');
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to download carton barcode.'), 'error');
//     }
//   };

//   const handleScanCarton = async (payload: { cartonNumber?: number; cartonCode?: string }) => {
//     setScanningCarton(true);
//     try {
//       const res = await apiClient.post<{ success: boolean; message: string }>(
//         `/bookings/${bookingId}/cartons/scan`,
//         payload
//       );
//       showToast(res.data.message, 'success');
//       setCartonScanInput('');
//       await loadDetails();
//     } catch (err) {
//       showToast(extractErrorMessage(err, 'Failed to scan carton barcode.'), 'error');
//     } finally {
//       setScanningCarton(false);
//     }
//   };

//   if (loading) return <LoadingSkeleton rows={6} />;
//   if (error || !data) return <ErrorBanner message={error || 'Shipment not found'} onRetry={loadDetails} />;

//   const { booking, trackingEvents, deliveryProof } = data;
//   const transporter = booking.transporterId as Transporter;
//   const seller = booking.sellerId as SellerProfile | null;
//   const isPersonalBooking = booking.bookingSource === 'TRANSPORTER_SELF';
//   const isTransporter = user?.role === UserRole.TRANSPORTER;
//   const totalCartons = Math.max(1, booking.parcel.numberOfPackages || 1);
//   const scannedMap = new Map(
//     (booking.scannedCartons || []).map((c) => [c.cartonNumber, c])
//   );
//   const scannedCount = scannedMap.size;

//   return (
//     <div className="space-y-6">
//       <div className="flex flex-wrap items-center justify-between gap-4">
//         <div className="flex items-center gap-3">
//           <button
//             type="button"
//             onClick={() => navigate(backPath)}
//             className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50"
//             aria-label="Back to list"
//           >
//             <ArrowLeft className="w-4 h-4" />
//           </button>
//           <div>
//             <div className="flex flex-wrap items-center gap-2.5">
//               <h1 className="text-xl font-semibold text-slate-900 font-mono tabular-nums">
//                 {booking.lrNumber}
//               </h1>
//               <StatusBadge status={booking.status} />
//               <StatusBadge status={isPersonalBooking ? 'TRANSPORTER_SELF' : 'PLATFORM'} />
//             </div>
//             <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
//               <span className="font-mono">{booking.bookingId}</span>
//               <span aria-hidden="true">·</span>
//               <span>Created {formatDateTime(booking.createdAt)}</span>
//             </div>
//           </div>
//         </div>

//         <div className="flex flex-wrap items-center gap-2.5">
//           <button
//             type="button"
//             onClick={handleDownloadBarcode}
//             disabled={downloadingBarcode}
//             className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
//           >
//             <Barcode className="w-4 h-4 text-slate-600" />
//             <span>{downloadingBarcode ? 'Generating...' : 'Barcode PNG'}</span>
//           </button>
//           <button
//             type="button"
//             onClick={handleDownloadTaxInvoice}
//             disabled={downloadingInvoice}
//             className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
//           >
//             <FileText className="w-4 h-4 text-slate-600" />
//             <span>{downloadingInvoice ? 'Generating...' : 'Tax Invoice PDF'}</span>
//           </button>
//           <button
//             type="button"
//             onClick={handleDownloadLr}
//             disabled={downloadingLr}
//             className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
//           >
//             <Download className="w-4 h-4" />
//             <span>{downloadingLr ? 'Generating PDF...' : 'Download LR PDF'}</span>
//           </button>
//           {renderActions && renderActions(data, loadDetails)}
//         </div>
//       </div>

//       {booking.status === BookingStatus.REJECTED && booking.rejectionReason && (
//         <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3 text-sm text-red-900">
//           <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
//           <div>
//             <p className="font-semibold">Booking Rejected by Transporter</p>
//             <p className="text-xs text-red-800 mt-0.5">
//               Reason: {booking.rejectionReason}
//               {booking.paymentMode === 'WALLET'
//                 ? ' · Paid wallet amount was automatically refunded to the seller.'
//                 : ''}
//             </p>
//           </div>
//         </div>
//       )}

//       {booking.status === BookingStatus.CANCELLED && (
//         <div className="rounded-xl border border-slate-300 bg-slate-100 px-5 py-4 flex items-start gap-3 text-sm text-slate-900">
//           <Ban className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
//           <div>
//             <p className="font-semibold">Booking Self-Cancelled by Seller</p>
//             <p className="text-xs text-slate-700 mt-0.5">
//               {booking.cancellationReason ? `Reason: ${booking.cancellationReason}` : 'Cancelled prior to dispatch.'}
//               {booking.paymentMode === 'WALLET'
//                 ? ' · Paid wallet amount was automatically refunded to the seller.'
//                 : ''}
//             </p>
//           </div>
//         </div>
//       )}

//       {booking.status === BookingStatus.NDR && (
//         <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 flex items-start gap-3 text-sm text-orange-950">
//           <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
//           <div>
//             <p className="font-semibold">
//               Non-Delivery Report (NDR) · Attempt #{booking.ndrAttempts || 1}
//             </p>
//             <p className="text-xs text-orange-900 mt-0.5">
//               {booking.ndrReason ? `Reason: ${booking.ndrReason}` : 'Delivery attempt could not be completed.'}
//               {' · '}
//               {isPersonalBooking
//                 ? 'Schedule a delivery re-attempt or initiate Return to Origin (RTO).'
//                 : 'Seller can request a re-attempt or approve Return to Origin (RTO).'}
//             </p>
//           </div>
//         </div>
//       )}

//       {(booking.status === BookingStatus.RTO_INITIATED ||
//         booking.status === BookingStatus.RTO_DELIVERED) && (
//         <div className="rounded-xl border border-purple-200 bg-purple-50 px-5 py-4 flex items-start gap-3 text-sm text-purple-950">
//           <RotateCcw className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
//           <div>
//             <p className="font-semibold">
//               {booking.status === BookingStatus.RTO_DELIVERED
//                 ? 'RTO Return Delivered Back to Origin'
//                 : 'Return to Origin (RTO) In Progress'}
//             </p>
//             <p className="text-xs text-purple-900 mt-0.5">
//               {booking.rtoReason ? `Reason: ${booking.rtoReason}` : 'Shipment returning to consignor origin.'}
//               {booking.rtoCharges > 0 && (
//                 <>
//                   {' · '}RTO Fee: {formatINR(booking.rtoCharges)}
//                   {!isPersonalBooking && (
//                     <>
//                       {' '}
//                       (
//                       {booking.rtoBilledStatus === 'WALLET_DEBITED'
//                         ? 'Debited from Seller Wallet'
//                         : booking.rtoBilledStatus === 'INVOICE_PENDING'
//                           ? 'Pending Wallet Settlement / Invoice'
//                           : 'Billed via Invoice'}
//                       )
//                     </>
//                   )}
//                 </>
//               )}
//             </p>
//           </div>
//         </div>
//       )}

//       <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 sm:gap-6">
//         <div className="xl:col-span-2 space-y-5 sm:space-y-6">
//           {/* Route & Parties */}
//           <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
//             <div>
//               <p className="text-xs font-semibold text-slate-500 mb-2">Sender (Pickup Snapshot)</p>
//               <p className="text-sm font-semibold text-slate-900">
//                 {booking.sender.companyName || booking.sender.name}
//               </p>
//               {booking.sender.contactPerson &&
//                 booking.sender.contactPerson !== (booking.sender.companyName || booking.sender.name) && (
//                   <p className="text-xs text-slate-600 mt-0.5">
//                     Contact: {booking.sender.contactPerson}
//                   </p>
//                 )}
//               <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
//                 {booking.sender.phone}
//               </p>
//               <p className="text-sm text-slate-600 mt-1.5">{booking.sender.address}</p>
//               <p className="text-sm text-slate-700 font-medium mt-0.5">
//                 {booking.sender.city}
//                 {booking.sender.state ? `, ${booking.sender.state}` : ''} — {booking.sender.pincode}
//               </p>
//               {booking.sender.gstin && (
//                 <p className="text-xs font-mono text-slate-500 mt-1">
//                   GSTIN: {booking.sender.gstin}
//                 </p>
//               )}
//             </div>
//             <div>
//               <p className="text-xs font-semibold text-slate-500 mb-2">Receiver (Consignee)</p>
//               <p className="text-sm font-semibold text-slate-900">{booking.receiver.name}</p>
//               <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
//                 {booking.receiver.phone}
//               </p>
//               <p className="text-sm text-slate-600 mt-1.5">{booking.receiver.address}</p>
//               <p className="text-sm text-slate-700 font-medium mt-0.5">
//                 {booking.receiver.city} — {booking.receiver.pincode}
//               </p>
//             </div>
//           </div>

//           {/* Parcel & Carrier */}
//           <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
//             <h2 className="text-sm font-semibold text-slate-900">Parcel & Carrier Manifest</h2>
//             <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
//               <div>
//                 <p className="text-xs text-slate-500">Packages</p>
//                 <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
//                   {booking.parcel.numberOfPackages}
//                 </p>
//               </div>
//               <div>
//                 <p className="text-xs text-slate-500">Dimensions (L×W×H)</p>
//                 <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
//                   {booking.parcel.lengthCm}×{booking.parcel.widthCm}×{booking.parcel.heightCm} cm
//                 </p>
//               </div>
//               <div>
//                 <p className="text-xs text-slate-500">Actual / Volumetric</p>
//                 <p className="font-mono tabular-nums font-medium text-slate-900 mt-0.5">
//                   {formatWeight(booking.actualWeight)} / {formatWeight(booking.volumetricWeight)}
//                 </p>
//               </div>
//               <div>
//                 <p className="text-xs text-slate-500">Chargeable Weight</p>
//                 <p className="font-mono tabular-nums font-semibold text-blue-700 mt-0.5">
//                   {formatWeight(booking.chargeableWeight)}
//                 </p>
//               </div>
//             </div>

//             <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
//               <div>
//                 <p className="text-xs text-slate-500">Goods Description</p>
//                 <p className="text-slate-800 mt-0.5">{booking.parcel.description}</p>
//               </div>
//               <div>
//                 <p className="text-xs text-slate-500">
//                   {isPersonalBooking ? 'Carrier & Direct Consignor' : 'Transporter & Seller'}
//                 </p>
//                 <p className="text-slate-900 font-medium mt-0.5">
//                   {transporter?.companyName || '—'}
//                 </p>
//                 <p className="text-xs text-slate-500 mt-0.5">
//                   {isPersonalBooking
//                     ? `Direct Customer: ${booking.sender.name}`
//                     : `Seller: ${seller?.businessName || booking.sender.name}`}
//                 </p>
//               </div>
//               {(booking.ewayBillNumber || booking.invoiceNumber) && (
//                 <div className="sm:col-span-2 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
//                   {booking.ewayBillNumber && (
//                     <div>
//                       <p className="text-xs text-slate-500">E-Way Bill (EWB)</p>
//                       <p className="font-mono font-semibold text-slate-900 mt-0.5">
//                         {booking.ewayBillNumber}
//                         {booking.ewayBillValidUpto
//                           ? ` · Valid upto ${formatDate(booking.ewayBillValidUpto)}`
//                           : ''}
//                       </p>
//                     </div>
//                   )}
//                   {booking.invoiceNumber && (
//                     <div>
//                       <p className="text-xs text-slate-500">Tax Invoice Ref</p>
//                       <p className="font-mono font-medium text-slate-800 mt-0.5">
//                         {booking.invoiceNumber}
//                       </p>
//                     </div>
//                   )}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Individual Carton Barcodes & Scan Manifest */}
//           <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
//             <div className="flex flex-wrap items-center justify-between gap-3">
//               <div>
//                 <h2 className="text-sm font-semibold text-slate-900">
//                   Individual Carton Barcodes ({scannedCount} / {totalCartons} Scanned)
//                 </h2>
//                 <p className="text-xs text-slate-500 mt-0.5">
//                   Code 128 carton labels for piece-level verification at pickup and delivery
//                 </p>
//               </div>
//             </div>

//             {isTransporter &&
//               booking.status !== BookingStatus.REJECTED &&
//               booking.status !== BookingStatus.CANCELLED &&
//               booking.status !== BookingStatus.RTO_DELIVERED && (
//               <form
//                 onSubmit={(e) => {
//                   e.preventDefault();
//                   if (!cartonScanInput.trim()) return;
//                   handleScanCarton({ cartonCode: cartonScanInput.trim() });
//                 }}
//                 className="flex flex-col sm:flex-row sm:items-center gap-2.5"
//               >
//                 <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
//                   <ScanLine className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
//                   <input
//                     type="text"
//                     value={cartonScanInput}
//                     onChange={(e) => setCartonScanInput(e.target.value.toUpperCase())}
//                     placeholder={`Scan or enter ${booking.lrNumber}-C01`}
//                     className="w-full pl-9 pr-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
//                   />
//                 </div>
//                 <button
//                   type="submit"
//                   disabled={scanningCarton || !cartonScanInput.trim()}
//                   className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
//                 >
//                   <ScanLine className="w-4 h-4" />
//                   <span>{scanningCarton ? 'Scanning...' : 'Verify Scan'}</span>
//                 </button>
//               </form>
//             )}

//             <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
//               {Array.from({ length: Math.min(totalCartons, 50) }, (_, idx) => {
//                 const cartonNumber = idx + 1;
//                 const cartonCode = `${booking.lrNumber}-C${String(cartonNumber).padStart(2, '0')}`;
//                 const scanned = scannedMap.get(cartonNumber);

//                 return (
//                   <div
//                     key={cartonCode}
//                     className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs bg-white"
//                   >
//                     <div className="flex items-center gap-3 min-w-0">
//                       <span className="font-mono font-semibold text-slate-900 tabular-nums">
//                         {cartonCode}
//                       </span>
//                       <span className="text-slate-400">·</span>
//                       {scanned ? (
//                         <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
//                           <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
//                           <span>
//                             Scanned {formatDateTime(scanned.scannedAt)}
//                             {scanned.location ? ` · ${scanned.location}` : ''}
//                           </span>
//                         </span>
//                       ) : (
//                         <span className="text-slate-500">Pending scan</span>
//                       )}
//                     </div>

//                     <div className="flex items-center gap-2 shrink-0">
//                       <button
//                         type="button"
//                         onClick={() => handleDownloadCartonBarcode(cartonNumber, cartonCode)}
//                         className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 whitespace-nowrap"
//                       >
//                         <Barcode className="w-3.5 h-3.5" />
//                         <span>Label PNG</span>
//                       </button>
//                       {isTransporter &&
//                         !scanned &&
//                         booking.status !== BookingStatus.REJECTED &&
//                         booking.status !== BookingStatus.CANCELLED &&
//                         booking.status !== BookingStatus.RTO_DELIVERED && (
//                           <button
//                             type="button"
//                             disabled={scanningCarton}
//                             onClick={() => handleScanCarton({ cartonNumber })}
//                             className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
//                           >
//                             <ScanLine className="w-3.5 h-3.5" />
//                             <span>Mark Scanned</span>
//                           </button>
//                         )}
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           </div>

//           {/* Weight Discrepancy & Re-Weigh Card (Platform bookings only) */}
//           {!isPersonalBooking && (
//             <WeightDiscrepancyCard
//               booking={booking}
//               discrepancy={data.weightDiscrepancy || null}
//               onUpdated={loadDetails}
//             />
//           )}

//           {/* Tracking Timeline */}
//           <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
//             <h2 className="text-sm font-semibold text-slate-900 mb-4">Tracking Timeline</h2>
//             <TrackingTimeline events={trackingEvents} />
//           </div>

//           {/* Delivery Proof */}
//           {deliveryProof && (
//             <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
//               <h2 className="text-sm font-semibold text-slate-900">Proof of Delivery (POD)</h2>
//               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
//                 <div>
//                   <p className="text-xs text-slate-500">Received By</p>
//                   <p className="font-medium text-slate-900 mt-0.5">{deliveryProof.receiverName}</p>
//                 </div>
//                 <div>
//                   <p className="text-xs text-slate-500">Delivery Date</p>
//                   <p className="font-mono tabular-nums text-slate-900 mt-0.5">
//                     {formatDate(deliveryProof.deliveryDate)}
//                   </p>
//                 </div>
//                 <div>
//                   <p className="text-xs text-slate-500">Remarks</p>
//                   <p className="text-slate-700 mt-0.5">{deliveryProof.remarks || '—'}</p>
//                 </div>
//               </div>
//               <AuthenticatedProofImage
//                 bookingId={booking._id}
//                 alt={`Delivery proof for ${booking.lrNumber}`}
//               />
//             </div>
//           )}
//         </div>

//         {/* Pricing Snapshot Sidebar */}
//         <div className="space-y-6">
//           <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
//             <h2 className="text-sm font-semibold text-slate-900 mb-4">Applied Freight Snapshot</h2>
//             <dl className="space-y-3 text-sm">
//               <div className="flex justify-between">
//                 <dt className="text-slate-500">Rate Per Kg</dt>
//                 <dd className="font-mono tabular-nums text-slate-900">
//                   {formatINR(booking.pricingSnapshot.ratePerKg)}
//                 </dd>
//               </div>
//               <div className="flex justify-between">
//                 <dt className="text-slate-500">Minimum Freight</dt>
//                 <dd className="font-mono tabular-nums text-slate-900">
//                   {formatINR(booking.pricingSnapshot.minimumFreight)}
//                 </dd>
//               </div>
//               <div className="flex justify-between">
//                 <dt className="text-slate-500">Base Freight</dt>
//                 <dd className="font-mono tabular-nums font-medium text-slate-900">
//                   {formatINR(booking.freight)}
//                 </dd>
//               </div>
//               <div className="flex justify-between">
//                 <dt className="text-slate-500">Additional Charges</dt>
//                 <dd className="font-mono tabular-nums text-slate-900">
//                   {formatINR(booking.pricingSnapshot.additionalCharges)}
//                 </dd>
//               </div>
//               {Number(booking.pricingSnapshot.platformCharge ?? booking.platformCharge ?? 0) > 0 && (
//                 <div className="flex justify-between">
//                   <dt className="text-slate-500">
//                     Platform Charge
//                     {booking.pricingSnapshot.platformChargeType === 'PERCENTAGE' &&
//                     booking.pricingSnapshot.platformChargeValue
//                       ? ` (${booking.pricingSnapshot.platformChargeValue}%)`
//                       : ''}
//                   </dt>
//                   <dd className="font-mono tabular-nums text-slate-900">
//                     {formatINR(booking.pricingSnapshot.platformCharge ?? booking.platformCharge ?? 0)}
//                   </dd>
//                 </div>
//               )}
//               <div className="flex justify-between">
//                 <dt className="text-slate-500">
//                   GST ({booking.pricingSnapshot.gstApplicable ? `${booking.pricingSnapshot.gstRatePercent}%` : 'N/A'})
//                 </dt>
//                 <dd className="font-mono tabular-nums text-slate-900">
//                   {formatINR(booking.tax)}
//                 </dd>
//               </div>
//               <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
//                 <dt className="font-semibold text-slate-900">Total Payable</dt>
//                 <dd className="text-lg font-bold font-mono tabular-nums text-blue-600">
//                   {formatINR(booking.finalAmount)}
//                 </dd>
//               </div>
//               <div className="pt-3 border-t border-slate-100 flex justify-between text-xs">
//                 <dt className="text-slate-500">RTO Charges (if returned)</dt>
//                 <dd className="font-mono tabular-nums text-slate-700">
//                   {formatINR(booking.rtoCharges)}
//                 </dd>
//               </div>
//               <div className="flex justify-between text-xs">
//                 <dt className="text-slate-500">Estimated Transit</dt>
//                 <dd className="text-slate-700 font-medium">
//                   {booking.pricingSnapshot.estimatedDeliveryTime || '—'}
//                 </dd>
//               </div>
//               {booking.paymentMode && (
//                 <div className="flex justify-between text-xs">
//                   <dt className="text-slate-500">Payment Mode</dt>
//                   <dd className="font-mono text-slate-700">{booking.paymentMode}</dd>
//                 </div>
//               )}
//             </dl>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }


import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Barcode,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  RefreshCw,
  RotateCcw,
  ScanLine,
  XCircle,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatDate, formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { TrackingTimeline } from '../ui/TrackingTimeline.tsx';
import { ErrorBanner, LoadingSkeleton } from '../ui/States.tsx';
import { AuthenticatedProofImage } from './AuthenticatedProofImage.tsx';
import { WeightDiscrepancyCard } from './WeightDiscrepancyCard.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  BookingStatus,
  UserRole,
  type Booking,
  type DeliveryProof,
  type SellerProfile,
  type TrackingEvent,
  type Transporter,
  type WeightDiscrepancy,
} from '../../types/index.ts';

export interface ShipmentDetailsPayload {
  booking: Booking;
  trackingEvents: TrackingEvent[];
  deliveryProof: DeliveryProof | null;
  weightDiscrepancy?: WeightDiscrepancy | null;
}

interface ShipmentDetailViewProps {
  bookingId: string;
  backPath: string;
  renderActions?: (
    data: ShipmentDetailsPayload,
    reload: () => Promise<void>
  ) => React.ReactNode;
}

// Freight Snapshot wapas dikhana ho to true kar do
const SHOW_FREIGHT_SNAPSHOT = false;

// Status update buttons (neeche wali row) wapas dikhane ke liye true karo
const SHOW_STATUS_ACTIONS = true;

const toolButton =
  'inline-flex flex-1 sm:flex-none items-center justify-center gap-1 h-7 px-2 text-[11px] font-semibold bg-white border rounded-md disabled:opacity-50 transition-colors whitespace-nowrap';

const neutralButton = `${toolButton} text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-700`;

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3.5 border-b border-gray-200">
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {aside}
      </div>
      <div className="px-4 sm:px-6">{children}</div>
    </section>
  );
}

// Label left, value right
function Rows({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="divide-y divide-gray-100 text-[13px]">
      {items
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-3">
            <dt className="text-gray-500 shrink-0">{label}</dt>
            <dd className="min-w-0 font-medium text-gray-900 text-right tabular-nums break-words">
              {value}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function Notice({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 text-[13px] ${tone}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 opacity-90">{children}</p>
      </div>
    </div>
  );
}

export function ShipmentDetailView({
  bookingId,
  backPath,
  renderActions,
}: ShipmentDetailViewProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<ShipmentDetailsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingLr, setDownloadingLr] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [downloadingBarcode, setDownloadingBarcode] = useState(false);
  const [cartonScanInput, setCartonScanInput] = useState('');
  const [scanningCarton, setScanningCarton] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: ShipmentDetailsPayload }>(
        `/bookings/${bookingId}`
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load shipment details.'));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleDownloadLr = async () => {
    if (!data) return;
    setDownloadingLr(true);
    try {
      const res = await apiClient.get(`/bookings/${bookingId}/lr`, { responseType: 'blob' });
      const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.booking.lrNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${data.booking.lrNumber}.pdf`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download LR PDF'), 'error');
    } finally {
      setDownloadingLr(false);
    }
  };

  const handleDownloadTaxInvoice = async () => {
    if (!data) return;
    setDownloadingInvoice(true);
    try {
      const res = await apiClient.get(`/bookings/${bookingId}/tax-invoice`, { responseType: 'blob' });
      const blob = new Blob([res.data as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.booking.invoiceNumber || data.booking.lrNumber}-TAX-INVOICE.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Downloaded GST Tax Invoice PDF', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download Tax Invoice PDF'), 'error');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const handleDownloadBarcode = async () => {
    if (!data) return;
    setDownloadingBarcode(true);
    try {
      const res = await apiClient.get(`/bookings/${bookingId}/barcode?download=1`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.booking.lrNumber}-barcode.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded barcode label for ${data.booking.lrNumber}`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download barcode PNG'), 'error');
    } finally {
      setDownloadingBarcode(false);
    }
  };


  const handleDownloadCartonBarcode = async (cartonNumber: number, cartonCode: string) => {
    try {
      const res = await apiClient.get(
        `/bookings/${bookingId}/cartons/${cartonNumber}/barcode?download=1`,
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cartonCode}-barcode.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloaded barcode for ${cartonCode}`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download carton barcode.'), 'error');
    }
  };

  const handleScanCarton = async (payload: { cartonNumber?: number; cartonCode?: string }) => {
    setScanningCarton(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        `/bookings/${bookingId}/cartons/scan`,
        payload
      );
      showToast(res.data.message, 'success');
      setCartonScanInput('');
      await loadDetails();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to scan carton barcode.'), 'error');
    } finally {
      setScanningCarton(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error || !data) return <ErrorBanner message={error || 'Shipment not found'} onRetry={loadDetails} />;

  const { booking, trackingEvents, deliveryProof } = data;
  const transporter = booking.transporterId as Transporter;
  const seller = booking.sellerId as SellerProfile | null;
  const isPersonalBooking = booking.bookingSource === 'TRANSPORTER_SELF';
  const isTransporter = user?.role === UserRole.TRANSPORTER;
  const totalCartons = Math.max(1, booking.parcel.numberOfPackages || 1);
  const scannedMap = new Map(
    (booking.scannedCartons || []).map((c) => [c.cartonNumber, c])
  );
  const scannedCount = scannedMap.size;
  const canScan =
    isTransporter &&
    booking.status !== BookingStatus.REJECTED &&
    booking.status !== BookingStatus.CANCELLED &&
    booking.status !== BookingStatus.RTO_DELIVERED;

  const backLabel = backPath.includes('assigned-bookings')
    ? 'Assigned bookings'
    : backPath.includes('booked-orders')
      ? 'Booked orders'
      : 'Back';

  const handleCopyLr = async () => {
    try {
      await navigator.clipboard.writeText(booking.lrNumber);
      showToast(`Copied ${booking.lrNumber}`, 'success');
    } catch {
      showToast('Could not copy LR number.', 'error');
    }
  };

  return (
    <div
      className="space-y-4 sm:space-y-6 text-gray-900 antialiased"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="inline-flex items-center gap-1 self-start h-7 text-xs font-medium text-gray-900 hover:text-blue-700 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          {backLabel}
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={handleCopyLr} className={neutralButton}>
            <Copy className="w-3 h-3" />
            Copy
          </button>
          <button
            type="button"
            onClick={handleDownloadTaxInvoice}
            disabled={downloadingInvoice}
            className={`${toolButton} text-blue-700 border-blue-600 hover:bg-blue-50`}
          >
            <FileText className="w-3 h-3" />
            {downloadingInvoice ? 'Generating...' : 'Invoice'}
          </button>
          {/* <button
            type="button"
            onClick={handleDownloadBarcode}
            disabled={downloadingBarcode}
            className={neutralButton}
          >
            <Barcode className="w-3 h-3" />
            {downloadingBarcode ? 'Generating...' : 'Barcode'}
          </button> */}
          <button
            type="button"
            onClick={handleDownloadLr}
            disabled={downloadingLr}
            className={`${toolButton} !bg-blue-600 text-white border-blue-600 hover:!bg-blue-700`}
          >
            <Download className="w-3 h-3" />
            {downloadingLr ? 'Generating PDF...' : 'Download LR'}
          </button>
          <button type="button" onClick={loadDetails} className={neutralButton}>
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
          {SHOW_STATUS_ACTIONS && renderActions && (
            <>{renderActions(data, loadDetails)}</>
          )}

        </div>
      </div>

      {/* Status actions (parent page se aate hain) */}
      {/* {SHOW_STATUS_ACTIONS && renderActions && (
        <div className="flex flex-wrap items-center justify-end gap-2 empty:hidden [&>button:not([aria-haspopup])]:flex-1 sm:[&>button:not([aria-haspopup])]:flex-none">
          {renderActions(data, loadDetails)}
        </div>
      )} */}

      {booking.status === BookingStatus.REJECTED && booking.rejectionReason && (
        <Notice icon={XCircle} tone="border-red-200 bg-red-50 text-red-900" title="Booking Rejected by Transporter">
          Reason: {booking.rejectionReason}
          {booking.paymentMode === 'WALLET'
            ? ' · Paid wallet amount was automatically refunded to the seller.'
            : ''}
        </Notice>
      )}

      {booking.status === BookingStatus.CANCELLED && (
        <Notice icon={Ban} tone="border-gray-300 bg-gray-100 text-gray-900" title="Booking Self-Cancelled by Seller">
          {booking.cancellationReason ? `Reason: ${booking.cancellationReason}` : 'Cancelled prior to dispatch.'}
          {booking.paymentMode === 'WALLET'
            ? ' · Paid wallet amount was automatically refunded to the seller.'
            : ''}
        </Notice>
      )}

      {booking.status === BookingStatus.NDR && (
        <Notice
          icon={AlertTriangle}
          tone="border-orange-200 bg-orange-50 text-orange-950"
          title={`Non-Delivery Report (NDR) · Attempt #${booking.ndrAttempts || 1}`}
        >
          {booking.ndrReason ? `Reason: ${booking.ndrReason}` : 'Delivery attempt could not be completed.'}
          {' · '}
          {isPersonalBooking
            ? 'Schedule a delivery re-attempt or initiate Return to Origin (RTO).'
            : 'Seller can request a re-attempt or approve Return to Origin (RTO).'}
        </Notice>
      )}

      {(booking.status === BookingStatus.RTO_INITIATED ||
        booking.status === BookingStatus.RTO_DELIVERED) && (
          <Notice
            icon={RotateCcw}
            tone="border-purple-200 bg-purple-50 text-purple-950"
            title={
              booking.status === BookingStatus.RTO_DELIVERED
                ? 'RTO Return Delivered Back to Origin'
                : 'Return to Origin (RTO) In Progress'
            }
          >
            {booking.rtoReason ? `Reason: ${booking.rtoReason}` : 'Shipment returning to consignor origin.'}
            {booking.rtoCharges > 0 && (
              <>
                {' · '}RTO Fee: {formatINR(booking.rtoCharges)}
                {!isPersonalBooking && (
                  <>
                    {' '}
                    (
                    {booking.rtoBilledStatus === 'WALLET_DEBITED'
                      ? 'Debited from Seller Wallet'
                      : booking.rtoBilledStatus === 'INVOICE_PENDING'
                        ? 'Pending Wallet Settlement / Invoice'
                        : 'Billed via Invoice'}
                    )
                  </>
                )}
              </>
            )}
          </Notice>
        )}

      <Section
        title="Booking"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={booking.status} />
            <StatusBadge status={isPersonalBooking ? 'TRANSPORTER_SELF' : 'PLATFORM'} />
          </div>
        }
      >
        <Rows
          items={[
            ['LR number', booking.lrNumber],
            ['Booking ID', booking.bookingId],
            ['Route', `${booking.origin.city} → ${booking.destination.city}`],
            ['Shipping charge', formatINR(booking.finalAmount)],
            ['Payment', booking.paymentMode],
            ['Estimated transit', booking.pricingSnapshot.estimatedDeliveryTime],
            ['Created', formatDateTime(booking.createdAt)],
          ]}
        />
      </Section>

      <Section title="Sender">
        <Rows
          items={[
            ['Name', booking.sender.companyName || booking.sender.name],
            [
              'Contact person',
              booking.sender.contactPerson !== (booking.sender.companyName || booking.sender.name)
                ? booking.sender.contactPerson
                : undefined,
            ],
            ['Mobile', booking.sender.phone],
            ['Address', booking.sender.address],
            ['City', booking.sender.city],
            ['State', booking.sender.state],
            ['Pincode', booking.sender.pincode],
            ['GSTIN', booking.sender.gstin],
          ]}
        />
      </Section>

      <Section title="Receiver">
        <Rows
          items={[
            ['Name', booking.receiver.name],
            ['Mobile', booking.receiver.phone],
            ['Address', booking.receiver.address],
            ['City', booking.receiver.city],
            ['Pincode', booking.receiver.pincode],
          ]}
        />
      </Section>

      <Section title="Package & carrier">
        <Rows
          items={[
            ['Packages', booking.parcel.numberOfPackages],
            [
              'Dimensions (L×W×H)',
              `${booking.parcel.lengthCm} × ${booking.parcel.widthCm} × ${booking.parcel.heightCm} cm`,
            ],
            ['Actual weight', formatWeight(booking.actualWeight)],
            ['Volumetric weight', formatWeight(booking.volumetricWeight)],
            ['Chargeable weight', formatWeight(booking.chargeableWeight)],
            ['Goods description', booking.parcel.description],
            ['Transporter', transporter?.companyName || '—'],
            [
              isPersonalBooking ? 'Direct customer' : 'Seller',
              isPersonalBooking ? booking.sender.name : seller?.businessName || booking.sender.name,
            ],
            ['E-Way Bill', booking.ewayBillNumber],
            [
              'E-Way Bill valid upto',
              booking.ewayBillValidUpto ? formatDate(booking.ewayBillValidUpto) : undefined,
            ],
            ['Tax invoice ref', booking.invoiceNumber],
          ]}
        />
      </Section>

      {SHOW_FREIGHT_SNAPSHOT && (
        <Section title="Freight snapshot">
          <Rows
            items={[
              ['Rate per kg', formatINR(booking.pricingSnapshot.ratePerKg)],
              ['Minimum freight', formatINR(booking.pricingSnapshot.minimumFreight)],
              ['Base freight', formatINR(booking.freight)],
              ['Additional charges', formatINR(booking.pricingSnapshot.additionalCharges)],
              [
                `Platform charge${booking.pricingSnapshot.platformChargeType === 'PERCENTAGE' &&
                  booking.pricingSnapshot.platformChargeValue
                  ? ` (${booking.pricingSnapshot.platformChargeValue}%)`
                  : ''
                }`,
                Number(booking.pricingSnapshot.platformCharge ?? booking.platformCharge ?? 0) > 0
                  ? formatINR(booking.pricingSnapshot.platformCharge ?? booking.platformCharge ?? 0)
                  : undefined,
              ],
              [
                `GST (${booking.pricingSnapshot.gstApplicable ? `${booking.pricingSnapshot.gstRatePercent}%` : 'N/A'})`,
                formatINR(booking.tax),
              ],
              ['Total payable', formatINR(booking.finalAmount)],
              ['RTO charges (if returned)', formatINR(booking.rtoCharges)],
            ]}
          />
        </Section>
      )}

      {/* <Section
        title="Carton barcodes"
        aside={
          <span className="inline-flex items-center h-7 px-3 rounded-full bg-blue-50 text-blue-700 text-[13px] font-semibold tabular-nums">
            {scannedCount} / {totalCartons} Scanned
          </span>
        }
      >
        <div className="py-4 space-y-3">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, (scannedCount / totalCartons) * 100)}%` }}
            />
          </div>

        {canScan && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!cartonScanInput.trim()) return;
              handleScanCarton({ cartonCode: cartonScanInput.trim() });
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <ScanLine className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={cartonScanInput}
                onChange={(e) => setCartonScanInput(e.target.value.toUpperCase())}
                placeholder={`Scan or enter ${booking.lrNumber}-C01`}
                className="w-full h-9 pl-9 pr-3 text-[13px] tabular-nums bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              disabled={scanningCarton || !cartonScanInput.trim()}
              className="inline-flex items-center justify-center gap-2 h-9 px-4 text-[13px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              <ScanLine className="w-4 h-4" />
              <span>{scanningCarton ? 'Scanning...' : 'Verify Scan'}</span>
            </button>
          </form>
        )}

        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
          {Array.from({ length: Math.min(totalCartons, 50) }, (_, idx) => {
            const cartonNumber = idx + 1;
            const cartonCode = `${booking.lrNumber}-C${String(cartonNumber).padStart(2, '0')}`;
            const scanned = scannedMap.get(cartonNumber);

            return (
              <div
                key={cartonCode}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]"
              >
                <div className="min-w-0">
                  <p className="font-semibold tabular-nums">{cartonCode}</p>
                  {scanned ? (
                    <p className="flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Scanned {formatDateTime(scanned.scannedAt)}
                      {scanned.location ? ` · ${scanned.location}` : ''}
                    </p>
                  ) : (
                    <p className="text-gray-500">Pending scan</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {canScan && !scanned && (
                    <button
                      type="button"
                      disabled={scanningCarton}
                      onClick={() => handleScanCarton({ cartonNumber })}
                      className="inline-flex items-center gap-1.5 h-8 px-2.5 font-semibold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 disabled:opacity-50 whitespace-nowrap"
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      Mark Scanned
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDownloadCartonBarcode(cartonNumber, cartonCode)}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 whitespace-nowrap"
                  >
                    <Barcode className="w-3.5 h-3.5 text-blue-600" />
                    Label
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </Section> */}

      {/* Weight Discrepancy (Platform bookings only) */}
      {!isPersonalBooking && (
        <WeightDiscrepancyCard
          booking={booking}
          discrepancy={data.weightDiscrepancy || null}
          onUpdated={loadDetails}
        />
      )}

      {/* <Section title="Tracking timeline">
        <div className="py-4">
          <TrackingTimeline events={trackingEvents} />
        </div>
      </Section> */}

      {deliveryProof && (
        <Section title="Proof of delivery">
          <Rows
            items={[
              ['Received by', deliveryProof.receiverName],
              ['Delivery date', formatDate(deliveryProof.deliveryDate)],
              ['Remarks', deliveryProof.remarks || '—'],
            ]}
          />
          <div className="py-4 border-t border-gray-100">
            <AuthenticatedProofImage
              bookingId={booking._id}
              alt={`Delivery proof for ${booking.lrNumber}`}
            />
          </div>
        </Section>
      )}
    </div>
  );
}