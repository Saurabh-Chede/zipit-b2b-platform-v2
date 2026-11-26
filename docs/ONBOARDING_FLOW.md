# Partner Onboarding & KYC Verification Flow (`Seller`, `Transporter` & `Admin`)

This document details the complete step-by-step onboarding, email verification, KYC compliance, and activation workflow for **B2B Sellers** and **Transporters** on **ZIPIT B2B Transport**.

---

## 1. Onboarding Roles Overview

| Role | Onboarding Entry Point | Email OTP Required? | Admin Approval Required? | KYC Compliance |
| :--- | :--- | :--- | :--- | :--- |
| **Seller** | Self-registration at `/register-seller` | **Yes** (`6-digit` email OTP) | **Yes** (`PENDING` → `APPROVED` before booking) | PAN, Bank Account & Docs (`GST_CERTIFICATE`, `PAN_CARD`, `CANCELLED_CHEQUE`, `ADDRESS_PROOF`) |
| **Transporter** | Self-registration at `/register-transporter` **or** Admin-provisioned at `/admin/transporters` | No | **Yes** for self-registered (`PENDING` → `APPROVED` before routes/quotes/bookings); Admin-created carriers start `APPROVED` & `ACTIVE` | PAN, Settlement Bank Account & Docs (`GST_CERTIFICATE`, `PAN_CARD`, `CANCELLED_CHEQUE`, `ADDRESS_PROOF`) |
| **Admin** | Initial system seed / DB user | No | N/A | N/A |

---

## 2. Seller Onboarding Flow (End-to-End)

```text
[/register-seller Step 1]
  Business, GSTIN, Email, Password
        │
        ▼  POST /api/v1/auth/signup-otp
  Checks email & GSTIN uniqueness (409 if duplicate)
  Issues 6-digit HMAC-hashed OTP (10-min TTL, SMTP or dev sandboxOtp)
        │
        ▼
[/register-seller Step 2]
  Seller enters 6-digit OTP (max 5 attempts; 30s prod resend cooldown)
        │
        ▼  POST /api/v1/sellers/register
  Atomic MongoDB Transaction:
   1. Verifies & consumes OTP (single-use)
   2. Creates User (role: SELLER, emailVerified: true)
   3. Creates SellerProfile (approvalStatus: PENDING, walletBalance: 0)
  Pushes real-time SELLER_KYC notification to all Admins
        │
        ▼
[Pending State]
  Seller can log in (/login) & upload KYC at /seller/profile
  Booking creation is blocked (403 SELLER_APPROVAL_PENDING)
        │
        ▼
[Admin Review (/admin/sellers or /admin/kyc)]
   ├── Approve (PATCH /api/v1/sellers/:id/approve) ──▶ APPROVED (Can recharge wallet & book shipments)
   └── Reject  (PATCH /api/v1/sellers/:id/reject)  ──▶ REJECTED (Rejection reason shown on Seller portal)
```

### Step-by-Step Seller Walkthrough
1. **Step 1 — Business Details & OTP Request (`/register-seller`):**
   - Seller submits `businessName`, `ownerName`, `email`, `password`, `phone`, `gstNumber` (15-char GSTIN), `businessAddress`, `city`, and `pincode` (6-digit).
   - Clicking **Continue & Send OTP** calls `POST /api/v1/auth/signup-otp`.
   - Backend validates that neither `email` (`409 EMAIL_ALREADY_EXISTS`) nor `gstNumber` (`409 GST_ALREADY_REGISTERED`) is already taken, then sends a 6-digit OTP via SMTP (`nodemailer`) or returns `sandboxOtp` in non-production when SMTP is unconfigured.
2. **Step 2 — OTP Verification & Account Creation:**
   - Seller enters the 6-digit verification code and submits `POST /api/v1/sellers/register`.
   - Backend atomically verifies & consumes the OTP, hashes the password (`bcryptjs`), sets `emailVerified: true`, and creates `User` + `SellerProfile` (`PENDING`).
   - Admins receive an instant real-time notification via WebSocket (`/ws/notifications`).
