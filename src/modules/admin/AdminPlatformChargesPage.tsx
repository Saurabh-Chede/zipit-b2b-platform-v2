import React, { useCallback, useEffect, useState } from 'react';
import { History, Percent, Save } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import type {
  PlatformChargeRule,
  PlatformConfig,
  RouteAuditLogEntry,
} from '../../types/index.ts';

interface PlatformConfigPayload {
  config: PlatformConfig;
  auditHistory: RouteAuditLogEntry[];
}

function previewCharge(rule: PlatformChargeRule, sampleSubtotal = 1100, gstPercent = 18) {
  if (!rule.enabled || !Number.isFinite(rule.value) || rule.value <= 0) {
    const gst = Number(((sampleSubtotal * gstPercent) / 100).toFixed(2));
    return {
      charge: 0,
      gst,
      total: Number((sampleSubtotal + gst).toFixed(2)),
    };
  }
  const charge =
    rule.chargeType === 'PERCENTAGE'
      ? Number(((sampleSubtotal * rule.value) / 100).toFixed(2))
      : Number(rule.value.toFixed(2));
  const taxable = rule.applyGstOnCharge ? sampleSubtotal + charge : sampleSubtotal;
  const gst = Number(((taxable * gstPercent) / 100).toFixed(2));
  return {
    charge,
    gst,
    total: Number((sampleSubtotal + charge + gst).toFixed(2)),
  };
}

function RuleEditorCard({
  title,
  description,
  rule,
  onChange,
  idPrefix,
}: {
  title: string;
  description: string;
  rule: PlatformChargeRule;
  onChange: (next: PlatformChargeRule) => void;
  idPrefix: string;
}) {
  const sample = previewCharge(rule);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
          <input
            id={`${idPrefix}-enabled`}
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => onChange({ ...rule, enabled: e.target.checked })}
            className="w-4 h-4 rounded border-slate-300 text-blue-600"
          />
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
              rule.enabled
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {rule.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Charge Type</label>
          <select
            value={rule.chargeType}
            onChange={(e) =>
              onChange({
                ...rule,
                chargeType: e.target.value as 'FIXED' | 'PERCENTAGE',
              })
            }
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          >
            <option value="FIXED">Fixed Amount (INR / shipment)</option>
            <option value="PERCENTAGE">Percentage (% of Freight + Add&apos;l)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {rule.chargeType === 'PERCENTAGE' ? 'Percentage Rate (%)' : 'Charge Amount (INR)'}
          </label>
          <input
            type="number"
            min="0"
            max={rule.chargeType === 'PERCENTAGE' ? '100' : undefined}
            step="0.01"
            value={rule.value}
            onChange={(e) =>
              onChange({
                ...rule,
                value: Number(e.target.value || 0),
              })
            }
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono tabular-nums"
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          id={`${idPrefix}-gst`}
          type="checkbox"
          checked={rule.applyGstOnCharge}
          onChange={(e) => onChange({ ...rule, applyGstOnCharge: e.target.checked })}
          className="w-4 h-4 rounded border-slate-300 text-blue-600"
        />
        <label htmlFor={`${idPrefix}-gst`} className="text-sm text-slate-700">
          Apply freight GST rate on top of this platform charge
        </label>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1">
        <p className="font-semibold text-slate-700">
          Live Preview on Sample Shipment (₹1,000 Base + ₹100 Handling, 18% GST)
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
          <span>Platform Charge:</span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {formatINR(sample.charge)}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
          <span>Total Payable (incl. GST {formatINR(sample.gst)}):</span>
          <span className="font-mono font-bold text-blue-700 tabular-nums">
            {formatINR(sample.total)}
          </span>
        </div>
      </div>
    </section>
  );
}

