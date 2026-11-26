import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  Clock,
  RotateCcw,
  Truck,
  MapPin,
  PackageCheck,
  ShieldAlert,
  XCircle,
  PauseCircle,
  Globe,
  Building2,
} from 'lucide-react';
import {
  BookingStatus,
  EntityStatus,
  KycVerificationStatus,
  SellerApprovalStatus,
  SupportTicketStatus,
} from '../../types/index.ts';

type AnyStatus =
  | BookingStatus
  | SellerApprovalStatus
  | EntityStatus
  | SupportTicketStatus
  | KycVerificationStatus
  | string;

const STATUS_MAP: Record<
  string,
  { label: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  [BookingStatus.BOOKED]: {
    label: 'Booked',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Clock,
  },
  [BookingStatus.ACCEPTED]: {
    label: 'Accepted',
    classes: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    Icon: CheckCircle2,
  },
  [BookingStatus.DISPATCHED]: {
    label: 'Dispatched',
    classes: 'bg-blue-50 text-blue-800 border-blue-200',
    Icon: Truck,
  },
  [BookingStatus.ARRIVED]: {
    label: 'Arrived',
    classes: 'bg-sky-50 text-sky-800 border-sky-200',
    Icon: MapPin,
  },
  [BookingStatus.OUT_FOR_DELIVERY]: {
    label: 'Out for Delivery',
    classes: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    Icon: Truck,
  },
  [BookingStatus.DELIVERED]: {
    label: 'Delivered',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: PackageCheck,
  },
  [BookingStatus.REJECTED]: {
    label: 'Rejected',
    classes: 'bg-red-50 text-red-800 border-red-200',
    Icon: XCircle,
  },
  [BookingStatus.CANCELLED]: {
    label: 'Cancelled',
    classes: 'bg-slate-100 text-slate-700 border-slate-300',
    Icon: Ban,
  },
  [BookingStatus.NDR]: {
    label: 'NDR Exception',
    classes: 'bg-orange-50 text-orange-800 border-orange-200',
    Icon: AlertTriangle,
  },
  [BookingStatus.RTO_INITIATED]: {
    label: 'RTO Initiated',
    classes: 'bg-purple-50 text-purple-800 border-purple-200',
    Icon: RotateCcw,
  },
  [BookingStatus.RTO_DELIVERED]: {
    label: 'RTO Delivered',
    classes: 'bg-purple-50 text-purple-900 border-purple-300',
    Icon: PackageCheck,
  },
  SETTLED: {
    label: 'Settled',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  PROCESSING: {
    label: 'Processing',
    classes: 'bg-blue-50 text-blue-800 border-blue-200',
    Icon: Clock,
  },
  PENDING_PAYOUT: {
    label: 'Pending Payout',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Clock,
  },
  AWAITING_DELIVERY: {
    label: 'In Transit',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: Truck,
  },
  RTO_RETURN: {
    label: 'RTO Return',
    classes: 'bg-purple-50 text-purple-800 border-purple-200',
    Icon: RotateCcw,
  },
  DIRECT_CUSTOMER: {
    label: 'Direct Customer',
    classes: 'bg-teal-50 text-teal-800 border-teal-200',
    Icon: Building2,
  },
  PLATFORM: {
    label: 'Platform Order',
    classes: 'bg-blue-50 text-blue-800 border-blue-200',
    Icon: Globe,
  },
  TRANSPORTER_SELF: {
    label: 'Self Booking',
    classes: 'bg-violet-50 text-violet-800 border-violet-200',
    Icon: Building2,
  },
  [SellerApprovalStatus.PENDING]: {
    label: 'Pending Approval',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Clock,
  },
  [SellerApprovalStatus.APPROVED]: {
    label: 'Approved',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  [KycVerificationStatus.NOT_SUBMITTED]: {
    label: 'Not Submitted',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: AlertCircle,
  },
  [KycVerificationStatus.VERIFIED]: {
    label: 'KYC Verified',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  [EntityStatus.ACTIVE]: {
    label: 'Active',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  [EntityStatus.INACTIVE]: {
    label: 'Inactive',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: PauseCircle,
  },
  [SupportTicketStatus.OPEN]: {
    label: 'Open',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: AlertCircle,
  },
  [SupportTicketStatus.IN_PROGRESS]: {
    label: 'In Progress',
    classes: 'bg-blue-50 text-blue-800 border-blue-200',
    Icon: Clock,
  },
  [SupportTicketStatus.RESOLVED]: {
    label: 'Resolved',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  [SupportTicketStatus.CLOSED]: {
    label: 'Closed',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: Archive,
  },
  WARN: {
    label: 'Warning',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: AlertTriangle,
  },
  ERROR: {
    label: 'Error',
    classes: 'bg-red-50 text-red-800 border-red-200',
    Icon: XCircle,
  },
  FATAL: {
    label: 'Fatal',
    classes: 'bg-rose-100 text-rose-900 border-rose-300',
    Icon: ShieldAlert,
  },
  QUEUED: {
    label: 'Queued',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Clock,
  },
  SENT: {
    label: 'Sent',
    classes: 'bg-blue-50 text-blue-800 border-blue-200',
    Icon: CheckCircle2,
  },
  READ: {
    label: 'Read',
    classes: 'bg-teal-50 text-teal-800 border-teal-200',
    Icon: CheckCircle2,
  },
  FAILED: {
    label: 'Failed',
    classes: 'bg-red-50 text-red-800 border-red-200',
    Icon: XCircle,
  },
  SKIPPED: {
    label: 'Skipped',
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
    Icon: PauseCircle,
  },
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const cfg = STATUS_MAP[status] || {
    label: String(status),
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: Clock,
  };
  const { Icon } = cfg;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${cfg.classes}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}
