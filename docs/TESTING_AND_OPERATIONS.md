# Testing, Operations, Monitoring Checklist & Changelog

## 1. Automated Test Suite & Static Checks

Run all unit and end-to-end API integration tests:
```bash
npm test
```

Run TypeScript static typechecking & Vite production build:
```bash
npm run lint
npm run build
```

### Covered Automated Suites (**22/22 Passing**)
- **`tests/pricing.unit.test.ts` (6 tests):** Volumetric vs actual weight comparison, minimum freight floor, GST vs non-GST calculation, separate RTO charge handling, invalid weight/dimension rejections.
- **`tests/workflow.integration.test.ts` (16 tests):**
  1. Unauthenticated access rejection (`401 AUTH_REQUIRED`) and invalid login (`401 INVALID_CREDENTIALS`).
  2. Role-based access control (`403 FORBIDDEN_ROLE`) on admin endpoints.
  3. Seller registration (`PENDING` with signup email OTP verification), blocked booking until approval, rejection with reason, and admin approval.
  4. Rate calculator validation and missing route handling.
  5. Idempotent booking creation under concurrent/duplicate requests, LR PDF binary validation, cross-seller/cross-transporter ownership checks, sequential tracking timeline, POD MIME validation, and private POD streaming authorization.
  6. Seller Wallet summary, idempotent recharge (`Idempotency-Key`), `WALLET` booking debit, and insufficient balance rejection.
  7. Admin-only backend health diagnostics (`/api/v1/dashboard/health`).
  8. Seller & Transporter support tickets with Admin replies and access isolation.
  9. Transporter booking rejection (`BOOKED → REJECTED`) with automatic `WALLET_REFUND`, individual carton PNG barcode labels (`-C01`), global & booking carton barcode scanning + duplicate scan handling, Transporter self-profile, bulk service area import, and earnings ledger.
  10. Real-time error alerting (`POST /api/v1/alerts/client-error`, automatic backend `4xx` capture, `/auth/me` `401` noise suppression, Admin-only `GET /api/v1/alerts` & `POST /api/v1/alerts/test`).
  11. Real-time role-scoped notifications (`/api/v1/notifications`, ownership checks, read/unread & clear actions).
  12. End-to-end B2B KYC workflow (PAN/IFSC/bank validation, magic-byte file signature checks for PDF/PNG uploads, `storageKey` redaction, private cross-partner `403` streaming isolation, Admin KYC queue, Reject/Verify decisions, and `SELLER_KYC` notifications).
  13. Seller pre-dispatch self-cancellation (`BOOKED / ACCEPTED → CANCELLED`) with automatic `WALLET_REFUND`, post-dispatch cancellation block (`400 CANCELLATION_NOT_ALLOWED`), and end-to-end NDR (`ARRIVED → NDR`) → Seller `REATTEMPT` / `INITIATE_RTO` → `RTO_CHARGE` wallet debit → `RTO_DELIVERED` return delivery + Transporter earnings ledger verification.
  14. Live Razorpay Payment Gateway integration (unconfigured `503` guard, order creation `/api/v1/payments/orders`, Seller ownership isolation, HMAC-SHA256 checkout `/verify`, raw-body HMAC webhook `/api/v1/payments/webhook`, underpaid capture rejection, and atomic idempotent wallet crediting preventing double-credit on verify + webhook replay).
  15. Admin manual Seller wallet adjustment (`GET /api/v1/sellers/:id/wallet`, `POST /api/v1/sellers/:id/wallet-adjust` credit/debit with idempotency & negative-balance protection) and Admin Transporter Payout Settlement (`GET /api/v1/settlements`, pending bookings, server-side 5% commission calculation, `POST /api/v1/settlements` with duplicate UTR/booking `409` protection, and Transporter earnings reconciliation).
  16. Signup email OTP verification & Forgot/Reset Password flow (missing/wrong OTP rejection, email/GSTIN duplicate checks, anti-enumeration `200` on unknown email, 5-attempt brute-force lockout `429`, immediate prior JWT session invalidation via `tokenVersion`, OTP replay protection, and mocked SMTP delivery mode).

---

## 2. Manual End-to-End Verification Checklist

