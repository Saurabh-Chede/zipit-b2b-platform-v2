import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import type { TransporterEarningsResponse } from '../../types/index.ts';

type EarningsTab = 'SETTLEMENTS' | 'LEDGER';

export function TransporterEarningsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<TransporterEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EarningsTab>('SETTLEMENTS');

  const loadEarnings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: TransporterEarningsResponse }>(
        '/transporter/earnings'
      );
      setData(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load transporter earnings and settlements.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEarnings();
  }, [loadEarnings]);

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'LR Number',
      'Booking ID',
      'Booking Source',
      'Lane',
      'Shipment Status',
      'Payment Mode',
      'Gross Freight (INR)',
      'Platform Fee (INR)',
      'Net Earning (INR)',
      'Settlement State',
    ];
    const rows = data.shipmentLedger.map((item) => [
      item.lrNumber,
      item.bookingId,
      item.bookingSource || 'PLATFORM',
      item.lane,
      item.status,
      item.paymentMode,
      item.grossFreight.toFixed(2),
      item.platformFee.toFixed(2),
      item.netEarning.toFixed(2),
      item.settlementState,
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zipit-transporter-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !data) {
    return <ErrorBanner message={error || 'Unable to load earnings'} onRetry={loadEarnings} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Earnings & Settlement History</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track gross freight revenue, {data.commissionRatePercent}% platform service fee, settled NEFT/RTGS payouts, and pending balances
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <FileDown className="w-4 h-4 text-blue-600" />
          <span>Export Ledger CSV</span>
        </button>
      </div>

      {/* 4-Cell Flat Operational Metric Strip */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Net Earned (Delivered)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatINR(data.summary.deliveredNetEarned)}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Gross {formatINR(data.summary.deliveredGrossFreight)} · Fee {formatINR(data.summary.deliveredPlatformFee)}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Total Settled</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {formatINR(data.summary.totalSettled)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Disbursed across {data.settlements.length} payout{data.settlements.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Pending Settlement</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {formatINR(data.summary.pendingSettlement)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Delivered freight queued for next payout cycle
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">In-Transit Pipeline (Net)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">
            {formatINR(data.summary.inTransitPipelineNet)}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Gross active freight {formatINR(data.summary.inTransitPipelineGross)}
          </p>
        </div>
      </div>

      {data.personalBookingsSummary && data.personalBookingsSummary.totalBookings > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Direct Customer (Self-Booked) Summary — Excluded from Platform Bank Settlements
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Collected directly via Cash / To-Pay / Customer Invoice
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-slate-500 block">Self Orders</span>
              <strong className="font-mono text-sm text-slate-900 tabular-nums">
                {data.personalBookingsSummary.totalBookings} ({data.personalBookingsSummary.deliveredBookings} delivered)
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Gross Billed</span>
              <strong className="font-mono text-sm text-slate-900 tabular-nums">
                {formatINR(data.personalBookingsSummary.grossBilled)}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Platform Charges</span>
              <strong className="font-mono text-sm text-slate-900 tabular-nums">
                {formatINR(data.personalBookingsSummary.platformCharges)}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Segmented View Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('SETTLEMENTS')}
          className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition whitespace-nowrap shrink-0 ${
            activeTab === 'SETTLEMENTS'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Settlement Payouts ({data.settlements.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('LEDGER')}
          className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition whitespace-nowrap shrink-0 ${
            activeTab === 'LEDGER'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Shipment Earnings Ledger ({data.shipmentLedger.length})
        </button>
      </div>

      {activeTab === 'SETTLEMENTS' ? (
        data.settlements.length === 0 ? (
          <EmptyState
            title="No settlements recorded yet"
            description="Completed bank settlements (NEFT/RTGS/IMPS) will appear here after payout processing."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Mobile / Tablet Settlements Cards */}
            <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
              {data.settlements.map((st) => (
                <div
                  key={st._id}
                  className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-sm text-slate-900 tabular-nums truncate">
                        {st.settlementId}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">{st.periodLabel}</p>
                    </div>
                    <StatusBadge status={st.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-500 block">Gross ({st.bookingCount} orders)</span>
                      <span className="font-mono tabular-nums text-slate-800">
                        {formatINR(st.grossAmount)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">Net Payout</span>
                      <span className="font-mono font-semibold tabular-nums text-emerald-700">
                        {formatINR(st.netPayoutAmount)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100 font-mono tabular-nums">
                    <span className="truncate">
                      {st.payoutMethod} · {st.utrNumber}
                    </span>
                    <span>{formatDateTime(st.settledAt)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">Settlement ID</th>
                    <th className="py-3 px-4 hidden xl:table-cell">Billing Period</th>
                    <th className="py-3 px-4 text-right">Shipments</th>
                    <th className="py-3 px-4 text-right">Gross Freight</th>
                    <th className="py-3 px-4 text-right hidden xl:table-cell">Platform Fee</th>
                    <th className="py-3 px-4 text-right">Net Payout</th>
                    <th className="py-3 px-4 hidden lg:table-cell">Method & UTR</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 hidden xl:table-cell">Settled On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {data.settlements.map((st) => (
                    <tr key={st._id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {st.settlementId}
                      </td>
                      <td className="py-3 px-4 hidden xl:table-cell text-slate-700">{st.periodLabel}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {st.bookingCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatINR(st.grossAmount)}
                      </td>
                      <td className="py-3 px-4 hidden xl:table-cell text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        -{formatINR(st.platformFee)} ({st.platformCommissionRate}%)
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                        {formatINR(st.netPayoutAmount)}
                      </td>
                      <td className="py-3 px-4 hidden lg:table-cell font-mono text-xs text-slate-700 whitespace-nowrap">
                        {st.payoutMethod} · {st.utrNumber}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={st.status} />
                      </td>
                      <td className="py-3 px-4 hidden xl:table-cell font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                        {formatDateTime(st.settledAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : data.shipmentLedger.length === 0 ? (
        <EmptyState
          title="No shipment earnings entries"
          description="Shipments assigned to your carrier will populate your freight ledger."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Mobile / Tablet Ledger Cards */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4">
            {data.shipmentLedger.map((item) => (
              <div
                key={item._id}
                onClick={() =>
                  navigate(`/transporter/bookings/${item._id}`, {
                    state: { from: '/transporter/earnings' },
                  })
                }
                className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-slate-300 transition-colors cursor-pointer space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-sm text-blue-600 tabular-nums truncate">
                      {item.lrNumber}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">{item.lane}</p>
                  </div>
                  <StatusBadge status={item.settlementState} />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={item.status} />
                  <StatusBadge status={item.bookingSource || 'PLATFORM'} />
                  <span className="text-[11px] font-mono text-slate-500">{item.paymentMode}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-100 font-mono tabular-nums">
                  <div>
                    <span className="text-slate-500 font-sans block text-[11px]">Gross</span>
                    <span className="text-slate-800">{formatINR(item.grossFreight)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-sans block text-[11px]">Fee</span>
                    <span className="text-slate-500">-{formatINR(item.platformFee)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 font-sans block text-[11px]">Net</span>
                    <span className="font-semibold text-slate-900">{formatINR(item.netEarning)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">LR Number</th>
                  <th className="py-3 px-4 hidden xl:table-cell">Source</th>
                  <th className="py-3 px-4">Lane</th>
                  <th className="py-3 px-4">Shipment Status</th>
                  <th className="py-3 px-4 hidden xl:table-cell">Mode</th>
                  <th className="py-3 px-4 text-right hidden lg:table-cell">Gross Freight</th>
                  <th className="py-3 px-4 text-right hidden xl:table-cell">Platform Fee</th>
                  <th className="py-3 px-4 text-right">Net Earning</th>
                  <th className="py-3 px-4">Settlement State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.shipmentLedger.map((item) => (
                  <tr
                    key={item._id}
                    onClick={() =>
                      navigate(`/transporter/bookings/${item._id}`, {
                        state: { from: '/transporter/earnings' },
                      })
                    }
                    className="hover:bg-slate-50/70 cursor-pointer"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono font-semibold text-blue-600 hover:underline tabular-nums block">
                        {item.lrNumber}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {item.bookingId}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden xl:table-cell whitespace-nowrap">
                      <StatusBadge status={item.bookingSource || 'PLATFORM'} />
                    </td>
                    <td className="py-3 px-4 text-slate-800 whitespace-nowrap">{item.lane}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-3 px-4 hidden xl:table-cell font-mono text-xs text-slate-600 whitespace-nowrap">
                      {item.paymentMode}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatINR(item.grossFreight)}
                    </td>
                    <td className="py-3 px-4 hidden xl:table-cell text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      -{formatINR(item.platformFee)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                      {formatINR(item.netEarning)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={item.settlementState} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
