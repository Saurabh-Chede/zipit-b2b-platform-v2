import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  KeyRound,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import {
  WhatsAppEventType,
  type BookingSource,
  type WhatsAppConfigData,
  type WhatsAppCredentialsStatus,
  type WhatsAppConfigResponse,
  type WhatsAppEventTemplateConfig,
  type WhatsAppLogsResponse,
  type WhatsAppNotificationLog,
  type WhatsAppNotificationStatus,
} from '../../types/index.ts';

const EVENT_LABELS: Record<WhatsAppEventType, string> = {
  [WhatsAppEventType.BOOKING_CONFIRMED]: '1. Booking Confirmed',
  [WhatsAppEventType.PICKED_UP]: '2. Picked Up',
  [WhatsAppEventType.IN_TRANSIT]: '3. In Transit',
  [WhatsAppEventType.REACHED_DESTINATION]: '4. Reached Destination',
  [WhatsAppEventType.OUT_FOR_DELIVERY]: '5. Out for Delivery',
  [WhatsAppEventType.DELIVERED]: '6. Delivered',
};

const RECIPIENT_ROLE_LABELS: Record<WhatsAppNotificationLog['recipientRole'], string> = {
  RECEIVER: 'Receiver / Consignee',
  SENDER: 'Sender / Consignor',
  SELLER: 'Seller Account',
};

function renderPreviewVariables(tpl: WhatsAppEventTemplateConfig) {
  const sampleLr = 'ZIP-2026-000142';
  const sampleOrigin = 'Pune (411026)';
  const sampleDest = 'Mumbai (400013)';
  const latestUpdate = tpl.updateSummaryTemplate
    .replace(/\{\{lrNumber\}\}/gi, sampleLr)
    .replace(/\{\{pickupLocation\}\}/gi, sampleOrigin)
    .replace(/\{\{destinationLocation\}\}/gi, sampleDest)
    .replace(/\{\{statusLabel\}\}/gi, tpl.statusLabel);
  return {
    brandName: 'ZIPIT B2B',
    customerName: 'Rajesh Traders',
    lrNumber: sampleLr,
    statusLabel: tpl.statusLabel,
    pickupLocation: sampleOrigin,
    destinationLocation: sampleDest,
    latestUpdate,
    trackingUrl: `${window.location.origin}/track/${sampleLr}`,
  };
}

