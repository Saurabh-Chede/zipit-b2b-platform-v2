# ZIPIT B2B — Operations, Transporter, Carton Scanning & Payment Workflow Documentation

This document explains the end-to-end business logic, warehouse/hub operations, financial settlement calculations, and payment gateway readiness for the **ZIPIT B2B Transport** platform.

---

## 1. Platform Roles & Account Onboarding

ZIPIT B2B operates with three role-isolated workspaces (`ADMIN`, `SELLER`, `TRANSPORTER`):

| Role | How Account Is Created | Verification & Approval | Login URL |
| :--- | :--- | :--- | :--- |
| **Admin** | Pre-seeded / system provisioned | Active immediately | `/login` |
| **Seller** | Self-registration on `/register-seller` (business info, GSTIN, address, pincode) | **6-digit Email OTP** required on signup + **Admin Approval** (`PENDING` → `APPROVED` or `REJECTED`) before booking + B2B KYC verification | `/login` |
| **Transporter** | Created by Admin in **Admin Console → Transporters** (`companyName`, `contactPerson`, `email`, `password`, `phone`, `gstNumber`, initial `serviceAreas`) | Active immediately upon creation by Admin; submits B2B KYC & bank account for UTR payout settlements | `/login` |

> **Full Walkthrough:** See [Partner Onboarding & KYC Verification Flow](ONBOARDING_FLOW.md) for the complete Seller, Transporter, KYC document upload, Admin review, and password recovery diagrams. Transporters do **not** self-register publicly — they log in with Admin-provisioned credentials and can update their profile (`/transporter/profile`) and service areas (`/transporter/service-areas`).

---

## 2. Freight Pricing Engine & Rate Cards

All freight quotes are calculated deterministically on the backend from **Transport Rate Cards** (`TransportRate`), which map each **Transporter** to one or more **Routes** (`TransportRoute` with origin & destination cities/pincodes).

### Formula
1. **Volumetric Weight (kg)** $= \frac{\text{Length (cm)} \times \text{Width (cm)} \times \text{Height (cm)}}{\text{Volumetric Divisor}}$
2. **Chargeable Weight (kg)** $= \max(\text{Actual Weight}, \text{Volumetric Weight})$
3. **Base Freight** $= \max(\text{Minimum Freight}, \text{Chargeable Weight} \times \text{Rate Per Kg})$
4. **Taxable Subtotal** $= \text{Base Freight} + \text{Additional Charges}$
5. **GST** $= \text{Taxable Subtotal} \times \frac{\text{GST Rate \%}}{100}$ *(if `gstApplicable = true`)*
6. **Final Booking Amount** $= \text{Taxable Subtotal} + \text{GST}$
*(RTO Charges are stored separately for return-to-origin scenarios.)*

**Multiple Routes per Transporter:** A single transporter can maintain separate active rate cards across multiple lanes (e.g., `Pune → Mumbai`, `Mumbai → Pune`, `Pune → Nashik`), and Seller quotes compare all active carriers servicing that lane.

---

## 3. Payment Modes, Wallet Deduction & Auto-Refunds

Sellers have two payment modes when confirming a booking:

### A. Prepaid Seller Wallet (`WALLET`)
- **Top-up (`POST /api/v1/wallet/recharge`):** Credits `SellerProfile.walletBalance` atomically (`$inc`) and appends a `CREDIT` entry in `WalletTransaction` with idempotency-key protection.
- **Deduction Timing:** When the Seller clicks **Confirm Booking**, `finalAmount` is deducted **immediately** from `walletBalance` (`DEBIT` transaction with method `WALLET_BOOKING`, linked to `bookingId` and `lrNumber`) — acting as an escrow/hold so the carrier dispatch is financially backed.
- **Automatic Refund on Transporter Rejection:** If the Transporter rejects the booking while status is `BOOKED` (`BOOKED → REJECTED`), the backend automatically:
  1. Credits `finalAmount` back to `SellerProfile.walletBalance` (`$inc`),
  2. Records a `CREDIT` entry in `WalletTransaction` with method `WALLET_REFUND`,
  3. Appends the refund note to the booking's tracking timeline.

