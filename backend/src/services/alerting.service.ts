import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.ts';
import { logger } from '../config/logger.ts';
import { escapeRegex } from '../utils/sanitize.ts';
import {
  SystemIncident,
  type IncidentSeverity,
  type IncidentSource,
} from '../models/SystemIncident.ts';

export interface RealtimeAlertInput {
  source: IncidentSource;
  severity: IncidentSeverity;
  errorCode: string;
  message: string;
  route?: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  userId?: string;
  userRole?: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

export interface AlertDispatchResult {
  recorded: boolean;
  deduped: boolean;
  incidentId?: string;
  notifiedChannels: string[];
}

const DEDUP_WINDOW_MS = 60 * 1000; // 60 seconds cooldown per unique error signature for webhook spam protection
const recentAlertTimestamps = new Map<string, number>();

function cleanupDedupCache(now: number): void {
  if (recentAlertTimestamps.size < 250) return;
  for (const [key, ts] of recentAlertTimestamps.entries()) {
    if (now - ts > DEDUP_WINDOW_MS * 2) {
      recentAlertTimestamps.delete(key);
    }
  }
}

export function shouldNotifyForSeverity(severity: IncidentSeverity): boolean {
  if (env.alertMinLevel === 'ALL' || env.alertMinLevel === 'WARN') {
    return true;
  }
  return severity === 'ERROR' || severity === 'FATAL';
}

function buildDedupKey(input: RealtimeAlertInput): string {
  const raw = `${input.source}|${input.severity}|${input.errorCode}|${input.method || ''}|${input.route || ''}|${input.message.slice(0, 140)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function getSeverityColor(severity: IncidentSeverity): number {
  if (severity === 'FATAL') return 0x991b1b; // dark red
  if (severity === 'ERROR') return 0xef4444; // red
  return 0xf59e0b; // amber for WARN
}

function truncateText(text: string | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

async function postToDiscord(
  webhookUrl: string,
  input: RealtimeAlertInput,
  occurrenceCount: number
): Promise<boolean> {
  try {
    const emoji = input.severity === 'FATAL' ? '🚨' : input.severity === 'ERROR' ? '❌' : '⚠️';
    const fields = [
      { name: 'Severity', value: input.severity, inline: true },
      { name: 'Source', value: input.source, inline: true },
      { name: 'Code', value: input.errorCode || 'UNKNOWN', inline: true },
    ];

    if (input.route) {
      fields.push({
        name: 'Endpoint / Page',
        value: truncateText(`${input.method ? `${input.method} ` : ''}${input.route}`, 200),
        inline: false,
      });
    }
    if (typeof input.statusCode === 'number') {
      fields.push({ name: 'HTTP Status', value: String(input.statusCode), inline: true });
    }
    if (input.requestId) {
      fields.push({ name: 'Request ID', value: input.requestId, inline: true });
    }
    if (occurrenceCount > 1) {
      fields.push({ name: 'Occurrences', value: `${occurrenceCount}`, inline: true });
    }
    if (input.userRole || input.userId) {
      fields.push({
        name: 'Actor',
        value: `${input.userRole || 'GUEST'}${input.userId ? ` (${input.userId})` : ''}`,
        inline: true,
      });
    }

    const embed: Record<string, unknown> = {
      title: `${emoji} [${input.severity}] ${truncateText(input.errorCode, 80)}`,
      description: truncateText(input.message, 900),
      color: getSeverityColor(input.severity),
      fields,
      footer: {
        text: `ZIPIT B2B • ${env.nodeEnv.toUpperCase()}`,
      },
      timestamp: new Date().toISOString(),
    };

    if (input.stack) {
      embed.fields = [
        ...fields,
        {
          name: 'Stack / Trace',
          value: `\`\`\`\n${truncateText(input.stack, 700)}\n\`\`\``,
          inline: false,
        },
      ];
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'ZIPIT Alert Bot',
        embeds: [embed],
      }),
      signal: AbortSignal.timeout(4000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function postToGenericWebhook(
  webhookUrl: string,
  input: RealtimeAlertInput,
  incidentId?: string,
  occurrenceCount = 1
): Promise<boolean> {
  try {
    const summaryText = `[ZIPIT ${input.severity}] ${input.source} | ${input.errorCode}: ${truncateText(
      input.message,
      250
    )}${input.route ? ` (${input.method ? `${input.method} ` : ''}${input.route})` : ''}`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'zipit.system_incident',
        environment: env.nodeEnv,
        incidentId,
        severity: input.severity,
        source: input.source,
        errorCode: input.errorCode,
        message: input.message,
        summaryText,
        route: input.route,
        method: input.method,
        statusCode: input.statusCode,
        requestId: input.requestId,
        userId: input.userId,
        userRole: input.userRole,
        occurrenceCount,
        timestamp: new Date().toISOString(),
        meta: input.meta,
      }),
      signal: AbortSignal.timeout(4000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function sendRealtimeAlert(input: RealtimeAlertInput): Promise<AlertDispatchResult> {
  if (!shouldNotifyForSeverity(input.severity)) {
    return { recorded: false, deduped: false, notifiedChannels: [] };
  }

  const now = Date.now();
  cleanupDedupCache(now);

  const dedupKey = buildDedupKey(input);
  const lastSentAt = recentAlertTimestamps.get(dedupKey);
  const isWebhookCooldownActive = typeof lastSentAt === 'number' && now - lastSentAt < DEDUP_WINDOW_MS;

  let incidentId: string | undefined;
  let occurrenceCount = 1;
  let recorded = false;

  if (mongoose.connection.readyState === 1) {
    try {
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const existing = await SystemIncident.findOneAndUpdate(
        {
          dedupKey,
          lastOccurredAt: { $gte: fiveMinutesAgo },
        },
        {
          $inc: { occurrenceCount: 1 },
          $set: {
            lastOccurredAt: new Date(now),
            requestId: input.requestId,
          },
        },
        { new: true }
      );

      if (existing) {
        incidentId = existing._id.toString();
        occurrenceCount = existing.occurrenceCount;
        recorded = true;
      } else {
        const created = await SystemIncident.create({
          source: input.source,
          severity: input.severity,
          errorCode: truncateText(input.errorCode || 'UNKNOWN_ERROR', 120),
          message: truncateText(input.message || 'Unspecified error', 1000),
          route: input.route ? truncateText(input.route, 300) : undefined,
          method: input.method ? truncateText(input.method, 16) : undefined,
          statusCode: input.statusCode,
          requestId: input.requestId,
          userId: input.userId,
          userRole: input.userRole,
          stack: input.stack ? truncateText(input.stack, 2500) : undefined,
          dedupKey,
          occurrenceCount: 1,
          lastOccurredAt: new Date(now),
          notifiedChannels: [],
          meta: input.meta,
        });
        incidentId = created._id.toString();
        recorded = true;
      }
    } catch (dbErr) {
      logger.warn({
        module: 'alerting',
        action: 'incident_persist_failed',
        errorMessage: dbErr instanceof Error ? dbErr.message : 'Failed to store SystemIncident',
      });
    }
  }

  const notifiedChannels: string[] = [];

  // Skip real external HTTP webhook calls during automated test suite runs
  if (!isWebhookCooldownActive && !env.isTest) {
    recentAlertTimestamps.set(dedupKey, now);

    const tasks: Array<Promise<void>> = [];

    if (isValidHttpUrl(env.discordAlertWebhookUrl)) {
      tasks.push(
        postToDiscord(env.discordAlertWebhookUrl, input, occurrenceCount).then((ok) => {
          if (ok) notifiedChannels.push('DISCORD');
        })
      );
    }

    if (isValidHttpUrl(env.alertWebhookUrl)) {
      tasks.push(
        postToGenericWebhook(env.alertWebhookUrl, input, incidentId, occurrenceCount).then((ok) => {
          if (ok) notifiedChannels.push('WEBHOOK');
        })
      );
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
      if (incidentId && notifiedChannels.length > 0 && mongoose.connection.readyState === 1) {
        await SystemIncident.updateOne(
          { _id: incidentId },
          { $addToSet: { notifiedChannels: { $each: notifiedChannels } } }
        ).catch(() => undefined);
      }
    }
  }

  return {
    recorded,
    deduped: isWebhookCooldownActive,
    incidentId,
    notifiedChannels,
  };
}

export async function listSystemIncidents(query: {
  severity?: string;
  source?: string;
  search?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const filter: Record<string, unknown> = {};

  if (query.severity && ['WARN', 'ERROR', 'FATAL'].includes(query.severity)) {
    filter.severity = query.severity;
  }
  if (
    query.source &&
    ['BACKEND_API', 'FRONTEND_UI', 'DATABASE', 'PROCESS', 'SUPPORT'].includes(query.source)
  ) {
    filter.source = query.source;
  }
  if (typeof query.search === 'string' && query.search.trim()) {
    const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [
      { errorCode: regex },
      { message: regex },
      { route: regex },
      { requestId: regex },
    ];
  }

  const [items, totalCount, criticalLast24h] = await Promise.all([
    SystemIncident.find(filter).sort({ lastOccurredAt: -1 }).limit(limit).lean(),
    SystemIncident.countDocuments(filter),
    SystemIncident.countDocuments({
      severity: { $in: ['ERROR', 'FATAL'] },
      lastOccurredAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);

  return {
    items,
    totalCount,
    criticalLast24h,
    configuration: {
      discordConfigured: isValidHttpUrl(env.discordAlertWebhookUrl),
      genericWebhookConfigured: isValidHttpUrl(env.alertWebhookUrl),
      minLevel: env.alertMinLevel,
    },
  };
}

export async function sendTestAlert(triggeredByEmail: string, customMessage?: string) {
  const discordConfigured = isValidHttpUrl(env.discordAlertWebhookUrl);
  const genericWebhookConfigured = isValidHttpUrl(env.alertWebhookUrl);

  const testInput: RealtimeAlertInput = {
    source: 'BACKEND_API',
    severity: 'WARN',
    errorCode: 'TEST_ALERT_PING',
    message:
      customMessage ||
      `Manual real-time alerting verification triggered by ${triggeredByEmail}. All error channels operational.`,
    route: '/api/v1/alerts/test',
    method: 'POST',
    statusCode: 200,
    userRole: 'ADMIN',
  };

  const delivery = await sendRealtimeAlert(testInput);

  return {
    discordConfigured,
    genericWebhookConfigured,
    minLevel: env.alertMinLevel,
    incidentId: delivery.incidentId,
    notifiedChannels: delivery.notifiedChannels,
  };
}
