# Razorpay Payment Gateway Integration Guide

This document explains how **Live Razorpay Standard Checkout** is architected, secured, tested, and deployed for **ZIPIT B2B Transport** Seller Wallet top-ups.

---

## 1. Architecture & Component Overview

| Layer | File | Responsibility |
| :--- | :--- | :--- |
| **Database Model** | `backend/src/models/PaymentOrder.ts` | Persists each gateway top-up order (`orderRef`, `gatewayOrderId`, `gatewayPaymentId`, `amountInr`, `amountPaise`, `status`, `walletTransactionId`, `creditedAt`). |
| **Raw Body Capture** | `backend/src/app.ts` | `express.json({ verify })` preserves the exact `req.rawBody` UTF-8 buffer required for Razorpay webhook HMAC verification. |
| **Routes & RBAC** | `backend/src/modules/payments/payments.routes.ts` | Mounts public HMAC-signed `POST /webhook` above `authenticate`, and protects `/config`, `/orders`, `/verify` with JWT + `SELLER` RBAC. |
| **Validation** | `backend/src/modules/payments/payments.validator.ts` | Validates recharge amount (`₹100` – `₹5,00,000`), `paymentMethod`, and Razorpay verification payload (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`). |
| **Payment Service** | `backend/src/modules/payments/payments.service.ts` | Calls Razorpay Orders API, verifies Checkout & Webhook HMAC-SHA256 signatures via `crypto.timingSafeEqual`, and executes atomic transactional wallet crediting. |
| **Wallet Guard** | `backend/src/modules/wallet/wallet.service.ts` | Blocks direct unverified `/api/v1/wallet/recharge` in production (`403 DIRECT_RECHARGE_DISABLED`) while keeping local dev sandbox fallback when keys are unset. |
| **Checkout Loader** | `src/utils/razorpayCheckout.ts` | Dynamically loads `https://checkout.razorpay.com/v1/checkout.js` on demand without blocking initial page load. |
| **UI Modal** | `src/components/shared/WalletRechargeModal.tsx` | Automatically switches between **Razorpay Standard Checkout** (`configured: true`) and **Sandbox Instant Top-Up Mode** (`configured: false`). |

---

## 2. End-to-End Payment & Idempotency Flow

```text
[Seller clicks "Pay via Razorpay" in WalletRechargeModal]
        │
        ├─▶ 1. Frontend calls GET /api/v1/payments/config
        │       Returns { configured, webhookConfigured, minAmountInr: 100, maxAmountInr: 500000, directLedgerAllowed }
        │
        ├─▶ 2. Frontend loads Razorpay Checkout JS SDK & calls POST /api/v1/payments/orders
        │       Backend calls POST https://api.razorpay.com/v1/orders (Basic auth with Key ID + Secret)
        │       Saves PaymentOrder (status: CREATED, amountPaise = round(amountInr * 100))
        │       Returns { orderRef, gatewayKeyId, gatewayOrderId, amountPaise, currency: "INR", prefill }
        │
        ├─▶ 3. Browser opens Razorpay Standard Checkout modal (UPI / NetBanking / Card / NEFT)
        │
        ├──[Path A: Browser Checkout Callback]──────────────────────────┐
        │   POST /api/v1/payments/verify (Authenticated SELLER)         │
        │   - Checks Seller owns PaymentOrder (403 if mismatch)         │
        │   - Verifies HMAC-SHA256(order_id + "|" + payment_id)         │
        │     against RAZORPAY_KEY_SECRET using crypto.timingSafeEqual  │
        │                                                               │
        ├──[Path B: Server-to-Server Razorpay Webhook]──────────────────┤
        │   POST /api/v1/payments/webhook (Public + HMAC Header)        │
        │   - Verifies x-razorpay-signature against req.rawBody         │
        │     using RAZORPAY_WEBHOOK_SECRET + crypto.timingSafeEqual    │
        │   - For payment.captured / order.paid: validates              │
        │     paidPaise >= order.amountPaise (400 if underpaid)         │
        │                                                               │
        ▼                                                               │
[Atomic Settlement: settlePaymentOrderAndCreditWallet()] ◀──────────────┘
  Inside runInTransaction():
   1. PaymentOrder.findOneAndUpdate({ gatewayOrderId, status: { $ne: "PAID" } }, { status: "PAID", ... })
      → If already claimed (PAID), returns idempotentReplay: true (NO double-credit!)
   2. SellerProfile.findOneAndUpdate({ _id: sellerId }, { $inc: { walletBalance: amountInr } })
   3. WalletTransaction.create({ type: "CREDIT", idempotencyKey: "rzp-order:<gatewayOrderId>", ... })
   4. Pushes real-time WALLET notification via /ws/notifications
```

---

## 3. Sandbox Mode vs Live Production Mode

| Environment | Razorpay Keys Set? | Behavior |
| :--- | :--- | :--- |
| **Development / Test** (`NODE_ENV !== 'production'`) | **No** | `GET /api/v1/payments/config` returns `configured: false, directLedgerAllowed: true`. `WalletRechargeModal` runs in **Sandbox Instant Top-Up Mode** calling `POST /api/v1/wallet/recharge`. Calling `/api/v1/payments/orders` returns `503 PAYMENT_GATEWAY_NOT_CONFIGURED`. |
| **Development / Staging** (`NODE_ENV !== 'production'`) | **Yes (`rzp_test_...`)** | `WalletRechargeModal` opens live **Razorpay Test Checkout** (`https://checkout.razorpay.com/v1/checkout.js`). Test UPI/Cards/NetBanking work end-to-end. |
| **Production** (`NODE_ENV === 'production'`) | **Required (`rzp_live_...`)** | Direct unverified `POST /api/v1/wallet/recharge` is strictly blocked (`403 DIRECT_RECHARGE_DISABLED`). All Seller wallet top-ups must pass through Razorpay Checkout verification and/or Webhook settlement. |

---

## 4. Security Safeguards Implemented

1. **Secrets Never Exposed to Frontend:** `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` stay strictly on the backend. Only `gatewayKeyId` (public key) is returned when creating an order.
2. **Constant-Time Signature Comparison:** Both `/verify` and `/webhook` validate HMAC-SHA256 hex digests via `crypto.timingSafeEqual` to prevent timing attacks.
3. **Raw-Body Webhook Verification:** Webhook signatures are computed over the unmodified `req.rawBody` `Buffer` rather than re-serialized JSON.
4. **Ownership Isolation:** `POST /api/v1/payments/verify` confirms `order.sellerId` matches the authenticated Seller (`403 PAYMENT_ORDER_FORBIDDEN`).
5. **Underpayment Protection:** Webhook captures verify `payment.amount >= order.amountPaise` (`400 PAYMENT_AMOUNT_MISMATCH` if tampered or partial).
6. **Zero Double-Credit Guarantee:** `PaymentOrder` atomic status transition (`$ne: PAID → PAID`) combined with `WalletTransaction` unique partial index on `{ sellerId, idempotencyKey: "rzp-order:<gatewayOrderId>" }` guarantees the wallet is credited **exactly once** even if `/verify` and `/webhook` arrive simultaneously.

---

## 5. Step-by-Step Setup in Razorpay Dashboard

### Step 1: Generate API Keys
1. Log in to **Razorpay Dashboard** (switch between **Test Mode** for staging and **Live Mode** for production).
2. Go to **Account & Settings → API Keys → Generate Key**.
3. Copy **Key ID** (`rzp_test_...` or `rzp_live_...`) and **Key Secret**.

### Step 2: Configure Environment Variables
Add these to `.env` (or your hosting environment dashboard):
```env
RAZORPAY_KEY_ID="rzp_live_xxxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="your_razorpay_key_secret"
RAZORPAY_WEBHOOK_SECRET="your_strong_random_webhook_secret"
```

### Step 3: Register Webhook URL
1. In **Razorpay Dashboard → Account & Settings → Webhooks → Add New Webhook**:
   - **Webhook URL:** `https://portal.yourdomain.com/api/v1/payments/webhook`
   - **Secret:** Exact same value as `RAZORPAY_WEBHOOK_SECRET`
   - **Active Events:** Check **`payment.captured`**, **`order.paid`**, and **`payment.failed`**
2. Save the webhook and restart your Node.js server.

### Step 4: Verify
1. Log in as an approved **Seller**, click **Recharge** in the top header.
2. Confirm the modal banner shows **Razorpay Standard Checkout Active**.
3. Complete a test payment and verify:
   - Wallet balance updates immediately,
   - `WalletTransaction` shows `Razorpay Wallet Top-up (ZPT-PAY-...)`,
   - `PaymentOrder` transitions `CREATED → PAID`.

---

## 6. Automated Test Coverage

Covered by Test #14 in `tests/workflow.integration.test.ts`:
- `503 PAYMENT_GATEWAY_NOT_CONFIGURED` guard when keys are absent
- Order creation against mocked Razorpay Orders API
- Cross-seller ownership rejection (`403 PAYMENT_ORDER_FORBIDDEN`)
- Invalid HMAC rejection on `/verify` (`400 INVALID_PAYMENT_SIGNATURE`) and `/webhook` (`400 INVALID_WEBHOOK_SIGNATURE`)
- Valid checkout verification crediting wallet once
- Concurrent/sequential webhook replay (`payment.captured`) returning `idempotentReplay: true` without double-crediting
- Underpaid webhook capture rejection (`400 PAYMENT_AMOUNT_MISMATCH`)
- Webhook-only settlement fallback if the user closes the browser before `/verify` completes