export function AdminPlatformChargesPage() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sellerRule, setSellerRule] = useState<PlatformChargeRule>({
    enabled: false,
    chargeType: 'FIXED',
    value: 0,
    applyGstOnCharge: false,
  });
  const [transporterRule, setTransporterRule] = useState<PlatformChargeRule>({
    enabled: false,
    chargeType: 'FIXED',
    value: 0,
    applyGstOnCharge: false,
  });
  const [billingRuleNotes, setBillingRuleNotes] = useState('');
  const [lastUpdatedMeta, setLastUpdatedMeta] = useState<{
    name?: string | null;
    at?: string;
  }>({});
  const [auditHistory, setAuditHistory] = useState<RouteAuditLogEntry[]>([]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: PlatformConfigPayload }>(
        '/platform-config'
      );
      const { config, auditHistory: logs } = res.data.data;
      setSellerRule(config.sellerBookingCharge);
      setTransporterRule(config.transporterBookingCharge);
      setBillingRuleNotes(config.billingRuleNotes || '');
      setLastUpdatedMeta({ name: config.updatedByName, at: config.updatedAt });
      setAuditHistory(logs || []);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load platform charge configuration.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sellerRule.chargeType === 'PERCENTAGE' && sellerRule.value > 100) {
      showToast('Seller percentage platform charge cannot exceed 100%.', 'error');
      return;
    }
    if (transporterRule.chargeType === 'PERCENTAGE' && transporterRule.value > 100) {
      showToast('Transporter percentage platform charge cannot exceed 100%.', 'error');
      return;
    }

    setSaving(true);
    try {
      await apiClient.put('/platform-config', {
        sellerBookingCharge: sellerRule,
        transporterBookingCharge: transporterRule,
        billingRuleNotes: billingRuleNotes.trim(),
      });
      showToast('Platform charge configuration updated.', 'success');
      await loadConfig();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save platform charge configuration.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error) return <ErrorBanner message={error} onRetry={loadConfig} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-blue-600" />
            <span>Platform Charge Configuration</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure per-shipment platform fees dynamically for ZIPIT seller bookings and transporter self-created orders
          </p>
        </div>

        {lastUpdatedMeta.at && (
          <div className="text-xs text-slate-500">
            Last updated by <strong className="text-slate-700">{lastUpdatedMeta.name || 'Admin'}</strong>{' '}
            on <span className="font-mono tabular-nums">{formatDateTime(lastUpdatedMeta.at)}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RuleEditorCard
            idPrefix="seller-charge"
            title="Seller Bookings (ZIPIT Platform)"
            description="Applied to shipments booked by sellers via marketplace rate comparison & bulk upload"
            rule={sellerRule}
            onChange={setSellerRule}
          />
          <RuleEditorCard
            idPrefix="transporter-charge"
            title="Transporter Personal Bookings (Self-Created)"
            description="Applied to direct customer shipments created by transporters in their personal booking panel"
            rule={transporterRule}
            onChange={setTransporterRule}
          />
        </div>

        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              Billing Policy &amp; Rule Notes
            </label>
            <textarea
              rows={2}
              value={billingRuleNotes}
              onChange={(e) => setBillingRuleNotes(e.target.value)}
              placeholder="Document commercial notes or phased billing rollout rules..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Configuration...' : 'Save Platform Charge Rules'}</span>
            </button>
          </div>
        </section>
      </form>

      {/* Audit History */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Configuration Change Audit Log</h2>
        </div>
        {auditHistory.length === 0 ? (
          <p className="p-4 sm:p-5 text-xs text-slate-500">No platform charge changes recorded yet.</p>
        ) : (
          <>
            <div className="sm:hidden divide-y divide-slate-100 text-xs">
              {auditHistory.map((log) => (
                <div key={log._id} className="p-4 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {log.actorName} ({log.actorRole})
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <p className="text-slate-600">{log.summary}</p>
                </div>
              ))}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Changed By</th>
                    <th className="py-2.5 px-4">Summary</th>
                    <th className="py-2.5 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {auditHistory.map((log) => (
                    <tr key={log._id}>
                      <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {log.actorName} ({log.actorRole})
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{log.summary}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
