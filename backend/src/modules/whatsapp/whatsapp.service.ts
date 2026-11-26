import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import { AppError } from '../../utils/AppError.ts';
import { WhatsAppEventType } from '../../utils/constants.ts';
import { parsePagination, buildPaginatedResponse } from '../../utils/pagination.ts';
import type { IBooking } from '../../models/Booking.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { User } from '../../models/User.ts';
import {
  DEFAULT_WHATSAPP_EVENTS,
  WhatsAppConfig,
  type IWhatsAppConfig,
  type IWhatsAppEventTemplateConfig,
} from '../../models/WhatsAppConfig.ts';
import {
  WhatsAppNotificationLog,
  type IWhatsAppNotificationLog,
  type WhatsAppRecipientRole,
} from '../../models/WhatsAppNotificationLog.ts';
import type { UpdateWhatsAppConfigInput } from './whatsapp.validator.ts';

const META_GRAPH_BASE = 'https://graph.facebook.com';
const activeDispatches = new Set<Promise<void>>();
const activeDeliveries = new Set<Promise<void>>();
const pendingRetryTimers = new Map<string, NodeJS.Timeout>();
let pendingQueuedCount = 0;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateNotificationId(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ZPT-WA-${ymd}-${rand}`;
}

export function normalizeWhatsAppPhone(rawPhone: string, defaultCountryCode = '91'): string | null {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `${defaultCountryCode}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    const stripped = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(stripped)) {
      return `${defaultCountryCode}${stripped}`;
    }
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return digits;
  }
  return null;
}

function mergeDefaultEvents(
  existingEvents: IWhatsAppEventTemplateConfig[]
): IWhatsAppEventTemplateConfig[] {
  const byType = new Map<WhatsAppEventType, IWhatsAppEventTemplateConfig>();
  for (const ev of existingEvents || []) {
    byType.set(ev.eventType, {
      eventType: ev.eventType,
      enabled: ev.enabled,
      templateName: ev.templateName,
      languageCode: ev.languageCode,
      statusLabel: ev.statusLabel,
      updateSummaryTemplate: ev.updateSummaryTemplate,
    });
  }
  return DEFAULT_WHATSAPP_EVENTS.map((def) => byType.get(def.eventType) ?? { ...def });
}

export async function getOrCreateWhatsAppConfig(): Promise<IWhatsAppConfig> {
  let doc = await WhatsAppConfig.findOne({ key: 'DEFAULT' });
  if (!doc) {
    doc = await WhatsAppConfig.create({
      key: 'DEFAULT',
      enabled: env.whatsappEnabled,
      apiVersion: env.whatsappApiVersion || 'v21.0',
      phoneNumberId: env.whatsappPhoneNumberId || '',
      businessAccountId: env.whatsappBusinessAccountId || '',
      defaultCountryCode: '91',
      requireCustomerOptIn: true,
      recipients: {
        sendToReceiver: true,
        sendToSender: false,
        sendToSeller: true,
      },
      retryPolicy: {
        maxRetries: 3,
        backoffSeconds: 30,
      },
      events: DEFAULT_WHATSAPP_EVENTS.map((ev) => ({ ...ev })),
    });
  } else {
    const merged = mergeDefaultEvents(doc.events);
    if (merged.length !== doc.events.length) {
      doc.events = merged;
      await doc.save();
    }
  }
  return doc;
}

export async function getWhatsAppConfigView() {
  const doc = await getOrCreateWhatsAppConfig();
  const effectivePhoneNumberId = doc.phoneNumberId || env.whatsappPhoneNumberId || '';
  const effectiveBusinessAccountId =
    doc.businessAccountId || env.whatsappBusinessAccountId || '';

  return {
    config: {
      _id: doc._id,
      key: doc.key,
      enabled: doc.enabled,
      apiVersion: doc.apiVersion || env.whatsappApiVersion || 'v21.0',
      phoneNumberId: effectivePhoneNumberId,
      businessAccountId: effectiveBusinessAccountId,
      defaultCountryCode: doc.defaultCountryCode,
      requireCustomerOptIn: doc.requireCustomerOptIn,
      recipients: doc.recipients,
      retryPolicy: doc.retryPolicy,
      events: mergeDefaultEvents(doc.events),
      updatedByName: doc.updatedByName ?? null,
      updatedAt: doc.updatedAt,
    },
    credentials: {
      accessTokenConfigured: Boolean(env.whatsappAccessToken),
      phoneNumberIdConfigured: Boolean(effectivePhoneNumberId),
      businessAccountConfigured: Boolean(effectiveBusinessAccountId),
      appSecretConfigured: Boolean(env.whatsappAppSecret),
      webhookVerifyTokenConfigured: Boolean(env.whatsappWebhookVerifyToken),
      webhookUrl: `${env.appUrl}/api/v1/whatsapp/webhook`,
    },
  };
}

