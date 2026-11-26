import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CreditCard,
  Landmark,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime, formatINR } from '../../utils/formatters.ts';
import { loadRazorpayCheckoutScript } from '../../utils/razorpayCheckout.ts';
import { ErrorBanner, LoadingSkeleton } from '../ui/States.tsx';
import {
  WalletPaymentMethod,
  WalletTransactionType,
  type PaymentGatewayConfig,
  type RazorpayCreateOrderResponse,
  type SellerProfile,
  type WalletSummary,
  type WalletTransaction,
} from '../../types/index.ts';

interface WalletRechargeModalProps {
  open: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = [1000, 2500, 5000, 10000];

const PAYMENT_OPTIONS: {
  id:
    | WalletPaymentMethod.UPI
    | WalletPaymentMethod.NEFT_RTGS
    | WalletPaymentMethod.NETBANKING
    | WalletPaymentMethod.CARD;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: WalletPaymentMethod.UPI,
    label: 'UPI Instant',
    sublabel: 'GPay / PhonePe / BHIM',
    icon: Smartphone,
  },
  {
    id: WalletPaymentMethod.NEFT_RTGS,
    label: 'NEFT / RTGS',
    sublabel: 'Bank transfer UTR',
    icon: Building2,
  },
  {
    id: WalletPaymentMethod.NETBANKING,
    label: 'NetBanking',
    sublabel: 'Corporate bank login',
    icon: Landmark,
  },
  {
    id: WalletPaymentMethod.CARD,
    label: 'Corporate Card',
    sublabel: 'Visa / Mastercard / RuPay',
    icon: CreditCard,
  },
];

function formatMethodLabel(method: WalletPaymentMethod): string {
  switch (method) {
    case WalletPaymentMethod.UPI:
      return 'UPI';
    case WalletPaymentMethod.NEFT_RTGS:
      return 'NEFT/RTGS';
    case WalletPaymentMethod.NETBANKING:
      return 'NetBanking';
    case WalletPaymentMethod.CARD:
      return 'Card';
    case WalletPaymentMethod.WALLET_BOOKING:
      return 'Booking Debit';
    case WalletPaymentMethod.WALLET_REFUND:
      return 'Refund Credit';
    case WalletPaymentMethod.RTO_CHARGE:
      return 'RTO Charge';
    case WalletPaymentMethod.OPENING_CREDIT:
      return 'Opening Credit';
    case WalletPaymentMethod.ADMIN_ADJUSTMENT:
      return 'Admin Adjustment';
    default:
      return method;
  }
}

