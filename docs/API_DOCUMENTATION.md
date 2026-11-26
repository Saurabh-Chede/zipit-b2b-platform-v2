# REST API Documentation (`/api/v1`)

All protected endpoints authenticate via HTTP-only `zipit_token` cookie (or `Authorization: Bearer <token>`). Cookie-authenticated state-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) require `X-Requested-With: XMLHttpRequest` or matching `X-CSRF-Token`.

---

## Health & Liveness

- `GET /api/health` (Public) — Lightweight server liveness check returning `{ success: true, service: "zipit-b2b-transport", status: "healthy", timestamp }` (`200 OK`). Ideal for UptimeRobot / Better Stack monitoring.

---

## Authentication (`/api/v1/auth`)

- `POST /api/v1/auth/login` (Public) — Body `{ email, password }`. Sets `zipit_token` + `zipit_csrf` cookies and returns `{ user, profile, csrfToken }`.
- `POST /api/v1/auth/logout` (Public) — Clears `zipit_token` and `zipit_csrf` cookies.
- `GET /api/v1/auth/me` (Authenticated) — Returns current `user` and role-specific `profile`.
- `POST /api/v1/auth/signup-otp` (Public, rate-limited `15/15m`) — Body `{ email, ownerName?, gstNumber? }`. Checks email/GST uniqueness (`409`) and sends a 6-digit HMAC-hashed verification OTP via SMTP (or returns `sandboxOtp` in non-production preview when SMTP is unset).
- `POST /api/v1/auth/forgot-password` (Public, rate-limited `15/15m`) — Body `{ email }`. Issues a 6-digit password-reset OTP via SMTP (`200 OK` returned even for unknown/inactive emails to prevent account enumeration).
- `POST /api/v1/auth/reset-password` (Public, rate-limited `15/15m`) — Body `{ email, otp, newPassword }`. Enforces max 5 failed attempts (`429 OTP_MAX_ATTEMPTS_EXCEEDED`), atomically consumes the OTP, hashes the new password, and increments `tokenVersion` to immediately invalidate prior active sessions.

---

## Sellers (`/api/v1/sellers`)

- `POST /api/v1/sellers/register` (Public) — Requires verified 6-digit `otp` from `/api/v1/auth/signup-otp`. Registers `User` (`emailVerified: true`) + `SellerProfile` in `PENDING` status inside an atomic transaction.
- `GET /api/v1/sellers/me` (`SELLER`) — Returns own `SellerProfile` (including `walletBalance` and `rejectionReason` if rejected).
- `GET /api/v1/sellers` (`ADMIN`) — Paginated seller list (`?status=PENDING|APPROVED|REJECTED&search=...&page=1&limit=20`).
- `GET /api/v1/sellers/pending` (`ADMIN`) — Pending seller applications.
- `PATCH /api/v1/sellers/:id/approve` (`ADMIN`) — Approves seller (`APPROVED`).
- `PATCH /api/v1/sellers/:id/reject` (`ADMIN`) — Body `{ "rejectionReason": "..." }`.
- `GET /api/v1/sellers/:id/wallet` (`ADMIN`) — Returns seller's current `walletBalance` and latest 25 `WalletTransaction` audit entries.
- `POST /api/v1/sellers/:id/wallet-adjust` (`ADMIN`) — Body `{ type: "CREDIT" | "DEBIT", amount, reason, referenceNote? }` with `Idempotency-Key` support. Atomically updates balance (blocks negative balance on debit), records `ADMIN_ADJUSTMENT` ledger entry, and notifies Seller in real time.

---

## Seller Wallet (`/api/v1/wallet`)

- `GET /api/v1/wallet` (`SELLER`) — Returns `{ walletBalance, transactions }` (latest transactions).
- `POST /api/v1/wallet/recharge` (`SELLER`) — Sandbox direct ledger top-up (`UPI`, `NEFT_RTGS`, `NETBANKING`, `CARD`) with `Idempotency-Key` header support (`403 DIRECT_RECHARGE_DISABLED` in `NODE_ENV=production`, where live Razorpay Checkout is required).