3. **Step 3 — KYC Submission While Pending (Optional / Recommended):**
   - Seller signs in at `/login` and opens **Profile (`/seller/profile`) → KYC Verification**.
   - Submits PAN (`ABCDE1234F`), `bankAccountHolder`, `bankAccountNumber` (`9–18` digits), `ifscCode`, and `bankName` (`PUT /api/v1/kyc/me` → moves `kyc.status` to `PENDING`).
   - Uploads compliance documents via `POST /api/v1/kyc/me/documents` (`GST_CERTIFICATE`, `PAN_CARD`, `CANCELLED_CHEQUE`, `ADDRESS_PROOF`; JPEG/PNG/WebP/PDF up to 5 MB, validated by real magic-byte signatures).
4. **Step 4 — Admin Approval & Activation:**
   - **Option A (`/admin/sellers`):** Admin reviews pending sellers and clicks **Approve** (`PATCH /api/v1/sellers/:id/approve`) or **Reject** with a reason (`PATCH /api/v1/sellers/:id/reject`).
   - **Option B (`/admin/kyc`):** Admin inspects KYC documents privately (`GET /api/v1/kyc/SELLER/:profileId/documents/:docType`) and marks KYC **VERIFIED** (`PATCH /api/v1/kyc/SELLER/:profileId/review` with `alsoApproveSeller: true` to activate both KYC and Seller booking access in one action).
5. **Step 5 — Ready for Shipments:**
   - Approved Seller recharges their prepaid wallet (`/seller/profile` via Razorpay Checkout or sandbox) and creates bookings (`/seller/create-booking` or `/seller/create-shipment`).

---

## 3. Transporter Onboarding Flow (Self-Registration & Admin Provisioning)

Transporters can either **self-register publicly at `/register-transporter`** (subject to Admin approval) or be **provisioned directly by an Admin at `/admin/transporters`**.

```text
[Option A: Public Self-Registration (/register-transporter)]
  Carrier submits company details, GSTIN, HQ city/pincode, email & password
        │
        ▼  POST /api/v1/transporters/register (rate-limited)
  Atomic MongoDB Transaction:
   1. Checks email & GSTIN uniqueness (409 if duplicate)
   2. Creates User (role: TRANSPORTER, isActive: true)
   3. Creates Transporter profile (approvalStatus: PENDING, status: INACTIVE, initial serviceAreas[])
  Pushes real-time SELLER_KYC notification to all Admins
        │
        ▼
[Pending State]
  Transporter logs in (/login -> /transporter), edits profile, imports service areas, uploads KYC at /transporter/profile
  Route publishing, rate quotes, & personal bookings are blocked (403 TRANSPORTER_APPROVAL_PENDING)
        │
        ▼
[Admin Review (/admin/transporters or /admin/kyc)]
   ├── Approve (PATCH /api/v1/transporters/:id/approve) ──▶ APPROVED & ACTIVE (Can publish routes, appear in quotes & accept bookings)
   └── Reject  (PATCH /api/v1/transporters/:id/reject)  ──▶ REJECTED & INACTIVE (Rejection reason shown on Transporter portal)

[Option B: Admin-Provisioned (/admin/transporters)]
  Admin creates Carrier (POST /api/v1/transporters)
   - Creates User (role: TRANSPORTER, isActive: true)
   - Creates Transporter profile (approvalStatus: APPROVED, status: ACTIVE, initial serviceAreas[])
        │
        ▼
[Carrier Goes Live & Admin Verifies Carrier KYC (/admin/kyc)]
   - Carrier configures routes & rates (/transporter/routes), accepts/rejects bookings, scans carton barcodes, uploads PODs
   - Admin settles delivered freight payouts via NEFT/RTGS/IMPS UTR (/admin/settlements)
```

### Step-by-Step Transporter Walkthrough
1. **Self-Registration (`/register-transporter`) or Admin Provisioning (`/admin/transporters`):**
   - **Self-Registration:** Carrier submits `companyName`, `contactPerson`, `email`, `password`, `phone`, `gstNumber` (15-char GSTIN), `address`, `city`, and `pincode` (`POST /api/v1/transporters/register`). Backend creates `User` + `Transporter` (`approvalStatus: PENDING`, `status: INACTIVE`) and notifies all Admins.
   - **Admin Provisioning:** Admin clicks **Add Transporter** (`POST /api/v1/transporters`) with carrier details and initial `serviceAreas`. Admin-created carriers start `APPROVED` and `ACTIVE`.