1. **Pending Seller Registration & Approval:**
   - Register on `/register-seller`, verify dashboard displays Pending Approval notice and booking is blocked, then approve via Admin (`/admin/sellers`).
2. **Wallet Top-Up & Prepaid Booking:**
   - Sign in as `seller1@apexhardware.in`, recharge wallet in **Profile / Wallet** (`/seller/profile`), open **Create Booking** (`/seller/create-booking`), calculate quotes, and confirm booking using `WALLET` payment mode.
3. **Carton Barcode Labels & Physical Scanner Flow:**
   - Open Shipment Details → download individual carton Code 128 PNG labels (`<LR>-C01`, ...).
   - Sign in as Transporter (`ops@swiftlinefreight.in`), open **Carton Scanner** (`/transporter/scanner`), scan/enter `<LR>-C01`, verify manifest counter updates and scanner input auto-re-focuses.
4. **Booking Rejection & Automatic Refund:**
   - As Transporter, reject a `BOOKED` wallet shipment with a reason; confirm seller wallet receives automatic `WALLET_REFUND` credit.
5. **Pickup, Delivery & Proof of Delivery (POD):**
   - Use **Pickup & Delivery** (`/transporter/update-status`) queues (**Origin Pickups** / **Destination Deliveries**) to advance status `BOOKED → ACCEPTED → DISPATCHED → ARRIVED`, upload POD image, and mark `DELIVERED`.
6. **Service Areas CSV/Excel Import & Earnings:**
   - Import sample CSV/Excel file on `/transporter/service-areas`, and inspect 5% fee breakdown + settlement history + CSV export on `/transporter/earnings`.
7. **Support Desk:**
   - Submit a `HIGH` or `URGENT` ticket from `/seller/support` or `/transporter/support` and reply from `/admin/support`.
8. **Real-Time Alerts Verification:**
   - Configure `DISCORD_ALERT_WEBHOOK_URL` or `ALERT_WEBHOOK_URL` in `.env`, then send a `POST /api/v1/alerts/test` request as Admin to confirm instant delivery.

---

## 3. Production Deployment & Monitoring Checklist

| Item | Local Development Default | Production Requirement |
| :--- | :--- | :--- |
| **Database (`MONGODB_URI`)** | Embedded `MongoMemoryServer` persisted in `.data/mongodb` | External **MongoDB Replica Set / Atlas** URI (enables multi-document ACID transactions across nodes) |
| **Secrets (`JWT_SECRET`, `COOKIE_SECRET`)** | Runtime fallback hash | Strong 64-char random production secrets |
| **POD File Storage (`FileStorageProvider`)** | Local disk (`./uploads/delivery-proofs`) | Implement S3 / GCS adapter in `backend/src/config/storage.ts` for multi-container scaling |
| **Sample Seeding (`SEED_ON_STARTUP`)** | `"true"` | Set `"false"` in production |
| **Real-Time Error Webhooks** | Optional | Set `DISCORD_ALERT_WEBHOOK_URL` and/or `ALERT_WEBHOOK_URL` + `ALERT_MIN_LEVEL="WARN"` (or `"ERROR"`) |
| **Server-Down Uptime Monitor** | N/A | Configure external monitor (UptimeRobot / Better Stack) on `GET /api/health` every 1–5 minutes |
| **Payment Gateway (Live Seller Top-Ups)** | Sandbox ledger fallback when keys unset (`NODE_ENV !== production`) | Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and register `/api/v1/payments/webhook` in Razorpay Dashboard (`403 DIRECT_RECHARGE_DISABLED` enforced in production) |
| **Email OTP Delivery (`SMTP_*`)** | Sandbox OTP preview when SMTP is unset (`NODE_ENV !== production`) | Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (`503 EMAIL_SERVICE_NOT_CONFIGURED` enforced in production when unset) |

---

## 4. Known Limitations

- **Single-Currency (INR):** Freight calculations, wallet ledger, and LR PDF formatting assume INR (`₹`), 6-digit Indian pincodes, and 15-character GSTIN numbers.
- **Sealed-Carton Level Verification:** Barcode scanning operates at the sealed carton level (`1..numberOfPackages`) rather than per-SKU item scanning inside a box.
- **Process Crash Alerts on Total Host Power-Off:** Internal Node error/crash alerting fires whenever the application process is running; external monitoring against `GET /api/health` is required to detect full server/host downtime.