export function AdminWhatsAppPage() {
  const { showToast } = useToast();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [config, setConfig] = useState<WhatsAppConfigData | null>(null);
  const [credentials, setCredentials] = useState<WhatsAppCredentialsStatus | null>(null);
  const [previewEvent, setPreviewEvent] = useState<WhatsAppEventType | null>(null);

  // Logs state
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsData, setLogsData] = useState<WhatsAppLogsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | WhatsAppNotificationStatus>('ALL');
  const [eventFilter, setEventFilter] = useState<'ALL' | WhatsAppEventType>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | BookingSource>('ALL');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingBatch, setRetryingBatch] = useState(false);
  const [selectedLog, setSelectedLog] = useState<WhatsAppNotificationLog | null>(null);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: WhatsAppConfigResponse }>(
        '/whatsapp/config'
      );
      setConfig(res.data.data.config);
      setCredentials(res.data.data.credentials);
    } catch (err) {
      setConfigError(extractErrorMessage(err, 'Failed to load WhatsApp integration settings.'));
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    setLogsError(null);
    try {
      const params: Record<string, string | number> = { page, limit: 15 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (eventFilter !== 'ALL') params.eventType = eventFilter;
      if (sourceFilter !== 'ALL') params.bookingSource = sourceFilter;
      if (errorsOnly) params.errorsOnly = 'true';
      if (appliedSearch.trim()) params.search = appliedSearch.trim();

      const res = await apiClient.get<{ success: boolean; data: WhatsAppLogsResponse }>(
        '/whatsapp/logs',
        { params }
      );
      setLogsData(res.data.data);
    } catch (err) {
      setLogsError(extractErrorMessage(err, 'Failed to load WhatsApp notification logs.'));
    } finally {
      setLoadingLogs(false);
    }
  }, [page, statusFilter, eventFilter, sourceFilter, errorsOnly, appliedSearch]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    if (
      !config.recipients.sendToReceiver &&
      !config.recipients.sendToSender &&
      !config.recipients.sendToSeller
    ) {
      showToast('Select at least one recipient group (Receiver, Sender, or Seller).', 'error');
      return;
    }

    setSavingConfig(true);
    try {
      const payload = {
        enabled: config.enabled,
        apiVersion: config.apiVersion.trim(),
        phoneNumberId: config.phoneNumberId.trim(),
        businessAccountId: config.businessAccountId.trim(),
        defaultCountryCode: config.defaultCountryCode.trim(),
        requireCustomerOptIn: config.requireCustomerOptIn,
        recipients: config.recipients,
        retryPolicy: {
          maxRetries: Number(config.retryPolicy.maxRetries),
          backoffSeconds: Number(config.retryPolicy.backoffSeconds),
        },
        events: config.events.map((ev) => ({
          eventType: ev.eventType,
          enabled: ev.enabled,
          templateName: ev.templateName.trim(),
          languageCode: ev.languageCode.trim(),
          statusLabel: ev.statusLabel.trim(),
          updateSummaryTemplate: ev.updateSummaryTemplate.trim(),
        })),
      };

      const res = await apiClient.put<{
        success: boolean;
        message?: string;
        data: WhatsAppConfigResponse;
      }>('/whatsapp/config', payload);

      setConfig(res.data.data.config);
      setCredentials(res.data.data.credentials);
      showToast(res.data.message || 'WhatsApp configuration saved.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save WhatsApp configuration.'), 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleEventChange = (
    eventType: WhatsAppEventType,
    patch: Partial<WhatsAppEventTemplateConfig>
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      events: config.events.map((ev) =>
        ev.eventType === eventType ? { ...ev, ...patch } : ev
      ),
    });
  };

  const handleCopyWebhookUrl = async () => {
    if (!credentials?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(credentials.webhookUrl);
      showToast('Webhook URL copied to clipboard.', 'success');
    } catch {
      showToast('Unable to copy webhook URL from clipboard.', 'error');
    }
  };

  const handleRetrySingle = async (logId: string) => {
    setRetryingId(logId);
    try {
      const res = await apiClient.post<{
        success: boolean;
        data: WhatsAppNotificationLog;
      }>(`/whatsapp/logs/${logId}/retry`);
      const updated = res.data.data;
      if (updated.status === 'SENT' || updated.status === 'DELIVERED') {
        showToast(`Notification ${updated.notificationId} sent successfully.`, 'success');
      } else {
        showToast(
          updated.lastErrorMessage ||
            `Retry finished with status ${updated.status}.`,
          updated.status === 'FAILED' ? 'error' : 'info'
        );
      }
      await loadLogs();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to retry WhatsApp notification.'), 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryFailedBatch = async () => {
    setRetryingBatch(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message?: string;
        data: { retriedCount: number };
      }>('/whatsapp/logs/retry-failed');
      showToast(
        res.data.message || `Retried ${res.data.data.retriedCount} failed notification(s).`,
        'success'
      );
      await loadLogs();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to trigger batch retry.'), 'error');
    } finally {
      setRetryingBatch(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchTerm);
  };

  if (loadingConfig) return <LoadingSkeleton rows={7} />;
  if (configError || !config || !credentials) {
    return (
      <ErrorBanner
        message={configError || 'Unable to load WhatsApp integration configuration.'}
        onRetry={loadConfig}
      />
    );
  }

  const summary = logsData?.summary || {
    total: 0,
    queued: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
  };
  const logs = logsData?.items || [];
  const pagination = logsData?.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            <span>WhatsApp Shipment Tracking &amp; Notifications</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure Meta WhatsApp Business Cloud API templates, delivery recipients, and monitor notification logs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {config.updatedAt && (
            <div className="text-xs text-slate-500">
              Updated by <strong className="text-slate-700">{config.updatedByName || 'System'}</strong>{' '}
              on <span className="font-mono tabular-nums">{formatDateTime(config.updatedAt)}</span>
            </div>
          )}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border ${
              config.enabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {config.enabled ? 'Automation Active' : 'Automation Paused'}
          </span>
        </div>
      </div>

      {/* Configuration & Credentials Form */}
      <form onSubmit={handleSaveConfig} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cloud API Settings */}
          <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Meta WhatsApp Cloud API Integration
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Non-secret Graph API routing parameters. Access tokens remain strictly in backend environment variables.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  id="whatsapp-global-enabled"
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                />
                <span className="text-sm font-medium text-slate-800">
                  Enable WhatsApp Notifications
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Graph API Version
                </label>
                <input
                  type="text"
                  value={config.apiVersion}
                  onChange={(e) => setConfig({ ...config, apiVersion: e.target.value })}
                  placeholder="v21.0"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Default Country Calling Code
                </label>
                <input
                  type="text"
                  value={config.defaultCountryCode}
                  onChange={(e) => setConfig({ ...config, defaultCountryCode: e.target.value })}
                  placeholder="91"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Meta Phone Number ID (Optional Override)
                </label>
                <input
                  type="text"
                  value={config.phoneNumberId}
                  onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
                  placeholder="Leave blank to use WHATSAPP_PHONE_NUMBER_ID env"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Business Account ID (WABA ID)
                </label>
                <input
                  type="text"
                  value={config.businessAccountId}
                  onChange={(e) => setConfig({ ...config, businessAccountId: e.target.value })}
                  placeholder="Leave blank to use WHATSAPP_BUSINESS_ACCOUNT_ID env"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Automatic Retries (Transient API Errors)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={config.retryPolicy.maxRetries}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      retryPolicy: {
                        ...config.retryPolicy,
                        maxRetries: Number(e.target.value || 0),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Retry Base Backoff (Seconds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={config.retryPolicy.backoffSeconds}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      retryPolicy: {
                        ...config.retryPolicy,
                        backoffSeconds: Number(e.target.value || 15),
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Recipients & Opt-In */}
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  Notification Recipients
                </p>
                <div className="space-y-1.5 text-sm text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.recipients.sendToReceiver}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          recipients: { ...config.recipients, sendToReceiver: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>Receiver / Consignee Phone</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.recipients.sendToSender}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          recipients: { ...config.recipients, sendToSender: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>Sender / Consignor Phone</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.recipients.sendToSeller}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          recipients: { ...config.recipients, sendToSeller: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>Registered Seller Phone (Platform Bookings)</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                  Opt-In &amp; Messaging Compliance
                </p>
                <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={config.requireCustomerOptIn}
                    onChange={(e) =>
                      setConfig({ ...config, requireCustomerOptIn: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
                  />
                  <span>
                    Respect customer WhatsApp opt-in (`whatsappOptIn`) — shipments opted out will be logged as Skipped without sending API requests
                  </span>
                </label>
              </div>
            </div>
          </section>

          {/* Backend Environment Credential Readiness */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-600" />
                <span>Backend Environment Status</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Secrets are read securely from server environment variables and never exposed to browsers.
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                {
                  label: 'WHATSAPP_ACCESS_TOKEN',
                  ok: credentials.accessTokenConfigured,
                },
                {
                  label: 'Phone Number ID',
                  ok: credentials.phoneNumberIdConfigured,
                },
                {
                  label: 'Business Account ID',
                  ok: credentials.businessAccountConfigured,
                },
                {
                  label: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
                  ok: credentials.webhookVerifyTokenConfigured,
                },
                {
                  label: 'WHATSAPP_APP_SECRET (HMAC)',
                  ok: credentials.appSecretConfigured,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <span className="font-mono text-slate-700 truncate">{item.label}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold shrink-0 ${
                      item.ok
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {item.ok ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Configured
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        Missing
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">Meta Webhook Callback URL</p>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={credentials.webhookUrl}
                  aria-label="Meta Webhook Callback URL"
                  className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-700"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhookUrl}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Event Template Management */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Shipment Lifecycle Event Templates
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure approved Meta template names, language codes, and enable/disable individual shipment milestones. Parameters sent: Brand, Customer, LR Number, Status, Pickup, Destination, Latest Update, Tracking URL.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingConfig}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{savingConfig ? 'Saving Settings...' : 'Save WhatsApp Settings'}</span>
            </button>
          </div>

          {/* Mobile & Portrait Tablet Template Editor Cards */}
          <div className="lg:hidden divide-y divide-slate-200">
            {config.events.map((ev) => {
              const isPreviewOpen = previewEvent === ev.eventType;
              const sampleVars = isPreviewOpen ? renderPreviewVariables(ev) : null;
              return (
                <div key={ev.eventType} className="p-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label={`Enable ${ev.eventType} mobile`}
                        checked={ev.enabled}
                        onChange={(e) =>
                          handleEventChange(ev.eventType, { enabled: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span>{EVENT_LABELS[ev.eventType] || ev.eventType}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setPreviewEvent(isPreviewOpen ? null : ev.eventType)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isPreviewOpen ? 'Hide' : 'Preview'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Meta Template Name
                      </label>
                      <input
                        type="text"
                        value={ev.templateName}
                        onChange={(e) =>
                          handleEventChange(ev.eventType, { templateName: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Lang Code
                      </label>
                      <input
                        type="text"
                        value={ev.languageCode}
                        onChange={(e) =>
                          handleEventChange(ev.eventType, { languageCode: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Status Label
                      </label>
                      <input
                        type="text"
                        value={ev.statusLabel}
                        onChange={(e) =>
                          handleEventChange(ev.eventType, { statusLabel: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Latest Update Summary Template
                      </label>
                      <input
                        type="text"
                        value={ev.updateSummaryTemplate}
                        onChange={(e) =>
                          handleEventChange(ev.eventType, {
                            updateSummaryTemplate: e.target.value,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  {isPreviewOpen && sampleVars && (
                    <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 space-y-1.5 text-slate-700">
                      <p className="font-semibold text-emerald-900">
                        Sample Preview ({ev.templateName} / {ev.languageCode})
                      </p>
                      <p>
                        <strong>LR:</strong>{' '}
                        <span className="font-mono">{sampleVars.lrNumber}</span> ·{' '}
                        <strong>Status:</strong> {sampleVars.statusLabel}
                      </p>
                      <p>
                        <strong>Route:</strong> {sampleVars.pickupLocation} &rarr;{' '}
                        {sampleVars.destinationLocation}
                      </p>
                      <p>
                        <strong>Update:</strong> {sampleVars.latestUpdate}
                      </p>
                      <p className="break-all">
                        <strong>Link:</strong>{' '}
                        <span className="font-mono text-blue-700">{sampleVars.trackingUrl}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Milestone Event</th>
                  <th className="py-2.5 px-3">Active</th>
                  <th className="py-2.5 px-3">Meta Template Name</th>
                  <th className="py-2.5 px-3">Lang</th>
                  <th className="py-2.5 px-3">Status Label</th>
                  <th className="py-2.5 px-3">Latest Update Summary Template</th>
                  <th className="py-2.5 px-3 text-right">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {config.events.map((ev) => {
                  const isPreviewOpen = previewEvent === ev.eventType;
                  const sampleVars = isPreviewOpen ? renderPreviewVariables(ev) : null;
                  return (
                    <React.Fragment key={ev.eventType}>
                      <tr className="align-top hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {EVENT_LABELS[ev.eventType] || ev.eventType}
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            aria-label={`Enable ${ev.eventType}`}
                            checked={ev.enabled}
                            onChange={(e) =>
                              handleEventChange(ev.eventType, { enabled: e.target.checked })
                            }
                            className="w-4 h-4 mt-1 rounded border-slate-300 text-emerald-600"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            value={ev.templateName}
                            onChange={(e) =>
                              handleEventChange(ev.eventType, { templateName: e.target.value })
                            }
                            className="w-48 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md font-mono"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            value={ev.languageCode}
                            onChange={(e) =>
                              handleEventChange(ev.eventType, { languageCode: e.target.value })
                            }
                            className="w-20 px-2 py-1.5 text-xs border border-slate-300 rounded-md font-mono"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            value={ev.statusLabel}
                            onChange={(e) =>
                              handleEventChange(ev.eventType, { statusLabel: e.target.value })
                            }
                            className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            value={ev.updateSummaryTemplate}
                            onChange={(e) =>
                              handleEventChange(ev.eventType, {
                                updateSummaryTemplate: e.target.value,
                              })
                            }
                            className="w-full min-w-[260px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                          />
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewEvent(isPreviewOpen ? null : ev.eventType)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {isPreviewOpen ? 'Hide' : 'Preview'}
                          </button>
                        </td>
                      </tr>
                      {isPreviewOpen && sampleVars && (
                        <tr className="bg-emerald-50/40">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="bg-white border border-emerald-200 rounded-lg p-3.5 text-xs space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-emerald-900">
                                  Sample Template Payload Preview ({ev.templateName} / {ev.languageCode})
                                </span>
                                <span className="font-mono text-slate-500">
                                  ZIPIT B2B Official Template
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-700">
                                <div>
                                  <strong>Brand:</strong> {sampleVars.brandName}
                                </div>
                                <div>
                                  <strong>LR / Tracking #:</strong>{' '}
                                  <span className="font-mono">{sampleVars.lrNumber}</span>
                                </div>
                                <div>
                                  <strong>Status:</strong> {sampleVars.statusLabel}
                                </div>
                                <div>
                                  <strong>Route:</strong> {sampleVars.pickupLocation} &rarr;{' '}
                                  {sampleVars.destinationLocation}
                                </div>
                                <div className="md:col-span-2">
                                  <strong>Latest Update:</strong> {sampleVars.latestUpdate}
                                </div>
                                <div className="md:col-span-2">
                                  <strong>Tracking Link:</strong>{' '}
                                  <span className="font-mono text-blue-700">
                                    {sampleVars.trackingUrl}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </form>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Events', value: summary.total, tone: 'text-slate-900' },
          { label: 'Sent', value: summary.sent, tone: 'text-blue-700' },
          { label: 'Delivered', value: summary.delivered, tone: 'text-emerald-700' },
          { label: 'Read', value: summary.read, tone: 'text-teal-700' },
          { label: 'Failed / Errors', value: summary.failed, tone: 'text-red-700' },
          { label: 'Skipped (Opt-out/Off)', value: summary.skipped, tone: 'text-slate-600' },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${card.tone}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Notification History & Error Monitor */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-600" />
                <span>Notification Delivery History &amp; API Error Monitor</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Track sent, delivered, read, skipped, and failed WhatsApp alerts across Platform and Transporter bookings
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={loadLogs}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
              <button
                type="button"
                disabled={retryingBatch || summary.failed === 0}
                onClick={handleRetryFailedBatch}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {retryingBatch
                    ? 'Retrying Failed...'
                    : `Retry Failed (${summary.failed})`}
                </span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              Filters:
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value as 'ALL' | WhatsAppNotificationStatus);
              }}
              aria-label="Filter by delivery status"
              className="flex-1 sm:flex-initial px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            >
              <option value="ALL">All Statuses</option>
              <option value="QUEUED">Queued</option>
              <option value="SENT">Sent</option>
              <option value="DELIVERED">Delivered</option>
              <option value="READ">Read</option>
              <option value="FAILED">Failed</option>
              <option value="SKIPPED">Skipped</option>
            </select>

            <select
              value={eventFilter}
              onChange={(e) => {
                setPage(1);
                setEventFilter(e.target.value as 'ALL' | WhatsAppEventType);
              }}
              aria-label="Filter by shipment event"
              className="flex-1 sm:flex-initial px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            >
              <option value="ALL">All Events</option>
              {Object.values(WhatsAppEventType).map((ev) => (
                <option key={ev} value={ev}>
                  {EVENT_LABELS[ev]}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => {
                setPage(1);
                setSourceFilter(e.target.value as 'ALL' | BookingSource);
              }}
              aria-label="Filter by booking source"
              className="w-full sm:w-auto px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            >
              <option value="ALL">All Sources</option>
              <option value="PLATFORM">Seller / Platform</option>
              <option value="TRANSPORTER_SELF">Transporter Personal</option>
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer px-2 py-1.5 rounded-md border border-slate-200 bg-slate-50">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => {
                  setPage(1);
                  setErrorsOnly(e.target.checked);
                }}
                className="w-3.5 h-3.5 rounded border-slate-300 text-red-600"
              />
              <span>API Errors Only</span>
            </label>

            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search LR, phone, error..."
                className="flex-1 sm:w-48 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-900 shrink-0"
              >
                Search
              </button>
            </form>
          </div>
        </div>

        {loadingLogs ? (
          <div className="p-4 sm:p-5">
            <LoadingSkeleton rows={5} />
          </div>
        ) : logsError ? (
          <div className="p-4 sm:p-5">
            <ErrorBanner message={logsError} onRetry={loadLogs} />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              title="No WhatsApp notification logs found"
              description="Notifications will appear automatically once shipments are booked or progressed across delivery milestones."
            />
          </div>
        ) : (
          <>
            {/* Mobile & Tablet Card Grid for Notification Logs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4 lg:hidden bg-slate-50/40">
              {logs.map((log) => (
                <div
                  key={log._id}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-slate-900 truncate">
                        {log.lrNumber} · {log.notificationId}
                      </p>
                      <p className="text-slate-600 font-medium mt-0.5 truncate">
                        {EVENT_LABELS[log.eventType] || log.eventType}
                      </p>
                    </div>
                    <StatusBadge status={log.status} />
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">{log.recipientName}</span>
                      <span className="font-mono text-slate-600 shrink-0">+{log.recipientPhone}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>{RECIPIENT_ROLE_LABELS[log.recipientRole] || log.recipientRole}</span>
                      <span className="font-mono tabular-nums">
                        Attempt {log.attemptCount}/{log.maxRetries + 1}
                      </span>
                    </div>
                    <div className="pt-1">
                      <StatusBadge status={log.bookingSource} />
                    </div>
                  </div>

                  {log.lastErrorMessage ? (
                    <div className="bg-red-50 border border-red-200 rounded-md p-2 text-red-700 text-[11px] break-words">
                      <span className="font-mono font-semibold">
                        {log.lastErrorCode || 'API_ERROR'}
                        {log.lastErrorHttpStatus ? ` (${log.lastErrorHttpStatus})` : ''}:{' '}
                      </span>
                      {log.lastErrorMessage}
                    </div>
                  ) : log.skipReason ? (
                    <p className="text-[11px] text-slate-500">{log.skipReason}</p>
                  ) : null}

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                      >
                        View
                      </button>
                      {(log.status === 'FAILED' || log.status === 'QUEUED') && (
                        <button
                          type="button"
                          disabled={retryingId === log._id}
                          onClick={() => handleRetrySingle(log._id)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          {retryingId === log._id ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 px-4">ID &amp; Time</th>
                    <th className="py-2.5 px-3">LR / Source</th>
                    <th className="py-2.5 px-3">Event</th>
                    <th className="py-2.5 px-3">Recipient</th>
                    <th className="py-2.5 px-3">Template</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Attempts</th>
                    <th className="py-2.5 px-3">Diagnostics / Error</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50/60 align-top">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-mono font-semibold text-slate-800">
                          {log.notificationId}
                        </p>
                        <p className="text-slate-500 font-mono tabular-nums mt-0.5">
                          {formatDateTime(log.createdAt)}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p className="font-mono font-semibold text-slate-900">{log.lrNumber}</p>
                        <div className="mt-1">
                          <StatusBadge status={log.bookingSource} />
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-800">
                        {EVENT_LABELS[log.eventType] || log.eventType}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-slate-800">{log.recipientName}</p>
                        <p className="font-mono text-slate-600">+{log.recipientPhone}</p>
                        <p className="text-[11px] text-slate-400">
                          {RECIPIENT_ROLE_LABELS[log.recipientRole] || log.recipientRole}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-700">
                        {log.templateName}
                        <span className="text-slate-400 ml-1">({log.languageCode})</span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono tabular-nums text-slate-700">
                        {log.attemptCount} / {log.maxRetries + 1}
                      </td>
                      <td className="py-3 px-3 max-w-[260px]">
                        {log.lastErrorMessage ? (
                          <div className="text-red-700 space-y-0.5">
                            <p className="font-mono font-semibold">
                              {log.lastErrorCode || 'API_ERROR'}
                              {log.lastErrorHttpStatus ? ` (HTTP ${log.lastErrorHttpStatus})` : ''}
                            </p>
                            <p className="break-words">{log.lastErrorMessage}</p>
                          </div>
                        ) : log.skipReason ? (
                          <span className="text-slate-500">{log.skipReason}</span>
                        ) : log.metaMessageId ? (
                          <span className="font-mono text-slate-500 break-all">
                            {log.metaMessageId}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                          >
                            View
                          </button>
                          {(log.status === 'FAILED' || log.status === 'QUEUED') && (
                            <button
                              type="button"
                              disabled={retryingId === log._id}
                              onClick={() => handleRetrySingle(log._id)}
                              className="px-2 py-1 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                              {retryingId === log._id ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="tabular-nums">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} logs)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Message Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 truncate">
                  WhatsApp Notification {selectedLog.notificationId}
                </h3>
                <p className="text-xs text-slate-500 font-mono truncate">
                  LR {selectedLog.lrNumber} &middot; {selectedLog.eventType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 text-slate-400 hover:text-slate-700 shrink-0"
                aria-label="Close notification details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={selectedLog.status} />
                <span className="font-mono text-slate-500">
                  +{selectedLog.recipientPhone} ({selectedLog.recipientRole})
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 whitespace-pre-wrap text-slate-800 leading-relaxed break-words">
                {selectedLog.messagePreview}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                <div>
                  <strong>Template:</strong>{' '}
                  <span className="font-mono">{selectedLog.templateName}</span>
                </div>
                <div>
                  <strong>Language:</strong>{' '}
                  <span className="font-mono">{selectedLog.languageCode}</span>
                </div>
                <div>
                  <strong>Attempts:</strong> {selectedLog.attemptCount}
                </div>
                <div>
                  <strong>Meta Msg ID:</strong>{' '}
                  <span className="font-mono break-all">
                    {selectedLog.metaMessageId || '-'}
                  </span>
                </div>
              </div>

              {selectedLog.lastErrorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800">
                  <p className="font-semibold">
                    Error {selectedLog.lastErrorCode || 'UNKNOWN'}{' '}
                    {selectedLog.lastErrorHttpStatus
                      ? `(HTTP ${selectedLog.lastErrorHttpStatus})`
                      : ''}
                  </p>
                  <p className="mt-1 break-words">{selectedLog.lastErrorMessage}</p>
                </div>
              )}
            </div>
            <div className="px-4 sm:px-5 py-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
              {(selectedLog.status === 'FAILED' || selectedLog.status === 'QUEUED') && (
                <button
                  type="button"
                  disabled={retryingId === selectedLog._id}
                  onClick={async () => {
                    await handleRetrySingle(selectedLog._id);
                    setSelectedLog(null);
                  }}
                  className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Retry Notification
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