2. **Carrier Portal Setup While Pending (`/transporter`):**
   - Self-registered transporter signs in at `/login` and completes **Profile (`/transporter/profile`) → KYC Verification** (PAN, bank account details, and documents `GST_CERTIFICATE`, `PAN_CARD`, `CANCELLED_CHEQUE`, `ADDRESS_PROOF`).
   - Uploads serviceable pincodes (`.csv`, `.xlsx`, `.xls`, up to 500 rows) in **Service Areas (`/transporter/service-areas`)**.
   - While `PENDING` or `REJECTED`, carrier is excluded from seller quotes/bookings and blocked from route publishing (`403`).
3. **Admin Approval & KYC Verification:**
   - **Option A (`/admin/transporters`):** Admin reviews pending carriers and clicks **Approve** (`PATCH /api/v1/transporters/:id/approve`) or **Reject** with a reason (`PATCH /api/v1/transporters/:id/reject`).
   - **Option B (`/admin/kyc`):** Admin verifies carrier KYC documents (`PATCH /api/v1/kyc/TRANSPORTER/:profileId/review` with `alsoApproveSeller: true` to approve both KYC and pending carrier access in one action).
4. **Route & Rate Card Setup (`/transporter/routes` or `/admin/routes` & `/admin/rates`):**
   - Approved carrier (or Admin) configures operating lanes and freight rate cards (`minimumFreight`, `ratePerKg`, `volumetricDivisor`, `rtoCharges`, `additionalCharges`, `gstApplicable`, `gstRatePercent`, `estimatedDeliveryTime`) so Sellers see quotes and the carrier can accept platform bookings or create personal customer orders.
5. **Payout Readiness (`/admin/settlements`):**
   - Once KYC is `VERIFIED`, **Admin → Payout Settlements (`/admin/settlements`)** displays the carrier's `VERIFIED` badge alongside beneficiary bank details for UTR settlement batches.

---

## 4. Password Reset & Account Recovery Flow (`/forgot-password`)

Available for all roles (`ADMIN`, `SELLER`, `TRANSPORTER`):
1. User clicks **Forgot password?** on `/login` → navigates to `/forgot-password`.
2. **Step 1:** Enters account email (`POST /api/v1/auth/forgot-password`). Server always returns `200 OK` (even for unknown/inactive emails) to prevent email enumeration.
3. **Step 2:** Enters 6-digit OTP + new password (`POST /api/v1/auth/reset-password`).
   - Enforces max **5 invalid OTP attempts** (`429 OTP_MAX_ATTEMPTS_EXCEEDED`).
   - Atomically consumes the OTP, updates `passwordHash`, and increments `User.tokenVersion` so all previously active browser/API sessions are invalidated immediately (`401 SESSION_EXPIRED`).

---

## 5. Production Onboarding Readiness Checklist

Before inviting external Sellers and Transporters to a live deployment:
- [ ] **MongoDB Atlas (`MONGODB_URI`):** Connected to a replica-set cluster for ACID transactions.
- [ ] **SMTP Configured (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`):** Required in `NODE_ENV=production` so signup and password-reset OTP emails deliver reliably (`503 EMAIL_SERVICE_NOT_CONFIGURED` if missing).
- [ ] **Razorpay Live Keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`):** Configured and webhook registered at `/api/v1/payments/webhook` so Sellers can top up wallets.
- [ ] **Persistent Storage (`UPLOAD_DIR` or S3/R2 adapter):** Mounted persistent volume on VPS/PaaS (or S3/GCS adapter in `backend/src/config/storage.ts` for stateless containers) so KYC documents and POD images survive redeploys.
- [ ] **Demo Accounts Hardened:** `SEED_ON_STARTUP="false"` and default `ZipitDemo@2026` accounts removed or passwords rotated.
- [ ] **Discord / Webhook Alerts Verified:** Tested via **Admin → Incident Alerts (`/admin/alerts`) → Send Test Alert**.