---

## 5. Changelog

- **v1.0.0:** Initial MVP release with modular Express/Mongoose backend, React/Tailwind v4 role portals, freight pricing engine, idempotent booking, PDFKit + Code 128 LR documents, append-only tracking, and private POD upload/streaming.
- **v1.1.0:** Added Seller Prepaid Wallet (`WalletTransaction`, atomic debit, idempotent recharge), Admin Backend Health Diagnostics (`/api/v1/dashboard/health`), and Seller/Transporter Support Desk (`SupportTicket`).
- **v1.2.0:** Completed full Transporter Operations Suite — Booking Accept/Reject with automatic `WALLET_REFUND`, per-carton Code 128 barcode generation & global HID scanner (`/transporter/scanner`), Origin/Destination operational queues, CSV/Excel service area import, company self-profile, and 5% commission Earnings & `TransporterSettlement` ledger.
- **v1.3.0:** Added Real-Time Error & Incident Alerting (`SystemIncident` 30-day TTL model, 60s webhook deduplication, Discord Embeds + generic WhatsApp/n8n/Make webhook dispatch, frontend `errorReporter.ts` + `ErrorBoundary`, DB/process crash hooks, and `/api/v1/alerts` Admin endpoints) and updated complete system documentation.
- **v1.4.0:** Added Real-Time Notification Center (`Notification` 60-day TTL model, authenticated WebSocket `/ws/notifications`, `/api/v1/notifications`, `NotificationBell`, `NotificationsPage`, and deployment guide).
- **v1.5.0:** Implemented B2B KYC Verification & Compliance (`/api/v1/kyc`, PAN & bank settlement details, JPEG/PNG/WebP/PDF document uploads with magic-byte verification, private authorized inline preview/download, Admin KYC Review queue `/admin/kyc`, and real-time `SELLER_KYC` notifications).
- **v1.6.0:** Implemented Seller Pre-Dispatch Self-Cancellation (`POST /api/v1/bookings/:id/cancel` with automatic `WALLET_REFUND`) and full Non-Delivery Report (NDR) & Return to Origin (RTO) workflow (`ARRIVED → NDR → DELIVERED / RTO_INITIATED → RTO_DELIVERED`, Seller `POST /api/v1/bookings/:id/ndr-action`, `RTO_CHARGE` wallet billing, Seller & Transporter UI workflows, and earnings ledger `RTO_RETURN` state).
- **v1.7.0:** Implemented Live Razorpay Payment Gateway integration (`PaymentOrder` schema, `/api/v1/payments/config`, `/orders`, `/verify`, raw-body HMAC-SHA256 `/webhook` with `crypto.timingSafeEqual`, atomic idempotent wallet credit, production `403` guard on unverified direct recharge, and seamless Razorpay Checkout / Sandbox UI inside `WalletRechargeModal`).
- **v1.8.0:** Implemented Admin **Payout Settlements (UTR)** (`/admin/settlements`, `/api/v1/settlements` with KYC bank account view, selectable delivered bookings, 5% fee reconciliation, duplicate UTR/booking locking, and carrier notifications) and Admin **Manual Seller Wallet Adjustment** (`AdminSellersPage` Wallet modal, `/api/v1/sellers/:id/wallet` & `/wallet-adjust` with mandatory audit reason, negative-balance guard, and `ADMIN_ADJUSTMENT` ledger tracking).
- **v1.9.0:** Implemented **Signup Email OTP Verification** (`/api/v1/auth/signup-otp` + atomic verification in `/api/v1/sellers/register`, 2-step `SellerRegisterPage`) and **Forgot / Reset Password** (`/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password`, `/forgot-password` UI) using `OtpVerification` TTL schema, HMAC-SHA256 OTP hashing, 5-attempt lockouts, `nodemailer` SMTP transport, and automatic prior JWT session invalidation (`tokenVersion`).
- **v1.10.0:** Added **Admin Incident Alerts UI Page** (`/admin/alerts` sidebar screen with 24h critical KPIs, Discord/Webhook readiness cards, severity/source/search filters on `GET /api/v1/alerts`, full stack-trace & metadata inspection modal, and **Send Test Alert** trigger via `POST /api/v1/alerts/test`).