---

## Live Payment Gateway (`/api/v1/payments`) — Razorpay

- `GET /api/v1/payments/config` (Authenticated) — Returns safe gateway readiness metadata (`gateway`, `configured`, `webhookConfigured`, `currency`, `minAmountInr`, `maxAmountInr`, `directLedgerAllowed`). Secrets are never exposed.
- `GET /api/v1/payments/orders` (`SELLER`) — Lists recent `PaymentOrder` attempts for the logged-in seller.
- `POST /api/v1/payments/orders` (`SELLER`) — Body `{ amount, paymentMethod }` (`100`–`500000` INR). Calls Razorpay Orders API (`https://api.razorpay.com/v1/orders`), persists `PaymentOrder` (`CREATED`), and returns `{ orderRef, gatewayKeyId, gatewayOrderId, amountInr, amountPaise, currency, prefill }`. Returns `503 PAYMENT_GATEWAY_NOT_CONFIGURED` if gateway keys are unset.
- `POST /api/v1/payments/verify` (`SELLER`) — Body `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentMethod? }`. Enforces Seller ownership (`403 PAYMENT_ORDER_FORBIDDEN`), verifies HMAC-SHA256 signature using `crypto.timingSafeEqual`, and atomically credits `walletBalance` + appends `WalletTransaction` (`idempotencyKey: rzp-order:<gatewayOrderId>`) with replay protection.
- `POST /api/v1/payments/webhook` (Public, HMAC-authenticated via `x-razorpay-signature`) — Verifies raw UTF-8 payload signature against `RAZORPAY_WEBHOOK_SECRET` using `crypto.timingSafeEqual`. Handles `payment.captured`, `order.paid` (validates captured paise `>= amountPaise`), and `payment.failed` idempotently.

---

## Transporters — Admin & Seller Directory (`/api/v1/transporters`)

- `POST /api/v1/transporters` (`ADMIN`) — Creates transporter profile and login credentials (`User` + `Transporter`).
- `GET /api/v1/transporters` (`ADMIN`, `SELLER`) — Lists transporters (sellers see `ACTIVE` carriers only).
- `GET /api/v1/transporters/:id` (`ADMIN`, `SELLER`) — Get single transporter.
- `PATCH /api/v1/transporters/:id` (`ADMIN`) — Edit details, status (`ACTIVE`/`INACTIVE`), service areas, or reset password.

---

## Transporter Operations (`/api/v1/transporter`) — `TRANSPORTER` Only

- `GET /api/v1/transporter/bookings` — Paginated bookings assigned strictly to the logged-in transporter (`?status=...&lrNumber=...&page=1&limit=20`).
- `POST /api/v1/transporter/cartons/scan` — Global barcode scanner intake (`{ cartonCode, location? }`). Resolves `<LR>-C0X` across owned bookings (or plain `<LR>` for single-box shipments), records scan timestamp & user, rejects out-of-range/rejected shipments, and returns `{ booking, scannedCarton, alreadyScanned, scannedCount, totalPackages }`.
- `GET /api/v1/transporter/profile` — Returns logged-in transporter's company profile & service areas.
- `PATCH /api/v1/transporter/profile` — Updates allowed self-service profile fields (`companyName`, `contactPerson`, `phone`, `address`).
- `POST /api/v1/transporter/service-areas` — Adds a single `{ city, pincode }` service area.
- `POST /api/v1/transporter/service-areas/import` — Bulk merges & deduplicates up to 500 `{ city, pincode }` rows parsed from CSV/Excel (`addedCount`, `duplicateCount`).
- `DELETE /api/v1/transporter/service-areas` — Removes `{ city, pincode }` while enforcing at least 1 active service area remains.
- `GET /api/v1/transporter/earnings` — Returns 5% commission breakdown, summary (`totalNetEarned`, `totalSettled`, `pendingSettlement`, `inTransitPipeline`), `settlements`, and `shipmentLedger`.

---