export async function updateWhatsAppConfig(
  actorUserId: string,
  input: UpdateWhatsAppConfigInput
) {
  const actor = await User.findById(actorUserId).select('name').lean();
  const doc = await getOrCreateWhatsAppConfig();

  doc.enabled = input.enabled;
  doc.apiVersion = input.apiVersion;
  doc.phoneNumberId = input.phoneNumberId;
  doc.businessAccountId = input.businessAccountId;
  doc.defaultCountryCode = input.defaultCountryCode;
  doc.requireCustomerOptIn = input.requireCustomerOptIn;
  doc.recipients = { ...input.recipients };
  doc.retryPolicy = { ...input.retryPolicy };
  doc.events = mergeDefaultEvents(input.events as IWhatsAppEventTemplateConfig[]);
  doc.updatedByUserId = new mongoose.Types.ObjectId(actorUserId);
  doc.updatedByName = actor?.name || 'Admin';

  await doc.save();
  return getWhatsAppConfigView();
}

export function buildMetaTemplatePayload(log: IWhatsAppNotificationLog) {
  const vars = log.templateVariables;
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: log.recipientPhone,
    type: 'template',
    template: {
      name: log.templateName,
      language: {
        code: log.languageCode || 'en',
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: vars.brandName },
            { type: 'text', text: vars.lrNumber },
            { type: 'text', text: vars.statusLabel },
            { type: 'text', text: vars.pickupLocation },
            { type: 'text', text: vars.destinationLocation },
            { type: 'text', text: vars.latestUpdate },
            { type: 'text', text: vars.trackingUrl },
          ],
        },
      ],
    },
  };
}

function buildTrackingUrl(lrNumber: string): string {
  const base = env.appUrl.replace(/\/+$/, '');
  return `${base}/track/${encodeURIComponent(lrNumber)}`;
}

function buildMessagePreview(vars: IWhatsAppNotificationLog['templateVariables']): string {
  return (
    `[${vars.brandName}] Shipment Update for ${vars.customerName} — ` +
    `LR: ${vars.lrNumber} | Status: ${vars.statusLabel} | ` +
    `Route: ${vars.pickupLocation} -> ${vars.destinationLocation} | ` +
    `Update: ${vars.latestUpdate} | Track: ${vars.trackingUrl}`
  );
}

interface MetaApiSendResult {
  ok: boolean;
  metaMessageId?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
}

