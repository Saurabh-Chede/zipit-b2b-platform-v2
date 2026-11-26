import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Truck,
  ClipboardList,
  SearchCheck,
  Package,
  Search,
  CheckCircle2,
  CheckCheck,
  FileText,
  Barcode,
  Calendar,
  MapPin,
  FileDown,
  RotateCcw,
  Wallet,
  X,
  Plus,
  Building2,
  Pencil,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR, formatWeight } from '../../utils/formatters.ts';
import { ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { MyShipmentsPage } from './MyShipmentsPage.tsx';
import { TrackingView } from '../../components/shared/TrackingView.tsx';
import { PickupAddressModal } from '../../components/seller/PickupAddressModal.tsx';
import {
  BookingStatus,
  SellerApprovalStatus,
  type Booking,
  type PaginatedResponse,
  type RateQuote,
  type SavedAddress,
  type SellerProfile,
  type TrackingEvent,
  type TransportRoute,
  type Transporter,
} from '../../types/index.ts';

type WorkbenchTab = 'create' | 'bookings' | 'tracking';

interface SenderForm {
  companyName: string;
  contactPerson: string;
  phone: string;
  address: string;
  state: string;
  city: string;
  pincode: string;
  gstin: string;
}

interface PartyForm {
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
}

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function mapSavedAddressToSender(addr: SavedAddress): SenderForm {
  return {
    companyName: addr.companyName || addr.name || '',
    contactPerson: addr.contactPerson || addr.name || '',
    phone: addr.phone || '',
    address: addr.address || '',
    state: addr.state || '',
    city: addr.city || '',
    pincode: addr.pincode || '',
    gstin: addr.gstin || '',
  };
}

function getPrimaryPickup(addresses: SavedAddress[]): SavedAddress | null {
  const pickups = addresses.filter(
    (a) => a.addressType === 'PICKUP' || a.addressType === 'BOTH'
  );
  if (pickups.length === 0) return null;
  return pickups.find((a) => a.isDefault) || pickups[0];
}

interface ParcelForm {
  description: string;
  actualWeightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  numberOfPackages: string;
}

const TRACKING_STEPS: { status: BookingStatus; label: string }[] = [
  { status: BookingStatus.BOOKED, label: 'Booking Confirmed' },
  { status: BookingStatus.ACCEPTED, label: 'Pickup Done' },
  { status: BookingStatus.DISPATCHED, label: 'In Transit' },
  { status: BookingStatus.ARRIVED, label: 'Arrived at Destination' },
  { status: BookingStatus.DELIVERED, label: 'Delivered' },
];

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const cardCls = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6';

function Field({
  label,
  required = true,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}
        {required ? '*' : ''}
      </span>
      {children}
    </label>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
      <h3 className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-blue-600 shrink-0" />
        <span>{children}</span>
      </h3>
      {right}
    </div>
  );
}

function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  headerRight,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-2.5 sm:p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-6 sm:py-4">
          <h3 className="flex items-center gap-2.5 text-sm font-semibold text-slate-900 sm:text-base min-w-0">
            <Icon className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </div>
    </div>
  );
}