## Transporter Payout Settlements (`/api/v1/settlements`) — `ADMIN` Only

- `GET /api/v1/settlements` — Returns platform settlement totals, per-transporter unsettled `DELIVERED` booking summaries + KYC bank account details, and recent UTR settlement batches.
- `GET /api/v1/settlements/transporters/:transporterId/pending` — Lists unsettled `DELIVERED` bookings for a carrier with server-computed gross freight, 5% fee, and net payout totals.
- `POST /api/v1/settlements` — Body `{ transporterId, bookingIds, payoutMethod: "NEFT" | "RTGS" | "IMPS", utrNumber, periodLabel, remarks? }`. Recomputes totals server-side inside a database transaction, blocks duplicate UTRs (`409 DUPLICATE_UTR_NUMBER`) and already-settled bookings (`409 BOOKING_ALREADY_SETTLED`), saves `TransporterSettlement` (`SETTLED`), and notifies the carrier.

---

## Routes & Rate Cards (`/api/v1/routes`, `/api/v1/rates`)

- `POST /api/v1/routes` (`ADMIN`) — Create origin/destination pincode route.
- `GET /api/v1/routes` (`ADMIN`, `SELLER`, `TRANSPORTER`) — List routes.
- `PATCH /api/v1/routes/:id` (`ADMIN`) — Update route details or status.
- `POST /api/v1/rates` (`ADMIN`) — Configure transporter rate for a route (`minimumFreight`, `ratePerKg`, `volumetricDivisor`, `rtoCharges`, `additionalCharges`, `gstApplicable`, `gstRatePercent`, `estimatedDeliveryTime`, `effectiveFrom`, `effectiveTo`).
- `GET /api/v1/rates` (`ADMIN`, `SELLER`, `TRANSPORTER`) — List configured rate cards.
- `POST /api/v1/rates/calculate` (`ADMIN`, `SELLER`) — Body `{ routeId, actualWeightKg, lengthCm, widthCm, heightCm, numberOfPackages }`. Returns matched active carrier quotes with weight breakdown, freight, GST, `finalAmount`, and separate `rtoCharges`.

---

## Bookings, LR PDF, Carton Barcodes & POD (`/api/v1/bookings`)

- `POST /api/v1/bookings` (`SELLER`, Approved only) — Creates booking with server-computed pricing snapshot, `paymentMode` (`WALLET` or `INVOICE`), and `idempotencyKey` deduplication. Atomically debits `walletBalance` when `paymentMode === 'WALLET'`. Generates `bookingId` (`ZPT-BK-...`), `lrNumber` (`ZIPIT-LR-...`), and initial `BOOKED` tracking event.
- `GET /api/v1/bookings` (`ADMIN`, `SELLER`, `TRANSPORTER`) — Role-scoped paginated booking list (`?status=...&lrNumber=...&page=1&limit=20`).
- `GET /api/v1/bookings/:id` (`ADMIN`, Owning `SELLER`, Assigned `TRANSPORTER`) — Returns booking, pricing snapshot, `scannedCartons`, chronological tracking events, and delivery proof metadata.
- `GET /api/v1/bookings/:id/lr` (`ADMIN`, Owning `SELLER`, Assigned `TRANSPORTER`) — Streams downloadable `application/pdf` Lorry Receipt with Code 128 barcode.
- `GET /api/v1/bookings/:id/barcode` (`ADMIN`, Owning `SELLER`, Assigned `TRANSPORTER`) — Streams Code 128 PNG barcode encoding `lrNumber`.
- `GET /api/v1/bookings/:id/cartons/:cartonNumber/barcode` (`ADMIN`, Owning `SELLER`, Assigned `TRANSPORTER`) — Streams Code 128 PNG barcode label for carton `1..numberOfPackages` (`<LR>-C01`, ...).
- `POST /api/v1/bookings/:id/cartons/scan` (`Assigned TRANSPORTER`) — Body `{ cartonNumber, location? }`. Marks specific carton scanned inside a booking manifest.
- `PATCH /api/v1/bookings/:id/status` (`Assigned TRANSPORTER`) — Body `{ status: "ACCEPTED" | "DISPATCHED" | "ARRIVED" | "DELIVERED" | "REJECTED" | "NDR" | "RTO_INITIATED" | "RTO_DELIVERED", location, remarks }`. Enforces valid transitions:
  - `REJECTED` (from `BOOKED` only) requires `remarks >= 4` chars and automatically issues a `WALLET_REFUND` when `paymentMode === 'WALLET'`.
  - `NDR` (from `ARRIVED`) requires `remarks >= 4` chars, increments `ndrAttempts`, notifies Seller & Admins.
  - `RTO_INITIATED` (from `ARRIVED` or `NDR`) requires `remarks >= 4` chars and applies `booking.rtoCharges` (`RTO_CHARGE` wallet debit when `WALLET` has balance, else `INVOICE_PENDING` / `INVOICE_BILLED`).
  - `RTO_DELIVERED` completes return delivery from `RTO_INITIATED`.
