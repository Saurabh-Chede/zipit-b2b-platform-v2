# ZIPIT B2B Transport — Production Deployment Guide

ZIPIT B2B Transport supports **two production deployment modes** from a single codebase:

- **Mode A — Monolithic Deployment (`SERVE_FRONTEND="true"`):** Express serves `/api/v1/*`, `/ws/notifications`, and the compiled React SPA (`dist/`) from one server.
- **Mode B — Separate Frontend & Backend Deployment (`SERVE_FRONTEND="false"`):**
  - **Frontend:** Vercel (`https://app.zipit.in`)
  - **Backend API + WebSockets:** Render (`https://api.zipit.in`)
  - **Database:** MongoDB Atlas (`MONGODB_URI`)
  - **Object Storage:** Cloudflare R2 or AWS S3 (`STORAGE_PROVIDER="s3"`)

---

## Step 1: MongoDB Atlas Setup (Required in Production)

Embedded MongoDB (`mongodb-memory-server`) is strictly disabled when `NODE_ENV=production`.

1. Create a cluster on [MongoDB Atlas](https://www.mongodb.com/atlas) (M0 for staging, M10+ for production).
2. Under **Database Access**, create a database user with Read/Write permissions.
3. Under **Network Access**, allow your Render outbound IPs (or `0.0.0.0/0` for dynamic PaaS IPs).
4. Copy your SRV connection string (**Connect → Drivers**):
   ```text
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/zipit_b2b?retryWrites=true&w=majority
   ```

---

## Step 2: Cloud Object Storage Setup (Cloudflare R2 / AWS S3)

For stateless containers (Render without persistent disk, multi-instance scaling), store all KYC documents and Delivery Proofs (POD) in private S3-compatible object storage.

### Cloudflare R2 Setup (Recommended — Zero Egress Fees)
1. In Cloudflare Dashboard → **R2 Object Storage**, create a **private** bucket (e.g., `zipit-b2b-private`). Do **not** enable public bucket access.
2. Go to **Manage R2 API Tokens → Create API Token** with **Object Read & Write** permission scoped to `zipit-b2b-private`.
3. Note your credentials:
   - `S3_BUCKET="zipit-b2b-private"`
   - `S3_REGION="auto"`
   - `S3_ENDPOINT="https://<YOUR_CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com"`
   - `S3_ACCESS_KEY_ID="<R2_ACCESS_KEY_ID>"`
   - `S3_SECRET_ACCESS_KEY="<R2_SECRET_ACCESS_KEY>"`
   - `S3_FORCE_PATH_STYLE="false"`
   - `S3_KEY_PREFIX="zipit-uploads"`

> Files remain completely private in the bucket and are streamed exclusively via authenticated, RBAC-checked backend endpoints (`/api/v1/bookings/:id/delivery-proof/image` and `/api/v1/kyc/:entityType/:profileId/documents/:docType`).

---

## Step 3: DNS & Subdomain Configuration (`zipit.in`)

Using subdomains of the same root domain (`app.zipit.in` + `api.zipit.in`) allows first-party HTTP-only cookies (`COOKIE_DOMAIN=".zipit.in"`) to work across Axios requests and WebSocket upgrades without exposing JWT tokens in `localStorage` or URLs.

In your DNS provider (e.g., Cloudflare DNS):
1. **Frontend (`app.zipit.in`):** Add the `CNAME` (or `A`) record provided by Vercel (`cname.vercel-dns.com`).
2. **Backend (`api.zipit.in`):** Add the `CNAME` record provided by Render (`<your-service>.onrender.com`).
   > If using Cloudflare proxy (orange cloud), set SSL/TLS mode to **Full (strict)** and ensure **WebSockets** are enabled in Cloudflare Network settings.

---

## Mode B — Separate Deployment (Vercel + Render)

### 1. Deploy Backend on Render (`https://api.zipit.in`)
1. Push your repository to GitHub.
2. In Render Dashboard → **New + → Web Service**:
   - **Runtime:** Node.js `20` (LTS)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start` *(runs `tsx server.ts --prod`)*
   - **Health Check Path:** `/api/health` *(liveness)* — readiness probe is `/api/health/ready`
3. Add a Custom Domain: `api.zipit.in`.
4. Generate two 64-char random secrets:
   ```bash
   openssl rand -hex 32
   openssl rand -hex 32
   ```
5. Configure **Render Environment Variables** (never put secrets in `VITE_*`):
   ```env
   NODE_ENV=production
   PORT=3000
   SERVE_FRONTEND=false
   APP_URL=https://app.zipit.in
   CORS_ORIGIN=https://app.zipit.in
   COOKIE_DOMAIN=.zipit.in
   COOKIE_SAME_SITE=auto

   MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/zipit_b2b?retryWrites=true&w=majority

   JWT_SECRET=<64_CHAR_HEX_1>
   JWT_EXPIRES_IN=7d
   COOKIE_SECRET=<64_CHAR_HEX_2>

   STORAGE_PROVIDER=s3
   S3_BUCKET=zipit-b2b-private
   S3_REGION=auto
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
   S3_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
   S3_FORCE_PATH_STYLE=false
   S3_KEY_PREFIX=zipit-uploads

   SEED_ON_STARTUP=false
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX=500

   # Optional Live Integrations
   RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=noreply@zipit.in
   SMTP_PASS=...
   SMTP_FROM=ZIPIT B2B Transport <noreply@zipit.in>
   DISCORD_ALERT_WEBHOOK_URL=
   ALERT_WEBHOOK_URL=
   ALERT_MIN_LEVEL=WARN
   ```

### 2. Deploy Frontend on Vercel (`https://app.zipit.in`)
1. Import the same GitHub repository in [Vercel](https://vercel.com).
2. Vercel auto-reads `vercel.json`:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **SPA Rewrite:** All routes rewrite to `/index.html` so direct URL navigation and browser refresh work.
3. Configure **Vercel Environment Variables** (public `VITE_*` only):
   ```env
   VITE_API_URL=https://api.zipit.in
   VITE_WS_URL=wss://api.zipit.in/ws/notifications
   ```
4. Add Custom Domain `app.zipit.in` in Vercel Project Settings → Domains and deploy.

---

## Mode A — Monolithic Deployment Fallback (Single Render Service)

1. Connect GitHub repo to a single Render Web Service:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
2. Attach a Persistent Disk at `/var/data/zipit/delivery-proofs` (or configure `STORAGE_PROVIDER=s3`).
3. Set `SERVE_FRONTEND=true`, leave `COOKIE_DOMAIN` empty, leave `VITE_API_URL` and `VITE_WS_URL` unset, and set `APP_URL` and `CORS_ORIGIN` to your single domain (e.g., `https://portal.zipit.in`).

---

## Step 4: Initial Seed & Razorpay Webhook

1. **First-time DB seed (optional):** Run once in Render Shell:
   ```bash
   npm run seed
   ```
   Immediately change the seeded `admin@zipit.in` password or create a dedicated Admin account and deactivate demo accounts.
2. **Razorpay Webhook:** Set Webhook URL to `https://api.zipit.in/api/v1/payments/webhook` (Mode B) or `https://portal.zipit.in/api/v1/payments/webhook` (Mode A) with events `payment.captured`, `order.paid`, and `payment.failed`.

---

## Step 5: Post-Deployment Verification Checklist

- [ ] `GET https://api.zipit.in/api/health` returns `200` (`"status": "alive"`, `"mode": "api-only"`).
- [ ] `GET https://api.zipit.in/api/health/ready` returns `200` (`"status": "ready"`, `"database": { "connected": true }`).
- [ ] `https://app.zipit.in/login` loads, and refreshing nested routes (e.g., `/seller/shipments`) does not 404.
- [ ] Login sets `zipit_token` (`HttpOnly`, `Secure`, `Domain=.zipit.in`, `SameSite=Lax`) and `zipit_csrf` (`Domain=.zipit.in`).
- [ ] Mutating requests (`POST`/`PATCH`/`DELETE`) succeed with CSRF validation, and Logout clears both cookies.
- [ ] WebSocket `/ws/notifications` connects cleanly on `wss://api.zipit.in/ws/notifications` and pushes live notifications.
- [ ] KYC document upload/preview and Delivery Proof (POD) upload/preview stream securely via S3/R2.
- [ ] Admin Dashboard Health card reports `Database Connected` and `Storage: s3-compatible (Writable)`.
