import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Webhook,
  XCircle,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { Modal } from '../../components/ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import type {
  AdminAlertsResponse,
  IncidentSeverity,
  IncidentSource,
  SystemIncidentRecord,
  TestAlertResponse,
} from '../../types/index.ts';

const SOURCE_LABELS: Record<IncidentSource, string> = {
  BACKEND_API: 'Backend API',
  FRONTEND_UI: 'Frontend UI',
  DATABASE: 'MongoDB',
  PROCESS: 'Node Process',
  SUPPORT: 'Support Desk',
};

export function AdminAlertsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<AdminAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [severityFilter, setSeverityFilter] = useState<'ALL' | IncidentSeverity>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | IncidentSource>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState<number>(50);

  const [selectedIncident, setSelectedIncident] = useState<SystemIncidentRecord | null>(null);

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchAlerts = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params: Record<string, string | number> = { limit };
        if (severityFilter !== 'ALL') params.severity = severityFilter;
        if (sourceFilter !== 'ALL') params.source = sourceFilter;
        if (searchQuery.trim()) params.search = searchQuery.trim();

        const res = await apiClient.get<{ success: boolean; data: AdminAlertsResponse }>(
          '/alerts',
          { params }
        );
        setData(res.data.data);
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load system incident alerts.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit, searchQuery, severityFilter, sourceFilter]
  );

  useEffect(() => {
    void fetchAlerts(false);
  }, [fetchAlerts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  };

  const handleSendTestAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingTest(true);
    try {
      const payload = testMessage.trim() ? { message: testMessage.trim() } : {};
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: TestAlertResponse;
      }>('/alerts/test', payload);

      const channels = res.data.data.notifiedChannels;
      const channelText =
        channels.length > 0
          ? `Dispatched to ${channels.join(', ')}.`
          : 'Logged in Incident History (no external webhook URL configured).';

      showToast(`Test alert recorded. ${channelText}`, 'success');
      setTestModalOpen(false);
      setTestMessage('');
      await fetchAlerts(true);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to trigger test alert.'), 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const columns: ColumnDef<SystemIncidentRecord>[] = [
    {
      key: 'severity',
      header: 'Severity & Source',
      render: (item) => (
        <div className="space-y-1">
          <StatusBadge status={item.severity} />
          <p className="text-xs text-slate-500">
            {SOURCE_LABELS[item.source] || item.source}
            {item.userRole ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{item.userRole}</span>
              </>
            ) : null}
          </p>
        </div>
      ),
    },
    {
      key: 'error',
      header: 'Error Code & Message',
      render: (item) => (
        <div className="max-w-md min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-900 truncate">
            {item.errorCode}
          </p>
          <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{item.message}</p>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Endpoint / Page',
      hideBelow: 'lg',
      render: (item) =>
        item.route ? (
          <div className="max-w-[230px]">
            <p className="font-mono text-xs text-slate-800 truncate">
              {item.method ? `${item.method} ` : ''}
              {item.route}
            </p>
            {typeof item.statusCode === 'number' && (
              <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                HTTP {item.statusCode}
              </p>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'occurrences',
      header: 'Hits',
      align: 'right',
      hideBelow: 'xl',
      render: (item) => (
        <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
          ×{item.occurrenceCount}
        </span>
      ),
    },
    {
      key: 'channels',
      header: 'Alert Delivery',
      hideBelow: 'lg',
      render: (item) =>
        item.notifiedChannels.length > 0 ? (
          <span className="text-xs font-medium text-emerald-700">
            {item.notifiedChannels.join(' · ')}
          </span>
        ) : (
          <span className="text-xs text-slate-500">DB Log Only</span>
        ),
    },
    {
      key: 'lastOccurredAt',
      header: 'Last Occurred',
      hideBelow: 'xl',
      render: (item) => (
        <span className="font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
          {formatDateTime(item.lastOccurredAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Inspect',
      align: 'right',
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedIncident(item);
          }}
          className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap"
        >
          Details
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">System Incident Alerts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Inspect API errors, frontend runtime crashes, and Discord / webhook alert delivery status
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => void fetchAlerts(true)}
            disabled={loading || refreshing}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTestModalOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Alert</span>
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Matching Incidents (30d TTL)</span>
              <ShieldAlert className="w-4 h-4 text-slate-500" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {data.totalCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">Showing latest {data.items.length} entries</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Critical Errors (Last 24h)</span>
              <AlertTriangle
                className={`w-4 h-4 ${data.criticalLast24h > 0 ? 'text-red-600' : 'text-emerald-600'}`}
              />
            </div>
            <p
              className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                data.criticalLast24h > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {data.criticalLast24h}
            </p>
            <p className="text-xs text-slate-500 mt-1">ERROR and FATAL severity events</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Discord Webhook</span>
              <BellRing className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {data.configuration.discordConfigured ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-base font-semibold text-emerald-700">Configured</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-base font-semibold text-amber-700">Not Configured</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Env: DISCORD_ALERT_WEBHOOK_URL</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Generic / WhatsApp Webhook</span>
              <Webhook className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {data.configuration.genericWebhookConfigured ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-base font-semibold text-emerald-700">Configured</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-base font-semibold text-slate-700">Not Configured</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Min Alert Level:{' '}
              <span className="font-mono font-semibold text-slate-700">
                {data.configuration.minLevel}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none w-full lg:w-auto">
          {(['ALL', 'FATAL', 'ERROR', 'WARN'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                severityFilter === sev
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {sev === 'ALL' ? 'All Severities' : sev}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:flex-1 lg:justify-end">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:flex-1 sm:max-w-xs sm:min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => {
                const val = e.target.value;
                setSearchInput(val);
                if (!val.trim()) setSearchQuery('');
              }}
              placeholder="Search code, route, message..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>

          <select
            aria-label="Filter by incident source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'ALL' | IncidentSource)}
            className="flex-1 sm:flex-initial px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="ALL">All Sources</option>
            <option value="BACKEND_API">Backend API</option>
            <option value="FRONTEND_UI">Frontend UI</option>
            <option value="DATABASE">MongoDB</option>
            <option value="PROCESS">Node Process</option>
            <option value="SUPPORT">Support Desk</option>
          </select>

          <select
            aria-label="Rows limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
            <option value={200}>200 rows</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : error || !data ? (
        <ErrorBanner
          message={error || 'Unable to load system incidents'}
          onRetry={() => void fetchAlerts(false)}
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="No incidents matching these filters"
          description="Captured API exceptions, frontend crashes, and test pings appear here automatically and expire after 30 days."
          action={
            severityFilter !== 'ALL' || sourceFilter !== 'ALL' || searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter('ALL');
                  setSourceFilter('ALL');
                  setSearchInput('');
                  setSearchQuery('');
                }}
                className="px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Reset Filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(item) => item._id}
          onRowClick={(item) => setSelectedIncident(item)}
          renderMobileCard={(item) => (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.severity} />
                    <span className="text-xs text-slate-500">
                      {SOURCE_LABELS[item.source] || item.source}
                    </span>
                  </div>
                  <p className="font-mono text-xs font-semibold text-slate-900 mt-1.5 truncate">
                    {item.errorCode}
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 shrink-0">
                  ×{item.occurrenceCount}
                </span>
              </div>

              <p className="text-xs text-slate-600 line-clamp-2">{item.message}</p>

              {item.route && (
                <p className="font-mono text-[11px] text-slate-500 truncate pt-2 border-t border-slate-100">
                  {item.method ? `${item.method} ` : ''}
                  {item.route}
                  {typeof item.statusCode === 'number' ? ` · HTTP ${item.statusCode}` : ''}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  {formatDateTime(item.lastOccurredAt)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIncident(item);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                >
                  Details
                </button>
              </div>
            </div>
          )}
        />
      )}

      {/* Incident Detail Inspection Modal */}
      <Modal
        open={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
        title={selectedIncident ? `Incident · ${selectedIncident.errorCode}` : 'Incident Details'}
        subtitle={
          selectedIncident
            ? `${SOURCE_LABELS[selectedIncident.source] || selectedIncident.source} · Last occurred ${formatDateTime(selectedIncident.lastOccurredAt)}`
            : undefined
        }
        maxWidthClass="max-w-3xl"
      >
        {selectedIncident && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <StatusBadge status={selectedIncident.severity} />
                <span className="font-mono text-slate-600">
                  Occurrences: <strong className="text-slate-900">×{selectedIncident.occurrenceCount}</strong>
                </span>
              </div>
              <span className="font-mono text-slate-500">
                Channels:{' '}
                {selectedIncident.notifiedChannels.length > 0
                  ? selectedIncident.notifiedChannels.join(', ')
                  : 'Database Only'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <p className="text-slate-500">Route / Endpoint</p>
                <p className="font-mono text-slate-900 mt-0.5 break-all">
                  {selectedIncident.method ? `${selectedIncident.method} ` : ''}
                  {selectedIncident.route || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">HTTP Status</p>
                <p className="font-mono tabular-nums text-slate-900 mt-0.5">
                  {selectedIncident.statusCode ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Request ID</p>
                <p className="font-mono text-slate-900 mt-0.5 break-all">
                  {selectedIncident.requestId || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Actor Role / User ID</p>
                <p className="font-mono text-slate-900 mt-0.5 break-all">
                  {selectedIncident.userRole || 'GUEST'}
                  {selectedIncident.userId ? ` (${selectedIncident.userId})` : ''}
                </p>
              </div>
              <div>
                <p className="text-slate-500">First Seen</p>
                <p className="font-mono tabular-nums text-slate-900 mt-0.5">
                  {formatDateTime(selectedIncident.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Signature Hash</p>
                <p className="font-mono text-slate-700 mt-0.5">{selectedIncident.dedupKey}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="font-semibold text-slate-700 mb-1">Error Message</p>
              <p className="text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg p-3 break-words">
                {selectedIncident.message}
              </p>
            </div>

            {selectedIncident.stack && (
              <div>
                <p className="font-semibold text-slate-700 mb-1">Stack Trace</p>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto max-h-60 leading-relaxed whitespace-pre-wrap break-all">
                  {selectedIncident.stack}
                </pre>
              </div>
            )}

            {selectedIncident.meta && Object.keys(selectedIncident.meta).length > 0 && (
              <div>
                <p className="font-semibold text-slate-700 mb-1">Metadata Context</p>
                <pre className="p-3 bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-[11px] font-mono overflow-x-auto max-h-44">
                  {JSON.stringify(selectedIncident.meta, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Send Test Alert Modal */}
      <Modal
        open={testModalOpen}
        onClose={() => !sendingTest && setTestModalOpen(false)}
        title="Send Test Alert Ping"
        subtitle="Verify incident persistence and Discord / generic webhook alert delivery"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSendTestAlert} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p>
              Logs a <span className="font-mono font-semibold text-slate-900">TEST_ALERT_PING</span>{' '}
              (WARN) event and dispatches to any configured webhook URLs.
            </p>
            {data &&
              !data.configuration.discordConfigured &&
              !data.configuration.genericWebhookConfigured && (
                <p className="text-amber-700 font-medium">
                  No external webhook URL is currently configured in .env; the test ping will be
                  recorded in the database log only.
                </p>
              )}
          </div>

          <div>
            <label htmlFor="test-alert-msg" className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Test Message <span className="font-normal text-slate-400">(Optional)</span>
            </label>
            <textarea
              id="test-alert-msg"
              rows={3}
              maxLength={400}
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="e.g. Pre-launch alert channel verification check"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={sendingTest}
              onClick={() => setTestModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sendingTest || (testMessage.trim().length > 0 && testMessage.trim().length < 3)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingTest ? 'Sending...' : 'Trigger Test Alert'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