- `POST /api/v1/bookings/:id/cancel` (`Owning SELLER`) — Body `{ reason }` (`>= 4` chars). Allows Seller self-cancellation only while status is `BOOKED` or `ACCEPTED` (pre-dispatch). Automatically issues `WALLET_REFUND` when `paymentMode === 'WALLET'`, appends immutable `CANCELLED` tracking event, and notifies Assigned Transporter + Admins.
- `POST /api/v1/bookings/:id/ndr-action` (`Owning SELLER`) — Body `{ action: "REATTEMPT" | "INITIATE_RTO", remarks }` (`>= 4` chars) while booking status is `NDR`. `REATTEMPT` logs instructions on tracking timeline & notifies Transporter; `INITIATE_RTO` transitions `NDR → RTO_INITIATED`, applies `rtoCharges`, and notifies Transporter & Admins.
- `POST /api/v1/bookings/:id/delivery-proof` (`Assigned TRANSPORTER`) — `multipart/form-data` (`image`, `receiverName`, `deliveryDate`, `remarks`, optional `markDelivered` from `ARRIVED` or `NDR`).
- `GET /api/v1/bookings/:id/delivery-proof/image` (`ADMIN`, Owning `SELLER`, Assigned `TRANSPORTER`) — Streams private POD image after authorization check.

---

## Tracking (`/api/v1/tracking`)

- `GET /api/v1/tracking/:lrNumber` (`ADMIN`, Owning `SELLER`, Assigned `TRANSPORTER`) — Returns LR summary, latest update, and chronological `TrackingEvent` timeline.

---

## Support Desk (`/api/v1/support`)

- `GET /api/v1/support` (Authenticated) — Lists role-scoped tickets (`ADMIN` sees all; `SELLER`/`TRANSPORTER` see own tickets) with filters (`?status=...&category=...&role=...&search=...`).
- `POST /api/v1/support` (`SELLER`, `TRANSPORTER`) — Creates ticket (`subject`, `category`, `priority`, optional `lrNumber`, `message`). `HIGH` and `URGENT` tickets trigger real-time alerts.
- `GET /api/v1/support/:id` (Authenticated, owner or `ADMIN`) — Retrieves full message thread.
- `POST /api/v1/support/:id/messages` (Authenticated, owner or `ADMIN`) — Appends reply; Admin reply moves `OPEN` → `IN_PROGRESS`.
- `PATCH /api/v1/support/:id/status` (Authenticated) — Admin can set any status (`IN_PROGRESS`, `RESOLVED`, `CLOSED`, `OPEN`); Seller/Transporter can mark own ticket `CLOSED`.

---

## Dashboard & Diagnostics (`/api/v1/dashboard`)

- `GET /api/v1/dashboard/stats` (Authenticated) — Role-specific live aggregated metrics.
- `GET /api/v1/dashboard/health` (`ADMIN`) — Backend diagnostics (`status`, `database.connected`, `database.pingMs`, `storage.writable`, uptime).

---