### B. B2B Credit Invoice (`INVOICE`)
- Used for approved B2B corporate credit accounts.
- No immediate wallet balance deduction occurs at booking confirmation; the amount is billed via periodic B2B invoicing.

---

## 4. Shipment Lifecycle & Pickup/Delivery Operations

### Allowed Status Transitions
Every status update appends an immutable record to `TrackingEvent`:

```text
BOOKED ──▶ ACCEPTED ──▶ DISPATCHED ──▶ ARRIVED ──▶ DELIVERED
  │
  └──▶ REJECTED (Terminal state; requires rejection reason >= 4 chars; auto-refunds WALLET)
```

- **Accept / Reject (`BOOKED`):** Transporter reviews incoming bookings in **Assigned Bookings** (`/transporter/bookings`), **Pickup & Delivery** (`/transporter/update-status`), or **Booking Details** (`/transporter/bookings/:id`). Accepting moves status to `ACCEPTED`; rejecting requires a reason and locks further transit updates.
- **Pickup & Delivery Queues (`/transporter/update-status`):**
  - **Origin Pickups tab:** Filters `BOOKED` and `ACCEPTED` shipments needing pickup/dispatch.
  - **Destination Deliveries tab:** Filters `DISPATCHED` and `ARRIVED` shipments ready for hub arrival, delivery, and POD.
- **Proof of Delivery (POD):** Available when shipment status is `ARRIVED` or `DELIVERED`. Transporter uploads a JPEG/PNG/WebP image (max 5 MB) with `receiverName`, `deliveryDate`, and optional `remarks`. Setting `markDelivered=true` transitions `ARRIVED → DELIVERED`.

---

## 5. Carton Barcode Generation & Scanning Workflow

### A. Deterministic Per-Carton Barcode Format
Every booking generates `N = parcel.numberOfPackages` individual **Code 128** carton barcodes under its LR number:

- Box 1: `<LR_NUMBER>-C01` (e.g., `ZIPIT-LR-100001-C01`)
- Box 2: `<LR_NUMBER>-C02` (e.g., `ZIPIT-LR-100001-C02`)
- Box `N`: `<LR_NUMBER>-C0N`

### B. Sticker Printing & Operational Scenarios

| Scenario | How It Is Handled |
| :--- | :--- |
| **Standard Single or Multi-Box** | Seller downloads individual **Label PNG** barcodes from **Shipment Details → Individual Carton Barcodes & Scan Manifest** (or LR PDF), prints them, and sticks one label per carton (`-C01`, `-C02`, ...). |
| **Seller Without Printer** | Transporter can download/print **Label PNG** from **Carton Scanner** or **Booking Details**, or physically count boxes and click **Mark Scanned** manually in the manifest. |
| **Multi-Carton Shipment (`N > 1`)** | Cartons can be scanned in **any order** (`C04` before `C01`). Live manifest counters (`4/5 scanned`) highlight missing boxes immediately. Scanning a plain LR (`ZIPIT-LR-100001` without `-C0X`) on a multi-carton shipment is blocked (`INVALID_CARTON_BARCODE`) to prevent accidentally marking all boxes as scanned with one trigger pull. |
| **Single-Carton Shipment (`N = 1`)** | Accepts either `ZIPIT-LR-100001-C01` or plain `ZIPIT-LR-100001`. |
| **Multiple Items Inside One Carton** | Freight & barcode verification operate at the **sealed carton level** (not individual SKU items). Pack all items in 1 box (`numberOfPackages = 1`), list items in **Cargo Description**, enter total packed gross weight/dimensions, and attach an itemized Packing Slip / Tax Invoice on the outer pouch. |

