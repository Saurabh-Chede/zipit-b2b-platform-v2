import crypto from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { connectDatabase, disconnectDatabase } from '../backend/src/config/database.ts';
import { env } from '../backend/src/config/env.ts';
import { createApiApp, errorHandler } from '../backend/src/app.ts';
import { seedDatabase } from '../backend/src/seeds/seedData.ts';
import { TransportRoute } from '../backend/src/models/TransportRoute.ts';
import { TransportRate } from '../backend/src/models/TransportRate.ts';
import { Transporter } from '../backend/src/models/Transporter.ts';
import { WhatsAppConfig } from '../backend/src/models/WhatsAppConfig.ts';
import { WhatsAppNotificationLog } from '../backend/src/models/WhatsAppNotificationLog.ts';
import { Booking } from '../backend/src/models/Booking.ts';
import { BookingStatus, WhatsAppEventType } from '../backend/src/utils/constants.ts';
import {
  dispatchBookingNotificationEvent,
  flushWhatsAppQueueForTests,
  stopWhatsAppWorkersForTests,
} from '../backend/src/modules/whatsapp/whatsapp.service.ts';

process.env.NODE_ENV = 'test';

const app = createApiApp();
app.use(errorHandler);

const DEMO_PASS = process.env.DEMO_SEED_PASSWORD || 'ZipitDemo@2026';

const mutableEnv = env as unknown as {
  whatsappEnabled: boolean;
  whatsappApiVersion: string;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  whatsappAccessToken: string;
  whatsappAppSecret: string;
  whatsappWebhookVerifyToken: string;
};

