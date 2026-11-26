export enum UserRole {
  ADMIN = 'ADMIN',
  SELLER = 'SELLER',
  TRANSPORTER = 'TRANSPORTER',
}

export enum SellerApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum TransporterApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum EntityStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum BookingStatus {
  BOOKED = 'BOOKED',
  ACCEPTED = 'ACCEPTED',
  DISPATCHED = 'DISPATCHED',
  ARRIVED = 'ARRIVED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  NDR = 'NDR',
  RTO_INITIATED = 'RTO_INITIATED',
  RTO_DELIVERED = 'RTO_DELIVERED',
}

export const NEXT_BOOKING_STATUS: Record<BookingStatus, BookingStatus | null> = {
  [BookingStatus.BOOKED]: BookingStatus.ACCEPTED,
  [BookingStatus.ACCEPTED]: BookingStatus.DISPATCHED,
  [BookingStatus.DISPATCHED]: BookingStatus.ARRIVED,
  [BookingStatus.ARRIVED]: BookingStatus.DELIVERED,
  [BookingStatus.OUT_FOR_DELIVERY]: BookingStatus.DELIVERED,
  [BookingStatus.DELIVERED]: null,
  [BookingStatus.REJECTED]: null,
  [BookingStatus.CANCELLED]: null,
  [BookingStatus.NDR]: BookingStatus.DELIVERED,
  [BookingStatus.RTO_INITIATED]: BookingStatus.RTO_DELIVERED,
  [BookingStatus.RTO_DELIVERED]: null,
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string;
}

export interface SavedAddress {
  _id: string;
  label: string;
  addressType: 'PICKUP' | 'DELIVERY' | 'BOTH';
  companyName?: string;
  contactPerson?: string;
  name: string;
  phone: string;
  address: string;
  state?: string;
  city: string;
  pincode: string;
  gstin?: string;
  isDefault: boolean;
}

export interface SellerProfile {
  _id: string;
  userId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  gstNumber: string;
  businessAddress: string;
  city: string;
  pincode: string;
  walletBalance?: number;
  savedAddresses?: SavedAddress[];
  approvalStatus: SellerApprovalStatus;
  rejectionReason?: string;
  reviewedAt?: string;
  kyc?: KycDetails;
  createdAt: string;
}

