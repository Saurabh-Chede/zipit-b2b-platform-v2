import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectDatabase, disconnectDatabase } from '../backend/src/config/database.ts';
import { createApiApp, errorHandler } from '../backend/src/app.ts';
import { seedDatabase } from '../backend/src/seeds/seedData.ts';
import { Booking } from '../backend/src/models/Booking.ts';
import { SellerProfile } from '../backend/src/models/SellerProfile.ts';
import { TransportRoute } from '../backend/src/models/TransportRoute.ts';
import { TransportRate } from '../backend/src/models/TransportRate.ts';
import { User } from '../backend/src/models/User.ts';
import { BookingStatus, EntityStatus, TransporterApprovalStatus } from '../backend/src/utils/constants.ts';

process.env.NODE_ENV = 'test';

const app = createApiApp();
app.use(errorHandler);

const DEMO_PASS = process.env.DEMO_SEED_PASSWORD || 'ZipitDemo@2026';

describe('ZIPIT B2B End-to-End API Integration Tests', () => {
  beforeAll(async () => {
    await connectDatabase();
    await seedDatabase(true);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  async function loginAs(email: string, password = DEMO_PASS) {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return { agent, body: res.body };
  }

  it('rejects unauthenticated access to protected routes and handles invalid login', async () => {
    const unauth = await request(app).get('/api/v1/bookings');
    expect(unauth.status).toBe(401);
    expect(unauth.body.errorCode).toBe('AUTH_REQUIRED');

    const badLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@zipit.in', password: 'WrongPassword123' });
    expect(badLogin.status).toBe(401);
    expect(badLogin.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('enforces role-based access control on admin endpoints', async () => {
    const { agent: sellerAgent } = await loginAs('seller1@apexhardware.in');
    const res = await sellerAgent.get('/api/v1/sellers');
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN_ROLE');
  });

  it('enforces seller registration, pending block, rejection reason, and admin approval', async () => {
    const regRes = await request(app).post('/api/v1/sellers/register').send({
      businessName: 'Kaveri Precision Castings',
      ownerName: 'Anil Deshpande',
      email: 'anil@kaveri.in',
      password: 'Password@123',
      phone: '9822334455',
      gstNumber: '27AABCK1234F1Z7',
      businessAddress: 'Sector 7, Chakan MIDC',
      city: 'Pune',
      pincode: '410501',
    });
    expect(regRes.status).toBe(201);
    const newSellerProfileId = regRes.body.data.sellerProfile._id;

    // Pending seller cannot create bookings
    const { agent: newSellerAgent } = await loginAs('anil@kaveri.in', 'Password@123');
    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const rate = await TransportRate.findOne({ routeId: route!._id }).lean();

    const blockedBook = await newSellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: rate!.transporterId.toString(),
        rateId: rate!._id.toString(),
        sender: {
          name: 'Kaveri',
          phone: '9822334455',
          address: 'Sector 7',
          city: 'Pune',
          pincode: '410501',
        },
        receiver: {
          name: 'Buyer',
          phone: '9820011223',
          address: 'Andheri',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Castings',
          actualWeightKg: 25,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 20,
          numberOfPackages: 2,
        },
      });
    expect(blockedBook.status).toBe(403);
    expect(blockedBook.body.errorCode).toBe('SELLER_APPROVAL_PENDING');

    // Admin rejects with reason, then approves
    const { agent: adminAgent } = await loginAs('admin@zipit.in');
    const rejectRes = await adminAgent
      .patch(`/api/v1/sellers/${newSellerProfileId}/reject`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ rejectionReason: 'Address verification pending' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.approvalStatus).toBe('REJECTED');

    const profileRes = await newSellerAgent.get('/api/v1/sellers/me');
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.rejectionReason).toBe('Address verification pending');

    const approveRes = await adminAgent
      .patch(`/api/v1/sellers/${newSellerProfileId}/approve`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.approvalStatus).toBe('APPROVED');
  });

  it('rejects invalid dimensions and missing routes in rate calculator', async () => {
    const { agent: sellerAgent } = await loginAs('seller1@apexhardware.in');

    const invalidDim = await sellerAgent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        originPincode: '411026',
        destinationPincode: '400013',
        actualWeightKg: 20,
        lengthCm: -10,
        widthCm: 20,
        heightCm: 20,
      });
    expect(invalidDim.status).toBe(400);
    expect(invalidDim.body.errorCode).toBe('VALIDATION_ERROR');

    const missingRoute = await sellerAgent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        originPincode: '999999',
        destinationPincode: '888888',
        actualWeightKg: 20,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 20,
      });
    expect(missingRoute.status).toBe(404);
    expect(missingRoute.body.errorCode).toBe('ROUTE_NOT_FOUND');
  });

  it('creates booking, enforces idempotency on concurrent/duplicate requests, generates LR PDF, enforces ownership, tracks lifecycle, and validates POD', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: seller2Agent } = await loginAs('seller2@metrotextiles.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');
    const { agent: trans2Agent } = await loginAs('dispatch@rapidroadways.in');

    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const calcRes = await seller1Agent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        actualWeightKg: 100,
        lengthCm: 60,
        widthCm: 50,
        heightCm: 40,
        numberOfPackages: 5,
      });
    expect(calcRes.status).toBe(200);
    expect(calcRes.body.data.quotes.length).toBeGreaterThan(0);

    const swiftQuote = calcRes.body.data.quotes.find((q: { transporterName: string }) =>
      q.transporterName.includes('SwiftLine')
    );
    expect(swiftQuote).toBeDefined();

    const idempotencyKey = `test-idem-${Date.now()}`;
    const bookingPayload = {
      routeId: route!._id.toString(),
      transporterId: swiftQuote.transporterId,
      rateId: swiftQuote.rateId,
      idempotencyKey,
      paymentMode: 'INVOICE',
      sender: {
        name: 'Apex Hardware',
        phone: '9823011223',
        address: 'MIDC Bhosari',
        city: 'Pune',
        pincode: '411026',
      },
      receiver: {
        name: 'Mumbai Hub Buyers',
        phone: '9820011223',
        address: 'Lower Parel',
        city: 'Mumbai',
        pincode: '400013',
      },
      parcel: {
        description: 'Industrial Gears',
        actualWeightKg: 100,
        lengthCm: 60,
        widthCm: 50,
        heightCm: 40,
        numberOfPackages: 5,
      },
    };

    // Concurrent booking creation with same idempotencyKey
    const [resA, resB] = await Promise.all([
      seller1Agent
        .post('/api/v1/bookings')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(bookingPayload),
      seller1Agent
        .post('/api/v1/bookings')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(bookingPayload),
    ]);

    expect([200, 201]).toContain(resA.status);
    expect([200, 201]).toContain(resB.status);
    expect(resA.body.data._id).toBe(resB.body.data._id);
    expect(resA.body.data.lrNumber).toBe(resB.body.data.lrNumber);
    expect(resA.body.data.finalAmount).toBe(swiftQuote.breakdown.finalAmount);

    const bookingId = resA.body.data._id;
    const lrNumber = resA.body.data.lrNumber;

    // Duplicate booking with a NEW idempotencyKey but identical receiver, weight, and price must be blocked (409)
    const dupBookingRes = await seller1Agent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        ...bookingPayload,
        idempotencyKey: `test-dup-${Date.now()}-${Math.random()}`,
      });
    expect(dupBookingRes.status).toBe(409);
    expect(dupBookingRes.body.errorCode).toBe('DUPLICATE_BOOKING');

    // Verify Seller 2 cannot view Seller 1's booking or tracking
    const forbiddenSeller = await seller2Agent.get(`/api/v1/bookings/${bookingId}`);
    expect(forbiddenSeller.status).toBe(403);
    const forbiddenTrack = await seller2Agent.get(`/api/v1/tracking/${lrNumber}`);
    expect(forbiddenTrack.status).toBe(403);

    // Verify Transporter 2 cannot update Transporter 1's booking
    const forbiddenTrans = await trans2Agent
      .patch(`/api/v1/bookings/${bookingId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: BookingStatus.ACCEPTED, location: 'Pune' });
    expect(forbiddenTrans.status).toBe(403);

    // Verify LR PDF download generates valid PDF
    const pdfRes = await seller1Agent.get(`/api/v1/bookings/${bookingId}/lr`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(pdfRes.body.toString('utf8', 0, 4)).toBe('%PDF');

    // Verify Code 128 barcode PNG endpoint works for owner and rejects other sellers
    const barcodeRes = await seller1Agent.get(`/api/v1/bookings/${bookingId}/barcode`);
    expect(barcodeRes.status).toBe(200);
    expect(barcodeRes.headers['content-type']).toContain('image/png');
    expect(barcodeRes.body.slice(1, 4).toString('ascii')).toBe('PNG');
    const forbiddenBarcode = await seller2Agent.get(`/api/v1/bookings/${bookingId}/barcode`);
    expect(forbiddenBarcode.status).toBe(403);

    // Invalid status transition BOOKED -> DELIVERED must fail
    const badTransition = await trans1Agent
      .patch(`/api/v1/bookings/${bookingId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: BookingStatus.DELIVERED, location: 'Mumbai' });
    expect(badTransition.status).toBe(400);
    expect(badTransition.body.errorCode).toBe('INVALID_STATUS_TRANSITION');

    // Valid sequential transitions: ACCEPTED -> DISPATCHED -> ARRIVED
    for (const next of [BookingStatus.ACCEPTED, BookingStatus.DISPATCHED, BookingStatus.ARRIVED]) {
      const stepRes = await trans1Agent
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ status: next, location: 'Hub Checkpoint', remarks: `Transition to ${next}` });
      expect(stepRes.status).toBe(200);
    }

    // Delivery proof validation: reject invalid MIME type
    const badPod = await trans1Agent
      .post(`/api/v1/bookings/${bookingId}/delivery-proof`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('receiverName', 'Rohan Mehta')
      .field('deliveryDate', '2026-11-13')
      .attach('image', Buffer.from('not-an-image'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(badPod.status).toBe(400);
    expect(badPod.body.errorCode).toBe('INVALID_FILE_TYPE');

    // Valid PNG POD upload + markDelivered=true
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const okPod = await trans1Agent
      .post(`/api/v1/bookings/${bookingId}/delivery-proof`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('receiverName', 'Rohan Mehta')
      .field('deliveryDate', '2026-11-13')
      .field('remarks', 'Signed challan collected')
      .field('markDelivered', 'true')
      .attach('image', validPng, { filename: 'pod.png', contentType: 'image/png' });
    expect(okPod.status).toBe(201);

    // Tracking timeline should have all 5 append-only events
    const trackRes = await seller1Agent.get(`/api/v1/tracking/${lrNumber}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.data.currentStatus).toBe(BookingStatus.DELIVERED);
    expect(trackRes.body.data.timeline.map((e: { status: string }) => e.status)).toEqual([
      BookingStatus.BOOKED,
      BookingStatus.ACCEPTED,
      BookingStatus.DISPATCHED,
      BookingStatus.ARRIVED,
      BookingStatus.DELIVERED,
    ]);

    // Private delivery proof image authorized for seller1, forbidden for seller2
    const seller1Img = await seller1Agent.get(`/api/v1/bookings/${bookingId}/delivery-proof/image`);
    expect(seller1Img.status).toBe(200);
    expect(seller1Img.headers['content-type']).toBe('image/png');

    const seller2Img = await seller2Agent.get(`/api/v1/bookings/${bookingId}/delivery-proof/image`);
    expect(seller2Img.status).toBe(403);

    // Confirm no duplicate bookings created for that idempotency key
    const seller1Profile = await SellerProfile.findOne({ email: 'seller1@apexhardware.in' }).lean();
    const count = await Booking.countDocuments({ sellerId: seller1Profile!._id, idempotencyKey });
    expect(count).toBe(1);
  });

  it('supports seller wallet summary, idempotent recharge, role isolation, and WALLET booking debit', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');

    // Non-sellers cannot access wallet endpoints
    const forbiddenWallet = await trans1Agent.get('/api/v1/wallet');
    expect(forbiddenWallet.status).toBe(403);
    expect(forbiddenWallet.body.errorCode).toBe('FORBIDDEN_ROLE');

    // Initial seeded wallet balance is 25,000
    const initialRes = await seller1Agent.get('/api/v1/wallet');
    expect(initialRes.status).toBe(200);
    expect(initialRes.body.data.walletBalance).toBe(25000);
    expect(initialRes.body.data.transactions.length).toBeGreaterThanOrEqual(1);

    // Recharge with idempotency key
    const wltIdemKey = `wlt-test-${Date.now()}`;
    const recharge1 = await seller1Agent
      .post('/api/v1/wallet/recharge')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Idempotency-Key', wltIdemKey)
      .send({
        amount: 2500,
        paymentMethod: 'UPI',
        referenceNote: 'UTR99887766',
      });
    expect(recharge1.status).toBe(201);
    expect(recharge1.body.data.walletBalance).toBe(27500);
    expect(recharge1.body.data.transaction.type).toBe('CREDIT');
    expect(recharge1.body.data.transaction.amount).toBe(2500);

    // Replay with same idempotencyKey must not double-credit
    const rechargeReplay = await seller1Agent
      .post('/api/v1/wallet/recharge')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Idempotency-Key', wltIdemKey)
      .send({
        amount: 2500,
        paymentMethod: 'UPI',
        referenceNote: 'UTR99887766',
      });
    expect(rechargeReplay.status).toBe(200);
    expect(rechargeReplay.body.data.walletBalance).toBe(27500);
    expect(rechargeReplay.body.data.idempotentReplay).toBe(true);

    // Book using WALLET paymentMode
    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const calcRes = await seller1Agent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        actualWeightKg: 40,
        lengthCm: 50,
        widthCm: 40,
        heightCm: 30,
        numberOfPackages: 2,
      });
    expect(calcRes.status).toBe(200);
    const quote = calcRes.body.data.quotes[0];

    const walletBookingRes = await seller1Agent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: quote.transporterId,
        rateId: quote.rateId,
        idempotencyKey: `wlt-bk-${Date.now()}`,
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Wallet Test Buyer',
          phone: '9820099887',
          address: 'Andheri East',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Precision Spares',
          actualWeightKg: 40,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
          numberOfPackages: 2,
        },
      });
    expect(walletBookingRes.status).toBe(201);
    expect(walletBookingRes.body.data.paymentMode).toBe('WALLET');

    const afterBookingWallet = await seller1Agent.get('/api/v1/wallet');
    expect(afterBookingWallet.status).toBe(200);
    expect(afterBookingWallet.body.data.walletBalance).toBe(
      Number((27500 - quote.breakdown.finalAmount).toFixed(2))
    );
    expect(afterBookingWallet.body.data.transactions[0].type).toBe('DEBIT');
    expect(afterBookingWallet.body.data.transactions[0].lrNumber).toBe(
      walletBookingRes.body.data.lrNumber
    );

    // Insufficient wallet balance should be rejected with 400 INSUFFICIENT_WALLET_BALANCE
    const seller1Profile = await SellerProfile.findOne({ email: 'seller1@apexhardware.in' }).lean();
    await SellerProfile.updateOne({ _id: seller1Profile!._id }, { $set: { walletBalance: 50 } });

    const lowBalanceRes = await seller1Agent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: quote.transporterId,
        rateId: quote.rateId,
        idempotencyKey: `wlt-low-${Date.now()}`,
        paymentMode: 'WALLET',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Low Balance Buyer',
          phone: '9820099111',
          address: 'Andheri West',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Copper Coils',
          actualWeightKg: 40,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
          numberOfPackages: 2,
        },
      });
    expect(lowBalanceRes.status).toBe(400);
    expect(lowBalanceRes.body.errorCode).toBe('INSUFFICIENT_WALLET_BALANCE');
  });

  it('exposes admin-only backend health diagnostics on /api/v1/dashboard/health', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: adminAgent } = await loginAs('admin@zipit.in');

    const forbiddenRes = await seller1Agent.get('/api/v1/dashboard/health');
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.errorCode).toBe('FORBIDDEN_ROLE');

    const healthRes = await adminAgent.get('/api/v1/dashboard/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.data.status).toBe('healthy');
    expect(healthRes.body.data.database.connected).toBe(true);
    expect(typeof healthRes.body.data.database.pingMs).toBe('number');
    expect(healthRes.body.data.storage.writable).toBe(true);
  });

  it('supports Seller and Transporter support tickets with Admin replies and access isolation', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');
    const { agent: adminAgent } = await loginAs('admin@zipit.in');

    // Seller creates a support ticket
    const sellerTicketRes = await seller1Agent
      .post('/api/v1/support')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        subject: 'Need morning dock pickup confirmation',
        category: 'PICKUP_DELIVERY',
        priority: 'HIGH',
        lrNumber: 'zipit-lr-100001',
        message: 'Please ensure truck arrives before 10:30 AM at MIDC gate.',
      });
    expect(sellerTicketRes.status).toBe(201);
    expect(sellerTicketRes.body.data.ticketNumber).toMatch(/^ZPT-SUP-/);
    expect(sellerTicketRes.body.data.lrNumber).toBe('ZIPIT-LR-100001');
    const sellerTicketId = sellerTicketRes.body.data._id;

    // Transporter creates a support ticket
    const transTicketRes = await trans1Agent
      .post('/api/v1/support')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        subject: 'Detention approval needed at Ambad MIDC',
        category: 'BILLING_WALLET',
        priority: 'URGENT',
        message: 'Vehicle waited 3.5 hours at consignee gate due to crane unavailability.',
      });
    expect(transTicketRes.status).toBe(201);
    const transTicketId = transTicketRes.body.data._id;

    // Role isolation: seller cannot access transporter ticket
    const forbiddenGet = await seller1Agent.get(`/api/v1/support/${transTicketId}`);
    expect(forbiddenGet.status).toBe(403);
    expect(forbiddenGet.body.errorCode).toBe('TICKET_FORBIDDEN');

    // Admin sees both tickets and replies to seller ticket (moves OPEN -> IN_PROGRESS)
    const adminList = await adminAgent.get('/api/v1/support');
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.items.length).toBeGreaterThanOrEqual(2);

    const adminReply = await adminAgent
      .post(`/api/v1/support/${sellerTicketId}/messages`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ message: 'Confirmed with dispatch supervisor for 10:00 AM arrival.' });
    expect(adminReply.status).toBe(200);
    expect(adminReply.body.data.status).toBe('IN_PROGRESS');
    expect(adminReply.body.data.messages.length).toBe(2);

    // Transporter cannot mark ticket RESOLVED (Admin-only), can CLOSE own ticket
    const forbiddenResolve = await trans1Agent
      .patch(`/api/v1/support/${transTicketId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'RESOLVED' });
    expect(forbiddenResolve.status).toBe(403);

    const closeRes = await trans1Agent
      .patch(`/api/v1/support/${transTicketId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'CLOSED' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('CLOSED');
  });

  it('supports transporter booking rejection with automatic wallet refund, carton barcode scanning, service areas bulk import, profile updates, and earnings ledger', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');

    // Top up seller1 wallet cleanly so WALLET booking succeeds
    const topupRes = await seller1Agent
      .post('/api/v1/wallet/recharge')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Idempotency-Key', `wlt-reject-topup-${Date.now()}`)
      .send({ amount: 15000, paymentMethod: 'NEFT_RTGS', referenceNote: 'NEFT-TEST-901' });
    expect(topupRes.status).toBe(201);
    const balanceBeforeBooking = topupRes.body.data.walletBalance;

    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const calcRes = await seller1Agent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        actualWeightKg: 35,
        lengthCm: 50,
        widthCm: 40,
        heightCm: 30,
        numberOfPackages: 3,
      });
    expect(calcRes.status).toBe(200);
    const swiftQuote = calcRes.body.data.quotes.find((q: { transporterName: string }) =>
      q.transporterName.includes('SwiftLine')
    );
    expect(swiftQuote).toBeDefined();

    // Create WALLET booking that transporter will REJECT
    const walletBkRes = await seller1Agent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: swiftQuote.transporterId,
        rateId: swiftQuote.rateId,
        idempotencyKey: `reject-test-${Date.now()}`,
        paymentMode: 'WALLET',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Reject Flow Consignee',
          phone: '9820012345',
          address: 'Lower Parel East',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Fragile Valve Assembly',
          actualWeightKg: 35,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
          numberOfPackages: 3,
        },
      });
    expect(walletBkRes.status).toBe(201);
    const rejectBookingId = walletBkRes.body.data._id;
    const rejectLr = walletBkRes.body.data.lrNumber;

    // Rejection without reason must fail validation
    const missingReasonRes = await trans1Agent
      .patch(`/api/v1/bookings/${rejectBookingId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: BookingStatus.REJECTED, location: 'Pune (411026)', remarks: 'no' });
    expect(missingReasonRes.status).toBe(400);

    // Transporter rejects booking with valid reason -> automatic wallet refund
    const rejectRes = await trans1Agent
      .patch(`/api/v1/bookings/${rejectBookingId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        status: BookingStatus.REJECTED,
        location: 'Pune (411026)',
        remarks: 'No covered container vehicle available for today',
      });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.booking.status).toBe(BookingStatus.REJECTED);
    expect(rejectRes.body.data.booking.rejectionReason).toContain('covered container');
    expect(rejectRes.body.data.refundedAmount).toBe(swiftQuote.breakdown.finalAmount);

    // Verify seller wallet balance was fully restored and WALLET_REFUND logged
    const walletAfterReject = await seller1Agent.get('/api/v1/wallet');
    expect(walletAfterReject.status).toBe(200);
    expect(walletAfterReject.body.data.walletBalance).toBe(balanceBeforeBooking);
    expect(walletAfterReject.body.data.transactions[0].type).toBe('CREDIT');
    expect(walletAfterReject.body.data.transactions[0].paymentMethod).toBe('WALLET_REFUND');
    expect(walletAfterReject.body.data.transactions[0].lrNumber).toBe(rejectLr);

    // Scanning cartons on a rejected booking must be blocked
    const scanRejectedRes = await trans1Agent
      .post(`/api/v1/bookings/${rejectBookingId}/cartons/scan`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ cartonNumber: 1 });
    expect(scanRejectedRes.status).toBe(400);
    expect(scanRejectedRes.body.errorCode).toBe('BOOKING_REJECTED');

    // Create a second INVOICE booking for carton barcode scanning tests
    const scanBkRes = await seller1Agent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: swiftQuote.transporterId,
        rateId: swiftQuote.rateId,
        idempotencyKey: `carton-test-${Date.now()}`,
        paymentMode: 'INVOICE',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Carton Scan Consignee',
          phone: '9820055566',
          address: 'Andheri East',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Precision Fasteners',
          actualWeightKg: 45,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
          numberOfPackages: 3,
        },
      });
    expect(scanBkRes.status).toBe(201);
    const scanBookingId = scanBkRes.body.data._id;
    const scanLr = scanBkRes.body.data.lrNumber;

    // Download carton 1 PNG barcode label
    const cartonPngRes = await trans1Agent.get(`/api/v1/bookings/${scanBookingId}/cartons/1/barcode`);
    expect(cartonPngRes.status).toBe(200);
    expect(cartonPngRes.headers['content-type']).toContain('image/png');
    expect(cartonPngRes.body.slice(1, 4).toString('ascii')).toBe('PNG');

    // Out-of-bounds carton number must return 400
    const badCartonPngRes = await trans1Agent.get(`/api/v1/bookings/${scanBookingId}/cartons/9/barcode`);
    expect(badCartonPngRes.status).toBe(400);

    // Scan carton 1 via booking endpoint
    const scan1 = await trans1Agent
      .post(`/api/v1/bookings/${scanBookingId}/cartons/scan`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ cartonNumber: 1, location: 'Pune Dock 2' });
    expect(scan1.status).toBe(200);
    expect(scan1.body.data.alreadyScanned).toBe(false);
    expect(scan1.body.data.scannedCount).toBe(1);
    expect(scan1.body.data.scannedCarton.cartonCode).toBe(`${scanLr}-C01`);

    // Global scanner endpoint scans carton 2 and reports idempotent duplicate on re-scan
    const scan2 = await trans1Agent
      .post('/api/v1/transporter/cartons/scan')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ cartonCode: `${scanLr}-C02`, location: 'Mumbai Inbound Hub' });
    expect(scan2.status).toBe(200);
    expect(scan2.body.data.alreadyScanned).toBe(false);
    expect(scan2.body.data.scannedCount).toBe(2);

    const scan2Dup = await trans1Agent
      .post('/api/v1/transporter/cartons/scan')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ cartonCode: `${scanLr}-C02` });
    expect(scan2Dup.status).toBe(200);
    expect(scan2Dup.body.data.alreadyScanned).toBe(true);
    expect(scan2Dup.body.data.scannedCount).toBe(2);

    // Transporter self-profile & service area management (manual + bulk import + remove)
    const profileGet = await trans1Agent.get('/api/v1/transporter/profile');
    expect(profileGet.status).toBe(200);
    expect(profileGet.body.data.companyName).toContain('SwiftLine');

    const profilePatch = await trans1Agent
      .patch('/api/v1/transporter/profile')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ contactPerson: 'Vikram Nair Ops' });
    expect(profilePatch.status).toBe(200);
    expect(profilePatch.body.data.contactPerson).toBe('Vikram Nair Ops');

    const addArea = await trans1Agent
      .post('/api/v1/transporter/service-areas')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ city: 'Kolhapur', pincode: '416001' });
    expect(addArea.status).toBe(201);
    expect(addArea.body.data.addedCount).toBe(1);

    const bulkImport = await trans1Agent
      .post('/api/v1/transporter/service-areas/import')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        serviceAreas: [
          { city: 'Kolhapur', pincode: '416001' }, // duplicate
          { city: 'Aurangabad', pincode: '431001' },
          { city: 'Satara', pincode: '415001' },
        ],
      });
    expect(bulkImport.status).toBe(200);
    expect(bulkImport.body.data.addedCount).toBe(2);
    expect(bulkImport.body.data.duplicateCount).toBe(1);

    const removeArea = await trans1Agent
      .delete('/api/v1/transporter/service-areas')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ city: 'Satara', pincode: '415001' });
    expect(removeArea.status).toBe(200);

    // Transporter earnings & settlement history
    const earningsRes = await trans1Agent.get('/api/v1/transporter/earnings');
    expect(earningsRes.status).toBe(200);
    expect(earningsRes.body.data.commissionRatePercent).toBe(5);
    expect(earningsRes.body.data.settlements.length).toBeGreaterThanOrEqual(1);
    expect(earningsRes.body.data.summary.totalSettled).toBeGreaterThan(0);
    expect(earningsRes.body.data.shipmentLedger.length).toBeGreaterThanOrEqual(1);
  });

  it('captures frontend and backend errors into real-time SystemIncident alerts with Admin-only inspection', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: adminAgent } = await loginAs('admin@zipit.in');

    // 1. Frontend UI error reporting endpoint captures incident (202 Accepted)
    const uiErrRes = await seller1Agent
      .post('/api/v1/alerts/client-error')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        severity: 'ERROR',
        errorCode: 'UI_UNCAUGHT_ERROR',
        message: 'Simulated TypeError in booking calculator component',
        route: '/seller/book',
      });
    expect(uiErrRes.status).toBe(202);
    expect(uiErrRes.body.data.recorded).toBe(true);
    expect(uiErrRes.body.data.incidentId).toBeTruthy();

    // 2. Normal unauthenticated /auth/me check should NOT flood SystemIncidents
    const unauthMe = await request(app).get('/api/v1/auth/me');
    expect(unauthMe.status).toBe(401);

    // 3. Small backend 4xx error should be captured as WARN automatically
    const notFoundRes = await seller1Agent.get('/api/v1/bookings/000000000000000000000000');
    expect(notFoundRes.status).toBe(404);

    // Allow fire-and-forget alert persistence microtask to flush
    await new Promise((r) => setTimeout(r, 100));

    // 4. Seller cannot read alerts or trigger test ping (Admin RBAC enforced)
    const sellerAlertsForbidden = await seller1Agent.get('/api/v1/alerts');
    expect(sellerAlertsForbidden.status).toBe(403);
    expect(sellerAlertsForbidden.body.errorCode).toBe('FORBIDDEN_ROLE');

    const sellerTestForbidden = await seller1Agent
      .post('/api/v1/alerts/test')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({});
    expect(sellerTestForbidden.status).toBe(403);

    // 5. Admin can list recorded incidents and send a test alert ping without exposing raw webhook URLs
    const adminAlerts = await adminAgent.get('/api/v1/alerts?limit=25');
    expect(adminAlerts.status).toBe(200);
    expect(adminAlerts.body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(adminAlerts.body.data.configuration).toHaveProperty('discordConfigured');
    expect(adminAlerts.body.data.configuration).toHaveProperty('genericWebhookConfigured');
    expect(adminAlerts.body.data.configuration.minLevel).toBe('WARN');

    const serializedConfig = JSON.stringify(adminAlerts.body.data.configuration);
    expect(serializedConfig).not.toContain('discord.com/api/webhooks');

    const hasUiIncident = adminAlerts.body.data.items.some(
      (item: { source: string; errorCode: string }) =>
        item.source === 'FRONTEND_UI' && item.errorCode === 'UI_UNCAUGHT_ERROR'
    );
    expect(hasUiIncident).toBe(true);

    const hasSuppressedAuthMe = adminAlerts.body.data.items.some(
      (item: { route?: string; errorCode: string }) =>
        item.route?.includes('/api/v1/auth/me') && item.errorCode === 'AUTH_REQUIRED'
    );
    expect(hasSuppressedAuthMe).toBe(false);

    const testPingRes = await adminAgent
      .post('/api/v1/alerts/test')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ message: 'Integration test verification ping' });
    expect(testPingRes.status).toBe(200);
    expect(testPingRes.body.data.incidentId).toBeTruthy();

    const searchAlertsRes = await adminAgent.get(
      '/api/v1/alerts?severity=ERROR&source=FRONTEND_UI&search=UI_UNCAUGHT_ERROR'
    );
    expect(searchAlertsRes.status).toBe(200);
    expect(searchAlertsRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(searchAlertsRes.body.data.items[0].errorCode).toBe('UI_UNCAUGHT_ERROR');
  });

  it('creates role-scoped notifications on business events with ownership isolation and read/clear actions', async () => {
    const { agent: seller1Agent, body: seller1Login } = await loginAs('seller1@apexhardware.in');
    const { agent: trans1Agent, body: trans1Login } = await loginAs('ops@swiftlinefreight.in');
    const { agent: adminAgent, body: adminLogin } = await loginAs('admin@zipit.in');

    const seller1UserId = seller1Login.data.user.id as string;
    const trans1UserId = trans1Login.data.user.id as string;
    const adminUserId = adminLogin.data.user.id as string;

    // 1. Trigger a wallet recharge -> generates WALLET notification for seller1
    const rechargeRes = await seller1Agent
      .post('/api/v1/wallet/recharge')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Idempotency-Key', `notif-wlt-${Date.now()}`)
      .send({ amount: 500, paymentMethod: 'UPI', referenceNote: 'NOTIF-UPI-1' });
    expect(rechargeRes.status).toBe(201);

    // 2. Trigger seller support ticket -> generates SUPPORT notification for all admins via notifyAllAdmins
    const sellerTicketRes = await seller1Agent
      .post('/api/v1/support')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        subject: 'Notification ownership verification ticket',
        category: 'PICKUP_DELIVERY',
        priority: 'LOW',
        message: 'Testing admin notification recipient mapping and read permissions.',
      });
    expect(sellerTicketRes.status).toBe(201);

    // 3. Trigger transporter support ticket + admin reply -> generates SUPPORT notification for trans1
    const transTicketRes = await trans1Agent
      .post('/api/v1/support')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        subject: 'Transporter notification verification ticket',
        category: 'BILLING_WALLET',
        priority: 'LOW',
        message: 'Testing transporter notification ownership.',
      });
    expect(transTicketRes.status).toBe(201);

    const adminReplyRes = await adminAgent
      .post(`/api/v1/support/${transTicketRes.body.data._id}/messages`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ message: 'Acknowledged by operations team.' });
    expect(adminReplyRes.status).toBe(200);

    // Allow non-blocking notification inserts to settle
    await new Promise((r) => setTimeout(r, 150));

    // Verify Seller notifications have correct recipientUserId and recipientRole
    const sellerNotifs = await seller1Agent.get('/api/v1/notifications?unreadOnly=true');
    expect(sellerNotifs.status).toBe(200);
    expect(sellerNotifs.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    const walletNotif = sellerNotifs.body.data.items.find(
      (n: { category: string }) => n.category === 'WALLET'
    );
    expect(walletNotif).toBeDefined();
    expect(walletNotif.recipientUserId).toBe(seller1UserId);
    expect(walletNotif.recipientRole).toBe('SELLER');

    // Verify Transporter notifications have correct recipientUserId and recipientRole
    const transNotifs = await trans1Agent.get('/api/v1/notifications?unreadOnly=true');
    expect(transNotifs.status).toBe(200);
    expect(transNotifs.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    const transSupportNotif = transNotifs.body.data.items.find(
      (n: { category: string; entityId?: string }) =>
        n.category === 'SUPPORT' && n.entityId === transTicketRes.body.data._id
    );
    expect(transSupportNotif).toBeDefined();
    expect(transSupportNotif.recipientUserId).toBe(trans1UserId);
    expect(transSupportNotif.recipientRole).toBe('TRANSPORTER');

    // Verify Admin notifications created via notifyAllAdmins have correct recipientUserId and recipientRole
    const adminNotifs = await adminAgent.get('/api/v1/notifications?unreadOnly=true');
    expect(adminNotifs.status).toBe(200);
    expect(adminNotifs.body.data.items.length).toBeGreaterThanOrEqual(1);
    const adminTicketNotif = adminNotifs.body.data.items.find(
      (n: { category: string; entityId?: string }) =>
        n.category === 'SUPPORT' && n.entityId === sellerTicketRes.body.data._id
    );
    expect(adminTicketNotif).toBeDefined();
    expect(adminTicketNotif.recipientUserId).toBe(adminUserId);
    expect(adminTicketNotif.recipientRole).toBe('ADMIN');

    // Cross-user isolation: Transporter cannot mark Seller or Admin notifications as read (403)
    const transReadsSeller = await trans1Agent
      .patch(`/api/v1/notifications/${walletNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(transReadsSeller.status).toBe(403);
    expect(transReadsSeller.body.errorCode).toBe('NOTIFICATION_FORBIDDEN');

    const transReadsAdmin = await trans1Agent
      .patch(`/api/v1/notifications/${adminTicketNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(transReadsAdmin.status).toBe(403);
    expect(transReadsAdmin.body.errorCode).toBe('NOTIFICATION_FORBIDDEN');

    // Cross-user isolation: Seller cannot mark Admin or Transporter notifications as read (403)
    const sellerReadsAdmin = await seller1Agent
      .patch(`/api/v1/notifications/${adminTicketNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(sellerReadsAdmin.status).toBe(403);
    expect(sellerReadsAdmin.body.errorCode).toBe('NOTIFICATION_FORBIDDEN');

    const sellerReadsTrans = await seller1Agent
      .patch(`/api/v1/notifications/${transSupportNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(sellerReadsTrans.status).toBe(403);
    expect(sellerReadsTrans.body.errorCode).toBe('NOTIFICATION_FORBIDDEN');

    // Cross-user isolation: Admin cannot mark Seller or Transporter notifications as read (403)
    const adminReadsSeller = await adminAgent
      .patch(`/api/v1/notifications/${walletNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(adminReadsSeller.status).toBe(403);
    expect(adminReadsSeller.body.errorCode).toBe('NOTIFICATION_FORBIDDEN');
    expect(adminReadsSeller.body.message).toBe('You are not authorized to access this notification.');

    const adminReadsTrans = await adminAgent
      .patch(`/api/v1/notifications/${transSupportNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(adminReadsTrans.status).toBe(403);
    expect(adminReadsTrans.body.errorCode).toBe('NOTIFICATION_FORBIDDEN');

    // Missing notification ID returns 404 NOTIFICATION_NOT_FOUND
    const missingNotifRes = await adminAgent
      .patch('/api/v1/notifications/000000000000000000000000/read')
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(missingNotifRes.status).toBe(404);
    expect(missingNotifRes.body.errorCode).toBe('NOTIFICATION_NOT_FOUND');

    // Owner read access succeeds (200) for SELLER, TRANSPORTER, and ADMIN
    const sellerMarkOneRes = await seller1Agent
      .patch(`/api/v1/notifications/${walletNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(sellerMarkOneRes.status).toBe(200);
    expect(sellerMarkOneRes.body.data.isRead).toBe(true);

    const transMarkOneRes = await trans1Agent
      .patch(`/api/v1/notifications/${transSupportNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(transMarkOneRes.status).toBe(200);
    expect(transMarkOneRes.body.data.isRead).toBe(true);

    const adminMarkOneRes = await adminAgent
      .patch(`/api/v1/notifications/${adminTicketNotif._id}/read`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(adminMarkOneRes.status).toBe(200);
    expect(adminMarkOneRes.body.data.isRead).toBe(true);

    // Seller marks all read and clears read notifications without affecting other roles
    const markAllRes = await seller1Agent
      .patch('/api/v1/notifications/read-all')
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(markAllRes.status).toBe(200);

    const afterReadAll = await seller1Agent.get('/api/v1/notifications?unreadOnly=true');
    expect(afterReadAll.status).toBe(200);
    expect(afterReadAll.body.data.unreadCount).toBe(0);

    const clearReadRes = await seller1Agent
      .delete('/api/v1/notifications/read')
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(clearReadRes.status).toBe(200);
    expect(clearReadRes.body.data.deletedCount).toBeGreaterThanOrEqual(1);
  });

  it('supports end-to-end Seller and Transporter KYC details, magic-byte document upload, ownership isolation, and Admin review', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');
    const { agent: adminAgent } = await loginAs('admin@zipit.in');

    // 1. Invalid PAN/IFSC must fail Zod validation
    const invalidKyc = await seller1Agent
      .put('/api/v1/kyc/me')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        panNumber: 'BADPAN',
        bankAccountHolder: 'Apex Hardware Pvt Ltd',
        bankAccountNumber: '50100234567890',
        ifscCode: 'INVALID',
        bankName: 'HDFC Bank',
      });
    expect(invalidKyc.status).toBe(400);

    // 2. Seller submits valid PAN & Bank details -> status becomes PENDING
    const sellerKycRes = await seller1Agent
      .put('/api/v1/kyc/me')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        panNumber: 'AABCA1234F',
        bankAccountHolder: 'Apex Hardware Pvt Ltd',
        bankAccountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        bankName: 'HDFC Bank',
      });
    expect(sellerKycRes.status).toBe(200);
    expect(sellerKycRes.body.data.kyc.status).toBe('PENDING');
    expect(sellerKycRes.body.data.kyc.panNumber).toBe('AABCA1234F');
    const sellerProfileId = sellerKycRes.body.data.profileId;

    // 3. Magic-byte spoofing rejection: fake text uploaded as application/pdf
    const spoofedPdf = Buffer.from('not really a pdf document', 'utf8');
    const spoofRes = await seller1Agent
      .post('/api/v1/kyc/me/documents')
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('docType', 'GST_CERTIFICATE')
      .attach('document', spoofedPdf, {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      });
    expect(spoofRes.status).toBe(400);
    expect(spoofRes.body.errorCode).toBe('INVALID_FILE_SIGNATURE');

    // 4. Valid PDF upload for Seller GST Certificate
    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8');
    const sellerPdfRes = await seller1Agent
      .post('/api/v1/kyc/me/documents')
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('docType', 'GST_CERTIFICATE')
      .attach('document', validPdf, {
        filename: 'gst-reg.pdf',
        contentType: 'application/pdf',
      });
    expect(sellerPdfRes.status).toBe(201);
    expect(sellerPdfRes.body.data.kyc.documents).toHaveLength(1);
    expect(sellerPdfRes.body.data.kyc.documents[0].docType).toBe('GST_CERTIFICATE');
    expect(sellerPdfRes.body.data.kyc.documents[0].storageKey).toBeUndefined();

    // 5. Transporter submits PAN, bank details, and a valid PNG PAN Card document
    const transKycRes = await trans1Agent
      .put('/api/v1/kyc/me')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        panNumber: 'AABCS9988K',
        bankAccountHolder: 'SwiftLine Freight Solutions LLP',
        bankAccountNumber: '918273645501',
        ifscCode: 'ICIC0000456',
        bankName: 'ICICI Bank',
      });
    expect(transKycRes.status).toBe(200);
    const transProfileId = transKycRes.body.data.profileId;

    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const transPngRes = await trans1Agent
      .post('/api/v1/kyc/me/documents')
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('docType', 'PAN_CARD')
      .attach('document', validPng, {
        filename: 'pan-copy.png',
        contentType: 'image/png',
      });
    expect(transPngRes.status).toBe(201);
    expect(transPngRes.body.data.kyc.documents[0].docType).toBe('PAN_CARD');

    // 6. Ownership isolation: Seller cannot read Transporter's KYC document; Transporter & Admin can
    const crossRead = await seller1Agent.get(
      `/api/v1/kyc/TRANSPORTER/${transProfileId}/documents/PAN_CARD`
    );
    expect(crossRead.status).toBe(403);
    expect(crossRead.body.errorCode).toBe('KYC_DOCUMENT_FORBIDDEN');

    const selfStream = await seller1Agent.get(
      `/api/v1/kyc/SELLER/${sellerProfileId}/documents/GST_CERTIFICATE`
    );
    expect(selfStream.status).toBe(200);
    expect(selfStream.headers['content-type']).toContain('application/pdf');
    expect(selfStream.headers['x-content-type-options']).toBe('nosniff');

    const adminStream = await adminAgent.get(
      `/api/v1/kyc/TRANSPORTER/${transProfileId}/documents/PAN_CARD`
    );
    expect(adminStream.status).toBe(200);
    expect(adminStream.headers['content-type']).toContain('image/png');

    // 7. Admin KYC queue lists both Seller & Transporter without leaking storageKey
    const queueRes = await adminAgent.get('/api/v1/kyc/queue?status=PENDING');
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.data.summary.pending).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(queueRes.body.data.items)).not.toContain('storageKey');

    // 8. Admin rejects Transporter KYC without reason -> 400; with reason -> 200 REJECTED
    const badReject = await adminAgent
      .patch(`/api/v1/kyc/TRANSPORTER/${transProfileId}/review`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'REJECTED', rejectionReason: 'no' });
    expect(badReject.status).toBe(400);

    const rejectTrans = await adminAgent
      .patch(`/api/v1/kyc/TRANSPORTER/${transProfileId}/review`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        status: 'REJECTED',
        rejectionReason: 'Uploaded PAN copy is cropped; please upload full card scan.',
      });
    expect(rejectTrans.status).toBe(200);
    expect(rejectTrans.body.data.kyc.status).toBe('REJECTED');

    // 9. Admin verifies Seller KYC -> 200 VERIFIED and Seller receives notification
    const verifySeller = await adminAgent
      .patch(`/api/v1/kyc/SELLER/${sellerProfileId}/review`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: 'VERIFIED', alsoApproveSeller: true });
    expect(verifySeller.status).toBe(200);
    expect(verifySeller.body.data.kyc.status).toBe('VERIFIED');

    await new Promise((r) => setTimeout(r, 100));

    const sellerKycAfter = await seller1Agent.get('/api/v1/kyc/me');
    expect(sellerKycAfter.status).toBe(200);
    expect(sellerKycAfter.body.data.kyc.status).toBe('VERIFIED');

    const transNotifs = await trans1Agent.get('/api/v1/notifications?category=SELLER_KYC');
    expect(transNotifs.status).toBe(200);
    expect(transNotifs.body.data.items.some((n: { title: string }) => n.title.includes('Rejected'))).toBe(
      true
    );
  });

  it('supports Seller pre-dispatch self-cancellation with WALLET_REFUND and end-to-end NDR -> Re-Attempt / RTO return flow with RTO_CHARGE debit', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: seller2Agent } = await loginAs('seller2@metrotextiles.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');

    // Top up seller1 wallet so both bookings & RTO fee are cleanly covered
    const topupRes = await seller1Agent
      .post('/api/v1/wallet/recharge')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Idempotency-Key', `ndr-rto-topup-${Date.now()}`)
      .send({ amount: 25000, paymentMethod: 'UPI', referenceNote: 'NDR-RTO-TEST' });
    expect(topupRes.status).toBe(201);
    const startingBalance = topupRes.body.data.walletBalance;

    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const calcRes = await seller1Agent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        actualWeightKg: 30,
        lengthCm: 45,
        widthCm: 35,
        heightCm: 25,
        numberOfPackages: 2,
      });
    expect(calcRes.status).toBe(200);
    const swiftQuote = calcRes.body.data.quotes.find((q: { transporterName: string }) =>
      q.transporterName.includes('SwiftLine')
    );
    expect(swiftQuote).toBeDefined();
    expect(swiftQuote.breakdown.rtoCharges).toBeGreaterThan(0);

    // 1. Create WALLET booking #1 for Seller self-cancellation
    const bk1Res = await seller1Agent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: swiftQuote.transporterId,
        rateId: swiftQuote.rateId,
        idempotencyKey: `cancel-test-${Date.now()}`,
        paymentMode: 'WALLET',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Self Cancel Consignee',
          phone: '9820011999',
          address: 'Andheri East',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Brass Couplings',
          actualWeightKg: 30,
          lengthCm: 45,
          widthCm: 35,
          heightCm: 25,
          numberOfPackages: 2,
        },
      });
    expect(bk1Res.status).toBe(201);
    const bk1Id = bk1Res.body.data._id;
    const bk1Lr = bk1Res.body.data.lrNumber;

    // Ownership isolation: another seller cannot cancel bk1
    const forbiddenCancel = await seller2Agent
      .post(`/api/v1/bookings/${bk1Id}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ reason: 'Unauthorized attempt' });
    expect(forbiddenCancel.status).toBe(403);

    // Short reason must fail Zod validation
    const shortCancel = await seller1Agent
      .post(`/api/v1/bookings/${bk1Id}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ reason: 'no' });
    expect(shortCancel.status).toBe(400);

    // Seller self-cancels bk1 before dispatch -> full WALLET_REFUND
    const cancelOk = await seller1Agent
      .post(`/api/v1/bookings/${bk1Id}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ reason: 'Customer cancelled purchase order prior to dispatch' });
    expect(cancelOk.status).toBe(200);
    expect(cancelOk.body.data.booking.status).toBe(BookingStatus.CANCELLED);
    expect(cancelOk.body.data.refundedAmount).toBe(swiftQuote.breakdown.finalAmount);

    const walletAfterCancel = await seller1Agent.get('/api/v1/wallet');
    expect(walletAfterCancel.status).toBe(200);
    expect(walletAfterCancel.body.data.walletBalance).toBe(startingBalance);
    expect(walletAfterCancel.body.data.transactions[0].paymentMethod).toBe('WALLET_REFUND');

    // 2. Create WALLET booking #2 and advance through DISPATCHED -> ARRIVED -> NDR -> RTO_INITIATED -> RTO_DELIVERED
    const bk2Res = await seller1Agent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: swiftQuote.transporterId,
        rateId: swiftQuote.rateId,
        idempotencyKey: `ndr-test-${Date.now()}`,
        paymentMode: 'WALLET',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'NDR Flow Consignee',
          phone: '9820088776',
          address: 'Lower Parel West',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Hydraulic Valves',
          actualWeightKg: 30,
          lengthCm: 45,
          widthCm: 35,
          heightCm: 25,
          numberOfPackages: 2,
        },
      });
    expect(bk2Res.status).toBe(201);
    const bk2Id = bk2Res.body.data._id;
    const bk2Lr = bk2Res.body.data.lrNumber;

    for (const next of [BookingStatus.ACCEPTED, BookingStatus.DISPATCHED, BookingStatus.ARRIVED]) {
      const stepRes = await trans1Agent
        .patch(`/api/v1/bookings/${bk2Id}/status`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ status: next, location: 'Transit Checkpoint' });
      expect(stepRes.status).toBe(200);
    }

    // Seller cannot self-cancel once DISPATCHED / ARRIVED
    const lateCancel = await seller1Agent
      .post(`/api/v1/bookings/${bk2Id}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ reason: 'Trying to cancel after arrival' });
    expect(lateCancel.status).toBe(400);
    expect(lateCancel.body.errorCode).toBe('CANCELLATION_NOT_ALLOWED');

    // Transporter marks ARRIVED -> NDR without remarks must fail
    const ndrNoReason = await trans1Agent
      .patch(`/api/v1/bookings/${bk2Id}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: BookingStatus.NDR, location: 'Mumbai (400013)', remarks: 'x' });
    expect(ndrNoReason.status).toBe(400);

    // Transporter marks ARRIVED -> NDR with valid reason
    const ndrRes = await trans1Agent
      .patch(`/api/v1/bookings/${bk2Id}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        status: BookingStatus.NDR,
        location: 'Mumbai (400013)',
        remarks: 'Consignee warehouse shutter closed at 5:15 PM',
      });
    expect(ndrRes.status).toBe(200);
    expect(ndrRes.body.data.booking.status).toBe(BookingStatus.NDR);
    expect(ndrRes.body.data.booking.ndrAttempts).toBe(1);

    // Seller submits REATTEMPT instructions
    const reattemptRes = await seller1Agent
      .post(`/api/v1/bookings/${bk2Id}/ndr-action`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        action: 'REATTEMPT',
        remarks: 'Re-attempt between 10 AM and 2 PM; ask for Mr. Kulkarni',
      });
    expect(reattemptRes.status).toBe(200);
    expect(reattemptRes.body.data.booking.status).toBe(BookingStatus.NDR);

    // Seller approves INITIATE_RTO -> debits rtoCharges from wallet
    const rtoInitRes = await seller1Agent
      .post(`/api/v1/bookings/${bk2Id}/ndr-action`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        action: 'INITIATE_RTO',
        remarks: 'Consignee confirmed order cancellation; return stock to Pune plant',
      });
    expect(rtoInitRes.status).toBe(200);
    expect(rtoInitRes.body.data.booking.status).toBe(BookingStatus.RTO_INITIATED);
    expect(rtoInitRes.body.data.booking.rtoBilledStatus).toBe('WALLET_DEBITED');
    expect(rtoInitRes.body.data.rtoDebitedAmount).toBe(swiftQuote.breakdown.rtoCharges);

    const walletAfterRto = await seller1Agent.get('/api/v1/wallet');
    expect(walletAfterRto.status).toBe(200);
    expect(walletAfterRto.body.data.transactions[0].type).toBe('DEBIT');
    expect(walletAfterRto.body.data.transactions[0].paymentMethod).toBe('RTO_CHARGE');
    expect(walletAfterRto.body.data.transactions[0].lrNumber).toBe(bk2Lr);
    expect(walletAfterRto.body.data.walletBalance).toBe(
      Number(
        (
          startingBalance -
          swiftQuote.breakdown.finalAmount -
          swiftQuote.breakdown.rtoCharges
        ).toFixed(2)
      )
    );

    // Transporter delivers RTO shipment back to origin
    const rtoDeliveredRes = await trans1Agent
      .patch(`/api/v1/bookings/${bk2Id}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        status: BookingStatus.RTO_DELIVERED,
        location: 'Pune (411026)',
        remarks: 'Returned goods handed over at Apex Hardware dock',
      });
    expect(rtoDeliveredRes.status).toBe(200);
    expect(rtoDeliveredRes.body.data.booking.status).toBe(BookingStatus.RTO_DELIVERED);
    expect(rtoDeliveredRes.body.data.booking.rtoDeliveredAt).toBeTruthy();

    // Earnings ledger shows RTO_RETURN for bk2 and excludes cancelled bk1
    const earningsRes = await trans1Agent.get('/api/v1/transporter/earnings');
    expect(earningsRes.status).toBe(200);
    const bk2Ledger = earningsRes.body.data.shipmentLedger.find(
      (item: { lrNumber: string }) => item.lrNumber === bk2Lr
    );
    const bk1Ledger = earningsRes.body.data.shipmentLedger.find(
      (item: { lrNumber: string }) => item.lrNumber === bk1Lr
    );
    expect(bk2Ledger).toBeDefined();
    expect(bk2Ledger.settlementState).toBe('RTO_RETURN');
    expect(bk1Ledger).toBeUndefined();
  });

  it('supports Razorpay wallet checkout order creation, HMAC signature verification, webhook settlement, ownership isolation, and double-credit idempotency', async () => {
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: seller2Agent } = await loginAs('seller2@metrotextiles.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');

    const prevKeyId = process.env.RAZORPAY_KEY_ID;
    const prevKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const prevWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    try {
      // 1. Unconfigured gateway reports configured=false and returns 503 on order creation
      const unconfRes = await seller1Agent.get('/api/v1/payments/config');
      expect(unconfRes.status).toBe(200);
      expect(unconfRes.body.data.configured).toBe(false);

      const unconfOrder = await seller1Agent
        .post('/api/v1/payments/orders')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ amount: 1500, paymentMethod: 'UPI' });
      expect(unconfOrder.status).toBe(503);
      expect(unconfOrder.body.errorCode).toBe('PAYMENT_GATEWAY_NOT_CONFIGURED');

      // 2. Configure test Razorpay credentials & mock Razorpay Orders HTTP API
      const testKeyId = 'rzp_test_ZipitGateway01';
      const testKeySecret = 'rzp_test_secret_super_987654';
      const testWebhookSecret = 'rzp_whsec_super_543210';

      process.env.RAZORPAY_KEY_ID = testKeyId;
      process.env.RAZORPAY_KEY_SECRET = testKeySecret;
      process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

      let orderSeq = 1;
      const originalFetch = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url === 'https://api.razorpay.com/v1/orders') {
          const reqBody = JSON.parse(String(init?.body || '{}')) as { amount: number; receipt: string };
          return new Response(
            JSON.stringify({
              id: `order_rzptest_${Date.now()}_${orderSeq++}`,
              amount: reqBody.amount,
              currency: 'INR',
              receipt: reqBody.receipt,
              status: 'created',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      });

      // 3. Config reveals safe metadata only (never secrets)
      const confRes = await seller1Agent.get('/api/v1/payments/config');
      expect(confRes.status).toBe(200);
      expect(confRes.body.data.configured).toBe(true);
      expect(confRes.body.data.webhookConfigured).toBe(true);
      expect(JSON.stringify(confRes.body)).not.toContain(testKeySecret);
      expect(JSON.stringify(confRes.body)).not.toContain(testWebhookSecret);

      // 4. Transporter cannot create seller wallet payment orders
      const transOrderRes = await trans1Agent
        .post('/api/v1/payments/orders')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ amount: 1500, paymentMethod: 'UPI' });
      expect(transOrderRes.status).toBe(403);
      expect(transOrderRes.body.errorCode).toBe('FORBIDDEN_ROLE');

      // 5. Record starting wallet balance for seller1
      const startWallet = await seller1Agent.get('/api/v1/wallet');
      expect(startWallet.status).toBe(200);
      const startBalance = Number(startWallet.body.data.walletBalance);

      // 6. Seller1 creates a INR 3,500 Razorpay order
      const createOrder1 = await seller1Agent
        .post('/api/v1/payments/orders')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ amount: 3500, paymentMethod: 'UPI' });
      expect(createOrder1.status).toBe(201);
      const orderId1 = createOrder1.body.data.gatewayOrderId as string;
      expect(orderId1).toMatch(/^order_rzptest_/);
      expect(createOrder1.body.data.gatewayKeyId).toBe(testKeyId);
      expect(createOrder1.body.data.amountPaise).toBe(350000);

      const paymentId1 = `pay_rzptest_${Date.now()}_1`;
      const validSig1 = crypto
        .createHmac('sha256', testKeySecret)
        .update(`${orderId1}|${paymentId1}`)
        .digest('hex');

      // 7. Seller2 cannot verify Seller1's payment order
      const crossSellerVerify = await seller2Agent
        .post('/api/v1/payments/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          razorpay_order_id: orderId1,
          razorpay_payment_id: paymentId1,
          razorpay_signature: validSig1,
        });
      expect(crossSellerVerify.status).toBe(403);
      expect(crossSellerVerify.body.errorCode).toBe('PAYMENT_ORDER_FORBIDDEN');

      // 8. Invalid signature rejected without crediting wallet
      const badSigVerify = await seller1Agent
        .post('/api/v1/payments/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          razorpay_order_id: orderId1,
          razorpay_payment_id: paymentId1,
          razorpay_signature: '0'.repeat(64),
        });
      expect(badSigVerify.status).toBe(400);
      expect(badSigVerify.body.errorCode).toBe('INVALID_PAYMENT_SIGNATURE');

      const walletUnchanged = await seller1Agent.get('/api/v1/wallet');
      expect(walletUnchanged.body.data.walletBalance).toBe(startBalance);

      // 9. Valid signature credits wallet atomically
      const okVerify = await seller1Agent
        .post('/api/v1/payments/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          razorpay_order_id: orderId1,
          razorpay_payment_id: paymentId1,
          razorpay_signature: validSig1,
          paymentMethod: 'UPI',
        });
      expect(okVerify.status).toBe(200);
      expect(okVerify.body.data.idempotentReplay).toBe(false);
      expect(okVerify.body.data.walletBalance).toBe(Number((startBalance + 3500).toFixed(2)));
      expect(okVerify.body.data.transaction.referenceNote).toBe(paymentId1);

      // 10. Replaying verify does not double-credit
      const replayVerify = await seller1Agent
        .post('/api/v1/payments/verify')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          razorpay_order_id: orderId1,
          razorpay_payment_id: paymentId1,
          razorpay_signature: validSig1,
          paymentMethod: 'UPI',
        });
      expect(replayVerify.status).toBe(200);
      expect(replayVerify.body.data.idempotentReplay).toBe(true);
      expect(replayVerify.body.data.walletBalance).toBe(Number((startBalance + 3500).toFixed(2)));

      // 11. Webhook replay for already-settled order is idempotent; invalid signature fails 400
      const replayWebhookBody = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId1,
              order_id: orderId1,
              amount: 350000,
              currency: 'INR',
              method: 'upi',
            },
          },
        },
      });
      const badWebhookRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'f'.repeat(64))
        .send(replayWebhookBody);
      expect(badWebhookRes.status).toBe(400);
      expect(badWebhookRes.body.errorCode).toBe('INVALID_WEBHOOK_SIGNATURE');

      const replayWhSig = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(replayWebhookBody)
        .digest('hex');
      const replayWebhookRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', replayWhSig)
        .send(replayWebhookBody);
      expect(replayWebhookRes.status).toBe(200);
      expect(replayWebhookRes.body.data.idempotentReplay).toBe(true);
      expect(replayWebhookRes.body.data.walletBalance).toBe(Number((startBalance + 3500).toFixed(2)));

      // 12. Second order settled solely via Razorpay webhook (and rejects underpaid capture)
      const createOrder2 = await seller1Agent
        .post('/api/v1/payments/orders')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ amount: 1200, paymentMethod: 'NETBANKING' });
      expect(createOrder2.status).toBe(201);
      const orderId2 = createOrder2.body.data.gatewayOrderId as string;
      const paymentId2 = `pay_rzptest_${Date.now()}_2`;

      const underpaidBody = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId2,
              order_id: orderId2,
              amount: 50000,
              currency: 'INR',
              method: 'netbanking',
            },
          },
        },
      });
      const underpaidSig = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(underpaidBody)
        .digest('hex');
      const underpaidRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', underpaidSig)
        .send(underpaidBody);
      expect(underpaidRes.status).toBe(400);
      expect(underpaidRes.body.errorCode).toBe('PAYMENT_AMOUNT_MISMATCH');

      const webhookBody2 = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId2,
              order_id: orderId2,
              amount: 120000,
              currency: 'INR',
              method: 'netbanking',
            },
          },
        },
      });
      const webhookSig2 = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(webhookBody2)
        .digest('hex');
      const webhookRes2 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', webhookSig2)
        .send(webhookBody2);
      expect(webhookRes2.status).toBe(200);
      expect(webhookRes2.body.data.processed).toBe(true);
      expect(webhookRes2.body.data.idempotentReplay).toBe(false);
      expect(webhookRes2.body.data.walletBalance).toBe(Number((startBalance + 3500 + 1200).toFixed(2)));

      const ordersList = await seller1Agent.get('/api/v1/payments/orders');
      expect(ordersList.status).toBe(200);
      expect(ordersList.body.data.items.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.restoreAllMocks();
      if (prevKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
      else process.env.RAZORPAY_KEY_ID = prevKeyId;
      if (prevKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
      else process.env.RAZORPAY_KEY_SECRET = prevKeySecret;
      if (prevWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
      else process.env.RAZORPAY_WEBHOOK_SECRET = prevWebhookSecret;
    }
  });

  it('supports Admin manual Seller wallet credit/debit with idempotency and Admin Transporter payout settlement (UTR)', async () => {
    const { agent: adminAgent } = await loginAs('admin@zipit.in');
    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: trans1Agent } = await loginAs('ops@swiftlinefreight.in');

    const sellerProfile = await SellerProfile.findOne({ email: 'seller1@apexhardware.in' }).lean();
    expect(sellerProfile).toBeDefined();
    const sellerId = sellerProfile!._id.toString();

    // 1. Non-admin cannot inspect seller wallet or adjust or settle payouts
    const sellerAdjustForbidden = await seller1Agent
      .post(`/api/v1/sellers/${sellerId}/wallet-adjust`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ type: 'CREDIT', amount: 500, reason: 'Unauthorized attempt' });
    expect(sellerAdjustForbidden.status).toBe(403);
    expect(sellerAdjustForbidden.body.errorCode).toBe('FORBIDDEN_ROLE');

    const transSettleForbidden = await trans1Agent.get('/api/v1/settlements');
    expect(transSettleForbidden.status).toBe(403);
    expect(transSettleForbidden.body.errorCode).toBe('FORBIDDEN_ROLE');

    // 2. Admin inspects Seller1 wallet
    const adminWalletRes = await adminAgent.get(`/api/v1/sellers/${sellerId}/wallet`);
    expect(adminWalletRes.status).toBe(200);
    const startingBalance = Number(adminWalletRes.body.data.walletBalance);

    // 3. Admin credits Seller1 wallet with Idempotency-Key
    const adjKey = `adm-adj-${Date.now()}`;
    const creditRes = await adminAgent
      .post(`/api/v1/sellers/${sellerId}/wallet-adjust`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Idempotency-Key', adjKey)
      .send({
        type: 'CREDIT',
        amount: 1500,
        reason: 'Offline NEFT freight credit confirmed by accounts',
        referenceNote: 'NEFT-ACC-441',
      });
    expect(creditRes.status).toBe(201);
    expect(creditRes.body.data.walletBalance).toBe(Number((startingBalance + 1500).toFixed(2)));
    expect(creditRes.body.data.transaction.paymentMethod).toBe('ADMIN_ADJUSTMENT');

    // Replay same Idempotency-Key must not double credit
    const replayCredit = await adminAgent
      .post(`/api/v1/sellers/${sellerId}/wallet-adjust`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Idempotency-Key', adjKey)
      .send({
        type: 'CREDIT',
        amount: 1500,
        reason: 'Offline NEFT freight credit confirmed by accounts',
        referenceNote: 'NEFT-ACC-441',
      });
    expect(replayCredit.status).toBe(200);
    expect(replayCredit.body.data.idempotentReplay).toBe(true);
    expect(replayCredit.body.data.walletBalance).toBe(Number((startingBalance + 1500).toFixed(2)));

    // 4. Debit exceeding balance is blocked
    const excessiveDebit = await adminAgent
      .post(`/api/v1/sellers/${sellerId}/wallet-adjust`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        type: 'DEBIT',
        amount: startingBalance + 50000,
        reason: 'Excessive debit test',
      });
    expect(excessiveDebit.status).toBe(400);
    expect(excessiveDebit.body.errorCode).toBe('INSUFFICIENT_WALLET_BALANCE');

    // 5. Valid Admin debit reduces balance atomically
    const debitRes = await adminAgent
      .post(`/api/v1/sellers/${sellerId}/wallet-adjust`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        type: 'DEBIT',
        amount: 500,
        reason: 'Detention & demurrage adjustment settled per billing email',
      });
    expect(debitRes.status).toBe(201);
    expect(debitRes.body.data.walletBalance).toBe(Number((startingBalance + 1000).toFixed(2)));

    // 6. Admin loads transporter settlements overview & pending delivered shipments for SwiftLine
    const overviewRes = await adminAgent.get('/api/v1/settlements');
    expect(overviewRes.status).toBe(200);
    const swiftSummary = overviewRes.body.data.transporters.find((t: { companyName: string }) =>
      t.companyName.includes('SwiftLine')
    );
    expect(swiftSummary).toBeDefined();
    expect(swiftSummary.pendingCount).toBeGreaterThanOrEqual(1);

    const pendingRes = await adminAgent.get(
      `/api/v1/settlements/transporters/${swiftSummary._id}/pending`
    );
    expect(pendingRes.status).toBe(200);
    const pendingBookingIds = pendingRes.body.data.pendingBookings.map((b: { _id: string }) => b._id);
    expect(pendingBookingIds.length).toBeGreaterThanOrEqual(1);
    const expectedNet = pendingRes.body.data.totals.netPayoutAmount;

    // 7. Admin settles all pending delivered shipments with UTR
    const utrCode = `HDFC261121TEST${Math.floor(100 + Math.random() * 899)}`;
    const settleRes = await adminAgent
      .post('/api/v1/settlements')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        transporterId: swiftSummary._id,
        bookingIds: pendingBookingIds,
        payoutMethod: 'NEFT',
        utrNumber: utrCode,
        periodLabel: 'Nov 2026 Integration Batch',
        remarks: 'Verified bank transfer payout',
      });
    expect(settleRes.status).toBe(201);
    expect(settleRes.body.data.status).toBe('SETTLED');
    expect(settleRes.body.data.utrNumber).toBe(utrCode);
    expect(settleRes.body.data.netPayoutAmount).toBe(expectedNet);
    expect(settleRes.body.data.bookingCount).toBe(pendingBookingIds.length);

    // 8. Reusing same UTR must return 409 DUPLICATE_UTR_NUMBER; settling already-settled booking returns 409
    const dupUtrRes = await adminAgent
      .post('/api/v1/settlements')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        transporterId: swiftSummary._id,
        bookingIds: pendingBookingIds,
        payoutMethod: 'NEFT',
        utrNumber: utrCode,
        periodLabel: 'Duplicate UTR Batch',
      });
    expect(dupUtrRes.status).toBe(409);
    expect(dupUtrRes.body.errorCode).toBe('DUPLICATE_UTR_NUMBER');

    const dupBookingRes = await adminAgent
      .post('/api/v1/settlements')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        transporterId: swiftSummary._id,
        bookingIds: pendingBookingIds,
        payoutMethod: 'IMPS',
        utrNumber: `${utrCode}X`,
        periodLabel: 'Duplicate Booking Batch',
      });
    expect(dupBookingRes.status).toBe(409);
    expect(dupBookingRes.body.errorCode).toBe('BOOKING_ALREADY_SETTLED');

    // 9. Transporter earnings endpoint reflects 0 pending payout and includes the settled UTR batch
    const earningsAfter = await trans1Agent.get('/api/v1/transporter/earnings');
    expect(earningsAfter.status).toBe(200);
    expect(earningsAfter.body.data.summary.pendingSettlement).toBe(0);
    const recordedBatch = earningsAfter.body.data.settlements.find(
      (st: { utrNumber: string }) => st.utrNumber === utrCode
    );
    expect(recordedBatch).toBeDefined();
    expect(recordedBatch.netPayoutAmount).toBe(expectedNet);
  });

  it('enforces direct seller registration uniqueness and forgot/reset password with anti-enumeration, attempt lockouts, session invalidation, and SMTP delivery', async () => {
    // 1. Duplicate email or duplicate GSTIN rejected on seller registration
    const dupEmailReg = await request(app).post('/api/v1/sellers/register').send({
      businessName: 'Sahyadri Alloys Pvt Ltd',
      ownerName: 'Existing Seller',
      email: 'seller1@apexhardware.in',
      password: 'Password@123',
      phone: '9822001199',
      gstNumber: '27AABCS5544L1Z2',
      businessAddress: 'Plot 12, Talegaon MIDC',
      city: 'Pune',
      pincode: '410506',
    });
    expect(dupEmailReg.status).toBe(409);
    expect(dupEmailReg.body.errorCode).toBe('EMAIL_ALREADY_EXISTS');

    const dupGstReg = await request(app).post('/api/v1/sellers/register').send({
      businessName: 'Sahyadri Alloys Pvt Ltd',
      ownerName: 'Fresh Seller',
      email: 'fresh.seller@sahyadri.in',
      password: 'Password@123',
      phone: '9822001199',
      gstNumber: '27AABCK1234F1Z7',
      businessAddress: 'Plot 12, Talegaon MIDC',
      city: 'Pune',
      pincode: '410506',
    });
    expect(dupGstReg.status).toBe(409);
    expect(dupGstReg.body.errorCode).toBe('GST_ALREADY_REGISTERED');

    // 2. Direct seller registration succeeds without OTP and prevents duplicate replay
    const okReg = await request(app).post('/api/v1/sellers/register').send({
      businessName: 'Sahyadri Alloys Pvt Ltd',
      ownerName: 'Ramesh Kulkarni',
      email: 'ramesh@sahyadri.in',
      password: 'Password@123',
      phone: '9822001199',
      gstNumber: '27AABCS5544L1Z2',
      businessAddress: 'Plot 12, Talegaon MIDC',
      city: 'Pune',
      pincode: '410506',
    });
    expect(okReg.status).toBe(201);
    expect(okReg.body.data.sellerProfile.email).toBe('ramesh@sahyadri.in');

    const replayReg = await request(app).post('/api/v1/sellers/register').send({
      businessName: 'Sahyadri Alloys Pvt Ltd',
      ownerName: 'Ramesh Kulkarni',
      email: 'ramesh@sahyadri.in',
      password: 'Password@123',
      phone: '9822001199',
      gstNumber: '27AABCS5544L1Z2',
      businessAddress: 'Plot 12, Talegaon MIDC',
      city: 'Pune',
      pincode: '410506',
    });
    expect(replayReg.status).toBe(409);

    // 4. Forgot password for unknown email returns generic 200 without leaking sandboxOtp
    const unknownResetRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent.user@example.com' });
    expect(unknownResetRes.status).toBe(200);
    expect(unknownResetRes.body.data.sandboxOtp).toBeUndefined();

    // 5. Log in as anil@kaveri.in first so we can verify prior JWT session gets invalidated on reset
    const { agent: oldSessionAgent } = await loginAs('anil@kaveri.in', 'Password@123');
    const preResetMe = await oldSessionAgent.get('/api/v1/auth/me');
    expect(preResetMe.status).toBe(200);

    // 6. Request forgot-password OTP for anil@kaveri.in and trigger 5-attempt brute-force lockout
    const forgotRes1 = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'anil@kaveri.in' });
    expect(forgotRes1.status).toBe(200);
    const resetOtp1 = forgotRes1.body.data.sandboxOtp as string;
    expect(resetOtp1).toMatch(/^\d{6}$/);
    const wrongResetOtp = resetOtp1 === '999999' ? '888888' : '999999';

    for (let attempt = 1; attempt <= 4; attempt++) {
      const badTry = await request(app).post('/api/v1/auth/reset-password').send({
        email: 'anil@kaveri.in',
        otp: wrongResetOtp,
        newPassword: 'NewPassword@456',
      });
      expect(badTry.status).toBe(400);
      expect(badTry.body.errorCode).toBe('INVALID_OTP');
    }

    const fifthTry = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'anil@kaveri.in',
      otp: wrongResetOtp,
      newPassword: 'NewPassword@456',
    });
    expect(fifthTry.status).toBe(429);
    expect(fifthTry.body.errorCode).toBe('OTP_MAX_ATTEMPTS_EXCEEDED');

    // Even the real OTP is now locked until a fresh OTP is requested
    const lockedTry = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'anil@kaveri.in',
      otp: resetOtp1,
      newPassword: 'NewPassword@456',
    });
    expect(lockedTry.status).toBe(429);
    expect(lockedTry.body.errorCode).toBe('OTP_MAX_ATTEMPTS_EXCEEDED');

    // 7. Request fresh reset OTP, reset password, verify prior session invalidated, old password fails, new works
    const forgotRes2 = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'anil@kaveri.in' });
    expect(forgotRes2.status).toBe(200);
    const resetOtp2 = forgotRes2.body.data.sandboxOtp as string;
    expect(resetOtp2).toMatch(/^\d{6}$/);

    const resetOk = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'anil@kaveri.in',
      otp: resetOtp2,
      newPassword: 'NewPassword@456',
    });
    expect(resetOk.status).toBe(200);
    expect(resetOk.body.data.email).toBe('anil@kaveri.in');

    // Old JWT cookie session must now be rejected immediately
    const postResetMe = await oldSessionAgent.get('/api/v1/auth/me');
    expect(postResetMe.status).toBe(401);
    expect(postResetMe.body.errorCode).toBe('SESSION_EXPIRED');

    // Old password rejected, new password succeeds
    const oldPassLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'anil@kaveri.in', password: 'Password@123' });
    expect(oldPassLogin.status).toBe(401);

    const { agent: freshAgent } = await loginAs('anil@kaveri.in', 'NewPassword@456');
    const freshMe = await freshAgent.get('/api/v1/auth/me');
    expect(freshMe.status).toBe(200);
    expect(freshMe.body.data.user.email).toBe('anil@kaveri.in');

    // Reusing consumed reset OTP fails
    const replayReset = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'anil@kaveri.in',
      otp: resetOtp2,
      newPassword: 'AnotherPassword@789',
    });
    expect(replayReset.status).toBe(400);
    expect(replayReset.body.errorCode).toBe('INVALID_OR_EXPIRED_OTP');

    // 8. Configured SMTP mode sends via nodemailer and never exposes sandboxOtp in API response
    const prevHost = process.env.SMTP_HOST;
    const prevUser = process.env.SMTP_USER;
    const prevPass = process.env.SMTP_PASS;
    const prevFrom = process.env.SMTP_FROM;

    try {
      process.env.SMTP_HOST = 'smtp.example.test';
      process.env.SMTP_USER = 'mailer@example.test';
      process.env.SMTP_PASS = 'smtp-secret-pass';
      process.env.SMTP_FROM = 'ZIPIT Test <noreply@example.test>';

      const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'msg-test-001' });
      const createTransportSpy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: sendMailMock,
      } as unknown as ReturnType<typeof nodemailer.createTransport>);

      const smtpRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'anil@kaveri.in' });

      expect(smtpRes.status).toBe(200);
      expect(smtpRes.body.data.deliveryMode).toBe('SMTP');
      expect(smtpRes.body.data.sandboxOtp).toBeUndefined();
      expect(createTransportSpy).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock.mock.calls[0][0].to).toBe('anil@kaveri.in');
      expect(sendMailMock.mock.calls[0][0].subject).toContain('Password Reset');
    } finally {
      vi.restoreAllMocks();
      if (prevHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = prevHost;
      if (prevUser === undefined) delete process.env.SMTP_USER;
      else process.env.SMTP_USER = prevUser;
      if (prevPass === undefined) delete process.env.SMTP_PASS;
      else process.env.SMTP_PASS = prevPass;
      if (prevFrom === undefined) delete process.env.SMTP_FROM;
      else process.env.SMTP_FROM = prevFrom;
    }
  });

  it('exposes separate liveness and readiness health checks on /api/health, /api/health/live, and /api/health/ready', async () => {
    const liveDefault = await request(app).get('/api/health');
    expect(liveDefault.status).toBe(200);
    expect(liveDefault.body.check).toBe('liveness');
    expect(liveDefault.body.status).toBe('alive');

    const liveExplicit = await request(app).get('/api/health/live');
    expect(liveExplicit.status).toBe(200);
    expect(liveExplicit.body.check).toBe('liveness');
    expect(liveExplicit.body.status).toBe('alive');

    const readyRes = await request(app).get('/api/health/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.check).toBe('readiness');
    expect(readyRes.body.status).toBe('ready');
    expect(readyRes.body.database.connected).toBe(true);
    expect(typeof readyRes.body.database.pingMs).toBe('number');
  });

  it('clears auth and CSRF cookies cleanly on logout, rejects invalid POD image signatures, and invalidates stale WebSocket tokenVersion', async () => {
    const { authenticateWsRequest } = await import('../backend/src/services/notificationRealtime.ts');
    const { agent: sellerAgent } = await loginAs('seller1@apexhardware.in');

    // 1. Cookie auth works on /auth/me and logout clears both zipit_token and zipit_csrf
    const meBefore = await sellerAgent.get('/api/v1/auth/me');
    expect(meBefore.status).toBe(200);

    const logoutRes = await sellerAgent
      .post('/api/v1/auth/logout')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(logoutRes.status).toBe(200);
    const clearedHeaders = (logoutRes.headers['set-cookie'] || []) as string[];
    expect(clearedHeaders.some((c) => c.startsWith('zipit_token=;') && c.includes('Partitioned'))).toBe(true);
    expect(clearedHeaders.some((c) => c.startsWith('zipit_token=;') && !c.includes('Partitioned'))).toBe(true);
    expect(clearedHeaders.some((c) => c.startsWith('zipit_csrf=;') && c.includes('Partitioned'))).toBe(true);
    expect(clearedHeaders.some((c) => c.startsWith('zipit_csrf=;') && !c.includes('Partitioned'))).toBe(true);

    // 2. Login returns Bearer token, WebSocket auth supports cookie & query token, and Bearer overrides stale cookies
    const freshSeller = request.agent(app);
    const loginRes = await freshSeller
      .post('/api/v1/auth/login')
      .send({ email: 'seller1@apexhardware.in', password: DEMO_PASS });
    expect(loginRes.status).toBe(200);
    const bearerToken = loginRes.body.data.token as string;
    expect(typeof bearerToken).toBe('string');
    expect(bearerToken.length).toBeGreaterThan(20);

    const cookies = (loginRes.headers['set-cookie'] || []) as string[];
    const tokenCookie = cookies.find((c: string) => c.startsWith('zipit_token='))!.split(';')[0];
    const validWsUserId = await authenticateWsRequest({
      headers: { cookie: tokenCookie },
    } as unknown as import('http').IncomingMessage);
    expect(validWsUserId).toBeTruthy();

    const queryWsUserId = await authenticateWsRequest({
      url: `/ws/notifications?token=${encodeURIComponent(bearerToken)}`,
      headers: {},
    } as unknown as import('http').IncomingMessage);
    expect(queryWsUserId).toBe(validWsUserId);

    // Bearer auth works cleanly without cookies (cross-origin Vercel -> Render scenario)
    const bearerMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${bearerToken}`);
    expect(bearerMe.status).toBe(200);

    // Bearer token takes priority even if a stale/revoked zipit_token cookie is present
    const bearerOverStaleCookie = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'zipit_token=stale.invalid.jwt')
      .set('Authorization', `Bearer ${bearerToken}`);
    expect(bearerOverStaleCookie.status).toBe(200);

    await User.updateOne({ email: 'seller1@apexhardware.in' }, { $inc: { tokenVersion: 1 } });
    const staleWsUserId = await authenticateWsRequest({
      headers: { cookie: tokenCookie },
    } as unknown as import('http').IncomingMessage);
    expect(staleWsUserId).toBeNull();

    // Verify fresh HTTP session also rejects stale tokenVersion
    const staleHttp = await freshSeller.get('/api/v1/auth/me');
    expect(staleHttp.status).toBe(401);

    // 3. POD upload rejects forged PNG bytes with 400 INVALID_FILE_SIGNATURE
    const { agent: transAgent } = await loginAs('ops@swiftlinefreight.in');
    const arrivedBooking = await Booking.findOne({ status: BookingStatus.ARRIVED }).lean();
    if (arrivedBooking) {
      const forgedPod = await transAgent
        .post(`/api/v1/bookings/${arrivedBooking._id.toString()}/delivery-proof`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('receiverName', 'Test Receiver')
        .field('deliveryDate', new Date().toISOString())
        .attach('image', Buffer.from('not-a-real-png-file'), {
          filename: 'fake.png',
          contentType: 'image/png',
        });
      expect(forgedPod.status).toBe(400);
      expect(forgedPod.body.errorCode).toBe('INVALID_FILE_SIGNATURE');
    }
  });

  it('supports public consignee tracking with PII redaction, E-Way Bill fields, and GST Tax Invoice PDF', async () => {
    const { agent: sellerAgent } = await loginAs('seller1@apexhardware.in');
    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const rate = await TransportRate.findOne({ routeId: route!._id, isActive: true }).lean();
    expect(route).toBeDefined();
    expect(rate).toBeDefined();

    const createRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: rate!.transporterId.toString(),
        rateId: rate!._id.toString(),
        idempotencyKey: `ewb-inv-${Date.now()}`,
        paymentMode: 'INVOICE',
        ewayBillNumber: '271234567890',
        ewayBillValidUpto: '2026-12-31',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'Secret Warehouse Plot 99, Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Deccan Electricals',
          phone: '9820088776',
          address: 'Private Shop 12, Fort',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Switchgear Panels',
          actualWeightKg: 60,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
          numberOfPackages: 2,
        },
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.ewayBillNumber).toBe('271234567890');
    expect(createRes.body.data.invoiceNumber).toMatch(/^ZPT-INV-/);

    const bookingId = createRes.body.data._id as string;
    const lrNumber = createRes.body.data.lrNumber as string;

    // 1. Public tracking succeeds unauthenticated and strips commercial/PII fields
    const pubTrackRes = await request(app).get(`/api/v1/public/tracking/${lrNumber.toLowerCase()}`);
    expect(pubTrackRes.status).toBe(200);
    expect(pubTrackRes.body.data.lrNumber).toBe(lrNumber);
    expect(pubTrackRes.body.data.consigneeName).toBe('Deccan Electricals');
    expect(pubTrackRes.body.data.origin.city).toBe('Pune');
    expect(pubTrackRes.body.data.destination.city).toBe('Mumbai');
    expect(pubTrackRes.body.data.timeline.length).toBeGreaterThanOrEqual(1);

    const pubJson = JSON.stringify(pubTrackRes.body.data);
    expect(pubJson).not.toContain('9823011223');
    expect(pubJson).not.toContain('9820088776');
    expect(pubJson).not.toContain('Secret Warehouse');
    expect(pubJson).not.toContain('Private Shop');
    expect(pubJson).not.toContain('271234567890');
    expect(pubTrackRes.body.data.finalAmount).toBeUndefined();
    expect(pubTrackRes.body.data.invoiceNumber).toBeUndefined();

    // Unknown LR returns 404
    const missingPub = await request(app).get('/api/v1/public/tracking/ZIPIT-LR-99999999');
    expect(missingPub.status).toBe(404);

    // 2. GST Tax Invoice PDF downloads cleanly for authorized booking owner
    const taxPdfRes = await sellerAgent.get(`/api/v1/bookings/${bookingId}/tax-invoice`);
    expect(taxPdfRes.status).toBe(200);
    expect(taxPdfRes.headers['content-type']).toContain('application/pdf');
    expect(taxPdfRes.body.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('supports in-app change-password (revoking older sessions) and seller saved address book CRUD', async () => {
    const { agent: oldSession } = await loginAs('seller2@metrotextiles.in', DEMO_PASS);
    const { agent: activeSession } = await loginAs('seller2@metrotextiles.in', DEMO_PASS);

    // Wrong current password rejected
    const wrongPassRes = await activeSession
      .post('/api/v1/auth/change-password')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        currentPassword: 'WrongPassword@1',
        newPassword: 'UpdatedPass@2026',
      });
    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body.errorCode).toBe('INVALID_CURRENT_PASSWORD');

    // Valid password change updates hash, rotates tokenVersion, issues fresh cookies, and revokes oldSession
    const changePassRes = await activeSession
      .post('/api/v1/auth/change-password')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        currentPassword: DEMO_PASS,
        newPassword: 'UpdatedPass@2026',
      });
    expect(changePassRes.status).toBe(200);
    expect(changePassRes.body.data.csrfToken).toBeTruthy();

    // Current session continues working cleanly
    const activeMe = await activeSession.get('/api/v1/auth/me');
    expect(activeMe.status).toBe(200);

    // Older session from another browser is immediately rejected
    const oldMe = await oldSession.get('/api/v1/auth/me');
    expect(oldMe.status).toBe(401);
    expect(oldMe.body.errorCode).toBe('SESSION_EXPIRED');

    // Restore original password so any subsequent logins using DEMO_PASS keep working
    const restoreRes = await activeSession
      .post('/api/v1/auth/change-password')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        currentPassword: 'UpdatedPass@2026',
        newPassword: DEMO_PASS,
      });
    expect(restoreRes.status).toBe(200);

    // Seller Saved Address Book CRUD
    const addAddrRes = await activeSession
      .post('/api/v1/sellers/me/addresses')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        label: 'Surat Weaving Plant',
        addressType: 'PICKUP',
        name: 'Metro Textiles Unit 2',
        phone: '9825011223',
        address: 'Ring Road GIDC Plot 44',
        city: 'Surat',
        pincode: '395002',
        isDefault: true,
      });
    expect(addAddrRes.status).toBe(201);
    expect(addAddrRes.body.data.length).toBeGreaterThanOrEqual(1);
    const createdAddrId = addAddrRes.body.data[addAddrRes.body.data.length - 1]._id as string;

    const listAddrRes = await activeSession.get('/api/v1/sellers/me/addresses');
    expect(listAddrRes.status).toBe(200);
    expect(listAddrRes.body.data.some((a: { _id: string }) => a._id === createdAddrId)).toBe(true);

    const delAddrRes = await activeSession
      .delete(`/api/v1/sellers/me/addresses/${createdAddrId}`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(delAddrRes.status).toBe(200);
    expect(delAddrRes.body.data.some((a: { _id: string }) => a._id === createdAddrId)).toBe(false);
  });

  it('supports bulk shipment booking preview/creation and combined multi-page LR PDF download', async () => {
    const { agent: sellerAgent } = await loginAs('seller1@apexhardware.in');

    const rows = [
      {
        rowNumber: 1,
        originPincode: '411026',
        destinationPincode: '400013',
        senderName: 'Apex Hardware',
        senderPhone: '9823011223',
        senderAddress: 'MIDC Bhosari Plot 12',
        senderCity: 'Pune',
        senderPincode: '411026',
        receiverName: 'Bulk Buyer Alpha',
        receiverPhone: '9820077001',
        receiverAddress: 'Lower Parel Unit A',
        receiverCity: 'Mumbai',
        receiverPincode: '400013',
        description: 'Hydraulic Valves Batch A',
        actualWeightKg: 25,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 25,
        numberOfPackages: 2,
      },
      {
        rowNumber: 2,
        originPincode: '411026',
        destinationPincode: '400013',
        senderName: 'Apex Hardware',
        senderPhone: '9823011223',
        senderAddress: 'MIDC Bhosari Plot 12',
        senderCity: 'Pune',
        senderPincode: '411026',
        receiverName: 'Bulk Buyer Beta',
        receiverPhone: '9820077002',
        receiverAddress: 'Lower Parel Unit B',
        receiverCity: 'Mumbai',
        receiverPincode: '400013',
        description: 'Copper Fittings Batch B',
        actualWeightKg: 35,
        lengthCm: 45,
        widthCm: 35,
        heightCm: 30,
        numberOfPackages: 3,
      },
    ];

    const previewRes = await sellerAgent
      .post('/api/v1/bookings/bulk/preview')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ paymentMode: 'INVOICE', rows });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.validCount).toBe(2);
    expect(previewRes.body.data.invalidCount).toBe(0);
    expect(previewRes.body.data.totalEstimatedAmount).toBeGreaterThan(0);

    const bulkCreateRes = await sellerAgent
      .post('/api/v1/bookings/bulk')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ paymentMode: 'INVOICE', rows });
    expect(bulkCreateRes.status).toBe(201);
    expect(bulkCreateRes.body.data.createdCount).toBe(2);
    const createdIds = bulkCreateRes.body.data.bookings.map((b: { _id: string }) => b._id);
    expect(createdIds.length).toBe(2);

    const bulkLrRes = await sellerAgent
      .post('/api/v1/bookings/bulk-lr')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ bookingIds: createdIds });
    expect(bulkLrRes.status).toBe(200);
    expect(bulkLrRes.headers['content-type']).toContain('application/pdf');
    expect(bulkLrRes.body.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('supports transporter weight discrepancy reporting with scale image, seller dispute, admin resolution, and bulk CSV rate matrix import/export', async () => {
    const { agent: sellerAgent } = await loginAs('seller1@apexhardware.in');
    const { agent: transAgent } = await loginAs('ops@swiftlinefreight.in');
    const { agent: adminAgent } = await loginAs('admin@zipit.in');

    // Ensure seller1 has sufficient wallet balance for WALLET discrepancy debit test
    const sellerProfile = await SellerProfile.findOne({ email: 'seller1@apexhardware.in' }).lean();
    await SellerProfile.updateOne({ _id: sellerProfile!._id }, { $set: { walletBalance: 50000 } });

    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const swiftTrans = await User.findOne({ email: 'ops@swiftlinefreight.in' }).lean();
    const swiftTransDoc = await import('../backend/src/models/Transporter.ts').then((m) =>
      m.Transporter.findOne({ userId: swiftTrans!._id }).lean()
    );
    const rate = await TransportRate.findOne({
      routeId: route!._id,
      transporterId: swiftTransDoc!._id,
      isActive: true,
    }).lean();

    const bkRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: rate!.transporterId.toString(),
        rateId: rate!._id.toString(),
        idempotencyKey: `wd-test-${Date.now()}`,
        paymentMode: 'WALLET',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Weighbridge Buyer',
          phone: '9820044556',
          address: 'Andheri East',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Alloy Rods',
          actualWeightKg: 20,
          lengthCm: 30,
          widthCm: 20,
          heightCm: 20,
          numberOfPackages: 1,
        },
      });
    expect(bkRes.status).toBe(201);
    const wdBookingId = bkRes.body.data._id as string;

    // Move to ACCEPTED so transporter can report weight discrepancy
    const accRes = await transAgent
      .patch(`/api/v1/bookings/${wdBookingId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: BookingStatus.ACCEPTED, location: 'Pune Hub' });
    expect(accRes.status).toBe(200);

    // Reject forged non-image scale proof
    const badScaleRes = await transAgent
      .post(`/api/v1/bookings/${wdBookingId}/weight-discrepancy`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('reportedActualWeightKg', '85')
      .attach('image', Buffer.from('fake-scale-bytes'), { filename: 'scale.png', contentType: 'image/png' });
    expect(badScaleRes.status).toBe(400);
    expect(badScaleRes.body.errorCode).toBe('INVALID_FILE_SIGNATURE');

    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const reportRes = await transAgent
      .post(`/api/v1/bookings/${wdBookingId}/weight-discrepancy`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('reportedActualWeightKg', '85')
      .field('remarks', 'Digital floor weighbridge shows 85 kg actual load.')
      .attach('image', validPng, { filename: 'scale.png', contentType: 'image/png' });
    expect(reportRes.status).toBe(201);
    expect(reportRes.body.data.status).toBe('OPEN');
    expect(reportRes.body.data.scaleImageStorageKey).toBeUndefined();
    const diffAmount = Number(reportRes.body.data.additionalDifferenceAmount);
    expect(diffAmount).toBeGreaterThan(0);

    // Detail endpoint exposes discrepancy without storage key and authorized scale image streams cleanly
    const detailRes = await sellerAgent.get(`/api/v1/bookings/${wdBookingId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.weightDiscrepancy).toBeDefined();
    expect(detailRes.body.data.weightDiscrepancy.scaleImageStorageKey).toBeUndefined();

    const scaleImgRes = await sellerAgent.get(`/api/v1/bookings/${wdBookingId}/weight-discrepancy/image`);
    expect(scaleImgRes.status).toBe(200);
    expect(scaleImgRes.headers['content-type']).toBe('image/png');

    // Seller disputes -> Admin resolves in favor of transporter (CHARGE_SELLER) -> Seller wallet debited
    const disputeRes = await sellerAgent
      .post(`/api/v1/bookings/${wdBookingId}/weight-discrepancy/respond`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ action: 'DISPUTE', reason: 'Packing list weight was 20 kg per carton.' });
    expect(disputeRes.status).toBe(200);
    expect(disputeRes.body.data.status).toBe('DISPUTED');

    const walletBeforeResolve = await sellerAgent.get('/api/v1/wallet');
    const balBeforeResolve = Number(walletBeforeResolve.body.data.walletBalance);

    const resolveRes = await adminAgent
      .post(`/api/v1/bookings/${wdBookingId}/weight-discrepancy/resolve`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ decision: 'CHARGE_SELLER', notes: 'Scale photo verified against LR manifest.' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe('RESOLVED_CHARGED');
    expect(resolveRes.body.data.paymentBilledStatus).toBe('WALLET_DEBITED');

    const walletAfterResolve = await sellerAgent.get('/api/v1/wallet');
    expect(Number(walletAfterResolve.body.data.walletBalance)).toBe(
      Number((balBeforeResolve - diffAmount).toFixed(2))
    );

    // Admin Rate Matrix CSV Export & Bulk Import
    const csvExportRes = await adminAgent.get('/api/v1/rates/export');
    expect(csvExportRes.status).toBe(200);
    expect(csvExportRes.headers['content-type']).toContain('text/csv');
    expect(csvExportRes.text).toContain('transporterName,transporterGst,transporterEmail');

    const importRes = await adminAgent
      .post('/api/v1/rates/bulk-import')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        rows: [
          {
            rowNumber: 1,
            transporterEmail: 'ops@swiftlinefreight.in',
            originPincode: route!.originPincode,
            destinationPincode: route!.destinationPincode,
            minimumFreight: rate!.minimumFreight,
            ratePerKg: rate!.ratePerKg,
            volumetricDivisor: rate!.volumetricDivisor,
            rtoCharges: rate!.rtoCharges,
            additionalCharges: rate!.additionalCharges,
            gstApplicable: true,
            gstRatePercent: 18,
            estimatedDeliveryTime: rate!.estimatedDeliveryTime,
            effectiveFrom: '2026-01-01',
            isActive: true,
          },
        ],
      });
    expect(importRes.status).toBe(200);
    expect(importRes.body.data.updatedCount).toBe(1);
    expect(importRes.body.data.failedCount).toBe(0);
  });

  it('supports transporter integrated routes+rates, cross-carrier isolation, personal bookings, admin master control, and configurable platform charges', async () => {
    const { agent: sellerAgent } = await loginAs('seller1@apexhardware.in');
    const { agent: swiftAgent } = await loginAs('ops@swiftlinefreight.in');
    const { agent: rapidAgent } = await loginAs('dispatch@rapidroadways.in');
    const { agent: adminAgent } = await loginAs('admin@zipit.in');

    // 1. Transporter creates a new integrated route + rate (Surat -> Ahmedabad) -> immediately live for Seller bookings
    const createRouteRes = await swiftAgent
      .post('/api/v1/transporter/routes')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        originCity: 'Surat',
        originPincode: '395003',
        destinationCity: 'Ahmedabad',
        destinationPincode: '380001',
        distanceKm: 265,
        ratePerKg: 14,
        minimumFreight: 600,
        additionalCharges: 120,
        rtoCharges: 400,
        volumetricDivisor: 5000,
        gstApplicable: true,
        gstRatePercent: 18,
        estimatedDeliveryTime: '12-16 Hours',
        isActive: true,
      });
    expect(createRouteRes.status).toBe(201);
    const createdItem = createRouteRes.body.data;
    const rateId = createdItem.rateId as string;
    const routeId = createdItem.routeId as string;
    expect(createdItem.originPincode).toBe('395003');
    expect(createdItem.ratePerKg).toBe(14);
    expect(createdItem.isActive).toBe(true);

    // Cross-transporter modification must return 403 ROUTE_OWNERSHIP_FORBIDDEN
    const forbiddenEditRes = await rapidAgent
      .patch(`/api/v1/transporter/routes/${rateId}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ ratePerKg: 99 });
    expect(forbiddenEditRes.status).toBe(403);
    expect(forbiddenEditRes.body.errorCode).toBe('ROUTE_OWNERSHIP_FORBIDDEN');

    // Seller rate calculation immediately discovers SwiftLine's new route
    const sellerCalcRes = await sellerAgent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        originPincode: '395003',
        destinationPincode: '380001',
        actualWeightKg: 50,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 25,
        numberOfPackages: 2,
      });
    expect(sellerCalcRes.status).toBe(200);
    const swiftQuote = sellerCalcRes.body.data.quotes.find(
      (q: { rateId: string }) => q.rateId === rateId
    );
    expect(swiftQuote).toBeDefined();
    expect(swiftQuote.routeId).toBe(routeId);
    expect(swiftQuote.breakdown.baseFreight).toBe(700); // 50 * 14

    // 2. Admin configures dynamic per-shipment platform charges
    const configUpdateRes = await adminAgent
      .put('/api/v1/platform-config')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        sellerBookingCharge: {
          enabled: true,
          chargeType: 'FIXED',
          value: 45,
          applyGstOnCharge: false,
        },
        transporterBookingCharge: {
          enabled: true,
          chargeType: 'PERCENTAGE',
          value: 5,
          applyGstOnCharge: true,
        },
        billingRuleNotes: 'Integration test rollout config',
      });
    expect(configUpdateRes.status).toBe(200);
    expect(configUpdateRes.body.data.config.sellerBookingCharge.value).toBe(45);
    expect(configUpdateRes.body.data.config.transporterBookingCharge.chargeType).toBe('PERCENTAGE');

    // Verify Seller quote + booking applies FIXED ₹45 platform charge
    const sellerCalcWithFeeRes = await sellerAgent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId,
        actualWeightKg: 50,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 25,
        numberOfPackages: 2,
      });
    expect(sellerCalcWithFeeRes.status).toBe(200);
    const quoteWithFee = sellerCalcWithFeeRes.body.data.quotes.find(
      (q: { rateId: string }) => q.rateId === rateId
    );
    expect(quoteWithFee.breakdown.platformChargeApplied).toBe(true);
    expect(quoteWithFee.breakdown.platformCharge).toBe(45);

    const sellerBookingWithFeeRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId,
        transporterId: createdItem.transporterId,
        rateId,
        idempotencyKey: `seller-plat-fee-${Date.now()}`,
        paymentMode: 'INVOICE',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'Ring Road Surat',
          city: 'Surat',
          pincode: '395003',
        },
        receiver: {
          name: 'Gujarat Machine Works',
          phone: '9825011223',
          address: 'Naroda GIDC',
          city: 'Ahmedabad',
          pincode: '380001',
        },
        parcel: {
          description: 'Precision Gears',
          actualWeightKg: 50,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 25,
          numberOfPackages: 2,
        },
      });
    expect(sellerBookingWithFeeRes.status).toBe(201);
    expect(sellerBookingWithFeeRes.body.data.bookingSource).toBe('PLATFORM');
    expect(sellerBookingWithFeeRes.body.data.platformCharge).toBe(45);

    // 3. Transporter Personal Order Booking (TRANSPORTER_SELF) with 5% platform charge + GST
    const personalCalcRes = await swiftAgent
      .post('/api/v1/transporter/bookings/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        rateId,
        actualWeightKg: 50,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 25,
        numberOfPackages: 2,
      });
    expect(personalCalcRes.status).toBe(200);
    // Subtotal = 700 + 120 = 820; 5% = 41; taxable = 861; GST 18% = 154.98; final = 1015.98
    expect(personalCalcRes.body.data.breakdown.platformCharge).toBe(41);
    expect(personalCalcRes.body.data.breakdown.finalAmount).toBe(1015.98);

    const personalBookRes = await swiftAgent
      .post('/api/v1/transporter/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId,
        rateId,
        idempotencyKey: `trans-self-${Date.now()}`,
        paymentMode: 'CASH',
        sender: {
          name: 'Direct Walkin Textiles',
          phone: '9824011223',
          address: 'Ring Road Market',
          city: 'Surat',
          pincode: '395003',
        },
        receiver: {
          name: 'Ahmedabad Retail Hub',
          phone: '9825099887',
          address: 'CG Road Shop 4',
          city: 'Ahmedabad',
          pincode: '380001',
        },
        parcel: {
          description: 'Cotton Bales',
          actualWeightKg: 50,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 25,
          numberOfPackages: 2,
        },
      });
    expect(personalBookRes.status).toBe(201);
    const selfBooking = personalBookRes.body.data;
    expect(selfBooking.bookingSource).toBe('TRANSPORTER_SELF');
    expect(selfBooking.sellerId).toBeNull();
    expect(selfBooking.platformCharge).toBe(41);
    expect(selfBooking.status).toBe(BookingStatus.ACCEPTED);

    // Order Panel (PLATFORM) excludes selfBooking; Booked Orders (TRANSPORTER_SELF) includes it & excludes platform booking
    const [platformPanelRes, bookedPanelRes, sellerShipmentsRes] = await Promise.all([
      swiftAgent.get('/api/v1/transporter/bookings?bookingSource=PLATFORM&limit=100'),
      swiftAgent.get('/api/v1/transporter/bookings?bookingSource=TRANSPORTER_SELF&limit=100'),
      sellerAgent.get('/api/v1/bookings?limit=100'),
    ]);
    expect(platformPanelRes.status).toBe(200);
    expect(bookedPanelRes.status).toBe(200);
    expect(
      platformPanelRes.body.data.items.some((b: { _id: string }) => b._id === selfBooking._id)
    ).toBe(false);
    expect(
      bookedPanelRes.body.data.items.some((b: { _id: string }) => b._id === selfBooking._id)
    ).toBe(true);
    expect(
      sellerShipmentsRes.body.data.items.some((b: { _id: string }) => b._id === selfBooking._id)
    ).toBe(false);

    // LR PDF & Barcode PNG succeed on TRANSPORTER_SELF booking, and transporter can advance directly to DISPATCHED
    const [selfLrRes, selfBarcodeRes, advanceSelfRes] = await Promise.all([
      swiftAgent.get(`/api/v1/bookings/${selfBooking._id}/lr`),
      swiftAgent.get(`/api/v1/bookings/${selfBooking._id}/barcode`),
      swiftAgent
        .patch(`/api/v1/bookings/${selfBooking._id}/status`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ status: BookingStatus.DISPATCHED, location: 'Surat Hub' }),
    ]);
    expect(selfLrRes.status).toBe(200);
    expect(selfLrRes.headers['content-type']).toContain('application/pdf');
    expect(selfBarcodeRes.status).toBe(200);
    expect(selfBarcodeRes.headers['content-type']).toContain('image/png');
    expect(advanceSelfRes.status).toBe(200);
    expect(advanceSelfRes.body.data.booking.status).toBe(BookingStatus.DISPATCHED);

    // 4. Admin Master Control modifies SwiftLine's route & rate -> synced to Transporter panel + audit log
    const adminMasterPatchRes = await adminAgent
      .patch(`/api/v1/routes/master/${rateId}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        ratePerKg: 16,
        minimumFreight: 750,
        estimatedDeliveryTime: '10-14 Hours',
      });
    expect(adminMasterPatchRes.status).toBe(200);
    expect(adminMasterPatchRes.body.data.ratePerKg).toBe(16);
    expect(adminMasterPatchRes.body.data.lastModifiedByRole).toBe('ADMIN');

    const [swiftRoutesAfterRes, masterAuditRes] = await Promise.all([
      swiftAgent.get('/api/v1/transporter/routes?limit=100'),
      adminAgent.get(`/api/v1/routes/master/${rateId}/audit`),
    ]);
    expect(swiftRoutesAfterRes.status).toBe(200);
    const updatedSwiftRoute = swiftRoutesAfterRes.body.data.items.find(
      (r: { rateId: string }) => r.rateId === rateId
    );
    expect(updatedSwiftRoute).toBeDefined();
    expect(updatedSwiftRoute.ratePerKg).toBe(16);
    expect(updatedSwiftRoute.minimumFreight).toBe(750);
    expect(masterAuditRes.status).toBe(200);
    expect(masterAuditRes.body.data.some((log: { actorRole: string }) => log.actorRole === 'ADMIN')).toBe(
      true
    );

    // Transporter can deactivate & delete its own route, and reset platform config cleanly
    const deactivateRes = await swiftAgent
      .patch(`/api/v1/transporter/routes/${rateId}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.isActive).toBe(false);

    const deleteRouteRes = await swiftAgent
      .delete(`/api/v1/transporter/routes/${rateId}`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(deleteRouteRes.status).toBe(200);

    await adminAgent
      .put('/api/v1/platform-config')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        sellerBookingCharge: { enabled: false, chargeType: 'FIXED', value: 0, applyGstOnCharge: false },
        transporterBookingCharge: {
          enabled: false,
          chargeType: 'FIXED',
          value: 0,
          applyGstOnCharge: false,
        },
        billingRuleNotes: '',
      });
  });

  it('manages seller pickup addresses (auto-Primary, Secondary, switch Primary, validation, ownership, active-booking delete guard, and immutable booking snapshot)', async () => {
    const regRes = await request(app).post('/api/v1/sellers/register').send({
      businessName: 'Sahyadri Fasteners Pvt Ltd',
      ownerName: 'Vikram Joshi',
      email: 'pickup.seller@sahyadri.in',
      password: 'Password@123',
      phone: '9822098220',
      gstNumber: '27AABCS8821K1Z4',
      businessAddress: 'Plot 18, Bhosari MIDC',
      city: 'Pune',
      pincode: '411026',
    });
    expect(regRes.status).toBe(201);
    const newSellerId = regRes.body.data.sellerProfile._id as string;

    const { agent: adminAgent } = await loginAs('admin@zipit.in');
    const approveRes = await adminAgent
      .patch(`/api/v1/sellers/${newSellerId}/approve`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(approveRes.status).toBe(200);

    const [{ agent: sellerAgent }, { agent: otherSellerAgent }] = await Promise.all([
      loginAs('pickup.seller@sahyadri.in', 'Password@123'),
      loginAs('seller2@metrotextiles.in'),
    ]);

    // 1. Validation checks for mobile, pincode, GSTIN
    const badPhoneRes = await sellerAgent
      .post('/api/v1/sellers/me/addresses')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        companyName: 'Sahyadri Fasteners Pvt Ltd',
        contactPerson: 'Vikram Joshi',
        phone: '12345',
        address: 'Plot 18, Bhosari MIDC',
        state: 'Maharashtra',
        city: 'Pune',
        pincode: '411026',
      });
    expect(badPhoneRes.status).toBe(400);

    const badPinGstinRes = await sellerAgent
      .post('/api/v1/sellers/me/addresses')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        companyName: 'Sahyadri Fasteners Pvt Ltd',
        contactPerson: 'Vikram Joshi',
        phone: '9822098220',
        address: 'Plot 18, Bhosari MIDC',
        state: 'Maharashtra',
        city: 'Pune',
        pincode: '4110',
        gstin: 'BADGST',
      });
    expect(badPinGstinRes.status).toBe(400);

    // 2. First pickup address automatically becomes Primary (isDefault: true)
    const addFirstRes = await sellerAgent
      .post('/api/v1/sellers/me/addresses')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        label: 'Bhosari Unit 1',
        addressType: 'PICKUP',
        companyName: 'Sahyadri Fasteners Pvt Ltd',
        contactPerson: 'Vikram Joshi',
        phone: '9822098220',
        address: 'Plot 18, Bhosari MIDC Sector 7',
        state: 'Maharashtra',
        city: 'Pune',
        pincode: '411026',
        gstin: '27AABCS8821K1Z4',
      });
    expect(addFirstRes.status).toBe(201);
    expect(addFirstRes.body.data).toHaveLength(1);
    const firstAddr = addFirstRes.body.data[0];
    expect(firstAddr.isDefault).toBe(true);
    expect(firstAddr.state).toBe('Maharashtra');

    // 3. Second pickup address defaults to Secondary (isDefault: false)
    const addSecondRes = await sellerAgent
      .post('/api/v1/sellers/me/addresses')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        label: 'Chakan Dispatch Dock',
        addressType: 'PICKUP',
        companyName: 'Sahyadri Logistics Annex',
        contactPerson: 'Neha Kulkarni',
        phone: '9822098221',
        address: 'Gate 4, Chakan Phase II',
        state: 'Maharashtra',
        city: 'Pune',
        pincode: '410501',
      });
    expect(addSecondRes.status).toBe(201);
    expect(addSecondRes.body.data).toHaveLength(2);
    const secondAddr = addSecondRes.body.data[1];
    expect(secondAddr.isDefault).toBe(false);
    expect(addSecondRes.body.data[0].isDefault).toBe(true);

    // 4. Promote Secondary to Primary -> previous Primary automatically becomes Secondary
    const promoteRes = await sellerAgent
      .patch(`/api/v1/sellers/me/addresses/${secondAddr._id}/primary`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(promoteRes.status).toBe(200);
    const afterPromoteFirst = promoteRes.body.data.find((a: { _id: string }) => a._id === firstAddr._id);
    const afterPromoteSecond = promoteRes.body.data.find((a: { _id: string }) => a._id === secondAddr._id);
    expect(afterPromoteFirst.isDefault).toBe(false);
    expect(afterPromoteSecond.isDefault).toBe(true);

    // 5. Cross-seller authorization: another seller cannot modify or delete this address
    const [crossPut, crossPromote, crossDelete] = await Promise.all([
      otherSellerAgent
        .put(`/api/v1/sellers/me/addresses/${secondAddr._id}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          companyName: 'Hijacked',
          contactPerson: 'Hacker',
          phone: '9822098229',
          address: 'Fake Street 1',
          state: 'Maharashtra',
          city: 'Pune',
          pincode: '411026',
        }),
      otherSellerAgent
        .patch(`/api/v1/sellers/me/addresses/${secondAddr._id}/primary`)
        .set('X-Requested-With', 'XMLHttpRequest'),
      otherSellerAgent
        .delete(`/api/v1/sellers/me/addresses/${secondAddr._id}`)
        .set('X-Requested-With', 'XMLHttpRequest'),
    ]);
    expect(crossPut.status).toBe(404);
    expect(crossPromote.status).toBe(404);
    expect(crossDelete.status).toBe(404);

    // 6. Edit Primary pickup address cleanly
    const editRes = await sellerAgent
      .put(`/api/v1/sellers/me/addresses/${secondAddr._id}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        label: 'Chakan Dock Updated',
        addressType: 'PICKUP',
        companyName: 'Sahyadri Chakan Hub LLP',
        contactPerson: 'Neha Kulkarni',
        phone: '9822098225',
        address: 'Gate 9, Chakan Phase II MIDC',
        state: 'Maharashtra',
        city: 'Pune',
        pincode: '411026',
        gstin: '27AABCS8821K1Z4',
        isPrimary: true,
      });
    expect(editRes.status).toBe(200);
    const editedAddr = editRes.body.data.find((a: { _id: string }) => a._id === secondAddr._id);
    expect(editedAddr.companyName).toBe('Sahyadri Chakan Hub LLP');
    expect(editedAddr.phone).toBe('9822098225');
    expect(editedAddr.isDefault).toBe(true);

    // 7. Create booking with pickupAddressId + booking-time contact override -> snapshot persisted
    const route = await TransportRoute.findOne({ originCity: 'Pune', destinationCity: 'Mumbai' }).lean();
    const rate = await TransportRate.findOne({ routeId: route!._id, isDeleted: { $ne: true } }).lean();
    expect(route).toBeTruthy();
    expect(rate).toBeTruthy();

    const bookRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route!._id.toString(),
        transporterId: rate!.transporterId.toString(),
        rateId: rate!._id.toString(),
        pickupAddressId: secondAddr._id,
        paymentMode: 'INVOICE',
        sender: {
          name: 'Sahyadri Chakan Hub LLP',
          companyName: 'Sahyadri Chakan Hub LLP',
          contactPerson: 'Suresh Shift Lead',
          phone: '9822098226',
          address: 'Gate 9, Chakan Phase II MIDC',
          state: 'Maharashtra',
          city: 'Pune',
          pincode: '411026',
          gstin: '27AABCS8821K1Z4',
        },
        receiver: {
          name: 'Andheri Industrial Buyers',
          phone: '9820055443',
          address: 'MIDC Marol Plot 22',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Precision Fasteners',
          actualWeightKg: 25,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 25,
          numberOfPackages: 2,
        },
      });
    expect(bookRes.status).toBe(201);
    const booking = bookRes.body.data;
    expect(booking.pickupAddressId).toBe(secondAddr._id);
    expect(booking.sender.companyName).toBe('Sahyadri Chakan Hub LLP');
    expect(booking.sender.contactPerson).toBe('Suresh Shift Lead');
    expect(booking.sender.state).toBe('Maharashtra');
    expect(booking.pickupAddressSnapshot.companyName).toBe('Sahyadri Chakan Hub LLP');
    expect(booking.pickupAddressSnapshot.isPrimary).toBe(true);

    // 8. Mutating the saved address later MUST NOT mutate historical booking snapshot
    const postBookingEditRes = await sellerAgent
      .put(`/api/v1/sellers/me/addresses/${secondAddr._id}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        label: 'Renamed Later Warehouse',
        addressType: 'PICKUP',
        companyName: 'Completely Different Entity Name',
        contactPerson: 'New Manager',
        phone: '9822098299',
        address: 'New Street Address 999',
        state: 'Gujarat',
        city: 'Surat',
        pincode: '395002',
      });
    expect(postBookingEditRes.status).toBe(200);

    const [fetchedBookingRes, trackingSnapshotRes, lrSnapshotRes] = await Promise.all([
      sellerAgent.get(`/api/v1/bookings/${booking._id}`),
      sellerAgent.get(`/api/v1/tracking/${booking.lrNumber}`),
      sellerAgent.get(`/api/v1/bookings/${booking._id}/lr`),
    ]);
    expect(fetchedBookingRes.status).toBe(200);
    expect(fetchedBookingRes.body.data.booking.sender.companyName).toBe('Sahyadri Chakan Hub LLP');
    expect(fetchedBookingRes.body.data.booking.sender.contactPerson).toBe('Suresh Shift Lead');
    expect(fetchedBookingRes.body.data.booking.sender.address).toBe('Gate 9, Chakan Phase II MIDC');
    expect(fetchedBookingRes.body.data.booking.pickupAddressSnapshot.companyName).toBe(
      'Sahyadri Chakan Hub LLP'
    );
    expect(trackingSnapshotRes.status).toBe(200);
    expect(trackingSnapshotRes.body.data.sender.companyName).toBe('Sahyadri Chakan Hub LLP');
    expect(trackingSnapshotRes.body.data.sender.address).toBe('Gate 9, Chakan Phase II MIDC');
    expect(lrSnapshotRes.status).toBe(200);
    expect(lrSnapshotRes.headers['content-type']).toContain('application/pdf');

    // 9. Prevent deletion while linked to an active booking
    const blockedDeleteRes = await sellerAgent
      .delete(`/api/v1/sellers/me/addresses/${secondAddr._id}`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(blockedDeleteRes.status).toBe(409);
    expect(blockedDeleteRes.body.errorCode).toBe('ADDRESS_IN_ACTIVE_USE');

    // 10. Cancel booking, then delete succeeds and auto-promotes remaining address to Primary
    const cancelRes = await sellerAgent
      .post(`/api/v1/bookings/${booking._id}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ reason: 'Test cleanup cancellation' });
    expect(cancelRes.status).toBe(200);

    const finalDeleteRes = await sellerAgent
      .delete(`/api/v1/sellers/me/addresses/${secondAddr._id}`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(finalDeleteRes.status).toBe(200);
    expect(finalDeleteRes.body.data).toHaveLength(1);
    expect(finalDeleteRes.body.data[0]._id).toBe(firstAddr._id);
    expect(finalDeleteRes.body.data[0].isDefault).toBe(true);
  });

  it('enforces public transporter self-registration, pending gates, rejection reason, and admin approval', async () => {
    const email = `carrier.selfreg.${Date.now()}@deccancargo.in`;
    const gstNumber = '27AABCD8899M1Z5';
    const password = 'Password@123';

    // 1. Public self-registration creates PENDING / INACTIVE transporter
    const regRes = await request(app).post('/api/v1/transporters/register').send({
      companyName: 'Deccan Rapid Logistics LLP',
      contactPerson: 'Sandeep Kulkarni',
      email,
      password,
      phone: '9822112233',
      gstNumber,
      address: 'Plot 18, Moshi Logistics Park, Pune',
      city: 'Pune',
      pincode: '411026',
    });
    expect(regRes.status).toBe(201);
    expect(regRes.body.data.transporter.approvalStatus).toBe(TransporterApprovalStatus.PENDING);
    expect(regRes.body.data.transporter.status).toBe(EntityStatus.INACTIVE);
    expect(regRes.body.data.transporter.serviceAreas).toEqual([{ city: 'Pune', pincode: '411026' }]);
    const transporterId = regRes.body.data.transporter._id as string;

    // 2. Duplicate email and duplicate GSTIN must fail with 409
    const dupEmailRes = await request(app).post('/api/v1/transporters/register').send({
      companyName: 'Another Carrier',
      contactPerson: 'Test User',
      email,
      password,
      phone: '9822112244',
      gstNumber: '27AABCD8899M1Z6',
      address: 'Plot 19, Moshi Logistics Park, Pune',
      city: 'Pune',
      pincode: '411026',
    });
    expect(dupEmailRes.status).toBe(409);
    expect(dupEmailRes.body.errorCode).toBe('EMAIL_ALREADY_EXISTS');

    const dupGstRes = await request(app).post('/api/v1/transporters/register').send({
      companyName: 'Another Carrier',
      contactPerson: 'Test User',
      email: `other.${Date.now()}@deccancargo.in`,
      password,
      phone: '9822112244',
      gstNumber,
      address: 'Plot 19, Moshi Logistics Park, Pune',
      city: 'Pune',
      pincode: '411026',
    });
    expect(dupGstRes.status).toBe(409);
    expect(dupGstRes.body.errorCode).toBe('GST_ALREADY_REGISTERED');

    // 3. Pending transporter can sign in, view/edit profile, and submit KYC
    const { agent: pendingTransAgent } = await loginAs(email, password);

    const profileRes = await pendingTransAgent.get('/api/v1/transporter/profile');
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.approvalStatus).toBe(TransporterApprovalStatus.PENDING);
    expect(profileRes.body.data.status).toBe(EntityStatus.INACTIVE);

    const kycRes = await pendingTransAgent
      .put('/api/v1/kyc/me')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        panNumber: 'AABCD8899M',
        bankAccountHolder: 'Deccan Rapid Logistics LLP',
        bankAccountNumber: '50100998877665',
        ifscCode: 'HDFC0000123',
        bankName: 'HDFC Bank',
      });
    expect(kycRes.status).toBe(200);
    expect(kycRes.body.data.kyc.status).toBe('PENDING');

    // 4. Pending transporter is blocked from creating routes or personal bookings
    const blockedRouteRes = await pendingTransAgent
      .post('/api/v1/transporter/routes')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        originCity: 'Pune',
        originPincode: '411026',
        destinationCity: 'Mumbai',
        destinationPincode: '400013',
        ratePerKg: 14,
        minimumFreight: 650,
        additionalCharges: 100,
        rtoCharges: 300,
        volumetricDivisor: 5000,
        gstApplicable: true,
        gstRatePercent: 18,
        estimatedDeliveryTime: '18-24 Hours',
        isActive: true,
      });
    expect(blockedRouteRes.status).toBe(403);
    expect(blockedRouteRes.body.errorCode).toBe('TRANSPORTER_APPROVAL_PENDING');

    const { agent: seller1Agent } = await loginAs('seller1@apexhardware.in');
    const { agent: adminAgent } = await loginAs('admin@zipit.in');

    // 5. Pending transporter does not appear in Seller active carrier directory
    const sellerDirectoryBefore = await seller1Agent.get('/api/v1/transporters');
    expect(sellerDirectoryBefore.status).toBe(200);
    expect(
      sellerDirectoryBefore.body.data.items.some((t: { _id: string }) => t._id === transporterId)
    ).toBe(false);

    // 6. RBAC: Seller/Transporter cannot approve or reject carriers; Admin cannot bypass approval via PATCH /:id
    const sellerApproveForbidden = await seller1Agent
      .patch(`/api/v1/transporters/${transporterId}/approve`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(sellerApproveForbidden.status).toBe(403);
    expect(sellerApproveForbidden.body.errorCode).toBe('FORBIDDEN_ROLE');

    const bypassActivateRes = await adminAgent
      .patch(`/api/v1/transporters/${transporterId}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: EntityStatus.ACTIVE });
    expect(bypassActivateRes.status).toBe(400);
    expect(bypassActivateRes.body.errorCode).toBe('TRANSPORTER_NOT_APPROVED');

    // 7. Admin checks pending queue and rejects with reason
    const pendingListRes = await adminAgent.get('/api/v1/transporters?approvalStatus=PENDING');
    expect(pendingListRes.status).toBe(200);
    expect(pendingListRes.body.data.items.some((t: { _id: string }) => t._id === transporterId)).toBe(true);

    const rejectReason = 'GST certificate copy missing authorized signatory stamp.';
    const rejectRes = await adminAgent
      .patch(`/api/v1/transporters/${transporterId}/reject`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ rejectionReason: rejectReason });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.approvalStatus).toBe(TransporterApprovalStatus.REJECTED);
    expect(rejectRes.body.data.rejectionReason).toBe(rejectReason);

    const rejectedDashboard = await pendingTransAgent.get('/api/v1/dashboard/stats');
    expect(rejectedDashboard.status).toBe(200);
    expect(rejectedDashboard.body.data.approvalStatus).toBe(TransporterApprovalStatus.REJECTED);
    expect(rejectedDashboard.body.data.rejectionReason).toBe(rejectReason);

    const rejectedRouteAttempt = await pendingTransAgent
      .post('/api/v1/transporter/routes')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        originCity: 'Pune',
        originPincode: '411026',
        destinationCity: 'Mumbai',
        destinationPincode: '400013',
        ratePerKg: 14,
        minimumFreight: 650,
        additionalCharges: 100,
        rtoCharges: 300,
        volumetricDivisor: 5000,
        gstApplicable: true,
        gstRatePercent: 18,
        estimatedDeliveryTime: '18-24 Hours',
        isActive: true,
      });
    expect(rejectedRouteAttempt.status).toBe(403);
    expect(rejectedRouteAttempt.body.errorCode).toBe('TRANSPORTER_APPROVAL_REJECTED');

    // 8. Admin approves transporter -> becomes APPROVED & ACTIVE, unlocks routes, quotes, and personal bookings
    const approveRes = await adminAgent
      .patch(`/api/v1/transporters/${transporterId}/approve`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.approvalStatus).toBe(TransporterApprovalStatus.APPROVED);
    expect(approveRes.body.data.status).toBe(EntityStatus.ACTIVE);
    expect(approveRes.body.data.rejectionReason).toBeUndefined();

    const sellerDirectoryAfter = await seller1Agent.get('/api/v1/transporters');
    expect(sellerDirectoryAfter.status).toBe(200);
    expect(
      sellerDirectoryAfter.body.data.items.some((t: { _id: string }) => t._id === transporterId)
    ).toBe(true);

    const createRouteRes = await pendingTransAgent
      .post('/api/v1/transporter/routes')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        originCity: 'Pune',
        originPincode: '411026',
        destinationCity: 'Mumbai',
        destinationPincode: '400013',
        ratePerKg: 14,
        minimumFreight: 650,
        additionalCharges: 100,
        rtoCharges: 300,
        volumetricDivisor: 5000,
        gstApplicable: true,
        gstRatePercent: 18,
        estimatedDeliveryTime: '18-24 Hours',
        isActive: true,
      });
    expect(createRouteRes.status).toBe(201);
    const createdRoute = createRouteRes.body.data;

    // 9. Newly approved carrier quote now appears in Seller rate calculation & personal booking succeeds
    const quotesRes = await seller1Agent
      .post('/api/v1/rates/calculate')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: createdRoute.routeId,
        actualWeightKg: 40,
        lengthCm: 40,
        widthCm: 30,
        heightCm: 25,
        numberOfPackages: 2,
      });
    expect(quotesRes.status).toBe(200);
    expect(
      quotesRes.body.data.quotes.some((q: { transporterId: string }) => q.transporterId === transporterId)
    ).toBe(true);

    const personalBkRes = await pendingTransAgent
      .post('/api/v1/transporter/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: createdRoute.routeId,
        rateId: createdRoute.rateId,
        idempotencyKey: `selfreg-bk-${Date.now()}`,
        paymentMode: 'CASH',
        sender: {
          name: 'Deccan Walk-in Consignor',
          phone: '9822334411',
          address: 'Bhosari Sector 10',
          city: 'Pune',
          pincode: '411026',
        },
        receiver: {
          name: 'Mumbai Buyer Hub',
          phone: '9820011223',
          address: 'Lower Parel Plot 7',
          city: 'Mumbai',
          pincode: '400013',
        },
        parcel: {
          description: 'Industrial Spares',
          actualWeightKg: 35,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 20,
          numberOfPackages: 2,
        },
      });
    expect(personalBkRes.status).toBe(201);
    expect(personalBkRes.body.data.transporterId._id).toBe(transporterId);
  });
});





