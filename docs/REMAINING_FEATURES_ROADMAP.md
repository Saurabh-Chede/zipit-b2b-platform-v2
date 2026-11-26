# Remaining Features & Production Readiness Roadmap

This document tracks all **completed** platform capabilities versus **remaining** production infrastructure upgrades and optional Phase-2 B2B features for **ZIPIT B2B Transport**.

---

## 1. Current Completion Status

All core, production-infrastructure, and Phase-2 B2B freight marketplace capabilities are **implemented and verified**:
- **Auth & Security:** Cookie/Bearer JWT auth, CSRF protection, role-based access control (`ADMIN`, `SELLER`, `TRANSPORTER`), brute-force lockouts, immediate session invalidation (`tokenVersion`), forgot/reset password via SMTP OTP, and **in-app Change Password** (`POST /api/v1/auth/change-password`) across all roles.
- **Partner Onboarding & Compliance:** Seller registration + Admin approval/rejection, Transporter management + CSV/Excel bulk service area import, end-to-end B2B KYC verification (PAN, bank details, magic-byte validated JPEG/PNG/WebP/PDF uploads, private document streaming), and **Seller Saved Address Book** (`/api/v1/sellers/me/addresses`) with quick-fill booking integration.
- **Cloud Storage & Deployment Readiness:** Pluggable `FileStorageProvider` supporting **AWS S3 / Cloudflare R2 (`S3StorageProvider`)** alongside `LocalDiskStorageProvider`, separate frontend/backend deployment (`SERVE_FRONTEND=false`, `COOKIE_DOMAIN`, `CORS_ORIGIN`, `VITE_API_URL`, `VITE_WS_URL`), liveness (`/api/health/live`) and readiness (`/api/health/ready`) probes.
- **Freight Engine, Compliance & Bulk Operations:** Configurable lane rate matrix with **Admin Bulk Rate Card CSV Import/Export**, volumetric vs actual weight pricing engine, idempotent single & **CSV/XLSX Bulk Shipment Booking** (`/seller/bulk-booking`), **12-digit E-Way Bill integration**, **GST Tax Invoice PDF** (`SAC 996511`, CGST/SGST vs IGST split), Code 128 LR PDF & **combined multi-page LR PDF bundle** (`/api/v1/bookings/bulk-lr`), per-carton barcode labels (`<LR>-C01`), and global USB/HID barcode scanner.
- **Public & Private Tracking, Exceptions & Disputes:** Role-scoped tracking plus **rate-limited Public Consignee Tracking Link** (`/track/:lrNumber`, redacting pricing/wallet/phone/address PII), private POD image upload/streaming, Seller self-cancellation + NDR (`REATTEMPT`/`RTO`), and **Weight Discrepancy & Re-Weigh Dispute Workflow** (`OPEN -> ACCEPTED | DISPUTED -> RESOLVED_CHARGED | RESOLVED_WAIVED` with scale photo proof and automatic wallet debit/invoice billing).
- **Payments, Wallets & Settlements:** Seller prepaid wallet ledger, live Razorpay Checkout + HMAC-SHA256 signature verification + raw-body `/api/v1/payments/webhook`, Admin manual seller wallet adjustments (`ADMIN_ADJUSTMENT`), and Admin Transporter UTR payout settlements (`TransporterSettlement` with 5% fee reconciliation).
- **Operations, Notifications & Monitoring:** Role-scoped Support Desk, real-time WebSocket Notification Center (`/ws/notifications`), health diagnostics (`/api/v1/dashboard/health`), Discord/generic webhook error alerting, and the Admin Incident Alerts UI (`/admin/alerts`).

---

## 2. Priority 1 — Production Infrastructure (Delivered)

### A. Cloud Object Storage Adapter (AWS S3 / Cloudflare R2 / Google Cloud Storage) — [Completed]
- **Implemented:** `backend/src/config/storage.ts` provides both `LocalDiskStorageProvider` (dev/tests) and `S3StorageProvider` (`@aws-sdk/client-s3`) implementing `FileStorageProvider` (`saveFile`, `getFileReadStream`, `exists`, `deleteFile`, `checkHealth`).
- **Configuration:** Switched automatically via `STORAGE_PROVIDER="s3" | "local"`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, keeping all KYC, POD, and scale proof objects private behind RBAC-authorized backend streams.

---

## 3. Priority 2 — Customer UX & Compliance Features (Delivered)

### B. Public Consignee Tracking Link (`/track/:lrNumber`) — [Completed]
- **Backend:** Rate-limited unauthenticated `GET /api/v1/public/tracking/:lrNumber` returns shipment status, origin/destination city & pincode, consignor/consignee business name, carrier company, carton scan progress, POD delivery date/receiver name, and chronological tracking milestones while stripping `finalAmount`, `freight`, `tax`, `pricingSnapshot`, wallet balances, phone numbers, street addresses, GSTIN, and E-Way Bill / invoice numbers.
- **Frontend:** Added public `/track` and `/track/:lrNumber` pages (`PublicTrackingPage.tsx`), `"Track a shipment"` link on `LoginPage`, and `"Copy Buyer Tracking Link"` on `ShipmentDetailView`.

