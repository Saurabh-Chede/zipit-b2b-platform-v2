# Database Schema & Indexing Documentation

All 15 MongoDB collections managed via Mongoose (`strictQuery: true`):

---

### 1. `users` (`User`)
- **Fields:** `name`, `email`, `passwordHash` (`select: false`), `role` (`ADMIN | SELLER | TRANSPORTER`), `isActive`, `emailVerified` (default `true`), `passwordChangedAt`, `tokenVersion` (default `0`, incremented on password reset), `lastLoginAt`, `timestamps`.
- **Indexes:** `{ email: 1 }` (unique), `{ role: 1, isActive: 1 }`.

### 2. `sellerprofiles` (`SellerProfile`)
- **Fields:** `userId` (ref `User`), `businessName`, `ownerName`, `email`, `phone`, `gstNumber` (15-char GSTIN regex), `businessAddress`, `city`, `pincode` (6-digit), `approvalStatus` (`PENDING | APPROVED | REJECTED`), `walletBalance` (number `>= 0`, default `0`), `rejectionReason`, `reviewedBy` (ref `User`), `reviewedAt`, embedded `kyc` (`status`: `NOT_SUBMITTED | PENDING | VERIFIED | REJECTED`, `panNumber`, `bankAccountHolder`, `bankAccountNumber`, `ifscCode`, `bankName`, `documents[]` with `docType`, `storageKey` stripped from JSON, `fileName`, `mimeType`, `sizeBytes`, `uploadedAt`, `submittedAt`, `reviewedBy`, `reviewedAt`, `rejectionReason`), `timestamps`.
- **Indexes:** `{ userId: 1 }` (unique), `{ gstNumber: 1 }` (unique), `{ approvalStatus: 1, createdAt: -1 }`, `{ 'kyc.status': 1, updatedAt: -1 }`.

### 3. `transporters` (`Transporter`)
- **Fields:** `userId` (ref `User`), `companyName`, `contactPerson`, `email`, `phone`, `gstNumber`, `address`, `serviceAreas` (`[{ city, pincode }]`), `status` (`ACTIVE | INACTIVE`), embedded `kyc` (same compliance & bank verification sub-schema as `SellerProfile`), `timestamps`.
- **Indexes:** `{ userId: 1 }` (unique), `{ gstNumber: 1 }` (unique), `{ status: 1, companyName: 1 }`, `{ 'kyc.status': 1, updatedAt: -1 }`.

### 4. `transportroutes` (`TransportRoute`)
- **Fields:** `originCity`, `originPincode`, `destinationCity`, `destinationPincode`, `distanceKm`, `status` (`ACTIVE | INACTIVE`), `timestamps`.
- **Indexes:** `{ originPincode: 1, destinationPincode: 1 }` (unique), `{ status: 1, originCity: 1, destinationCity: 1 }`.

### 5. `transportrates` (`TransportRate`)
- **Fields:** `transporterId` (ref `Transporter`), `routeId` (ref `TransportRoute`), `minimumFreight`, `ratePerKg`, `volumetricDivisor`, `rtoCharges`, `additionalCharges`, `gstApplicable`, `gstRatePercent`, `estimatedDeliveryTime`, `effectiveFrom`, `effectiveTo`, `isActive`, `isSampleData`, `timestamps`.
- **Indexes:** `{ routeId: 1, isActive: 1, effectiveFrom: 1, effectiveTo: 1 }`, `{ transporterId: 1, routeId: 1, isActive: 1 }`.