### C. Physical USB / Bluetooth Scanner Loop (`/transporter/scanner`)
1. Open **Carton Scanner** (`/transporter/scanner`). The **Carton Barcode** field is auto-focused.
2. Enter/confirm the **Scan Checkpoint Location** (e.g., `Pune Pickup Dock`).
3. Pull the scanner trigger on a box label:
   - USB/Bluetooth scanners operating in **HID Keyboard Mode** type the barcode string and send `Enter`.
   - The form submits to `POST /api/v1/transporter/cartons/scan`, saves `{ cartonNumber, cartonCode, scannedAt, scannedByUserId, location }` in `booking.scannedCartons`, logs the entry in **Recent Session Scans**, clears the input, and **automatically re-focuses** it for continuous rapid scanning.
4. **Backend Guardrails:**
   - Rejects scans from unowned/other-carrier LRs (`404 CARTON_BOOKING_NOT_FOUND` / `403`).
   - Rejects scans on rejected bookings (`400 BOOKING_REJECTED`).
   - Rejects out-of-range carton numbers (`400 INVALID_CARTON_NUMBER`, e.g. `-C06` on a 5-box shipment).
   - **Idempotent Duplicate Handling:** Scanning the same box twice returns `alreadyScanned: true` without duplicating the entry.

---

## 6. Service Areas & CSV/Excel Bulk Import

Transporters manage serviceable hub pincodes directly from **Service Areas** (`/transporter/service-areas`):
- **Manual Add (`POST /api/v1/transporter/service-areas`):** Add a single `city` + 6-digit `pincode`.
- **Bulk CSV / Excel Import (`POST /api/v1/transporter/service-areas/import`):**
  - Client-side parsing via SheetJS (`xlsx`) supports `.csv`, `.xlsx`, and `.xls` files (up to 500 rows per upload).
  - Auto-detects header columns (`city`, `pincode`) or 2-column order, validates city length (`>= 2`) and 6-digit numeric pincode (`/^\d{6}$/`), previews valid vs skipped invalid rows, and deduplicates against existing areas on the server.
  - A **Sample CSV** template download is provided directly in the UI.
- **Remove (`DELETE /api/v1/transporter/service-areas`):** Removes an area while enforcing that at least **1 active service area** remains configured.

---

## 7. Transporter Earnings, Settlements & CSV Reconciliation

Calculated dynamically on `GET /api/v1/transporter/earnings` (and displayed on `/transporter/earnings`):

### Financial Formula
- **Platform Commission Rate:** `5%` on **Gross Freight** (`freight + pricingSnapshot.additionalCharges`, excluding GST)
- **Net Earning per Shipment** $= \text{Gross Freight} - (\text{Gross Freight} \times 5\%)$
- **Excluded:** `REJECTED` bookings are excluded from earnings.

### Dashboard Metrics & Settlement States
| Metric / State | Definition |
| :--- | :--- |
| **Net Earned (Delivered)** | Total Net Earning across all `DELIVERED` bookings. Equals `Total Settled + Pending Settlement`. |
| **Total Settled (`SETTLED`)** | Sum of `netPayoutAmount` across completed `TransporterSettlement` payout records (each carrying `settlementId`, `payoutMethod` NEFT/RTGS/IMPS, `utrNumber`, `settledAt`). |
| **Pending Settlement (`PENDING_PAYOUT`)** | Sum of Net Earning for `DELIVERED` bookings **not yet linked** to any settlement batch. Queued for the next payout cycle. |
| **In-Transit Pipeline (`AWAITING_DELIVERY`)** | Projected Net Earning from active bookings in `ACCEPTED`, `DISPATCHED`, or `ARRIVED` status. Moves to `PENDING_PAYOUT` once `DELIVERED`. |