function AuthenticatedBarcodePreview({
  bookingId,
  lrNumber,
}: {
  bookingId: string;
  lrNumber: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setFailed(false);
    setObjectUrl(null);

    apiClient
      .get(`/bookings/${bookingId}/barcode`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        url = URL.createObjectURL(res.data as Blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bookingId]);

  return (
    <div className="mt-4 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-4">
      {failed ? (
        <div className="text-xs text-slate-500 py-1.5 font-mono tabular-nums">{lrNumber}</div>
      ) : !objectUrl ? (
        <div className="h-12 w-44 rounded bg-slate-200/70 animate-pulse" />
      ) : (
        <img
          src={objectUrl}
          alt={`Code 128 barcode for ${lrNumber}`}
          className="max-h-14 w-auto object-contain"
        />
      )}
    </div>
  );
}

export function CreateBookingPage() {
  const { profile, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const prefillState =
    (location.state as {
      routeId?: string;
      actualWeightKg?: string;
      lengthCm?: string;
      widthCm?: string;
      heightCm?: string;
      paymentMode?: 'INVOICE' | 'WALLET';
    } | null) || null;

  const sellerProfile = profile as SellerProfile | null;
  const [tab, setTab] = useState<WorkbenchTab>('create');

  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);

  const [routeId, setRouteId] = useState('');
  const [sender, setSender] = useState<SenderForm>({
    companyName: sellerProfile?.businessName || '',
    contactPerson: sellerProfile?.ownerName || sellerProfile?.businessName || '',
    phone: sellerProfile?.phone || '',
    address: sellerProfile?.businessAddress || '',
    state: '',
    city: sellerProfile?.city || '',
    pincode: sellerProfile?.pincode || '',
    gstin: sellerProfile?.gstNumber || '',
  });
  const [receiver, setReceiver] = useState<PartyForm>({
    name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
  });
  const [parcel, setParcel] = useState<ParcelForm>({
    description: 'B2B Commercial Goods',
    actualWeightKg: prefillState?.actualWeightKg || '20',
    lengthCm: prefillState?.lengthCm || '60',
    widthCm: prefillState?.widthCm || '40',
    heightCm: prefillState?.heightCm || '30',
    numberOfPackages: '1',
  });

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedPickupAddressId, setSelectedPickupAddressId] = useState<string>('');
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [showPickupFields, setShowPickupFields] = useState(false);
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [ewayBillValidUpto, setEwayBillValidUpto] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);

  const [quotes, setQuotes] = useState<RateQuote[] | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'INVOICE' | 'WALLET'>(
    prefillState?.paymentMode || 'WALLET'
  );
  const [calculating, setCalculating] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justConfirmedLr, setJustConfirmedLr] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `zpt-${crypto.randomUUID()}`);

  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [downloadingLr, setDownloadingLr] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [downloadingBarcode, setDownloadingBarcode] = useState(false);

  // Popup visibility
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [showLrModal, setShowLrModal] = useState(false);

  const closeQuotesModal = useCallback(() => setShowQuotesModal(false), []);
  const closeLrModal = useCallback(() => setShowLrModal(false), []);

  const selectedRoute = useMemo(
    () => routes.find((r) => r._id === routeId) || null,
    [routes, routeId]
  );

  const selectedQuote = useMemo(
    () => quotes?.find((q) => q.rateId === selectedQuoteId) || null,
    [quotes, selectedQuoteId]
  );

  const previewVolumetric = useMemo(() => {
    const l = Number(parcel.lengthCm) || 0;
    const w = Number(parcel.widthCm) || 0;
    const h = Number(parcel.heightCm) || 0;
    if (l <= 0 || w <= 0 || h <= 0) return 0;
    return Number(((l * w * h) / 5000).toFixed(2));
  }, [parcel.lengthCm, parcel.widthCm, parcel.heightCm]);

  const loadTrackingForLr = useCallback(async (lrNumber: string) => {
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: { timeline: TrackingEvent[] };
      }>(`/tracking/${encodeURIComponent(lrNumber)}`);
      setTrackingEvents(res.data.data.timeline || []);
    } catch {
      setTrackingEvents([]);
    }
  }, []);

  useEffect(() => {
    let active = true;

    apiClient
      .get<{ success: boolean; data: PaginatedResponse<TransportRoute> }>('/routes')
      .then((res) => {
        if (!active) return;
        const activeRoutes = res.data.data.items;
        setRoutes(activeRoutes);
        if (activeRoutes.length > 0) {
          const preferred =
            (prefillState?.routeId &&
              activeRoutes.find((r) => r._id === prefillState.routeId)) ||
            (sellerProfile?.pincode &&
              activeRoutes.find((r) => r.originPincode === sellerProfile.pincode)) ||
            activeRoutes[0];
          setRouteId(preferred._id);
          setSender((prev) => ({
            ...prev,
            city: prev.city || preferred.originCity,
            pincode: prev.pincode || preferred.originPincode,
          }));
          setReceiver((prev) => ({
            ...prev,
            city: preferred.destinationCity,
            pincode: preferred.destinationPincode,
          }));
        }
      })
      .catch((err) => {
        if (active) setRoutesError(extractErrorMessage(err, 'Failed to load active routes.'));
      })
      .finally(() => {
        if (active) setLoadingRoutes(false);
      });

    apiClient
      .get<{ success: boolean; data: PaginatedResponse<Booking> }>('/bookings', {
        params: { page: 1, limit: 1 },
      })
      .then((res) => {
        if (!active) return;
        const latest = res.data.data.items[0] || null;
        setActiveBooking(latest);
        if (latest) {
          loadTrackingForLr(latest.lrNumber);
        }
      })
      .catch(() => {
        if (active) setActiveBooking(null);
      })
      .finally(() => {
        if (active) setLoadingLatest(false);
      });

    apiClient
      .get<{ success: boolean; data: SavedAddress[] }>('/sellers/me/addresses')
      .then((res) => {
        if (!active) return;
        const list = res.data.data || [];
        setSavedAddresses(list);
        const primary = getPrimaryPickup(list);
        if (primary) {
          setSelectedPickupAddressId(primary._id);
          setSender(mapSavedAddressToSender(primary));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [loadTrackingForLr, sellerProfile?.pincode, prefillState?.routeId]);

  const handleRouteChange = (nextRouteId: string) => {
    setRouteId(nextRouteId);
    setQuotes(null);
    setSelectedQuoteId('');
    setFormError(null);
    const lane = routes.find((r) => r._id === nextRouteId);
    if (lane) {
      setReceiver((prev) => ({
        ...prev,
        city: lane.destinationCity,
        pincode: lane.destinationPincode,
      }));
    }
  };

  const handleSelectPickupAddress = (addressId: string) => {
    setSelectedPickupAddressId(addressId);
    const found = savedAddresses.find((a) => a._id === addressId);
    if (found) {
      setSender(mapSavedAddressToSender(found));
      setFormError(null);
    }
  };

  const handlePickupSavedInFlow = (updatedList: SavedAddress[], savedId?: string) => {
    setSavedAddresses(updatedList);
    const chosen =
      (savedId && updatedList.find((a) => a._id === savedId)) ||
      getPrimaryPickup(updatedList);
    if (chosen) {
      setSelectedPickupAddressId(chosen._id);
      setSender(mapSavedAddressToSender(chosen));
      setFormError(null);
    }
  };

  const handleReset = () => {
    const defaultLane = routes[0];
    setRouteId(defaultLane?._id || '');
    const primary = getPrimaryPickup(savedAddresses);
    if (primary) {
      setSelectedPickupAddressId(primary._id);
      setSender(mapSavedAddressToSender(primary));
    } else {
      setSelectedPickupAddressId('');
      setSender({
        companyName: sellerProfile?.businessName || '',
        contactPerson: sellerProfile?.ownerName || sellerProfile?.businessName || '',
        phone: sellerProfile?.phone || '',
        address: sellerProfile?.businessAddress || '',
        state: '',
        city: defaultLane?.originCity || sellerProfile?.city || '',
        pincode: defaultLane?.originPincode || sellerProfile?.pincode || '',
        gstin: sellerProfile?.gstNumber || '',
      });
    }
    setReceiver({
      name: '',
      phone: '',
      address: '',
      city: defaultLane?.destinationCity || '',
      pincode: defaultLane?.destinationPincode || '',
    });
    setParcel({
      description: 'B2B Commercial Goods',
      actualWeightKg: '20',
      lengthCm: '60',
      widthCm: '40',
      heightCm: '30',
      numberOfPackages: '1',
    });
    setEwayBillNumber('');
    setEwayBillValidUpto('');
    setQuotes(null);
    setSelectedQuoteId('');
    setFormError(null);
    setJustConfirmedLr(null);
    setShowQuotesModal(false);
    setShowLrModal(false);
    setIdempotencyKey(`zpt-${crypto.randomUUID()}`);
  };

  const validateParcelInputs = (): string | null => {
    if (!routeId) return 'Select an active transport route first.';
    const wt = Number(parcel.actualWeightKg);
    const l = Number(parcel.lengthCm);
    const w = Number(parcel.widthCm);
    const h = Number(parcel.heightCm);
    const pkgs = Number(parcel.numberOfPackages);
    if (!Number.isFinite(wt) || wt <= 0) return 'Actual weight must be greater than 0 kg.';
    if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      return 'Length, width, and height must all be greater than 0 cm.';
    }
    if (!Number.isInteger(pkgs) || pkgs < 1) return 'Number of packages must be at least 1.';
    return null;
  };

  const handleFindTransporters = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateParcelInputs();
    if (validationErr) {
      setFormError(validationErr);
      return;
    }

    setCalculating(true);
    setFormError(null);
    setJustConfirmedLr(null);
    setSelectedQuoteId('');
    try {
      const res = await apiClient.post<{
        success: boolean;
        data: { quotes: RateQuote[] };
      }>('/rates/calculate', {
        routeId,
        actualWeightKg: Number(parcel.actualWeightKg),
        lengthCm: Number(parcel.lengthCm),
        widthCm: Number(parcel.widthCm),
        heightCm: Number(parcel.heightCm),
        numberOfPackages: Number(parcel.numberOfPackages),
      });
      const fetchedQuotes = res.data.data.quotes;
      setQuotes(fetchedQuotes);
      setShowQuotesModal(true);
      if (fetchedQuotes.length > 0) {
        setSelectedQuoteId(fetchedQuotes[0].rateId);
      } else {
        showToast('No active transporter rates configured for this lane yet.', 'info');
      }
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Unable to calculate transporter quotes.'));
    } finally {
      setCalculating(false);
    }
  };

  const validatePartyAndParcel = (): string | null => {
    const phoneRegex = /^[6-9]\d{9}$/;
    const pinRegex = /^\d{6}$/;

    if (sender.companyName.trim().length < 2) return 'Pickup Company / Business Name is required.';
    if (sender.contactPerson.trim().length < 2) return 'Pickup Contact Person Name is required.';
    if (!phoneRegex.test(sender.phone.trim())) return 'Pickup mobile number must be a valid 10-digit Indian mobile number.';
    if (sender.address.trim().length < 5) return 'Complete pickup address must be at least 5 characters.';
    if (sender.state.trim().length < 2) return 'Pickup state is required.';
    if (sender.city.trim().length < 2 || !pinRegex.test(sender.pincode.trim())) {
      return 'Pickup city and 6-digit pincode are required.';
    }
    if (sender.gstin.trim() && !GSTIN_REGEX.test(sender.gstin.trim().toUpperCase())) {
      return 'Pickup GSTIN must be a valid 15-character Indian GST number.';
    }

    if (receiver.name.trim().length < 2) return 'Receiver name is required.';
    if (!phoneRegex.test(receiver.phone.trim())) return 'Receiver phone must be a valid 10-digit Indian mobile number.';
    if (receiver.address.trim().length < 5) return 'Receiver delivery address must be at least 5 characters.';
    if (receiver.city.trim().length < 2 || !pinRegex.test(receiver.pincode.trim())) {
      return 'Receiver city and 6-digit pincode are required.';
    }

    if (parcel.description.trim().length < 2) return 'Goods description is required.';
    return validateParcelInputs();
  };

  const handleConfirmBooking = async () => {
    if (!selectedQuote) {
      setFormError('Find transporters and select a rate quote before confirming.');
      return;
    }

    const validationErr = validatePartyAndParcel();
    if (validationErr) {
      if (validationErr.startsWith('Pickup') || validationErr.startsWith('Complete pickup')) {
        setShowPickupFields(true);
      }
      setFormError(validationErr);
      return;
    }

    setBookingSubmitting(true);
    setFormError(null);
    try {
      const cleanGstin = sender.gstin.trim().toUpperCase();
      const res = await apiClient.post<{ success: boolean; data: Booking }>(
        '/bookings',
        {
          routeId: selectedQuote.routeId || routeId,
          transporterId: selectedQuote.transporterId,
          rateId: selectedQuote.rateId,
          pickupAddressId: selectedPickupAddressId || null,
          idempotencyKey,
          paymentMode,
          ewayBillNumber: ewayBillNumber.trim() || undefined,
          ewayBillValidUpto: ewayBillValidUpto || null,
          whatsappOptIn,
          sender: {
            name: sender.companyName.trim(),
            companyName: sender.companyName.trim(),
            contactPerson: sender.contactPerson.trim(),
            phone: sender.phone.trim(),
            address: sender.address.trim(),
            state: sender.state.trim(),
            city: sender.city.trim(),
            pincode: sender.pincode.trim(),
            gstin: cleanGstin || undefined,
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

      const created = res.data.data;
      setActiveBooking(created);
      await loadTrackingForLr(created.lrNumber);
      if (paymentMode === 'WALLET') {
        await refreshUser();
      }
      setQuotes(null);
      setSelectedQuoteId('');
      setJustConfirmedLr(created.lrNumber);
      setIdempotencyKey(`zpt-${crypto.randomUUID()}`);
      setShowQuotesModal(false);
      setShowLrModal(true);
      showToast(`Shipment confirmed. LR: ${created.lrNumber}`, 'success');
    } catch (err) {
      const msg = extractErrorMessage(err, 'Failed to confirm booking.');
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const triggerBlobDownload = async (endpoint: string, filename: string, mime: string) => {
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
  };

  const handleDownloadLrPdf = async () => {
    if (!activeBooking) return;
    setDownloadingLr(true);
    try {
      await triggerBlobDownload(
        `/bookings/${activeBooking._id}/lr`,
        `${activeBooking.lrNumber}.pdf`,
        'application/pdf'
      );
      showToast(`Downloaded ${activeBooking.lrNumber}.pdf`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download LR PDF.'), 'error');
    } finally {
      setDownloadingLr(false);
    }
  };

  const handleDownloadBarcode = async () => {
    if (!activeBooking) return;
    setDownloadingBarcode(true);
    try {
      await triggerBlobDownload(
        `/bookings/${activeBooking._id}/barcode?download=1`,
        `${activeBooking.lrNumber}-barcode.png`,
        'image/png'
      );
      showToast(`Downloaded barcode for ${activeBooking.lrNumber}`, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download barcode label.'), 'error');
    } finally {
      setDownloadingBarcode(false);
    }
  };

  const handleDownloadTaxInvoice = async () => {
    if (!activeBooking) return;
    setDownloadingInvoice(true);
    try {
      await triggerBlobDownload(
        `/bookings/${activeBooking._id}/tax-invoice`,
        `${activeBooking.invoiceNumber || activeBooking.lrNumber}-TAX-INVOICE.pdf`,
        'application/pdf'
      );
      showToast('Downloaded GST Tax Invoice PDF', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to download Tax Invoice PDF.'), 'error');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const pickupAddresses = useMemo(() => {
    const filtered = savedAddresses.filter(
      (a) => a.addressType === 'PICKUP' || a.addressType === 'BOTH'
    );
    return [...filtered].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }, [savedAddresses]);

  const selectedPickupRecord = useMemo(
    () => pickupAddresses.find((a) => a._id === selectedPickupAddressId) || null,
    [pickupAddresses, selectedPickupAddressId]
  );

  const isSenderModified = useMemo(() => {
    if (!selectedPickupRecord) return false;
    const saved = mapSavedAddressToSender(selectedPickupRecord);
    return (
      sender.companyName.trim() !== saved.companyName.trim() ||
      sender.contactPerson.trim() !== saved.contactPerson.trim() ||
      sender.phone.trim() !== saved.phone.trim() ||
      sender.address.trim() !== saved.address.trim() ||
      sender.state.trim() !== saved.state.trim() ||
      sender.city.trim() !== saved.city.trim() ||
      sender.pincode.trim() !== saved.pincode.trim() ||
      sender.gstin.trim().toUpperCase() !== saved.gstin.trim().toUpperCase()
    );
  }, [sender, selectedPickupRecord]);

  const pickupStateOptions = useMemo(() => {
    if (sender.state && !INDIAN_STATES.includes(sender.state)) {
      return [sender.state, ...INDIAN_STATES];
    }
    return INDIAN_STATES;
  }, [sender.state]);

  const deliveryAddresses = useMemo(
    () => savedAddresses.filter((a) => a.addressType === 'DELIVERY' || a.addressType === 'BOTH'),
    [savedAddresses]
  );

  const activeStepIndex = useMemo(() => {
    if (!activeBooking) return -1;
    return TRACKING_STEPS.findIndex((s) => s.status === activeBooking.status);
  }, [activeBooking]);

  const stepTimestampMap = useMemo(() => {
    const map = new Map<BookingStatus, string>();
    for (const ev of trackingEvents) {
      map.set(ev.status, formatDateTime(ev.eventTimestamp));
    }
    return map;
  }, [trackingEvents]);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      {/* Workbench Header & Tabs */}
      <header className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white shrink-0">
              <Truck className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
                Create Booking Workbench
              </h1>
            </div>
          </div>

          <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'create', label: 'Create Booking', icon: Truck },
                { id: 'bookings', label: 'My Bookings', icon: ClipboardList },
                { id: 'tracking', label: 'Tracking', icon: SearchCheck },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                    active
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {tab === 'bookings' ? (
        <MyShipmentsPage />
      ) : tab === 'tracking' ? (
        <TrackingView />
      ) : sellerProfile && sellerProfile.approvalStatus !== SellerApprovalStatus.APPROVED ? (
        <ErrorBanner
          message={
            sellerProfile.approvalStatus === SellerApprovalStatus.PENDING
              ? 'Your seller registration is still pending admin approval. You can create shipments once approved.'
              : `Your seller registration was rejected: ${sellerProfile.rejectionReason || 'Contact admin'}`
          }
        />
      ) : loadingRoutes ? (
        <LoadingSkeleton rows={6} />
      ) : routesError ? (
        <ErrorBanner message={routesError} />
      ) : (
        <div className="space-y-4">
          {formError && !showQuotesModal && <ErrorBanner message={formError} />}

          {/* Last booking confirmed strip (reopens LR popup) */}
          {justConfirmedLr && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-xs text-emerald-800">
              <p>
                <span className="font-semibold">Booking confirmed ({justConfirmedLr}).</span>{' '}
                Modify receiver or parcel details (or click Reset) before your next shipment.
              </p>
              <div className="flex items-center gap-2">
                {activeBooking && (
                  <button
                    type="button"
                    onClick={() => navigate(`/seller/shipments/${activeBooking._id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 whitespace-nowrap"
                  >
                    <span>View Details</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowLrModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 whitespace-nowrap"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>View LR</span>
                </button>
              </div>
            </div>
          )}

          {/* Full-width form */}
          <form id="create-booking-form" onSubmit={handleFindTransporters} className="flex flex-col gap-4">
            {/* Pickup & Sender Details — top compact bar (details auto-filled, expandable on edit) */}
            <section className={cardCls}>
              <div
                className={`flex flex-wrap items-center justify-between gap-3 ${
                  showPickupFields || pickupAddresses.length === 0
                    ? 'mb-5 border-b border-slate-100 pb-3'
                    : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Pickup &amp; Sender Details
                  </h3>
                  {selectedPickupRecord && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                        selectedPickupRecord.isDefault
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {selectedPickupRecord.isDefault ? 'Primary' : 'Secondary'}
                    </span>
                  )}
                  {isSenderModified && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800">
                      Edited for this booking
                    </span>
                  )}
                </div>

                <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
                  {pickupAddresses.length > 0 && (
                    <select
                      aria-label="Select saved pickup address"
                      value={selectedPickupAddressId}
                      onChange={(e) => handleSelectPickupAddress(e.target.value)}
                      className="w-full sm:w-auto sm:max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 sm:py-1.5 text-xs font-medium text-slate-700"
                    >
                      {pickupAddresses.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.isDefault ? '[Primary] ' : '[Secondary] '}
                          {a.label || a.companyName || a.name} — {a.city} ({a.pincode})
                        </option>
                      ))}
                    </select>
                  )}
                  {pickupAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPickupFields((prev) => !prev)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>{showPickupFields ? 'Hide Details' : 'Edit Details'}</span>
                    </button>
                  )}
                  {isSenderModified && selectedPickupRecord && (
                    <button
                      type="button"
                      onClick={() => setSender(mapSavedAddressToSender(selectedPickupRecord))}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickupModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add New Pickup</span>
                  </button>
                </div>
              </div>

              {(showPickupFields || pickupAddresses.length === 0) && (
                <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-12">
                  <Field label="Company / Business Name" className="lg:col-span-3 xl:col-span-4">
                    <input
                      className={inputCls}
                      value={sender.companyName}
                      onChange={(e) => setSender({ ...sender, companyName: e.target.value })}
                      placeholder="Business / Consignor Name"
                      required
                    />
                  </Field>
                  <Field label="Contact Person Name" className="lg:col-span-3 xl:col-span-3">
                    <input
                      className={inputCls}
                      value={sender.contactPerson}
                      onChange={(e) => setSender({ ...sender, contactPerson: e.target.value })}
                      placeholder="Dispatch contact person"
                      required
                    />
                  </Field>
                  <Field label="Mobile Number" className="lg:col-span-3 xl:col-span-2">
                    <input
                      type="tel"
                      maxLength={10}
                      className={`${inputCls} font-mono tabular-nums`}
                      value={sender.phone}
                      onChange={(e) =>
                        setSender({ ...sender, phone: e.target.value.replace(/\D/g, '') })
                      }
                      placeholder="9820012345"
                      required
                    />
                  </Field>
                  <Field label="GSTIN (Optional)" required={false} className="lg:col-span-3 xl:col-span-3">
                    <input
                      className={`${inputCls} font-mono uppercase`}
                      maxLength={15}
                      value={sender.gstin}
                      onChange={(e) =>
                        setSender({
                          ...sender,
                          gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''),
                        })
                      }
                      placeholder="27AABCA4521K1Z5"
                    />
                  </Field>
                  <Field label="Complete Pickup Address" className="sm:col-span-2 lg:col-span-6 xl:col-span-6">
                    <input
                      className={inputCls}
                      value={sender.address}
                      onChange={(e) => setSender({ ...sender, address: e.target.value })}
                      placeholder="Plot / Warehouse / Industrial Estate street address"
                      required
                    />
                  </Field>
                  <Field label="State" className="lg:col-span-2 xl:col-span-2">
                    <select
                      className={inputCls}
                      value={sender.state}
                      onChange={(e) => setSender({ ...sender, state: e.target.value })}
                      required
                    >
                      <option value="">Select state...</option>
                      {pickupStateOptions.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Origin City" className="lg:col-span-2 xl:col-span-2">
                    <input
                      className={inputCls}
                      value={sender.city}
                      onChange={(e) => setSender({ ...sender, city: e.target.value })}
                      placeholder="City"
                      required
                    />
                  </Field>
                  <Field label="Pincode" className="lg:col-span-2 xl:col-span-2">
                    <input
                      maxLength={6}
                      className={`${inputCls} font-mono tabular-nums`}
                      value={sender.pincode}
                      onChange={(e) =>
                        setSender({ ...sender, pincode: e.target.value.replace(/\D/g, '') })
                      }
                      placeholder="411026"
                      required
                    />
                  </Field>
                </div>
              )}
            </section>

            {/* Lane Selection Strip */}
            <section className={cardCls}>
              <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-12">
                <div className="min-w-0 md:col-span-8">
                  <Field label="Select Active Transport Lane">
                    <select
                      value={routeId}
                      onChange={(e) => handleRouteChange(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Choose an active lane...</option>
                      {routes.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.originCity} ({r.originPincode}) → {r.destinationCity} (
                          {r.destinationPincode})
                          {r.distanceKm ? ` · ${r.distanceKm} km` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="min-w-0 md:col-span-4">
                  <span className="mb-1.5 block whitespace-nowrap text-xs font-medium text-slate-600">
                    Selected Lane
                  </span>
                  <div className="flex min-h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="break-words text-xs font-semibold text-slate-800 font-mono tabular-nums">
                      {selectedRoute
                        ? `${selectedRoute.originCity} → ${selectedRoute.destinationCity}${
                            selectedRoute.distanceKm ? ` (${selectedRoute.distanceKm} km)` : ''
                          }`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Receiver — full width */}
            <section className={cardCls}>
              <SectionTitle
                icon={MapPin}
                right={
                  deliveryAddresses.length > 0 ? (
                    <select
                      aria-label="Quick-fill saved delivery address"
                      defaultValue=""
                      onChange={(e) => {
                        const found = deliveryAddresses.find((a) => a._id === e.target.value);
                        if (found) {
                          setReceiver({
                            name: found.name,
                            phone: found.phone,
                            address: found.address,
                            city: found.city,
                            pincode: found.pincode,
                          });
                        }
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      <option value="">Quick-fill Saved Buyer...</option>
                      {deliveryAddresses.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.label} ({a.city} - {a.pincode})
                        </option>
                      ))}
                    </select>
                  ) : null
                }
              >
                Receiver Details
              </SectionTitle>
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-12">
                <Field label="Receiver Name" className="lg:col-span-3 xl:col-span-3">
                  <input
                    className={inputCls}
                    value={receiver.name}
                    onChange={(e) => setReceiver({ ...receiver, name: e.target.value })}
                    placeholder="Consignee name"
                    required
                  />
                </Field>
                <Field label="Phone" className="lg:col-span-3 xl:col-span-2">
                  <input
                    className={`${inputCls} font-mono tabular-nums`}
                    value={receiver.phone}
                    onChange={(e) => setReceiver({ ...receiver, phone: e.target.value })}
                    placeholder="9876543210"
                    required
                  />
                </Field>
                <Field label="Delivery Address" className="sm:col-span-2 lg:col-span-6 xl:col-span-3">
                  <input
                    className={inputCls}
                    value={receiver.address}
                    onChange={(e) => setReceiver({ ...receiver, address: e.target.value })}
                    placeholder="Warehouse / Industrial Estate"
                    required
                  />
                </Field>
                <Field label="Destination City" className="lg:col-span-3 xl:col-span-2">
                  <input
                    className={`${inputCls} bg-slate-50`}
                    value={receiver.city}
                    onChange={(e) => setReceiver({ ...receiver, city: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Pincode" className="lg:col-span-3 xl:col-span-2">
                  <input
                    className={`${inputCls} font-mono tabular-nums bg-slate-50`}
                    value={receiver.pincode}
                    onChange={(e) => setReceiver({ ...receiver, pincode: e.target.value })}
                    required
                  />
                </Field>
              </div>
            </section>

            {/* Parcel Details + Form Actions */}
            <section className={`${cardCls} flex flex-col`}>
              <SectionTitle
                icon={Package}
                right={
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    Est. Volumetric: {previewVolumetric} kg
                  </span>
                }
              >
                Parcel Specifications
              </SectionTitle>

              <div className="mb-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
                <Field label="Goods Description" className="col-span-2 sm:col-span-4 lg:col-span-4 xl:col-span-5">
                  <input
                    className={inputCls}
                    value={parcel.description}
                    onChange={(e) => setParcel({ ...parcel, description: e.target.value })}
                    placeholder="Industrial cartons, textiles..."
                    required
                  />
                </Field>
                <Field label="Packages" className="col-span-1 lg:col-span-2 xl:col-span-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={parcel.numberOfPackages}
                    onChange={(e) =>
                      setParcel({ ...parcel, numberOfPackages: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label="Weight (kg)" className="col-span-1 lg:col-span-2 xl:col-span-2">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={parcel.actualWeightKg}
                    onChange={(e) =>
                      setParcel({ ...parcel, actualWeightKg: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label="Length (cm)" className="col-span-1 lg:col-span-2 xl:col-span-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={parcel.lengthCm}
                    onChange={(e) => setParcel({ ...parcel, lengthCm: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Width (cm)" className="col-span-1 lg:col-span-2 xl:col-span-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={parcel.widthCm}
                    onChange={(e) => setParcel({ ...parcel, widthCm: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Height (cm)" className="col-span-2 sm:col-span-1 lg:col-span-2 xl:col-span-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={parcel.heightCm}
                    onChange={(e) => setParcel({ ...parcel, heightCm: e.target.value })}
                    required
                  />
                </Field>
                <Field label="E-Way Bill No. (12 digits, Optional)" required={false} className="col-span-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
                  <input
                    type="text"
                    maxLength={12}
                    pattern="\d{12}"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={ewayBillNumber}
                    onChange={(e) => setEwayBillNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g., 271009887766"
                  />
                </Field>
                <Field label="E-Way Bill Valid Upto (Optional)" required={false} className="col-span-2 sm:col-span-2 lg:col-span-3 xl:col-span-3">
                  <input
                    type="date"
                    className={`${inputCls} font-mono tabular-nums`}
                    value={ewayBillValidUpto}
                    onChange={(e) => setEwayBillValidUpto(e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
                <div className="space-y-1.5">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whatsappOptIn}
                      onChange={(e) => setWhatsappOptIn(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Send automated WhatsApp tracking notifications (customer opt-in)</span>
                  </label>
                  <p className="max-w-md text-xs leading-relaxed text-slate-500">
                    Final freight &amp; GST are computed server-side from active transporter rate
                    cards.
                  </p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                  {activeBooking && (
                    <button
                      type="button"
                      onClick={() => setShowLrModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap"
                    >
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                      <span>Latest LR</span>
                    </button>
                  )}
                  {quotes !== null && !showQuotesModal && (
                    <button
                      type="button"
                      onClick={() => setShowQuotesModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs sm:text-sm font-medium text-blue-700 transition hover:bg-blue-100 whitespace-nowrap"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>View Quotes</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={calculating}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>{calculating ? 'Calculating...' : 'Find Transporters'}</span>
                  </button>
                </div>
              </div>
            </section>
          </form>
        </div>
      )}

      {/* Popup 1: Available Transporters & Summary */}
      <Modal
        open={showQuotesModal}
        onClose={closeQuotesModal}
        title="Available Transporters & Summary"
        icon={Truck}
      >
        {formError && (
          <div className="mb-4">
            <ErrorBanner message={formError} />
          </div>
        )}

        {quotes === null || quotes.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
            No active transporter rates configured for this lane yet. Ask an administrator to
            add a rate.
          </div>
        ) : (
          <div className="space-y-2.5">
            {quotes.map((q) => {
              const active = q.rateId === selectedQuoteId;
              return (
                <button
                  key={q.rateId}
                  type="button"
                  onClick={() => setSelectedQuoteId(q.rateId)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                    active
                      ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`grid h-4 w-4 place-items-center rounded-full border shrink-0 ${
                        active
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {q.transporterName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
                        {q.estimatedDeliveryTime} ·{' '}
                        {formatWeight(q.breakdown.chargeableWeightKg)}
                        {q.isSampleData ? ' · Sample Rate' : ''}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 shrink-0 pl-4">
                    {formatINR(q.breakdown.finalAmount)}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Compact 2-Column Cost Breakdown + Payment Mode */}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Base Freight</dt>
              <dd className="font-mono tabular-nums font-medium text-slate-800">
                {selectedQuote ? formatINR(selectedQuote.breakdown.baseFreight) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Handling + GST</dt>
              <dd className="font-mono tabular-nums font-medium text-slate-800">
                {selectedQuote
                  ? formatINR(
                      selectedQuote.breakdown.additionalCharges +
                        selectedQuote.breakdown.taxAmount
                    )
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Chargeable Wt</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {selectedQuote
                  ? formatWeight(selectedQuote.breakdown.chargeableWeightKg)
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">RTO (if returned)</dt>
              <dd className="font-mono tabular-nums text-slate-600">
                {selectedQuote ? formatINR(selectedQuote.breakdown.rtoCharges) : '—'}
              </dd>
            </div>
            {selectedQuote?.breakdown.platformChargeApplied &&
              Number(selectedQuote.breakdown.platformCharge || 0) > 0 && (
                <div className="flex justify-between gap-3 sm:col-span-2">
                  <dt className="text-slate-500">
                    Platform Charge
                    {selectedQuote.breakdown.platformChargeType === 'PERCENTAGE'
                      ? ` (${selectedQuote.breakdown.platformChargeValue}%)`
                      : ''}
                  </dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-800">
                    {formatINR(selectedQuote.breakdown.platformCharge || 0)}
                  </dd>
                </div>
              )}
          </dl>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs font-medium text-slate-600">Payment Mode</span>
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPaymentMode('WALLET')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  paymentMode === 'WALLET'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wallet className="h-3.5 w-3.5 shrink-0" />
                <span>Wallet</span>
                <span className="font-mono tabular-nums">
                  ({formatINR(Number(sellerProfile?.walletBalance ?? 0))})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('INVOICE')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  paymentMode === 'INVOICE'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                B2B Invoice
              </button>
            </div>
          </div>

          {paymentMode === 'WALLET' &&
            selectedQuote &&
            Number(sellerProfile?.walletBalance ?? 0) < selectedQuote.breakdown.finalAmount && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>
                  Insufficient wallet balance for {formatINR(selectedQuote.breakdown.finalAmount)}.
                </span>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('zipit:open-wallet-modal'))}
                  className="font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
                >
                  Recharge Wallet
                </button>
              </div>
            )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4 rounded-lg bg-slate-50 px-4 py-3.5">
            <div>
              <span className="block text-[11px] font-medium text-slate-500">
                Total Payable
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-blue-600">
                {selectedQuote ? formatINR(selectedQuote.breakdown.finalAmount) : '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleConfirmBooking}
              disabled={bookingSubmitting || !selectedQuote}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{bookingSubmitting ? 'Confirming...' : 'Confirm Booking'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Popup 2: Confirmed Booking & Instant LR / Barcode */}
      <Modal
        open={showLrModal}
        onClose={closeLrModal}
        title="Latest Confirmed LR"
        icon={CheckCircle2}
        headerRight={activeBooking ? <StatusBadge status={activeBooking.status} /> : undefined}
      >
        {loadingLatest ? (
          <LoadingSkeleton rows={4} />
        ) : !activeBooking ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400">
              <FileText className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">No Active Booking</h3>
            <p className="mx-auto max-w-xs text-xs leading-relaxed text-slate-500">
              Confirm a booking to generate your LR PDF and Code 128 barcode label.
            </p>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 sm:gap-y-4 text-xs">
              <div>
                <dt className="text-slate-500">LR Number</dt>
                <dd className="font-mono font-semibold text-blue-700 tabular-nums mt-1">
                  {activeBooking.lrNumber}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Booking ID</dt>
                <dd className="font-mono font-medium text-slate-800 tabular-nums mt-1">
                  {activeBooking.bookingId}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Transporter</dt>
                <dd className="font-medium text-slate-800 mt-1 truncate">
                  {(activeBooking.transporterId as Transporter)?.companyName || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Route &amp; Amount</dt>
                <dd className="font-medium text-slate-800 mt-1">
                  {activeBooking.origin.city} → {activeBooking.destination.city} ·{' '}
                  <span className="font-mono font-bold tabular-nums">
                    {formatINR(activeBooking.finalAmount)}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleDownloadLrPdf}
                disabled={downloadingLr}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <FileDown className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span>{downloadingLr ? 'Generating...' : 'Download LR (PDF)'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadTaxInvoice}
                disabled={downloadingInvoice}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>{downloadingInvoice ? 'Generating...' : 'Tax Invoice PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadBarcode}
                disabled={downloadingBarcode}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Barcode className="h-3.5 w-3.5 text-slate-700 shrink-0" />
                <span>{downloadingBarcode ? 'Generating...' : 'Barcode Label'}</span>
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                <span className="font-mono tabular-nums">
                  {formatDateTime(activeBooking.createdAt)}
                </span>
              </span>
              <span>Code 128 Encoded LR</span>
            </div>

            <AuthenticatedBarcodePreview
              bookingId={activeBooking._id}
              lrNumber={activeBooking.lrNumber}
            />

            {/* Compact Tracking Timeline inside LR Modal */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">Shipment Progress</span>
                <button
                  type="button"
                  onClick={() => {
                    closeLrModal();
                    navigate(`/seller/shipments/${activeBooking._id}`);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                >
                  View Full Details
                </button>
              </div>
              {/* Mobile vertical milestone tracker */}
              <div className="sm:hidden space-y-2.5">
                {TRACKING_STEPS.map((step, i) => {
                  const done = i < activeStepIndex;
                  const current = i === activeStepIndex;
                  const stepTime = stepTimestampMap.get(step.status) || '—';
                  return (
                    <div key={step.status} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold shrink-0 ${
                            done
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : current
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 bg-white text-slate-400'
                          }`}
                        >
                          {done ? (
                            <CheckCheck className="h-3.5 w-3.5" />
                          ) : current ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            i + 1
                          )}
                        </div>
                        {i < TRACKING_STEPS.length - 1 && (
                          <span
                            className={`w-0.5 h-3.5 mt-1 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2 pt-0.5">
                        <span
                          className={`text-xs font-medium ${
                            done || current ? 'text-slate-800' : 'text-slate-400'
                          }`}
                        >
                          {step.label}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                          {stepTime}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet & Desktop 5-col stepper */}
              <div className="hidden sm:grid grid-cols-5 gap-2">
                {TRACKING_STEPS.map((step, i) => {
                  const done = i < activeStepIndex;
                  const current = i === activeStepIndex;
                  const stepTime = stepTimestampMap.get(step.status) || '—';
                  return (
                    <div key={step.status} className="flex flex-col items-center text-center">
                      <div
                        className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold ${
                          done
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : current
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 bg-white text-slate-400'
                        }`}
                      >
                        {done ? (
                          <CheckCheck className="h-3.5 w-3.5" />
                        ) : current ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      <p
                        className={`mt-1.5 text-[11px] font-medium leading-tight ${
                          done || current ? 'text-slate-800' : 'text-slate-400'
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="mt-0.5 text-[10px] font-mono tabular-nums text-slate-500 truncate max-w-full">
                        {stepTime}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </Modal>

      <PickupAddressModal
        open={pickupModalOpen}
        onClose={() => setPickupModalOpen(false)}
        hasExistingPickupAddresses={pickupAddresses.length > 0}
        onSaved={handlePickupSavedInFlow}
      />
    </div>
  );
}
