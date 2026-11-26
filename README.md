# ZIPIT B2B Transport — Local Freight & Logistics Management System

A production-structured, modular monolithic B2B Local Transport Management System built with React 19, Vite, Tailwind CSS v4, Node.js, Express, MongoDB/Mongoose, PDFKit, SheetJS (`xlsx`), and `bwip-js`.

---

## Key Features

- **Role-Based Access Control (Backend & Frontend)**: Dedicated portals and server-side RBAC guards for `ADMIN`, `SELLER`, and `TRANSPORTER` roles.
- **JWT + HTTP-Only Cookie Authentication**: Passwords hashed with `bcryptjs`, signed JWT stored in HTTP-only cookies, double-submit/custom-header CSRF protection (`X-CSRF-Token` / `X-Requested-With`), and rate-limited endpoints.
- **Seller Onboarding & Approval**: Public B2B seller registration (`PENDING`), Admin review queue, approval/rejection with rejection reason visibility, and booking restriction until `APPROVED`.
- **Prepaid B2B Wallet & Auto-Refunds**: Seller wallet balance (`SellerProfile.walletBalance`), idempotent recharge ledger (`WalletTransaction`), instant escrow debit on `WALLET` bookings, and automatic `WALLET_REFUND` credit if a Transporter rejects a `BOOKED` shipment.
- **Configurable Pricing Engine**: Server-side freight calculation using volumetric weight (`L × W × H / divisor`), chargeable weight (`max(actual, volumetric)`), minimum freight floors, additional charges, applicable GST, and separate RTO charges — persisted as an immutable `pricingSnapshot` on every booking.
- **Idempotent Booking & LR PDF Generation**: Unique `bookingId` (`ZPT-BK-...`) and `lrNumber` (`ZIPIT-LR-...`), idempotency-key deduplication against repeated/concurrent requests, and downloadable LR PDF (`PDFKit`) with Code 128 barcode (`bwip-js`).
- **Carton-Level Barcodes & Physical Scanner Support**: Deterministic per-carton Code 128 barcodes (`<LR>-C01`, `<LR>-C02`, ...), downloadable PNG labels, and rapid USB/Bluetooth HID scanner intake (`/transporter/scanner`) with out-of-range/rejected-booking validation and duplicate scan protection.
- **Transporter Operations, Service Areas & Earnings**: Origin Pickups vs Destination Deliveries queues, bulk `.csv`/`.xlsx`/`.xls` service area import, self-profile management, 5% commission earnings breakdown, `TransporterSettlement` payout tracking, and CSV export.
- **Authorized Delivery Proof (POD)**: Validated image uploads (JPEG/PNG/WebP up to 5 MB) stored behind an abstracted `FileStorageProvider` and served exclusively via authorized endpoints.
- **Support Desk**: Role-isolated Seller & Transporter support tickets with Admin replies, status workflows (`OPEN → IN_PROGRESS → RESOLVED → CLOSED`), and priority alerting.
- **Real-Time Error & Incident Alerting**: Captures backend API errors (`4xx`/`5xx`), frontend React crashes / JS errors / network failures, DB disconnects, process crashes (`FATAL`), and `HIGH`/`URGENT` tickets into `SystemIncident` (30-day TTL) with instant Discord Embed & WhatsApp-compatible JSON webhook notifications.

---

## Development Demo Login Credentials

> **Note**: These credentials are created automatically by the development seed script (`SEED_ON_STARTUP=true` or `npm run seed`) for local testing only. Never use default passwords in production.

| Role | Email | Password | Status / Scope |
| --- | --- | --- | --- |
| **Admin** | `admin@zipit.in` | `ZipitDemo@2026` | Full system administration & incident inspection |
| **Approved Seller 1** | `seller1@apexhardware.in` | `ZipitDemo@2026` | Apex Industrial Hardware (Pune, ₹25,000 seeded wallet) |
| **Approved Seller 2** | `seller2@metrotextiles.in` | `ZipitDemo@2026` | Metro Wholesale Textiles (Mumbai) |
| **Pending Seller** | `pending@navkarindustrial.in` | `ZipitDemo@2026` | Pending approval (cannot create bookings yet) |
| **Transporter 1** | `ops@swiftlinefreight.in` | `ZipitDemo@2026` | SwiftLine B2B Freight Carriers |
| **Transporter 2** | `dispatch@rapidroadways.in` | `ZipitDemo@2026` | Rapid Roadways Logistics |

---

## Setup & Run Instructions

### 1. Environment Configuration
Copy `.env.example` to `.env` when customizing runtime settings:
- Leave `MONGODB_URI=""` in local development to automatically launch the embedded persistent MongoDB instance (stored in `.data/mongodb`).
- Set strong `MONGODB_URI`, `JWT_SECRET`, and `COOKIE_SECRET` values for staging/production deployments.
- Optionally configure real-time alerts with `DISCORD_ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_URL` (WhatsApp automation via Make/n8n/Zapier/AiSensy), and `ALERT_MIN_LEVEL` (`"WARN"` or `"ERROR"`).

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Full-Stack Application (Development)
```bash
npm run dev
```
Runs Express API + Vite dev middleware on `http://localhost:3000`.

### 4. Seed / Reset Sample Data Manually
```bash
npm run seed
# Or reset and re-seed:
npx tsx backend/src/seeds/seedRunner.ts --reset
```

### 5. Run Automated Tests & Typecheck
```bash
npm test
npm run lint
```

### 6. Production Build & Start
```bash
npm run build
npm start
```

---

## Documentation Index

- [Step-by-Step Production Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Architecture & Frontend/Backend Map](docs/ARCHITECTURE.md)
- [Database Schema & Indexes](docs/DATABASE_SCHEMA.md)
- [REST API Reference (`/api/v1` & `/ws/notifications`)](docs/API_DOCUMENTATION.md)
- [Partner Onboarding & KYC Verification Flow](docs/ONBOARDING_FLOW.md)
- [Transporter, Carton Scanning, Wallet & Alerting Workflows](docs/TRANSPORTER_AND_PAYMENT_WORKFLOW.md)
- [Razorpay Payment Gateway Integration Guide](docs/RAZORPAY_INTEGRATION.md)
- [Testing, Production Checklist, Monitoring & Changelog](docs/TESTING_AND_OPERATIONS.md)
- [Remaining Features & Production Readiness Roadmap](docs/REMAINING_FEATURES_ROADMAP.md)