### Example CSV Export Reconciliation
From an exported `zipit-transporter-earnings-YYYY-MM-DD.csv`:
- `ZIPIT-LR-100001` (`DELIVERED`, Gross ₹1,140.00 − 5% Fee ₹57.00 = **₹1,083.00**) → `PENDING_PAYOUT`
- `ZIPIT-LR-100003` (`DELIVERED`, Gross ₹2,515.00 − 5% Fee ₹125.75 = **₹2,389.25**) → `PENDING_PAYOUT`
- `ZIPIT-LR-100005` (`DELIVERED`, Gross ₹1,080.00 − 5% Fee ₹54.00 = **₹1,026.00**) → `SETTLED`
- **Reconciliation:** Total Net Earned = **₹4,498.25** | Settled = **₹1,026.00** | Pending Payout = **₹3,472.25**.

---

## 8. Production Settlement Lifecycle & Razorpay Readiness

### Current State vs Automated Payout Execution
- **Current App:** Computes Pending vs Settled balances and includes **Admin Console → Payout Settlements (`/admin/settlements`)** so Admins can review unsettled `DELIVERED` bookings, verify carrier KYC bank details, enter bank `NEFT`/`RTGS`/`IMPS` **UTR Numbers**, and atomically create `SETTLED` `TransporterSettlement` records (which immediately update the Transporter's Earnings ledger & push a real-time notification).
- **How Production B2B Settlement Works:**
  1. **Eligibility & Dispute Window:** Shipment `DELIVERED` + POD uploaded + no open damage/shortage ticket + T+3/T+7 or weekly payout cycle passed.
  2. **Statutory Deductions:** Gross Freight − Platform Commission (`5%` + GST on commission if applicable) − Section 194C TDS (`1%`/`2%`).
  3. **Disbursement:**
     - **Semi-Automated (Built-In Today):** Finance/Admin transfers funds via Corporate Banking (`NEFT`/`RTGS`/`IMPS`), opens **Payout Settlements**, selects the delivered shipments, and enters the **UTR Number** to record a `SETTLED` batch.
     - **Fully Automated (Optional RazorpayX Payout API):** Trigger payouts programmatically via RazorpayX / Cashfree Payouts and mark `SETTLED` via payout webhook when UTR is returned.

### Razorpay Integration Status & Compatibility
- **Implemented (Seller Wallet Live Payments — Razorpay Standard Checkout):**
  - `PaymentOrder` model + atomic `$inc` wallet balance credits with unique `idempotencyKey = rzp-order:<gatewayOrderId>` preventing duplicate credits even if both `/verify` and `/webhook` fire concurrently.
  - Endpoints: `GET /api/v1/payments/config`, `GET/POST /api/v1/payments/orders`, `POST /api/v1/payments/verify`, and raw-body HMAC-SHA256 `POST /api/v1/payments/webhook` verified with `crypto.timingSafeEqual`.
  - Production guard disables direct unverified `/api/v1/wallet/recharge` (`403 DIRECT_RECHARGE_DISABLED` when `NODE_ENV=production`), while preserving sandbox fallback in local development when Razorpay keys are unset.
  - Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in `.env`.
- **Optional Next-Phase (Automated Transporter Payouts via RazorpayX):**
  1. Transporter KYC already collects `panNumber`, `bankAccountHolder`, `bankAccountNumber`, and `ifscCode` in `Transporter.kyc`.
  2. To automate payout execution, add RazorpayX `contactId` / `fundAccountId` mapping plus an Admin **Settle Payout** trigger and RazorpayX payout webhook handler updating `TransporterSettlement`.
  3. **Database Deployment:** Run **MongoDB Replica Set / Atlas** in production so multi-document ACID transactions execute with full rollback guarantees.

---

## 9. Key Transporter & Booking API Endpoints

| Area | Method & Path | Purpose |
| :--- | :--- | :--- |
| **Assigned Bookings** | `GET /api/v1/transporter/bookings` | List bookings assigned to logged-in transporter |
| **Status / Accept / Reject** | `PATCH /api/v1/bookings/:id/status` | Advance status or reject `BOOKED` shipment (auto-refunds `WALLET`) |
| **Delivery Proof** | `POST /api/v1/bookings/:id/delivery-proof` | Upload POD image & optionally mark `DELIVERED` |
| **Carton Label PNG** | `GET /api/v1/bookings/:id/cartons/:cartonNumber/barcode` | Download Code 128 PNG barcode for carton `1..N` |
| **Booking Carton Scan** | `POST /api/v1/bookings/:id/cartons/scan` | Mark specific carton scanned for a booking |
| **Global Carton Scan** | `POST /api/v1/transporter/cartons/scan` | Resolve `<LR>-C0X` barcode across assigned bookings & log scan |
| **Self Profile** | `GET`, `PATCH /api/v1/transporter/profile` | View & update carrier company/contact details |
| **Service Areas** | `POST /api/v1/transporter/service-areas` | Add single City + 6-digit Pincode |
| **Bulk Import Areas** | `POST /api/v1/transporter/service-areas/import` | Merge & deduplicate up to 500 parsed CSV/Excel rows |
| **Remove Area** | `DELETE /api/v1/transporter/service-areas` | Remove service area (minimum 1 active area enforced) |
| **Earnings & Ledger** | `GET /api/v1/transporter/earnings` | Retrieve 5% fee breakdown, settlements, and shipment ledger |
| **Support Desk** | `GET`, `POST /api/v1/support`, `POST /api/v1/support/:id/messages` | Raise & track Seller/Transporter support tickets |
| **Client Incident Intake** | `POST /api/v1/alerts/client-error` | Captures browser runtime crashes, React ErrorBoundary & gateway failures |
| **Admin Incident Feed & Ping** | `GET /api/v1/alerts`, `POST /api/v1/alerts/test` | Admin-only `SystemIncident` inspection & webhook test dispatch |

---

## 10. Real-Time Error & Crash Alerting (Discord, WhatsApp Webhook & Uptime)

To ensure even small errors or crashes notify the owner immediately:

1. **Every Error Captured Automatically:**
   - **Backend API (`errorHandler.ts`):** Captures all `5xx` (`ERROR`) and `4xx` (`WARN`, e.g., validation/route/payment rejections) — excluding routine unauthenticated `/api/v1/auth/me` probes.
   - **Frontend Browser (`errorReporter.ts` & `ErrorBoundary.tsx`):** Captures React component crashes (`FATAL`), unhandled JS errors, promise rejections, and API network/gateway failures (`502`/`503`/`504`) via `POST /api/v1/alerts/client-error`.
   - **Database & Process Crashes (`database.ts` & `server.ts`):** Captures MongoDB disconnects/errors, `uncaughtException`, and `unhandledRejection` (`FATAL`).
   - **High/Urgent Support Tickets (`support.service.ts`):** Notifies immediately when a Seller or Transporter submits a `HIGH` or `URGENT` ticket.
2. **Instant Discord Notifications (Free):**
   - Set `DISCORD_ALERT_WEBHOOK_URL` in `.env` to a Discord channel webhook URL.
3. **Instant WhatsApp Notifications (via Make / n8n / Zapier / AiSensy):**
   - Set `ALERT_WEBHOOK_URL` in `.env` to your automation webhook URL. The backend posts a JSON payload containing `severity`, `source`, `errorCode`, `message`, `summaryText`, `route`, and `requestId`.
4. **Sensitivity & Anti-Spam Protection:**
   - `ALERT_MIN_LEVEL="WARN"` (default) notifies on both small errors (`4xx`/UI warnings) and critical `5xx`/crashes. Set to `"ERROR"` for critical-only alerts.
   - Identical error signatures share a 60-second webhook cooldown while still incrementing `occurrenceCount` in MongoDB (`SystemIncident`, 30-day TTL).
5. **External Server-Down Detection (when Node itself is offline):**
   - Point an external monitor (e.g., UptimeRobot / Better Stack) at `GET /api/health` (checks every 1–5 minutes and alerts Discord/WhatsApp/SMS if the server stops responding).