### C. E-Way Bill Integration Field & GST Tax Invoice PDF — [Completed]
- **Backend:** Added validated optional 12-digit `ewayBillNumber`, `ewayBillValidUpto`, and deterministic `invoiceNumber` (`ZPT-INV-YYYYMMDD-XXXXXX`) on `Booking`, printed on LR PDFs, plus `GET /api/v1/bookings/:id/tax-invoice` generating an A4 GST Tax Invoice PDF (`SAC 996511`, CGST+SGST intra-state vs IGST inter-state calculation, and Indian Rupee amount in words).
- **Frontend:** Added E-Way Bill inputs on `CreateBookingPage` and `CreateShipmentPage`, manifest display and `"Tax Invoice PDF"` downloads in `ShipmentDetailView` and `MyShipmentsPage`.

### D. In-App Change Password & Seller Saved Address Book — [Completed]
- **Backend:** Added `POST /api/v1/auth/change-password` (verifies current password, updates hash, increments `tokenVersion` to invalidate older sessions, and issues fresh `zipit_token` + `zipit_csrf` cookies) and Seller Saved Address Book CRUD (`GET / POST / DELETE /api/v1/sellers/me/addresses`).
- **Frontend:** Added `ChangePasswordCard` to `SellerProfilePage`, `TransporterProfilePage`, and new `AdminProfilePage` (`/admin/profile`), plus full Saved Address Book management and 1-click pickup/delivery quick-fill dropdowns on booking creation forms.

---

## 4. Priority 3 — Scale & Operations Automation (Delivered)

### E. Bulk Shipment Booking (CSV / Excel) & Combined Multi-Page LR PDF Export — [Completed]
- **Backend:** Added `POST /api/v1/bookings/bulk/preview`, `POST /api/v1/bookings/bulk` (using per-row idempotency keys and cheapest-active-rate resolution), and `POST /api/v1/bookings/bulk-lr` returning a single multi-page `PDFKit` bundle.
- **Frontend:** Built `/seller/bulk-booking` (`BulkBookingPage.tsx`) supporting `.csv`/`.xlsx` upload, downloadable template CSV, server-side lane/wallet preview table, and batch LR bundle download, plus multi-select checkboxes and `"Download Selected LRs"` in `MyShipmentsPage`.

### F. Weight Discrepancy & Re-Weigh Dispute Workflow — [Completed]
- **Backend:** Added `WeightDiscrepancy` model (`OPEN -> ACCEPTED | DISPUTED -> RESOLVED_CHARGED | RESOLVED_WAIVED`), `WeightDiscrepancy` endpoints (`POST /:id/weight-discrepancy` with magic-byte validated scale photo upload, `GET /:id/weight-discrepancy/image` RBAC stream, Seller `/:id/weight-discrepancy/respond`, and Admin `/:id/weight-discrepancy/resolve` with automatic wallet debit / invoice billing & real-time notifications).
- **Frontend:** Added `"Report Weight Discrepancy"` upload modal on `TransporterBookingDetailsPage` and `WeightDiscrepancyCard` inside `ShipmentDetailView`.

### G. Admin Bulk Rate Card CSV Import / Export — [Completed]
- **Backend:** Added formula-injection-safe `GET /api/v1/rates/export` (`text/csv`) and `POST /api/v1/rates/bulk-import` (upserting `TransportRate` records by transporter + route pincode pair).
- **Frontend:** Added `"Export CSV"`, `"Sample CSV"`, and `"Bulk Import"` CSV/XLSX modal controls on `AdminRatesPage`.

---

## 5. Implementation Summary Matrix

| Feature | Category | Status | Scope Delivered |
| :--- | :--- | :--- | :--- |
| **AWS S3 / Cloudflare R2 `FileStorageProvider`** | Infrastructure | Completed | Backend storage adapter + R2/S3 env config |
| **Public Buyer Tracking Page (`/track/:lrNumber`)** | Customer UX | Completed | Rate-limited PII-safe API + public UI + share link |
| **E-Way Bill Field & GST Tax Invoice PDF** | B2B Compliance | Completed | Booking fields, LR display, GST PDF (`SAC 996511`) |
| **In-App Change Password & Saved Address Book** | Seller / All UX | Completed | `POST /auth/change-password` + Address CRUD & quick-fill |
| **Bulk Booking CSV/XLSX & Combined LR PDF** | High-Volume Scale | Completed | Preflight preview + batch book + multi-page LR PDF |
| **Weight Discrepancy / Re-Weigh Disputes** | Operations / Billing | Completed | Scale photo proof, Seller dispute, Admin resolution & billing |
| **Admin Bulk Rate Card CSV Import/Export** | Admin Tooling | Completed | Safe CSV export + XLSX/CSV bulk rate upsert |