## Real-Time Error & Incident Alerting (`/api/v1/alerts`)

- `POST /api/v1/alerts/client-error` (Public, rate-limited `30/min`, CSRF-protected when cookie present) — Receives frontend `ErrorBoundary`, unhandled JS errors, promise rejections, and gateway/network failures (`severity`, `errorCode`, `message`, `route`, `statusCode`, `stack`, `meta`). Returns `202 Accepted` with `{ recorded, incidentId }`.
- `GET /api/v1/alerts` (`ADMIN`) — Lists recent `SystemIncident` records (`?severity=WARN|ERROR|FATAL&source=...&search=...&limit=50`), 24h critical counts, and webhook configuration status (`discordConfigured`, `genericWebhookConfigured`, `minLevel` — raw webhook URLs never exposed).
- `POST /api/v1/alerts/test` (`ADMIN`) — Sends a manual test ping through configured Discord / WhatsApp webhook channels and returns delivery status.

---

## Real-Time Notification Center (`/api/v1/notifications` & `/ws/notifications`)

- `WS /ws/notifications` (Cookie/JWT authenticated on HTTP Upgrade) — Pushes instant `notification:new`, `notification:read`, `notification:read_all`, and `notification:cleared_read` events to connected user tabs for bookings, status changes, refunds, POD uploads, wallet credits, seller KYC decisions, and support replies.
- `GET /api/v1/notifications` (Authenticated) — Lists user-scoped notifications (`?category=BOOKING|SHIPMENT|WALLET|SUPPORT|SELLER_KYC&unreadOnly=true&page=1&limit=20`) along with `unreadCount`.
- `PATCH /api/v1/notifications/:id/read` (Authenticated owner) — Marks a single notification read and syncs across active tabs.
- `PATCH /api/v1/notifications/read-all` (Authenticated) — Marks all unread notifications read for the logged-in user.
- `DELETE /api/v1/notifications/read` (Authenticated) — Deletes already-read notifications for the logged-in user.

---

## B2B KYC Verification & Compliance (`/api/v1/kyc`)

- `GET /api/v1/kyc/me` (`SELLER`, `TRANSPORTER`) — Returns logged-in partner's KYC verification status (`NOT_SUBMITTED | PENDING | VERIFIED | REJECTED`), PAN, settlement bank details, and sanitized document metadata (`storageKey` never exposed).
- `PUT /api/v1/kyc/me` (`SELLER`, `TRANSPORTER`) — Validates and saves PAN (`ABCDE1234F`), `bankAccountHolder`, `bankAccountNumber` (`9–18` digits), `ifscCode` (`HDFC0001234`), and `bankName`, transitioning status to `PENDING` and notifying Admins.
- `POST /api/v1/kyc/me/documents` (`SELLER`, `TRANSPORTER`) — `multipart/form-data` (`docType`: `GST_CERTIFICATE | PAN_CARD | CANCELLED_CHEQUE | ADDRESS_PROOF`, `document`: JPEG/PNG/WebP/PDF up to 5 MB). Verifies real file magic bytes against declared MIME type before saving via `FileStorageProvider`.
- `GET /api/v1/kyc/queue` (`ADMIN`) — Lists unified Seller & Transporter KYC queue (`?entityType=SELLER|TRANSPORTER&status=...&search=...&page=1&limit=15`) with summary counters (`pending`, `verified`, `rejected`, `notSubmitted`).
- `PATCH /api/v1/kyc/:entityType/:profileId/review` (`ADMIN`) — Approves (`VERIFIED`, with optional `alsoApproveSeller`) or declines (`REJECTED`, `rejectionReason` >= 5 chars) a KYC submission and pushes real-time `SELLER_KYC` notification to the partner.
- `GET /api/v1/kyc/:entityType/:profileId/documents/:docType` (`ADMIN`, Owning `SELLER` / `TRANSPORTER`) — Streams private KYC image/PDF inline (`X-Content-Type-Options: nosniff`) after verifying strict Admin or profile-owner authorization.


