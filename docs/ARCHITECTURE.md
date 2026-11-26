# ZIPIT B2B Transport — Architecture & Design Decisions

## 1. Modular Monolithic Architecture

ZIPIT B2B Transport is organized as a modular monolith separating HTTP transport, validation schemas, business services, persistence models, and role-based UI workspaces:

### Backend (`backend/src/`)
- `config/`:
  - `env.ts`: Zod-validated runtime configuration (`PORT`, `MONGODB_URI`, `JWT_SECRET`, `COOKIE_SECRET`, `DISCORD_ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, `ALERT_MIN_LEVEL`, rate limits).
  - `logger.ts`: Pino structured JSON logger with automatic redaction (`password`, `passwordHash`, `token`, `jwt`, `secret`, `cookie`, `authorization`).
  - `database.ts`: Dual-mode MongoDB connection (`MONGODB_URI` or persistent embedded `MongoMemoryServer`), `runInTransaction` helper (full ACID transactions on Replica Sets, graceful fallback on standalone MongoDB), and DB disconnect/error alerting.
  - `storage.ts`: Abstracted `FileStorageProvider` (`LocalDiskStorageProvider` saving private POD and KYC files under `./uploads/delivery-proofs` with path-traversal confinement).
- `models/`: 13 Mongoose schemas (`User`, `SellerProfile`, `Transporter`, `TransportRoute`, `TransportRate`, `Booking`, `TrackingEvent`, `DeliveryProof`, `WalletTransaction`, `TransporterSettlement`, `SupportTicket`, `SystemIncident`, `Notification`) plus shared `kycSchema.ts`.
- `middleware/`:
  - `requestId.ts`: Injects `X-Request-Id` UUID per request.
  - `auth.ts`: Verifies HTTP-only `zipit_token` cookie or `Authorization: Bearer` header.
  - `rbac.ts`: `authorizeRoles(...)` and `requireApprovedSeller` guards.
  - `csrf.ts`: Double-submit `X-CSRF-Token` / custom `X-Requested-With: XMLHttpRequest` verification on cookie-authenticated mutations.
  - `validate.ts`: Request `params`, `query`, and `body` validation via Zod.
  - `upload.ts`: Multer memory validation (`deliveryProofUpload` for JPEG/PNG/WebP POD images and `kycDocumentUpload` for JPEG/PNG/WebP/PDF KYC documents up to 5 MB).
  - `errorHandler.ts`: Centralized error mapping, structured logging, and fire-and-forget `SystemIncident` real-time alerting.
- `modules/`: Domain-isolated modules (`auth`, `sellers`, `transporters`, `routes`, `pricing`, `bookings`, `tracking`, `documents`, `deliveryProof`, `wallet`, `support`, `dashboard`, `alerts`, `notifications`, `kyc`).
- `services/`: Shared backend infrastructure services (`alerting.service.ts` for MongoDB persistence, 60s deduplication, Discord Embeds, and generic WhatsApp/n8n/Make webhooks).
- `seeds/`: Idempotent development seeding (`seedData.ts`, `seedRunner.ts`).

### Frontend (`src/`)
- `services/`:
  - `api.ts`: Centralized Axios client (`apiClient`) with CSRF headers, safe GET-only retry on transient `502`/`503`/network failures, normalized `ApiClientError`, and outage reporting.
  - `errorReporter.ts`: Browser runtime crash/error capture (`window.error`, `unhandledrejection`, `ErrorBoundary`) with 15s deduplication and `POST /api/v1/alerts/client-error` delivery.
- `context/`: `AuthContext` and `ToastContext`.
- `components/`: `ErrorBoundary`, `DataTable`, `Modal`, `ConfirmDialog`, `StatusBadge`, `TrackingTimeline`, and shared shipment/booking detail views.
- `routes/`: `AppRouter.tsx` & `ProtectedRoute.tsx` enforcing role-scoped navigation:
  - **Public:** `/login`, `/register-seller`
  - **Admin (`/admin/*`):** Dashboard (`/admin`), Sellers (`/admin/sellers`), Transporters (`/admin/transporters`), KYC Review (`/admin/kyc`), Routes (`/admin/routes`), Rate Matrix (`/admin/rates`), Bookings (`/admin/bookings`, `/admin/bookings/:id`), Tracking (`/admin/tracking`), Notifications (`/admin/notifications`), Support (`/admin/support`)
  - **Seller (`/seller/*`):** Dashboard (`/seller`), Create Booking (`/seller/create-booking`), Create Shipment (`/seller/create-shipment`), Rate Calculator (`/seller/rate-calculator`), Available Transporters (`/seller/transporters`), My Shipments (`/seller/shipments`, `/seller/shipments/:id`), Tracking (`/seller/tracking`), Notifications (`/seller/notifications`), Business Profile, Wallet & KYC (`/seller/profile`), Support (`/seller/support`)
  - **Transporter (`/transporter/*`):** Dashboard (`/transporter`), Assigned Bookings (`/transporter/bookings`, `/transporter/bookings/:id`), Pickup & Delivery (`/transporter/update-status`), Carton Scanner (`/transporter/scanner`), Service Areas (`/transporter/service-areas`), Earnings & Settlements (`/transporter/earnings`), Tracking (`/transporter/tracking`), Notifications (`/transporter/notifications`), Company Profile & KYC (`/transporter/profile`), Support (`/transporter/support`)

---

## 2. Key Architectural Decisions

1. **Server-Side Pricing Authority**: `calculateFreightBreakdown` runs strictly on the backend against active `TransportRate` records. Booking confirmation persists an immutable `pricingSnapshot` so later rate card edits never alter historical invoices.
2. **Idempotent Booking & Wallet Escrow**:
   - `Booking` enforces a unique partial index on `(sellerId, idempotencyKey)` and duplicate-fingerprint window protection.
   - `WALLET` bookings atomically debit `SellerProfile.walletBalance` at confirmation, automatically credit `WALLET_REFUND` if a Transporter rejects a `BOOKED` shipment or if a Seller self-cancels prior to dispatch (`BOOKED` / `ACCEPTED`), and automatically debit `RTO_CHARGE` when `RTO_INITIATED` triggers (falling back to `INVOICE_PENDING` if wallet balance is insufficient so physical returns are never blocked).
3. **Carton-Level Code 128 Barcodes**: Every booking generates `N = parcel.numberOfPackages` deterministic carton codes (`<LR>-C01` .. `<LR>-C0N`) verified individually at pickup/hub checkpoints (`POST /api/v1/transporter/cartons/scan` & `POST /api/v1/bookings/:id/cartons/scan`).
4. **Append-Only Tracking History**: `TrackingEvent` blocks `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, and `findOneAndDelete` via Mongoose pre-hooks so shipment audit trails remain immutable.
5. **Private POD Storage Abstraction**: Delivery proof images are stored via `FileStorageProvider` and streamed exclusively through `GET /api/v1/bookings/:id/delivery-proof/image` after `assertBookingAccess` passes.
6. **Zero-UI-Clutter Real-Time Alerting**: Errors flow silently through `errorHandler.ts`, `errorReporter.ts`, DB lifecycle hooks, and Node process crash handlers into `SystemIncident` and external Discord/WhatsApp webhooks without rendering telemetry clutter in the application UI.

---

## 3. Request Tracing & Error Response Contract

Every request receives a unique `X-Request-Id` UUID (`req.requestId`). All errors resolve through `errorHandler.ts` with:

```json
{
  "success": false,
  "message": "Readable error message",
  "errorCode": "BOOKING_NOT_FOUND",
  "requestId": "unique-request-id"
}
```

Stack traces, DB credentials, JWT secrets, raw webhook URLs, and password hashes are never returned in API responses or Pino logs.
