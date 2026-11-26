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

export const ALLOWED_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.BOOKED]: [BookingStatus.ACCEPTED, BookingStatus.REJECTED],
  [BookingStatus.ACCEPTED]: [BookingStatus.DISPATCHED],
  [BookingStatus.DISPATCHED]: [BookingStatus.ARRIVED],
  [BookingStatus.ARRIVED]: [
    BookingStatus.OUT_FOR_DELIVERY,
    BookingStatus.DELIVERED,
    BookingStatus.NDR,
    BookingStatus.RTO_INITIATED,
  ],
  [BookingStatus.OUT_FOR_DELIVERY]: [
    BookingStatus.DELIVERED,
    BookingStatus.NDR,
    BookingStatus.RTO_INITIATED,
  ],
  [BookingStatus.NDR]: [BookingStatus.DELIVERED, BookingStatus.RTO_INITIATED],
  [BookingStatus.RTO_INITIATED]: [BookingStatus.RTO_DELIVERED],
  [BookingStatus.DELIVERED]: [],
  [BookingStatus.REJECTED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.RTO_DELIVERED]: [],
};

export const STATUS_DESCRIPTIONS: Record<BookingStatus, string> = {
  [BookingStatus.BOOKED]: 'Shipment booked and LR generated',
  [BookingStatus.ACCEPTED]: 'Booking picked up and accepted by assigned transporter',
  [BookingStatus.DISPATCHED]: 'Shipment dispatched and in transit from origin hub',
  [BookingStatus.ARRIVED]: 'Shipment reached destination hub',
  [BookingStatus.OUT_FOR_DELIVERY]: 'Shipment is out for delivery to consignee',
  [BookingStatus.DELIVERED]: 'Shipment delivered to consignee',
  [BookingStatus.REJECTED]: 'Booking rejected by assigned transporter',
  [BookingStatus.CANCELLED]: 'Booking cancelled by seller prior to dispatch',
  [BookingStatus.NDR]: 'Delivery attempt failed — Non-Delivery Report (NDR) raised',
  [BookingStatus.RTO_INITIATED]: 'Return to Origin (RTO) initiated back to consignor',
  [BookingStatus.RTO_DELIVERED]: 'Returned shipment delivered back to consignor (RTO completed)',
};

export enum WhatsAppEventType {
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  REACHED_DESTINATION = 'REACHED_DESTINATION',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
}

export const WHATSAPP_STATUS_TO_EVENT: Partial<Record<BookingStatus, WhatsAppEventType>> = {
  [BookingStatus.BOOKED]: WhatsAppEventType.BOOKING_CONFIRMED,
  [BookingStatus.ACCEPTED]: WhatsAppEventType.PICKED_UP,
  [BookingStatus.DISPATCHED]: WhatsAppEventType.IN_TRANSIT,
  [BookingStatus.ARRIVED]: WhatsAppEventType.REACHED_DESTINATION,
  [BookingStatus.OUT_FOR_DELIVERY]: WhatsAppEventType.OUT_FOR_DELIVERY,
  [BookingStatus.DELIVERED]: WhatsAppEventType.DELIVERED,
};

export const MAX_DELIVERY_PROOF_BYTES = 5 * 1024 * 1024;
export const ALLOWED_DELIVERY_PROOF_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

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

export const MAX_KYC_DOC_BYTES = 5 * 1024 * 1024;
export const ALLOWED_KYC_DOC_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