export enum WalletTransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum WalletPaymentMethod {
  UPI = 'UPI',
  NEFT_RTGS = 'NEFT_RTGS',
  NETBANKING = 'NETBANKING',
  CARD = 'CARD',
  WALLET_BOOKING = 'WALLET_BOOKING',
  WALLET_REFUND = 'WALLET_REFUND',
  RTO_CHARGE = 'RTO_CHARGE',
  WEIGHT_DISCREPANCY = 'WEIGHT_DISCREPANCY',
  OPENING_CREDIT = 'OPENING_CREDIT',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

export interface WalletTransaction {
  _id: string;
  transactionId: string;
  sellerId: string;
  userId: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  paymentMethod: WalletPaymentMethod;
  referenceNote?: string;
  description: string;
  bookingId?: string;
  lrNumber?: string;
  createdAt: string;
}

export interface WalletSummary {
  walletBalance: number;
  transactions: WalletTransaction[];
}

export interface PaymentGatewayConfig {
  gateway: 'RAZORPAY';
  configured: boolean;
  webhookConfigured: boolean;
  currency: 'INR';
  minAmountInr: number;
  maxAmountInr: number;
  directLedgerAllowed: boolean;
}

export interface RazorpayCreateOrderResponse {
  orderRef: string;
  gateway: 'RAZORPAY';
  gatewayKeyId: string;
  gatewayOrderId: string;
  amountInr: number;
  amountPaise: number;
  currency: 'INR';
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
}

export interface PaymentOrder {
  _id: string;
  orderRef: string;
  gateway: 'RAZORPAY';
  amountInr: number;
  amountPaise: number;
  currency: 'INR';
  preferredMethod: WalletPaymentMethod;
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  status: 'CREATED' | 'PAID' | 'FAILED';
  walletTransactionId?: string;
  creditedAt?: string | null;
  createdAt: string;
}

export interface ServiceArea {
  city: string;
  pincode: string;
}

export interface Transporter {
  _id: string;
  userId: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
  serviceAreas: ServiceArea[];
  status: EntityStatus;
  approvalStatus?: TransporterApprovalStatus;
  rejectionReason?: string;
  reviewedAt?: string;
  kyc?: KycDetails;
  createdAt: string;
}

export interface TransportRoute {
  _id: string;
  originCity: string;
  originPincode: string;
  destinationCity: string;
  destinationPincode: string;
  distanceKm?: number;
  status: EntityStatus;
  createdAt: string;
}

export interface TransportRate {
  _id: string;
  transporterId: Transporter | string;
  routeId: TransportRoute | string;
  minimumFreight: number;
  ratePerKg: number;
  volumetricDivisor: number;
  rtoCharges: number;
  additionalCharges: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  estimatedDeliveryTime: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
  isSampleData: boolean;
}

export interface FreightBreakdown {
  actualWeightKg: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  volumetricDivisor: number;
  minimumFreight: number;
  ratePerKg: number;
  baseFreight: number;
  additionalCharges: number;
  platformCharge?: number;
  platformChargeType?: 'NONE' | 'FIXED' | 'PERCENTAGE';
  platformChargeValue?: number;
  platformChargeApplied?: boolean;
  rtoCharges: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  taxAmount: number;
  finalAmount: number;
  estimatedDeliveryTime?: string;
  isSampleRate?: boolean;
}

export interface RateQuote {
  rateId: string;
  routeId?: string;
  transporterId: string;
  transporterName: string;
  contactPerson: string;
  transporterPhone: string;
  estimatedDeliveryTime: string;
  isSampleData: boolean;
  breakdown: FreightBreakdown;
}

export interface PartyDetails {
  name: string;
  companyName?: string;
  contactPerson?: string;
  phone: string;
  address: string;
  state?: string;
  city: string;
  pincode: string;
  gstin?: string;
}

export interface PickupAddressSnapshot {
  addressId?: string | null;
  label?: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  address: string;
  state?: string;
  city: string;
  pincode: string;
  gstin?: string;
  isPrimary: boolean;
}

export interface ParcelDetails {
  description: string;
  actualWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  numberOfPackages: number;
}

export interface ScannedCarton {
  cartonNumber: number;
  cartonCode: string;
  scannedAt: string;
  scannedByUserId: string;
  location?: string;
}

export type BookingSource = 'PLATFORM' | 'TRANSPORTER_SELF';

export type BookingPaymentMode = 'INVOICE' | 'WALLET' | 'CASH' | 'TO_PAY';

export interface Booking {
  _id: string;
  bookingId: string;
  lrNumber: string;
  bookingSource?: BookingSource;
  createdByRole?: UserRole;
  invoiceNumber?: string;
  ewayBillNumber?: string;
  ewayBillValidUpto?: string | null;
  sellerId: SellerProfile | string | null;
  pickupAddressId?: string | null;
  pickupAddressSnapshot?: PickupAddressSnapshot | null;
  transporterId: Transporter | string;
  routeId: TransportRoute | string;
  rateId?: string;
  sender: PartyDetails;
  receiver: PartyDetails;
  parcel: ParcelDetails;
  origin: { city: string; pincode: string };
  destination: { city: string; pincode: string };
  actualWeight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  freight: number;
  platformCharge?: number;
  rtoCharges: number;
  tax: number;
  finalAmount: number;
  pricingSnapshot: FreightBreakdown;
  paymentMode?: BookingPaymentMode;
  status: BookingStatus;
  rejectionReason?: string;
  rejectedAt?: string | null;
  cancellationReason?: string;
  cancelledAt?: string | null;
  ndrReason?: string;
  ndrAttempts?: number;
  ndrRaisedAt?: string | null;
  rtoReason?: string;
  rtoInitiatedAt?: string | null;
  rtoDeliveredAt?: string | null;
  rtoBilledStatus?: 'NONE' | 'WALLET_DEBITED' | 'INVOICE_BILLED' | 'INVOICE_PENDING';
  whatsappOptIn?: boolean;
  scannedCartons?: ScannedCarton[];
  createdAt: string;
  updatedAt: string;
}

export enum WeightDiscrepancyStatus {
  OPEN = 'OPEN',
  ACCEPTED = 'ACCEPTED',
  DISPUTED = 'DISPUTED',
  RESOLVED_CHARGED = 'RESOLVED_CHARGED',
  RESOLVED_WAIVED = 'RESOLVED_WAIVED',
}

export interface WeightDiscrepancy {
  _id: string;
  discrepancyId: string;
  bookingId: string;
  lrNumber: string;
  declaredActualWeightKg: number;
  declaredVolumetricWeightKg?: number;
  declaredChargeableWeightKg: number;
  declaredFinalAmount: number;
  reportedActualWeightKg: number;
  reportedVolumetricWeightKg?: number;
  reportedChargeableWeightKg: number;
  revisedFinalAmount: number;
  additionalDifferenceAmount: number;
  scaleImageFileName: string;
  scaleImageMimeType: string;
  scaleImageFileSizeBytes: number;
  transporterRemarks?: string;
  sellerDisputeReason?: string;
  adminResolutionNotes?: string;
  paymentBilledStatus: 'NONE' | 'WALLET_DEBITED' | 'INVOICE_BILLED' | 'INVOICE_PENDING' | 'WAIVED';
  status: WeightDiscrepancyStatus;
  sellerRespondedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface PublicTrackingData {
  lrNumber: string;
  bookingId: string;
  status: BookingStatus;
  origin: { city: string; pincode: string };
  destination: { city: string; pincode: string };
  transporterName: string;
  numberOfPackages: number;
  estimatedDeliveryTime?: string;
  createdAt: string;
  updatedAt: string;
  timeline: Array<{
    _id: string;
    status: BookingStatus;
    location: string;
    description: string;
    eventTimestamp: string;
  }>;
  deliverySummary: {
    receiverName: string;
    deliveryDate: string;
  } | null;
}

export interface TrackingEvent {
  _id: string;
  bookingId: string;
  lrNumber: string;
  status: BookingStatus;
  location: string;
  description: string;
  remarks?: string;
  actorRole?: UserRole;
  eventTimestamp: string;
}

export interface DeliveryProof {
  _id: string;
  bookingId: string;
  lrNumber: string;
  imageFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  receiverName: string;
  deliveryDate: string;
  remarks?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export enum SupportTicketCategory {
  SHIPMENT_DELAY = 'SHIPMENT_DELAY',
  BILLING_WALLET = 'BILLING_WALLET',
  PICKUP_DELIVERY = 'PICKUP_DELIVERY',
  POD_DOCUMENTS = 'POD_DOCUMENTS',
  ACCOUNT_TECHNICAL = 'ACCOUNT_TECHNICAL',
  OTHER = 'OTHER',
}

export enum SupportTicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum SupportTicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export interface SupportMessage {
  _id: string;
  senderUserId: string;
  senderName: string;
  senderRole: UserRole;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  ticketNumber: string;
  createdByUserId: string;
  createdByRole: UserRole.SELLER | UserRole.TRANSPORTER;
  createdByName: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  lrNumber?: string;
  status: SupportTicketStatus;
  messages: SupportMessage[];
  lastMessageAt: string;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketListResponse extends PaginatedResponse<SupportTicket> {
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
  };
}

export interface TransporterSettlement {
  _id: string;
  settlementId: string;
  transporterId: string;
  periodLabel: string;
  bookingIds: string[];
  bookingCount: number;
  grossAmount: number;
  platformCommissionRate: number;
  platformFee: number;
  netPayoutAmount: number;
  payoutMethod: 'NEFT' | 'RTGS' | 'IMPS';
  utrNumber: string;
  status: 'PROCESSING' | 'SETTLED';
  settledAt: string;
}

export interface TransporterEarningsLedgerItem {
  _id: string;
  bookingId: string;
  lrNumber: string;
  bookingSource?: BookingSource;
  lane: string;
  status: BookingStatus;
  paymentMode: BookingPaymentMode;
  grossFreight: number;
  gstAmount: number;
  platformFee: number;
  netEarning: number;
  settlementState:
    | 'AWAITING_DELIVERY'
    | 'PENDING_PAYOUT'
    | 'SETTLED'
    | 'RTO_RETURN'
    | 'DIRECT_CUSTOMER';
  createdAt: string;
  updatedAt: string;
}

export interface TransporterEarningsResponse {
  commissionRatePercent: number;
  summary: {
    deliveredGrossFreight: number;
    deliveredPlatformFee: number;
    deliveredNetEarned: number;
    totalSettled: number;
    pendingSettlement: number;
    inTransitPipelineGross: number;
    inTransitPipelineNet: number;
  };
  personalBookingsSummary?: {
    totalBookings: number;
    deliveredBookings: number;
    grossBilled: number;
    platformCharges: number;
  };
  settlements: TransporterSettlement[];
  shipmentLedger: TransporterEarningsLedgerItem[];
}

export interface IntegratedRouteRate {
  id: string;
  rateId: string;
  routeId: string;
  transporterId: string;
  transporterName: string;
  transporterEmail?: string;
  transporterPhone?: string;
  transporterStatus?: string;
  isSharedRoute: boolean;
  originCity: string;
  originPincode: string;
  destinationCity: string;
  destinationPincode: string;
  distanceKm?: number;
  status: EntityStatus;
  isActive: boolean;
  ratePerKg: number;
  minimumFreight: number;
  additionalCharges: number;
  rtoCharges: number;
  volumetricDivisor: number;
  gstApplicable: boolean;
  gstRatePercent: number;
  estimatedDeliveryTime: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  lastModifiedByName?: string | null;
  lastModifiedByRole?: string | null;
  lastModifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RouteAuditLogEntry {
  _id: string;
  entityType: 'ROUTE_RATE' | 'ROUTE' | 'RATE' | 'PLATFORM_CONFIG';
  action: 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'PLATFORM_CHARGE_UPDATE';
  transporterId?: string | null;
  routeId?: string | null;
  rateId?: string | null;
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole;
  summary: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  createdAt: string;
}

export interface PlatformChargeRule {
  enabled: boolean;
  chargeType: 'FIXED' | 'PERCENTAGE';
  value: number;
  applyGstOnCharge: boolean;
}

export interface PlatformConfig {
  _id: string;
  key: 'DEFAULT';
  sellerBookingCharge: PlatformChargeRule;
  transporterBookingCharge: PlatformChargeRule;
  billingRuleNotes?: string;
  updatedByName?: string | null;
  updatedAt?: string;
}

export enum NotificationCategory {
  BOOKING = 'BOOKING',
  SHIPMENT = 'SHIPMENT',
  WALLET = 'WALLET',
  SUPPORT = 'SUPPORT',
  SELLER_KYC = 'SELLER_KYC',
}

export interface AppNotification {
  _id: string;
  recipientUserId: string;
  recipientRole: UserRole;
  category: NotificationCategory;
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse extends PaginatedResponse<AppNotification> {
  unreadCount: number;
}

export enum KycVerificationStatus {
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum KycDocumentType {
  GST_CERTIFICATE = 'GST_CERTIFICATE',
  PAN_CARD = 'PAN_CARD',
  CANCELLED_CHEQUE = 'CANCELLED_CHEQUE',
  ADDRESS_PROOF = 'ADDRESS_PROOF',
}

export enum KycEntityType {
  SELLER = 'SELLER',
  TRANSPORTER = 'TRANSPORTER',
}

export interface KycDocumentMeta {
  docType: KycDocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface KycDetails {
  status: KycVerificationStatus;
  panNumber?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  documents: KycDocumentMeta[];
}

export interface SelfKycResponse {
  entityType: KycEntityType;
  profileId: string;
  displayName: string;
  gstNumber: string;
  email: string;
  phone: string;
  kyc: KycDetails;
}

export interface KycQueueItem {
  entityType: KycEntityType;
  profileId: string;
  displayName: string;
  contactName: string;
  email: string;
  phone: string;
  gstNumber: string;
  city: string;
  accountStatus: string;
  kyc: KycDetails;
  createdAt: string;
  updatedAt: string;
}

export interface KycQueueResponse extends PaginatedResponse<KycQueueItem> {
  summary: {
    total: number;
    pending: number;
    verified: number;
    rejected: number;
    notSubmitted: number;
  };
}

export interface AdminSellerWalletResponse {
  sellerId: string;
  businessName: string;
  ownerName: string;
  email: string;
  gstNumber: string;
  approvalStatus: SellerApprovalStatus;
  walletBalance: number;
  transactions: WalletTransaction[];
}

export interface AdminSettlementBankAccount {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifscCode: string;
}

export interface AdminSettlementCarrierSummary {
  _id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstNumber: string;
  status: EntityStatus;
  kycStatus: KycVerificationStatus;
  bankAccount: AdminSettlementBankAccount;
  pendingCount: number;
  pendingGrossFreight: number;
  pendingPlatformFee: number;
  pendingNetPayout: number;
  oldestDeliveredAt: string | null;
}

export interface AdminSettlementRecord {
  _id: string;
  settlementId: string;
  transporterId:
    | string
    | {
        _id: string;
        companyName: string;
        contactPerson?: string;
        gstNumber?: string;
      };
  periodLabel: string;
  bookingIds: string[];
  bookingCount: number;
  grossAmount: number;
  platformCommissionRate: number;
  platformFee: number;
  netPayoutAmount: number;
  payoutMethod: 'NEFT' | 'RTGS' | 'IMPS';
  utrNumber: string;
  status: 'PROCESSING' | 'SETTLED';
  settledAt: string;
  remarks?: string;
}

export interface AdminSettlementsOverviewResponse {
  commissionRatePercent: number;
  summary: {
    totalPendingPayout: number;
    totalPendingBookings: number;
    totalSettledAmount: number;
    settledBatchCount: number;
    transportersAwaitingPayout: number;
  };
  transporters: AdminSettlementCarrierSummary[];
  settlements: AdminSettlementRecord[];
}

export interface AdminTransporterPendingBooking {
  _id: string;
  bookingId: string;
  lrNumber: string;
  lane: string;
  paymentMode: 'INVOICE' | 'WALLET';
  grossFreight: number;
  platformFee: number;
  netEarning: number;
  deliveredAt: string;
  createdAt: string;
}

export interface AdminTransporterPendingResponse {
  commissionRatePercent: number;
  transporter: {
    _id: string;
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    gstNumber: string;
    status: EntityStatus;
    kycStatus: KycVerificationStatus;
    bankAccount: AdminSettlementBankAccount;
  };
  pendingBookings: AdminTransporterPendingBooking[];
  totals: {
    bookingCount: number;
    grossAmount: number;
    platformFee: number;
    netPayoutAmount: number;
  };
  recentSettlements: TransporterSettlement[];
}

export type IncidentSource = 'BACKEND_API' | 'FRONTEND_UI' | 'DATABASE' | 'PROCESS' | 'SUPPORT';
export type IncidentSeverity = 'WARN' | 'ERROR' | 'FATAL';

export interface SystemIncidentRecord {
  _id: string;
  source: IncidentSource;
  severity: IncidentSeverity;
  errorCode: string;
  message: string;
  route?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  userId?: string;
  userRole?: string;
  stack?: string;
  dedupKey: string;
  occurrenceCount: number;
  lastOccurredAt: string;
  notifiedChannels: string[];
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAlertsResponse {
  items: SystemIncidentRecord[];
  totalCount: number;
  criticalLast24h: number;
  configuration: {
    discordConfigured: boolean;
    genericWebhookConfigured: boolean;
    minLevel: string;
  };
}

export interface TestAlertResponse {
  discordConfigured: boolean;
  genericWebhookConfigured: boolean;
  minLevel: string;
  incidentId?: string;
  notifiedChannels: string[];
}

export enum WhatsAppEventType {
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  REACHED_DESTINATION = 'REACHED_DESTINATION',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
}

export type WhatsAppNotificationStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'SKIPPED';

export interface WhatsAppEventTemplateConfig {
  eventType: WhatsAppEventType;
  enabled: boolean;
  templateName: string;
  languageCode: string;
  statusLabel: string;
  updateSummaryTemplate: string;
}

export interface WhatsAppConfigData {
  _id: string;
  key: 'DEFAULT';
  enabled: boolean;
  apiVersion: string;
  phoneNumberId: string;
  businessAccountId: string;
  defaultCountryCode: string;
  requireCustomerOptIn: boolean;
  recipients: {
    sendToReceiver: boolean;
    sendToSender: boolean;
    sendToSeller: boolean;
  };
  retryPolicy: {
    maxRetries: number;
    backoffSeconds: number;
  };
  events: WhatsAppEventTemplateConfig[];
  updatedByName?: string | null;
  updatedAt?: string;
}

export interface WhatsAppCredentialsStatus {
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  businessAccountConfigured: boolean;
  appSecretConfigured: boolean;
  webhookVerifyTokenConfigured: boolean;
  webhookUrl: string;
}

export interface WhatsAppConfigResponse {
  config: WhatsAppConfigData;
  credentials: WhatsAppCredentialsStatus;
}

export interface WhatsAppNotificationLog {
  _id: string;
  notificationId: string;
  bookingId: string;
  lrNumber: string;
  bookingSource: BookingSource;
  eventType: WhatsAppEventType;
  recipientRole: 'RECEIVER' | 'SENDER' | 'SELLER';
  recipientName: string;
  recipientPhone: string;
  templateName: string;
  languageCode: string;
  templateVariables: {
    brandName: string;
    customerName: string;
    lrNumber: string;
    statusLabel: string;
    pickupLocation: string;
    destinationLocation: string;
    latestUpdate: string;
    trackingUrl: string;
  };
  messagePreview: string;
  status: WhatsAppNotificationStatus;
  skipReason?: string;
  metaMessageId?: string;
  attemptCount: number;
  maxRetries: number;
  nextRetryAt?: string | null;
  lastAttemptAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastErrorHttpStatus?: number;
  retryableError: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppLogsResponse extends PaginatedResponse<WhatsAppNotificationLog> {
  summary: {
    total: number;
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    skipped: number;
  };
}