export function WalletRechargeModal({ open, onClose }: WalletRechargeModalProps) {
  const { profile, refreshUser } = useAuth();
  const { showToast } = useToast();
  const sellerProfile = profile as SellerProfile | null;

  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amountInput, setAmountInput] = useState('5000');
  const [paymentMethod, setPaymentMethod] = useState<
    | WalletPaymentMethod.UPI
    | WalletPaymentMethod.NEFT_RTGS
    | WalletPaymentMethod.NETBANKING
    | WalletPaymentMethod.CARD
  >(WalletPaymentMethod.UPI);
  const [referenceNote, setReferenceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recentSuccess, setRecentSuccess] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `zpt-wlt-${crypto.randomUUID()}`);

  const fetchWalletAndGateway = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [walletRes, configRes] = await Promise.all([
        apiClient.get<{ success: boolean; data: WalletSummary }>('/wallet'),
        apiClient.get<{ success: boolean; data: PaymentGatewayConfig }>('/payments/config'),
      ]);
      setSummary(walletRes.data.data);
      setGatewayConfig(configRes.data.data);
    } catch (err) {
      setLoadError(extractErrorMessage(err, 'Failed to load wallet ledger.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setRecentSuccess(null);
    setIdempotencyKey(`zpt-wlt-${crypto.randomUUID()}`);
    fetchWalletAndGateway();
  }, [open, fetchWalletAndGateway]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const currentBalance = summary?.walletBalance ?? Number(sellerProfile?.walletBalance ?? 0);
  const parsedAmount = Number(amountInput);
  const isValidAmount = Number.isFinite(parsedAmount) && parsedAmount >= 100 && parsedAmount <= 500000;
  const isLiveRazorpay = Boolean(gatewayConfig?.configured);

  const handleAddPreset = (preset: number) => {
    const existing = Number(amountInput);
    const next = Number.isFinite(existing) && existing > 0 ? existing + preset : preset;
    setAmountInput(String(Math.min(500000, next)));
    setSubmitError(null);
  };

  const handleRazorpayCheckout = async () => {
    setSubmitting(true);
    try {
      await loadRazorpayCheckoutScript();
      const orderRes = await apiClient.post<{
        success: boolean;
        data: RazorpayCreateOrderResponse;
      }>('/payments/orders', {
        amount: parsedAmount,
        paymentMethod,
      });

      const order = orderRes.data.data;
      if (!window.Razorpay) {
        throw new Error('Razorpay Checkout SDK is unavailable in this browser session.');
      }

      const razorpay = new window.Razorpay({
        key: order.gatewayKeyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'Zipit B2B Logistics',
        description: `Prepaid Wallet Top-Up (${order.orderRef})`,
        order_id: order.gatewayOrderId,
        prefill: order.prefill,
        theme: { color: '#2563eb' },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
          },
        },
        handler: async (paymentResponse) => {
          try {
            const verifyRes = await apiClient.post<{
              success: boolean;
              data: { walletBalance: number; transaction: WalletTransaction };
            }>('/payments/verify', {
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
              paymentMethod,
            });

            const newBalance = verifyRes.data.data.walletBalance;
            const txn = verifyRes.data.data.transaction;
            setSummary((prev) => ({
              walletBalance: newBalance,
              transactions: prev
                ? [txn, ...prev.transactions.filter((item) => item._id !== txn._id)]
                : [txn],
            }));
            setRecentSuccess(
              `Razorpay payment verified! Added ${formatINR(txn.amount)} · Ref ${paymentResponse.razorpay_payment_id}`
            );
            showToast(`Wallet credited with ${formatINR(txn.amount)} via Razorpay`, 'success');
            await refreshUser();
          } catch (verifyErr) {
            const msg = extractErrorMessage(verifyErr, 'Payment verification failed.');
            setSubmitError(msg);
            showToast(msg, 'error');
          } finally {
            setSubmitting(false);
          }
        },
      });

      razorpay.on('payment.failed', (failure) => {
        const reason = failure?.error?.description || 'Payment cancelled or declined by bank.';
        setSubmitError(reason);
        showToast(reason, 'error');
        setSubmitting(false);
      });

      razorpay.open();
    } catch (err) {
      const msg = extractErrorMessage(err, 'Unable to initialize Razorpay checkout.');
      setSubmitError(msg);
      showToast(msg, 'error');
      setSubmitting(false);
    }
  };

  const handleSandboxRecharge = async () => {
    setSubmitting(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        data: { walletBalance: number; transaction: WalletTransaction };
      }>(
        '/wallet/recharge',
        {
          amount: parsedAmount,
          paymentMethod,
          referenceNote: referenceNote.trim() || undefined,
          idempotencyKey,
        },
        {
          headers: { 'Idempotency-Key': idempotencyKey },
        }
      );

      const newBalance = res.data.data.walletBalance;
      const txn = res.data.data.transaction;
      setSummary((prev) => ({
        walletBalance: newBalance,
        transactions: prev
          ? [txn, ...prev.transactions.filter((item) => item._id !== txn._id)]
          : [txn],
      }));
      setReferenceNote('');
      setIdempotencyKey(`zpt-wlt-${crypto.randomUUID()}`);
      setRecentSuccess(
        `Added ${formatINR(txn.amount)} via ${formatMethodLabel(txn.paymentMethod)} · Ref ${txn.transactionId}`
      );
      showToast(`Wallet recharged with ${formatINR(txn.amount)}`, 'success');
      await refreshUser();
    } catch (err) {
      const msg = extractErrorMessage(err, 'Wallet recharge failed.');
      setSubmitError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setRecentSuccess(null);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 100 || parsedAmount > 500000) {
      setSubmitError('Enter a recharge amount between INR 100 and INR 5,00,000.');
      return;
    }

    if (isLiveRazorpay) {
      await handleRazorpayCheckout();
    } else {
      await handleSandboxRecharge();
    }
  };

  const transactions = summary?.transactions || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-2.5 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 px-4 sm:px-5 py-3.5 sm:py-4 bg-white shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <Wallet className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="wallet-modal-title" className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Prepaid Freight Wallet
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {sellerProfile?.businessName || 'Seller Account'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <div className="text-right">
              <span className="block text-[11px] font-medium text-slate-500">
                Available Balance
              </span>
              <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatINR(currentBalance)}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label="Close wallet modal"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Recharge Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-6 space-y-4">
            <div
              className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${
                isLiveRazorpay
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <ShieldCheck
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isLiveRazorpay ? 'text-emerald-600' : 'text-slate-500'
                }`}
              />
              <div>
                <p className="font-semibold">
                  {isLiveRazorpay
                    ? 'Razorpay Standard Checkout Active'
                    : 'Sandbox Instant Top-Up Mode'}
                </p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {isLiveRazorpay
                    ? 'Payments open Razorpay Checkout and verify cryptographically before crediting your wallet.'
                    : 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server environment to enable live Razorpay Checkout.'}
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="wallet-recharge-amount"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Recharge Amount (INR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-500">
                  ₹
                </span>
                <input
                  id="wallet-recharge-amount"
                  type="number"
                  min={100}
                  max={500000}
                  step="1"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setSubmitError(null);
                  }}
                  placeholder="5000"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-7 pr-3 py-2 text-base font-bold font-mono tabular-nums text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddPreset(preset)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono font-medium tabular-nums text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors whitespace-nowrap"
                  >
                    +₹{preset.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Payment Channel
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAYMENT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = paymentMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 mt-0.5 shrink-0 ${
                          active ? 'text-blue-600' : 'text-slate-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{opt.label}</p>
                        <p className="text-[11px] text-slate-500 truncate">{opt.sublabel}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {!isLiveRazorpay && (
              <div>
                <label htmlFor="wallet-ref-note" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  UTR / Reference Note <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  id="wallet-ref-note"
                  type="text"
                  maxLength={120}
                  value={referenceNote}
                  onChange={(e) => setReferenceNote(e.target.value)}
                  placeholder="e.g. UTR42981230 or Monthly freight top-up"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            {submitError && <ErrorBanner message={submitError} />}

            {recentSuccess && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{recentSuccess}</span>
              </div>
            )}

            <div className="pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
              <div className="text-xs text-slate-500">
                Projected balance:{' '}
                <span className="font-mono font-semibold tabular-nums text-slate-800">
                  {formatINR(currentBalance + (isValidAmount ? parsedAmount : 0))}
                </span>
              </div>
              <button
                type="submit"
                disabled={submitting || !isValidAmount}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Wallet className="h-4 w-4 shrink-0" />
                <span>
                  {submitting
                    ? isLiveRazorpay
                      ? 'Opening Checkout...'
                      : 'Processing...'
                    : isLiveRazorpay
                      ? `Pay ${isValidAmount ? formatINR(parsedAmount) : ''} via Razorpay`
                      : `Add ${isValidAmount ? formatINR(parsedAmount) : 'Funds'}`}
                </span>
              </button>
            </div>
          </form>

          {/* Right: Recent Ledger */}
          <div className="lg:col-span-6 lg:border-l lg:border-slate-200 lg:pl-5 flex flex-col min-h-[260px]">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-slate-800">Recent Wallet Ledger</h3>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {loading ? (
              <LoadingSkeleton rows={4} />
            ) : loadError ? (
              <ErrorBanner message={loadError} />
            ) : transactions.length === 0 ? (
              <div className="flex-1 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-6 flex flex-col items-center justify-center text-center">
                <Wallet className="h-6 w-6 text-slate-400 mb-2" />
                <p className="text-xs font-medium text-slate-700">No wallet transactions yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Add funds on the left to start paying freight directly from your prepaid balance.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-y-auto max-h-[340px]">
                {transactions.map((txn) => {
                  const isCredit = txn.type === WalletTransactionType.CREDIT;
                  return (
                    <div
                      key={txn._id || txn.transactionId}
                      className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`mt-0.5 grid h-6 w-6 place-items-center rounded-md shrink-0 ${
                            isCredit
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">
                            {txn.description}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono tabular-nums truncate mt-0.5">
                            {formatMethodLabel(txn.paymentMethod)} · {formatDateTime(txn.createdAt)}
                          </p>
                          {txn.referenceNote && (
                            <p className="text-[11px] text-slate-500 truncate">
                              Ref: {txn.referenceNote}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-xs font-bold font-mono tabular-nums ${
                            isCredit ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {formatINR(txn.amount)}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                          Bal: {formatINR(txn.balanceAfter)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