describe('WhatsApp Shipment Tracking & Cloud API Integration Tests', () => {
  const originalEnvSnapshot = {
    whatsappEnabled: mutableEnv.whatsappEnabled,
    whatsappApiVersion: mutableEnv.whatsappApiVersion,
    whatsappPhoneNumberId: mutableEnv.whatsappPhoneNumberId,
    whatsappBusinessAccountId: mutableEnv.whatsappBusinessAccountId,
    whatsappAccessToken: mutableEnv.whatsappAccessToken,
    whatsappAppSecret: mutableEnv.whatsappAppSecret,
    whatsappWebhookVerifyToken: mutableEnv.whatsappWebhookVerifyToken,
  };

  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    await connectDatabase();
    await seedDatabase(true);
  });

  afterAll(async () => {
    stopWhatsAppWorkersForTests();
    Object.assign(mutableEnv, originalEnvSnapshot);
    await disconnectDatabase();
  });

  beforeEach(async () => {
    mutableEnv.whatsappEnabled = true;
    mutableEnv.whatsappApiVersion = 'v21.0';
    mutableEnv.whatsappPhoneNumberId = '102938475612345';
    mutableEnv.whatsappBusinessAccountId = '998877665544332';
    mutableEnv.whatsappAccessToken = 'EAAG_TEST_SECRET_TOKEN_NEVER_EXPOSED';
    mutableEnv.whatsappAppSecret = 'test_meta_app_secret_hmac_key';
    mutableEnv.whatsappWebhookVerifyToken = 'zipit_verify_token_123';

    await WhatsAppConfig.deleteMany({});
    await WhatsAppNotificationLog.deleteMany({});

    let seq = 1;
    fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const id = `wamid.HBgMOTE5ODIwMDExMjIzFQIAERgS${seq++}`;
      return new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          contacts: [{ input: '919820011223', wa_id: '919820011223' }],
          messages: [{ id }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
  });

  afterEach(() => {
    stopWhatsAppWorkersForTests();
    fetchMock.mockRestore();
  });

  async function loginAs(email: string, password = DEMO_PASS) {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return agent;
  }

  async function getSwiftLineRouteAndRate() {
    const transporter = await Transporter.findOne({ email: 'ops@swiftlinefreight.in' }).lean();
    expect(transporter).toBeDefined();
    const rate = await TransportRate.findOne({
      transporterId: transporter!._id,
      isActive: true,
    }).lean();
    expect(rate).toBeDefined();
    const route = await TransportRoute.findById(rate!.routeId).lean();
    expect(route).toBeDefined();
    return { transporter: transporter!, rate: rate!, route: route! };
  }

  it('enforces admin RBAC and never exposes Meta tokens/secrets in API responses', async () => {
    const [adminAgent, sellerAgent, transAgent] = await Promise.all([
      loginAs('admin@zipit.in'),
      loginAs('seller1@apexhardware.in'),
      loginAs('ops@swiftlinefreight.in'),
    ]);

    const sellerRes = await sellerAgent.get('/api/v1/whatsapp/config');
    expect(sellerRes.status).toBe(403);
    expect(sellerRes.body.errorCode).toBe('FORBIDDEN_ROLE');

    const transLogsRes = await transAgent.get('/api/v1/whatsapp/logs');
    expect(transLogsRes.status).toBe(403);
    expect(transLogsRes.body.errorCode).toBe('FORBIDDEN_ROLE');

    const adminConfigRes = await adminAgent.get('/api/v1/whatsapp/config');
    expect(adminConfigRes.status).toBe(200);
    expect(adminConfigRes.body.data.credentials).toMatchObject({
      accessTokenConfigured: true,
      phoneNumberIdConfigured: true,
      businessAccountConfigured: true,
      appSecretConfigured: true,
      webhookVerifyTokenConfigured: true,
    });

    const serialized = JSON.stringify(adminConfigRes.body);
    expect(serialized).not.toContain('EAAG_TEST_SECRET_TOKEN_NEVER_EXPOSED');
    expect(serialized).not.toContain('test_meta_app_secret_hmac_key');
    expect(serialized).not.toContain('zipit_verify_token_123');
  });

  it('sends all 6 WhatsApp lifecycle notifications for seller PLATFORM bookings with ZIPIT branding and tracking link', async () => {
    const [sellerAgent, transAgent, adminAgent] = await Promise.all([
      loginAs('seller1@apexhardware.in'),
      loginAs('ops@swiftlinefreight.in'),
      loginAs('admin@zipit.in'),
    ]);
    const { transporter, rate, route } = await getSwiftLineRouteAndRate();

    const bookRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route._id.toString(),
        transporterId: transporter._id.toString(),
        rateId: rate._id.toString(),
        idempotencyKey: `wa-plat-${Date.now()}`,
        paymentMode: 'INVOICE',
        whatsappOptIn: true,
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: route.originCity,
          pincode: route.originPincode,
        },
        receiver: {
          name: 'Mumbai Hub Receiver',
          phone: '9820011223',
          address: 'Lower Parel',
          city: route.destinationCity,
          pincode: route.destinationPincode,
        },
        parcel: {
          description: 'Precision Valves',
          actualWeightKg: 40,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 25,
          numberOfPackages: 2,
        },
      });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.data._id as string;
    const lrNumber = bookRes.body.data.lrNumber as string;

    const statuses = [
      BookingStatus.ACCEPTED,
      BookingStatus.DISPATCHED,
      BookingStatus.ARRIVED,
      BookingStatus.OUT_FOR_DELIVERY,
      BookingStatus.DELIVERED,
    ];

    for (const status of statuses) {
      const patchRes = await transAgent
        .patch(`/api/v1/bookings/${bookingId}/status`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          status,
          location: `${route.destinationCity} Hub`,
          remarks: `Milestone ${status} reached`,
        });
      expect(patchRes.status).toBe(200);
    }

    await flushWhatsAppQueueForTests();

    // Verify Meta Graph API calls contain branding, LR, pickup, destination, and tracking URL
    expect(fetchMock).toHaveBeenCalled();
    const receiverPayloads = fetchMock.mock.calls
      .map(([url, init]: [unknown, unknown]) => {
        expect(String(url)).toBe(
          'https://graph.facebook.com/v21.0/102938475612345/messages'
        );
        return JSON.parse(String((init as RequestInit).body)) as {
          to: string;
          type: string;
          template: { components: Array<{ parameters: Array<{ text: string }> }> };
        };
      })
      .filter((p: { to: string }) => p.to === '919820011223');

    expect(receiverPayloads).toHaveLength(6);
    for (const payload of receiverPayloads) {
      expect(payload.type).toBe('template');
      const paramTexts = payload.template.components[0].parameters.map(
        (p: { text: string }) => p.text
      );
      expect(paramTexts[0]).toBe('ZIPIT B2B');
      expect(paramTexts[1]).toBe(lrNumber);
      expect(paramTexts[3]).toContain(route.originCity);
      expect(paramTexts[4]).toContain(route.destinationCity);
      expect(paramTexts[6]).toContain(`/track/${encodeURIComponent(lrNumber)}`);
    }

    // Admin logs endpoint lists all 6 events for receiver with SENT status
    const logsRes = await adminAgent.get(
      `/api/v1/whatsapp/logs?search=${encodeURIComponent(lrNumber)}&limit=50`
    );
    expect(logsRes.status).toBe(200);
    const receiverLogs = logsRes.body.data.items.filter(
      (l: { recipientPhone: string }) => l.recipientPhone === '919820011223'
    );
    expect(receiverLogs).toHaveLength(6);
    expect(new Set(receiverLogs.map((l: { eventType: string }) => l.eventType))).toEqual(
      new Set(Object.values(WhatsAppEventType))
    );
    expect(receiverLogs.every((l: { status: string }) => l.status === 'SENT')).toBe(true);

    // Existing public tracking endpoint reflects OUT_FOR_DELIVERY and DELIVERED
    const publicTrackRes = await request(app).get(
      `/api/v1/public/tracking/${encodeURIComponent(lrNumber)}`
    );
    expect(publicTrackRes.status).toBe(200);
    expect(publicTrackRes.body.data.status).toBe(BookingStatus.DELIVERED);
    expect(
      publicTrackRes.body.data.timeline.map((t: { status: string }) => t.status)
    ).toContain(BookingStatus.OUT_FOR_DELIVERY);
  });

  it('triggers WhatsApp notifications for TRANSPORTER_SELF personal bookings and POD markDelivered', async () => {
    const [transAgent, adminAgent] = await Promise.all([
      loginAs('ops@swiftlinefreight.in'),
      loginAs('admin@zipit.in'),
    ]);
    const { rate, route } = await getSwiftLineRouteAndRate();

    const personalRes = await transAgent
      .post('/api/v1/transporter/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route._id.toString(),
        rateId: rate._id.toString(),
        idempotencyKey: `wa-self-${Date.now()}`,
        paymentMode: 'CASH',
        whatsappOptIn: true,
        sender: {
          name: 'Walkin Sender',
          phone: '9824011999',
          address: 'Plot 8',
          city: route.originCity,
          pincode: route.originPincode,
        },
        receiver: {
          name: 'Direct Receiver',
          phone: '9825099111',
          address: 'Shop 2',
          city: route.destinationCity,
          pincode: route.destinationPincode,
        },
        parcel: {
          description: 'Spare Bearings',
          actualWeightKg: 25,
          lengthCm: 30,
          widthCm: 25,
          heightCm: 20,
          numberOfPackages: 1,
        },
      });
    expect(personalRes.status).toBe(201);
    const selfId = personalRes.body.data._id as string;
    const selfLr = personalRes.body.data.lrNumber as string;

    for (const status of [
      BookingStatus.DISPATCHED,
      BookingStatus.ARRIVED,
      BookingStatus.OUT_FOR_DELIVERY,
    ]) {
      const stepRes = await transAgent
        .patch(`/api/v1/bookings/${selfId}/status`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ status, location: `${route.destinationCity} Hub` });
      expect(stepRes.status).toBe(200);
    }

    // Complete delivery via POD upload with markDelivered=true
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const podRes = await transAgent
      .post(`/api/v1/bookings/${selfId}/delivery-proof`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('receiverName', 'Direct Receiver')
      .field('deliveryDate', '2026-11-23')
      .field('markDelivered', 'true')
      .attach('image', validPng, { filename: 'pod.png', contentType: 'image/png' });
    expect(podRes.status).toBe(201);

    await flushWhatsAppQueueForTests();

    const logsRes = await adminAgent.get(
      `/api/v1/whatsapp/logs?bookingSource=TRANSPORTER_SELF&search=${encodeURIComponent(selfLr)}&limit=50`
    );
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.items).toHaveLength(5);
    expect(
      logsRes.body.data.items.some(
        (l: { eventType: string; status: string }) =>
          l.eventType === WhatsAppEventType.DELIVERED && l.status === 'SENT'
      )
    ).toBe(true);
  });

  it('prevents duplicate notifications, respects customer opt-in, and honors disabled event toggles', async () => {
    const [sellerAgent, transAgent, adminAgent] = await Promise.all([
      loginAs('seller1@apexhardware.in'),
      loginAs('ops@swiftlinefreight.in'),
      loginAs('admin@zipit.in'),
    ]);
    const { transporter, rate, route } = await getSwiftLineRouteAndRate();

    // 1. Booking with whatsappOptIn: false -> skipped without calling Meta API
    const optOutRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route._id.toString(),
        transporterId: transporter._id.toString(),
        rateId: rate._id.toString(),
        idempotencyKey: `wa-optout-${Date.now()}`,
        paymentMode: 'INVOICE',
        whatsappOptIn: false,
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: route.originCity,
          pincode: route.originPincode,
        },
        receiver: {
          name: 'OptOut Buyer',
          phone: '9820012345',
          address: 'Bandra',
          city: route.destinationCity,
          pincode: route.destinationPincode,
        },
        parcel: {
          description: 'Cartons',
          actualWeightKg: 15,
          lengthCm: 25,
          widthCm: 20,
          heightCm: 20,
          numberOfPackages: 1,
        },
      });
    expect(optOutRes.status).toBe(201);
    await flushWhatsAppQueueForTests();
    expect(fetchMock).not.toHaveBeenCalled();

    const optOutLogs = await WhatsAppNotificationLog.find({
      lrNumber: optOutRes.body.data.lrNumber,
    }).lean();
    expect(optOutLogs.length).toBeGreaterThan(0);
    expect(optOutLogs.every((l) => l.status === 'SKIPPED')).toBe(true);

    // 2. Disable IN_TRANSIT via Admin config and test deduplication
    const cfgRes = await adminAgent.get('/api/v1/whatsapp/config');
    const currentCfg = cfgRes.body.data.config;
    const updatedEvents = currentCfg.events.map((ev: { eventType: string; enabled: boolean }) =>
      ev.eventType === WhatsAppEventType.IN_TRANSIT ? { ...ev, enabled: false } : ev
    );

    const putCfgRes = await adminAgent
      .put('/api/v1/whatsapp/config')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        enabled: currentCfg.enabled,
        apiVersion: currentCfg.apiVersion,
        phoneNumberId: currentCfg.phoneNumberId,
        businessAccountId: currentCfg.businessAccountId,
        defaultCountryCode: currentCfg.defaultCountryCode,
        requireCustomerOptIn: currentCfg.requireCustomerOptIn,
        recipients: currentCfg.recipients,
        retryPolicy: currentCfg.retryPolicy,
        events: updatedEvents,
      });
    expect(putCfgRes.status).toBe(200);

    const optInRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route._id.toString(),
        transporterId: transporter._id.toString(),
        rateId: rate._id.toString(),
        idempotencyKey: `wa-dedup-${Date.now()}`,
        paymentMode: 'INVOICE',
        whatsappOptIn: true,
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: route.originCity,
          pincode: route.originPincode,
        },
        receiver: {
          name: 'Dedup Buyer',
          phone: '9820054321',
          address: 'Andheri',
          city: route.destinationCity,
          pincode: route.destinationPincode,
        },
        parcel: {
          description: 'Tools',
          actualWeightKg: 18,
          lengthCm: 25,
          widthCm: 20,
          heightCm: 20,
          numberOfPackages: 1,
        },
      });
    expect(optInRes.status).toBe(201);
    await flushWhatsAppQueueForTests();

    const countAfterBook = fetchMock.mock.calls.length;
    expect(countAfterBook).toBeGreaterThan(0);

    // Duplicate dispatch of BOOKING_CONFIRMED must not create another log or Meta request
    const bookingDoc = await Booking.findById(optInRes.body.data._id).lean();
    await dispatchBookingNotificationEvent({
      booking: bookingDoc!,
      eventType: WhatsAppEventType.BOOKING_CONFIRMED,
    });
    await flushWhatsAppQueueForTests();
    expect(fetchMock.mock.calls.length).toBe(countAfterBook);

    // Advance ACCEPTED -> DISPATCHED (IN_TRANSIT is disabled -> should log SKIPPED, no Meta fetch)
    await transAgent
      .patch(`/api/v1/bookings/${optInRes.body.data._id}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: BookingStatus.ACCEPTED, location: 'Pune Hub' });
    await flushWhatsAppQueueForTests();
    const callsBeforeDispatched = fetchMock.mock.calls.length;

    await transAgent
      .patch(`/api/v1/bookings/${optInRes.body.data._id}/status`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ status: BookingStatus.DISPATCHED, location: 'Expressway' });
    await flushWhatsAppQueueForTests();
    expect(fetchMock.mock.calls.length).toBe(callsBeforeDispatched);

    const skippedInTransit = await WhatsAppNotificationLog.findOne({
      bookingId: bookingDoc!._id,
      eventType: WhatsAppEventType.IN_TRANSIT,
    }).lean();
    expect(skippedInTransit?.status).toBe('SKIPPED');
  });

  it('does not roll back shipment updates on WhatsApp failure, auto-retries transient errors, and supports manual Admin retry', async () => {
    const [sellerAgent, adminAgent] = await Promise.all([
      loginAs('seller1@apexhardware.in'),
      loginAs('admin@zipit.in'),
    ]);
    const { transporter, rate, route } = await getSwiftLineRouteAndRate();

    // First attempt returns 500, second attempt returns 200 (automatic retry)
    let callNum = 0;
    fetchMock.mockImplementation(async () => {
      callNum += 1;
      if (callNum === 1) {
        return new Response(
          JSON.stringify({ error: { message: 'Temporary Meta upstream outage', code: 2 } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          messaging_product: 'whatsapp',
          messages: [{ id: `wamid.retry_ok_${callNum}` }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const bookRes1 = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route._id.toString(),
        transporterId: transporter._id.toString(),
        rateId: rate._id.toString(),
        idempotencyKey: `wa-autoretry-${Date.now()}`,
        paymentMode: 'INVOICE',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: route.originCity,
          pincode: route.originPincode,
        },
        receiver: {
          name: 'Retry Buyer',
          phone: '9820088776',
          address: 'Thane',
          city: route.destinationCity,
          pincode: route.destinationPincode,
        },
        parcel: {
          description: 'Auto Retry Test',
          actualWeightKg: 10,
          lengthCm: 20,
          widthCm: 20,
          heightCm: 20,
          numberOfPackages: 1,
        },
      });
    expect(bookRes1.status).toBe(201);
    await flushWhatsAppQueueForTests();

    const retriedReceiverLog = await WhatsAppNotificationLog.findOne({
      lrNumber: bookRes1.body.data.lrNumber,
      recipientPhone: '919820088776',
    }).lean();
    expect(retriedReceiverLog?.status).toBe('SENT');
    expect(retriedReceiverLog?.attemptCount).toBeGreaterThanOrEqual(1);

    // Permanent 400 failure -> FAILED log -> manual Admin retry succeeds
    fetchMock.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          error: { message: 'Template parameter count mismatch', code: 132000 },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    });
    // Also fail Seller phone if present
    fetchMock.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify({
          error: { message: 'Template parameter count mismatch', code: 132000 },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const bookRes2 = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route._id.toString(),
        transporterId: transporter._id.toString(),
        rateId: rate._id.toString(),
        idempotencyKey: `wa-manualretry-${Date.now()}`,
        paymentMode: 'INVOICE',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: route.originCity,
          pincode: route.originPincode,
        },
        receiver: {
          name: 'Manual Retry Buyer',
          phone: '9820077665',
          address: 'Vashi',
          city: route.destinationCity,
          pincode: route.destinationPincode,
        },
        parcel: {
          description: 'Manual Retry Test',
          actualWeightKg: 12,
          lengthCm: 20,
          widthCm: 20,
          heightCm: 20,
          numberOfPackages: 1,
        },
      });
    expect(bookRes2.status).toBe(201);
    await flushWhatsAppQueueForTests();

    const failedLog = await WhatsAppNotificationLog.findOne({
      lrNumber: bookRes2.body.data.lrNumber,
      recipientPhone: '919820077665',
    }).lean();
    expect(failedLog?.status).toBe('FAILED');
    expect(failedLog?.lastErrorCode).toBe('META_132000');

    // Manual retry via Admin API (fetchMock falls back to 200 default)
    const manualRetryRes = await adminAgent
      .post(`/api/v1/whatsapp/logs/${failedLog!._id}/retry`)
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(manualRetryRes.status).toBe(200);
    expect(manualRetryRes.body.data.status).toBe('SENT');
  });

  it('verifies Meta webhook challenge, enforces X-Hub-Signature-256 HMAC, and processes delivery/read/failed receipts', async () => {
    const sellerAgent = await loginAs('seller1@apexhardware.in');
    const { transporter, rate, route } = await getSwiftLineRouteAndRate();

    // GET challenge check
    const badVerify = await request(app)
      .get('/api/v1/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong_token', 'hub.challenge': 'abc123' });
    expect(badVerify.status).toBe(403);

    const okVerify = await request(app)
      .get('/api/v1/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'zipit_verify_token_123',
        'hub.challenge': 'challenge_9988',
      });
    expect(okVerify.status).toBe(200);
    expect(okVerify.text).toBe('challenge_9988');

    // Create a booking to generate a SENT log with metaMessageId
    const bookRes = await sellerAgent
      .post('/api/v1/bookings')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        routeId: route._id.toString(),
        transporterId: transporter._id.toString(),
        rateId: rate._id.toString(),
        idempotencyKey: `wa-webhook-${Date.now()}`,
        paymentMode: 'INVOICE',
        sender: {
          name: 'Apex Hardware',
          phone: '9823011223',
          address: 'MIDC Bhosari',
          city: route.originCity,
          pincode: route.originPincode,
        },
        receiver: {
          name: 'Webhook Receiver',
          phone: '9820066554',
          address: 'Chembur',
          city: route.destinationCity,
          pincode: route.destinationPincode,
        },
        parcel: {
          description: 'Webhook Cargo',
          actualWeightKg: 14,
          lengthCm: 25,
          widthCm: 20,
          heightCm: 20,
          numberOfPackages: 1,
        },
      });
    expect(bookRes.status).toBe(201);
    await flushWhatsAppQueueForTests();

    const sentLog = await WhatsAppNotificationLog.findOne({
      lrNumber: bookRes.body.data.lrNumber,
      recipientPhone: '919820066554',
    }).lean();
    expect(sentLog?.status).toBe('SENT');
    expect(sentLog?.metaMessageId).toBeTruthy();

    const webhookBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '998877665544332',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  {
                    id: sentLog!.metaMessageId,
                    status: 'delivered',
                    timestamp: '1795400000',
                  },
                  {
                    id: sentLog!.metaMessageId,
                    status: 'read',
                    timestamp: '1795400060',
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    // Reject missing/invalid signature
    const badSigRes = await request(app)
      .post('/api/v1/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=deadbeef')
      .send(webhookBody);
    expect(badSigRes.status).toBe(401);

    // Valid HMAC signature updates delivery & read status
    const validSig =
      'sha256=' +
      crypto
        .createHmac('sha256', 'test_meta_app_secret_hmac_key')
        .update(Buffer.from(webhookBody, 'utf8'))
        .digest('hex');

    const okWebhookRes = await request(app)
      .post('/api/v1/whatsapp/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', validSig)
      .send(webhookBody);
    expect(okWebhookRes.status).toBe(200);
    expect(okWebhookRes.body.data.updatedCount).toBe(2);

    const updatedLog = await WhatsAppNotificationLog.findById(sentLog!._id).lean();
    expect(updatedLog?.status).toBe('READ');
    expect(updatedLog?.deliveredAt).toBeTruthy();
    expect(updatedLog?.readAt).toBeTruthy();
    expect(updatedLog?.webhookHistory).toHaveLength(2);
  });
});