async function sendToMetaCloudApi(
  log: IWhatsAppNotificationLog,
  config: IWhatsAppConfig
): Promise<MetaApiSendResult> {
  const accessToken = env.whatsappAccessToken;
  const phoneNumberId = (config.phoneNumberId || env.whatsappPhoneNumberId || '').trim();
  const apiVersion = (config.apiVersion || env.whatsappApiVersion || 'v21.0').trim();

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      errorCode: 'CREDENTIALS_MISSING',
      errorMessage:
        'Meta WhatsApp Cloud API credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the backend server.',
      retryable: false,
    };
  }

  if (!/^v\d+\.\d+$/.test(apiVersion) || !/^[0-9]+$/.test(phoneNumberId)) {
    return {
      ok: false,
      errorCode: 'INVALID_META_CONFIG',
      errorMessage: 'Invalid Meta Graph API version or Phone Number ID format.',
      retryable: false,
    };
  }

  const endpointUrl = `${META_GRAPH_BASE}/${apiVersion}/${phoneNumberId}/messages`;
  const payload = buildMetaTemplatePayload(log);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  if (typeof timer.unref === 'function') timer.unref();

  try {
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let parsedBody: {
      messages?: Array<{ id?: string }>;
      error?: {
        message?: string;
        code?: number | string;
        error_subcode?: number | string;
        error_data?: { details?: string };
      };
    } = {};

    try {
      parsedBody = responseText ? (JSON.parse(responseText) as typeof parsedBody) : {};
    } catch {
      parsedBody = {};
    }

    if (response.ok) {
      const metaMessageId = parsedBody.messages?.[0]?.id;
      if (!metaMessageId) {
        return {
          ok: false,
          httpStatus: response.status,
          errorCode: 'META_NO_MESSAGE_ID',
          errorMessage: 'Meta Cloud API returned HTTP 200 without a message ID.',
          retryable: true,
        };
      }
      return {
        ok: true,
        metaMessageId,
        httpStatus: response.status,
        retryable: false,
      };
    }

    const metaErr = parsedBody.error;
    const errorCode = metaErr?.code ? `META_${String(metaErr.code)}` : `HTTP_${response.status}`;
    const errorMessage =
      metaErr?.error_data?.details ||
      metaErr?.message ||
      `Meta Cloud API request failed with HTTP ${response.status}`;
    const retryable = response.status === 429 || response.status >= 500;

    return {
      ok: false,
      httpStatus: response.status,
      errorCode,
      errorMessage: errorMessage.slice(0, 500),
      retryable,
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const msg = isAbort
      ? 'Meta WhatsApp Cloud API request timed out after 10 seconds.'
      : err instanceof Error
        ? err.message
        : 'Network error communicating with Meta WhatsApp Cloud API.';

    return {
      ok: false,
      errorCode: isAbort ? 'META_TIMEOUT' : 'NETWORK_ERROR',
      errorMessage: msg.slice(0, 500),
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function processDeliveryAttempt(logId: string): Promise<void> {
  const existingTimer = pendingRetryTimers.get(logId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pendingRetryTimers.delete(logId);
  }

  try {
    const log = await WhatsAppNotificationLog.findById(logId);
    if (!log) return;
    if (log.status === 'SENT' || log.status === 'DELIVERED' || log.status === 'READ' || log.status === 'SKIPPED') {
      return;
    }

    const config = await getOrCreateWhatsAppConfig();
    log.attemptCount = Number(log.attemptCount || 0) + 1;
    log.lastAttemptAt = new Date();

    const result = await sendToMetaCloudApi(log, config);

    if (result.ok && result.metaMessageId) {
      log.status = 'SENT';
      log.metaMessageId = result.metaMessageId;
      log.sentAt = new Date();
      log.nextRetryAt = null;
      log.retryableError = false;
      log.lastErrorCode = undefined;
      log.lastErrorMessage = undefined;
      log.lastErrorHttpStatus = result.httpStatus;
      await log.save();
      return;
    }

    log.lastErrorCode = result.errorCode;
    log.lastErrorMessage = result.errorMessage;
    log.lastErrorHttpStatus = result.httpStatus;
    log.retryableError = result.retryable;

    const canRetry = result.retryable && log.attemptCount <= log.maxRetries;
    if (canRetry) {
      const delayMs = env.isTest
        ? Math.min(60, 20 * log.attemptCount)
        : Math.max(5, config.retryPolicy.backoffSeconds) * 1000 * log.attemptCount;
      log.status = 'QUEUED';
      log.nextRetryAt = new Date(Date.now() + delayMs);
      await log.save();

      const retryTimer = setTimeout(() => {
        pendingRetryTimers.delete(logId);
        enqueueDelivery(logId);
      }, delayMs);
      if (typeof retryTimer.unref === 'function') retryTimer.unref();
      pendingRetryTimers.set(logId, retryTimer);
      return;
    }

    log.status = 'FAILED';
    log.failedAt = new Date();
    log.nextRetryAt = null;
    await log.save();

    logger.warn({
      module: 'whatsapp',
      action: 'whatsapp_delivery_failed',
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      meta: {
        notificationId: log.notificationId,
        lrNumber: log.lrNumber,
        eventType: log.eventType,
        attemptCount: log.attemptCount,
      },
    });
  } catch (err) {
    logger.warn({
      module: 'whatsapp',
      action: 'whatsapp_worker_exception',
      errorMessage: err instanceof Error ? err.message : 'Unexpected WhatsApp delivery error',
      meta: { logId },
    });
  }
}

export function enqueueDelivery(logId: string): void {
  pendingQueuedCount += 1;
  setImmediate(() => {
    const task = processDeliveryAttempt(logId).finally(() => {
      activeDeliveries.delete(task);
    });
    activeDeliveries.add(task);
    pendingQueuedCount = Math.max(0, pendingQueuedCount - 1);
  });
}

export async function flushWhatsAppQueueForTests(maxWaitMs = 4000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    if (activeDispatches.size > 0) {
      await Promise.allSettled(Array.from(activeDispatches));
    }
    if (activeDeliveries.size > 0) {
      await Promise.allSettled(Array.from(activeDeliveries));
    }
    if (
      activeDispatches.size === 0 &&
      pendingQueuedCount === 0 &&
      pendingRetryTimers.size === 0 &&
      activeDeliveries.size === 0
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

export function stopWhatsAppWorkersForTests(): void {
  for (const timer of pendingRetryTimers.values()) {
    clearTimeout(timer);
  }
  pendingRetryTimers.clear();
  pendingQueuedCount = 0;
}

export interface DispatchBookingNotificationInput {
  booking: Pick<
    IBooking,
    | '_id'
    | 'lrNumber'
    | 'bookingSource'
    | 'sellerId'
    | 'sender'
    | 'receiver'
    | 'origin'
    | 'destination'
    | 'status'
    | 'whatsappOptIn'
  >;
  eventType: WhatsAppEventType;
  latestUpdate?: string;
  sourceEventKey?: string;
}

export function dispatchBookingNotificationEvent(
  input: DispatchBookingNotificationInput
): Promise<void> {
  const task = runDispatchBookingNotificationEvent(input).finally(() => {
    activeDispatches.delete(task);
  });
  activeDispatches.add(task);
  return task;
}

async function runDispatchBookingNotificationEvent(
  input: DispatchBookingNotificationInput
): Promise<void> {
  try {
    const config = await getOrCreateWhatsAppConfig();
    const events = mergeDefaultEvents(config.events);
    const eventConfig = events.find((e) => e.eventType === input.eventType);
    if (!eventConfig) return;

    const booking = input.booking;
    const bookingIdStr = booking._id.toString();
    const sourceEventKey = input.sourceEventKey || `status:${booking.status}`;
    const pickupLocation = `${booking.origin.city} (${booking.origin.pincode})`;
    const destinationLocation = `${booking.destination.city} (${booking.destination.pincode})`;
    const latestUpdate = (input.latestUpdate || eventConfig.updateSummaryTemplate).trim().slice(0, 280);
    const trackingUrl = buildTrackingUrl(booking.lrNumber);

    const recipientCandidates: Array<{
      role: WhatsAppRecipientRole;
      name: string;
      rawPhone: string;
    }> = [];

    if (config.recipients.sendToReceiver && booking.receiver?.phone) {
      recipientCandidates.push({
        role: 'RECEIVER',
        name: booking.receiver.name,
        rawPhone: booking.receiver.phone,
      });
    }

    if (config.recipients.sendToSender && booking.sender?.phone) {
      recipientCandidates.push({
        role: 'SENDER',
        name: booking.sender.name,
        rawPhone: booking.sender.phone,
      });
    }

    if (config.recipients.sendToSeller && booking.sellerId && booking.bookingSource !== 'TRANSPORTER_SELF') {
      const seller = await SellerProfile.findById(booking.sellerId)
        .select('businessName ownerName phone')
        .lean();
      if (seller?.phone) {
        recipientCandidates.push({
          role: 'SELLER',
          name: seller.businessName || seller.ownerName || booking.sender.name,
          rawPhone: seller.phone,
        });
      }
    }

    const seenPhones = new Set<string>();
    const defaultCc = config.defaultCountryCode || '91';

    for (const candidate of recipientCandidates) {
      const normalizedPhone = normalizeWhatsAppPhone(candidate.rawPhone, defaultCc);
      if (!normalizedPhone || seenPhones.has(normalizedPhone)) {
        continue;
      }
      seenPhones.add(normalizedPhone);

      const dedupKey = `${bookingIdStr}:${input.eventType}:${normalizedPhone}`;
      const templateVariables = {
        brandName: 'ZIPIT B2B',
        customerName: candidate.name || 'Customer',
        lrNumber: booking.lrNumber,
        statusLabel: eventConfig.statusLabel,
        pickupLocation,
        destinationLocation,
        latestUpdate,
        trackingUrl,
      };
      const messagePreview = buildMessagePreview(templateVariables);

      let initialStatus: 'QUEUED' | 'SKIPPED' = 'QUEUED';
      let skipReason: string | undefined;

      if (config.requireCustomerOptIn && booking.whatsappOptIn === false) {
        initialStatus = 'SKIPPED';
        skipReason = 'Customer opted out of WhatsApp shipment tracking updates.';
      } else if (!config.enabled) {
        initialStatus = 'SKIPPED';
        skipReason = 'WhatsApp integration is disabled in Admin settings.';
      } else if (!eventConfig.enabled) {
        initialStatus = 'SKIPPED';
        skipReason = `${eventConfig.statusLabel} WhatsApp alerts are disabled in Admin settings.`;
      }

      try {
        const createdLog = await WhatsAppNotificationLog.create({
          notificationId: generateNotificationId(),
          bookingId: booking._id,
          lrNumber: booking.lrNumber,
          bookingSource: booking.bookingSource || 'PLATFORM',
          eventType: input.eventType,
          sourceEventKey,
          dedupKey,
          recipientRole: candidate.role,
          recipientName: candidate.name || 'Customer',
          recipientPhone: normalizedPhone,
          templateName: eventConfig.templateName,
          languageCode: eventConfig.languageCode || 'en',
          templateVariables,
          messagePreview,
          status: initialStatus,
          skipReason,
          attemptCount: 0,
          maxRetries: config.retryPolicy.maxRetries ?? 3,
          retryableError: false,
        });

        if (initialStatus === 'QUEUED') {
          enqueueDelivery(createdLog._id.toString());
        }
      } catch (createErr: unknown) {
        const isDuplicate =
          typeof createErr === 'object' &&
          createErr !== null &&
          'code' in createErr &&
          (createErr as { code: number }).code === 11000;
        if (!isDuplicate) {
          logger.warn({
            module: 'whatsapp',
            action: 'whatsapp_log_create_failed',
            errorMessage: createErr instanceof Error ? createErr.message : 'Unknown error',
            meta: { lrNumber: booking.lrNumber, eventType: input.eventType },
          });
        }
      }
    }
  } catch (err) {
    logger.warn({
      module: 'whatsapp',
      action: 'whatsapp_dispatch_failed',
      errorMessage: err instanceof Error ? err.message : 'Failed dispatching WhatsApp event',
      meta: { lrNumber: input.booking.lrNumber, eventType: input.eventType },
    });
  }
}

export async function listWhatsAppNotificationLogs(query: Record<string, unknown>) {
  const pagination = parsePagination(query, 20, 100);
  const filter: Record<string, unknown> = {};

  if (query.status && typeof query.status === 'string') {
    filter.status = query.status;
  }
  if (query.eventType && typeof query.eventType === 'string') {
    filter.eventType = query.eventType;
  }
  if (query.bookingSource === 'PLATFORM' || query.bookingSource === 'TRANSPORTER_SELF') {
    filter.bookingSource = query.bookingSource;
  }
  if (query.errorsOnly === 'true') {
    filter.$or = [
      { status: 'FAILED' },
      { lastErrorCode: { $exists: true, $ne: null } },
    ];
  }
  if (typeof query.search === 'string' && query.search.trim()) {
    const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
    const searchClause = [
      { lrNumber: regex },
      { notificationId: regex },
      { recipientPhone: regex },
      { recipientName: regex },
      { lastErrorMessage: regex },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchClause }];
      delete filter.$or;
    } else {
      filter.$or = searchClause;
    }
  }

  const [items, total, countsRaw] = await Promise.all([
    WhatsAppNotificationLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),
    WhatsAppNotificationLog.countDocuments(filter),
    WhatsAppNotificationLog.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const countsByStatus: Record<string, number> = {
    QUEUED: 0,
    SENT: 0,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    SKIPPED: 0,
  };
  for (const row of countsRaw) {
    countsByStatus[row._id] = row.count;
  }

  return {
    ...buildPaginatedResponse(items, total, pagination),
    summary: {
      total: Object.values(countsByStatus).reduce((sum, n) => sum + n, 0),
      queued: countsByStatus.QUEUED,
      sent: countsByStatus.SENT,
      delivered: countsByStatus.DELIVERED,
      read: countsByStatus.READ,
      failed: countsByStatus.FAILED,
      skipped: countsByStatus.SKIPPED,
    },
  };
}

export async function retryWhatsAppNotification(logId: string) {
  const log = await WhatsAppNotificationLog.findById(logId);
  if (!log) {
    throw new AppError('WhatsApp notification record not found.', 404, 'WHATSAPP_LOG_NOT_FOUND');
  }
  if (log.status === 'DELIVERED' || log.status === 'READ') {
    throw new AppError(
      'Delivered notifications do not need to be retried.',
      400,
      'WHATSAPP_ALREADY_DELIVERED'
    );
  }
  if (log.status === 'SKIPPED') {
    throw new AppError(
      `Cannot retry a skipped notification (${log.skipReason || 'opted out or disabled'}).`,
      400,
      'WHATSAPP_NOTIFICATION_SKIPPED'
    );
  }

  const config = await getOrCreateWhatsAppConfig();
  log.status = 'QUEUED';
  log.failedAt = null;
  log.nextRetryAt = null;
  log.maxRetries = Math.max(log.attemptCount + 1, config.retryPolicy.maxRetries ?? 3);
  await log.save();

  await processDeliveryAttempt(log._id.toString());
  return WhatsAppNotificationLog.findById(log._id).lean();
}

export async function retryAllFailedWhatsAppNotifications() {
  const failedLogs = await WhatsAppNotificationLog.find({ status: 'FAILED' })
    .sort({ createdAt: -1 })
    .limit(25);

  let retriedCount = 0;
  for (const log of failedLogs) {
    log.status = 'QUEUED';
    log.failedAt = null;
    log.nextRetryAt = null;
    log.maxRetries = Math.max(log.attemptCount + 1, log.maxRetries);
    await log.save();
    enqueueDelivery(log._id.toString());
    retriedCount += 1;
  }

  return { retriedCount };
}

export function verifyMetaWebhookChallenge(
  mode: unknown,
  token: unknown,
  challenge: unknown
): string {
  const verifyToken = env.whatsappWebhookVerifyToken;
  if (!verifyToken) {
    throw new AppError(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured on backend server.',
      503,
      'WHATSAPP_WEBHOOK_NOT_CONFIGURED'
    );
  }

  if (mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string') {
    throw new AppError('Invalid Meta webhook verification request.', 403, 'WEBHOOK_VERIFY_FAILED');
  }

  const expectedBuf = Buffer.from(verifyToken, 'utf8');
  const providedBuf = Buffer.from(token, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    throw new AppError('Webhook verification token mismatch.', 403, 'WEBHOOK_VERIFY_FAILED');
  }

  return challenge;
}

export function verifyMetaWebhookSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): void {
  if (!env.whatsappAppSecret) {
    return;
  }

  if (!rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
    throw new AppError('Missing or malformed Meta webhook signature.', 401, 'INVALID_WEBHOOK_SIGNATURE');
  }

  const providedHex = signatureHeader.slice('sha256='.length).trim();
  const expectedHex = crypto
    .createHmac('sha256', env.whatsappAppSecret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const providedBuf = Buffer.from(providedHex, 'hex');

  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    throw new AppError('Invalid Meta webhook signature.', 401, 'INVALID_WEBHOOK_SIGNATURE');
  }
}

interface MetaWebhookStatusPayload {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{
    code?: number | string;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}

export async function processMetaWebhookPayload(payload: unknown): Promise<{ updatedCount: number }> {
  if (!payload || typeof payload !== 'object') {
    return { updatedCount: 0 };
  }

  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: MetaWebhookStatusPayload[];
        };
      }>;
    }>;
  };

  let updatedCount = 0;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      for (const st of change.value?.statuses || []) {
        if (!st.id || !st.status) continue;
        const log = await WhatsAppNotificationLog.findOne({ metaMessageId: st.id });
        if (!log) continue;

        const firstErr = st.errors?.[0];
        const statusUpper = st.status.toLowerCase();

        log.webhookHistory.push({
          status: statusUpper,
          rawTimestamp: st.timestamp,
          errorCode: firstErr?.code ? String(firstErr.code) : undefined,
          errorTitle: firstErr?.title,
          errorMessage: firstErr?.error_data?.details || firstErr?.message,
          receivedAt: new Date(),
        });

        const parsedDate =
          st.timestamp && /^\d+$/.test(st.timestamp)
            ? new Date(Number(st.timestamp) * 1000)
            : new Date();

        if (statusUpper === 'sent' && log.status === 'QUEUED') {
          log.status = 'SENT';
          log.sentAt = log.sentAt || parsedDate;
        } else if (statusUpper === 'delivered' && log.status !== 'READ') {
          log.status = 'DELIVERED';
          log.deliveredAt = parsedDate;
        } else if (statusUpper === 'read') {
          log.status = 'READ';
          log.deliveredAt = log.deliveredAt || parsedDate;
          log.readAt = parsedDate;
        } else if (statusUpper === 'failed') {
          log.status = 'FAILED';
          log.failedAt = parsedDate;
          log.lastErrorCode = firstErr?.code ? `META_${String(firstErr.code)}` : 'META_DELIVERY_FAILED';
          log.lastErrorMessage =
            firstErr?.error_data?.details ||
            firstErr?.message ||
            firstErr?.title ||
            'Meta reported message delivery failure.';
        }

        await log.save();
        updatedCount += 1;
      }
    }
  }

  return { updatedCount };
}