### 6. `bookings` (`Booking`)
- **Fields:** `bookingId` (`ZPT-BK-...`), `lrNumber` (`ZIPIT-LR-...`), `idempotencyKey`, `duplicateFingerprint`, `sellerId`, `transporterId`, `routeId`, `rateId`, `sender` (`{ name, phone, address, city, pincode }`), `receiver` (`{ name, phone, address, city, pincode }`), `parcel` (`{ description, actualWeightKg, lengthCm, widthCm, heightCm, numberOfPackages }`), `origin`, `destination`, `actualWeight`, `volumetricWeight`, `chargeableWeight`, `freight`, `rtoCharges`, `tax`, `finalAmount`, `pricingSnapshot`, `paymentMode` (`INVOICE | WALLET`), `status` (`BOOKED | ACCEPTED | DISPATCHED | ARRIVED | DELIVERED | REJECTED | CANCELLED | NDR | RTO_INITIATED | RTO_DELIVERED`), `rejectionReason`, `rejectedAt`, `cancellationReason`, `cancelledAt`, `ndrReason`, `ndrAttempts`, `ndrRaisedAt`, `rtoReason`, `rtoInitiatedAt`, `rtoDeliveredAt`, `rtoBilledStatus` (`NONE | WALLET_DEBITED | INVOICE_BILLED | INVOICE_PENDING`), `scannedCartons` (`[{ cartonNumber, cartonCode, scannedAt, scannedByUserId, location }]`), `timestamps`.
- **Indexes:**
  - `{ bookingId: 1 }` (unique)
  - `{ lrNumber: 1 }` (unique)
  - `{ sellerId: 1, idempotencyKey: 1 }` (unique, partial filter `idempotencyKey` string)
  - `{ sellerId: 1, duplicateFingerprint: 1, status: 1, createdAt: -1 }`
  - `{ sellerId: 1, status: 1, createdAt: -1 }`
  - `{ transporterId: 1, status: 1, createdAt: -1 }`
  - `{ status: 1, createdAt: -1 }`

### 7. `trackingevents` (`TrackingEvent`) — Append-Only
- **Fields:** `bookingId` (ref `Booking`), `lrNumber`, `status`, `location`, `description`, `remarks`, `actorUserId`, `actorRole`, `eventTimestamp`, `createdAt`.
- **Protection:** Mongoose `pre` hooks reject `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, and `findOneAndDelete`.
- **Indexes:** `{ bookingId: 1, eventTimestamp: 1 }`, `{ lrNumber: 1, eventTimestamp: 1 }`.

### 8. `deliveryproofs` (`DeliveryProof`)
- **Fields:** `bookingId` (ref `Booking`), `lrNumber`, `transporterId`, `imageFileName`, `imageStorageKey` (excluded from JSON), `mimeType`, `fileSizeBytes`, `receiverName`, `deliveryDate`, `remarks`, `uploadedBy`, `timestamps`.
- **Indexes:** `{ bookingId: 1 }` (unique), `{ lrNumber: 1 }`, `{ transporterId: 1 }`.

### 9. `wallettransactions` (`WalletTransaction`)
- **Fields:** `transactionId`, `sellerId` (ref `SellerProfile`), `userId` (ref `User`), `type` (`CREDIT | DEBIT`), `amount`, `balanceAfter`, `paymentMethod` (`UPI | NEFT_RTGS | NETBANKING | CARD | WALLET_BOOKING | WALLET_REFUND | RTO_CHARGE | OPENING_CREDIT | ADMIN_ADJUSTMENT`), `referenceNote`, `description`, `bookingId` (ref `Booking`), `lrNumber`, `idempotencyKey`, `timestamps`.
- **Indexes:**
  - `{ transactionId: 1 }` (unique)
  - `{ sellerId: 1, createdAt: -1 }`
  - `{ sellerId: 1, idempotencyKey: 1 }` (unique, partial filter `idempotencyKey` string)

### 10. `transportersettlements` (`TransporterSettlement`)
- **Fields:** `settlementId`, `transporterId` (ref `Transporter`), `periodLabel`, `bookingIds` (`[ref Booking]`), `bookingCount`, `grossAmount`, `platformCommissionRate` (default `5`), `platformFee`, `netPayoutAmount`, `payoutMethod` (`NEFT | RTGS | IMPS`), `utrNumber`, `status` (`PROCESSING | SETTLED`), `settledAt`, `settledByUserId` (ref `User`), `remarks`, `timestamps`.
- **Indexes:** `{ settlementId: 1 }` (unique), `{ utrNumber: 1 }` (unique), `{ transporterId: 1, settledAt: -1 }`.

### 11. `supporttickets` (`SupportTicket`)
- **Fields:** `ticketNumber` (`ZPT-SUP-...`), `createdByUserId` (ref `User`), `createdByRole` (`SELLER | TRANSPORTER`), `createdByName`, `subject`, `category` (`SHIPMENT_DELAY | BILLING_WALLET | PICKUP_DELIVERY | POD_DOCUMENTS | ACCOUNT_TECHNICAL | OTHER`), `priority` (`LOW | MEDIUM | HIGH | URGENT`), `lrNumber`, `status` (`OPEN | IN_PROGRESS | RESOLVED | CLOSED`), `messages` (`[{ senderUserId, senderName, senderRole, body, createdAt }]`), `lastMessageAt`, `resolvedAt`, `timestamps`.
- **Indexes:** `{ ticketNumber: 1 }` (unique), `{ createdByUserId: 1, lastMessageAt: -1 }`, `{ status: 1, lastMessageAt: -1 }`.

### 12. `systemincidents` (`SystemIncident`)
- **Fields:** `source` (`BACKEND_API | FRONTEND_UI | DATABASE | PROCESS | SUPPORT`), `severity` (`WARN | ERROR | FATAL`), `errorCode`, `message`, `route`, `method`, `statusCode`, `requestId`, `userId`, `userRole`, `stack`, `dedupKey`, `occurrenceCount`, `lastOccurredAt`, `notifiedChannels` (`['DISCORD', 'WEBHOOK']`), `meta`, `timestamps`.
- **Indexes:**
  - `{ createdAt: 1 }` with `{ expireAfterSeconds: 2592000 }` (**30-day automatic TTL expiry**)
  - `{ severity: 1, lastOccurredAt: -1 }`
  - `{ dedupKey: 1 }`, `{ source: 1 }`, `{ errorCode: 1 }`, `{ lastOccurredAt: -1 }`

### 13. `notifications` (`Notification`)
- **Fields:** `recipientUserId` (ref `User`), `recipientRole` (`ADMIN | SELLER | TRANSPORTER`), `category` (`BOOKING | SHIPMENT | WALLET | SUPPORT | SELLER_KYC`), `title`, `message`, `link`, `entityType`, `entityId`, `isRead` (default `false`), `readAt`, `timestamps`.
- **Indexes:**
  - `{ recipientUserId: 1, createdAt: -1 }`
  - `{ recipientUserId: 1, isRead: 1, createdAt: -1 }`
  - `{ createdAt: 1 }` with `{ expireAfterSeconds: 5184000 }` (**60-day automatic TTL expiry**)

### 14. `paymentorders` (`PaymentOrder`)
- **Fields:** `orderRef` (`ZPT-PAY-...`), `gateway` (`RAZORPAY`), `sellerId` (ref `SellerProfile`), `userId` (ref `User`), `amountInr`, `amountPaise`, `currency` (`INR`), `preferredMethod`, `gatewayOrderId`, `gatewayPaymentId`, `paidMethod`, `status` (`CREATED | PAID | FAILED`), `walletTransactionId`, `creditedAt`, `failureReason`, `timestamps`.
- **Indexes:**
  - `{ orderRef: 1 }` (unique)
  - `{ gatewayOrderId: 1 }` (unique)
  - `{ gatewayPaymentId: 1 }` (unique, partial filter `gatewayPaymentId` string)
  - `{ sellerId: 1, createdAt: -1 }`

### 15. `otpverifications` (`OtpVerification`)
- **Fields:** `email`, `purpose` (`SIGNUP_EMAIL | PASSWORD_RESET`), `otpHash` (HMAC-SHA256 digest), `attempts` (max 5), `resendCount`, `lastSentAt`, `expiresAt`, `consumedAt`, `timestamps`.
- **Indexes:**
  - `{ email: 1, purpose: 1 }` (unique)
  - `{ expiresAt: 1 }` with `{ expireAfterSeconds: 0 }` (**10-minute automatic TTL expiry**)

