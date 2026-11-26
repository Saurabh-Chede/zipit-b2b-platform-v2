import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  LifeBuoy,
  Package,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../ui/States.tsx';
import {
  NotificationCategory,
  type AppNotification,
  type NotificationListResponse,
} from '../../types/index.ts';

type CategoryFilter = 'ALL' | NotificationCategory;

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'ALL', label: 'All Updates' },
  { id: NotificationCategory.BOOKING, label: 'Bookings' },
  { id: NotificationCategory.SHIPMENT, label: 'Shipments & POD' },
  { id: NotificationCategory.WALLET, label: 'Wallet & Refunds' },
  { id: NotificationCategory.SUPPORT, label: 'Support' },
  { id: NotificationCategory.SELLER_KYC, label: 'KYC & Onboarding' },
];

const CATEGORY_BADGES: Record<NotificationCategory, { label: string; style: string }> = {
  [NotificationCategory.BOOKING]: { label: 'Booking', style: 'bg-blue-50 text-blue-700 border-blue-200' },
  [NotificationCategory.SHIPMENT]: { label: 'Shipment', style: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  [NotificationCategory.WALLET]: { label: 'Wallet', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  [NotificationCategory.SUPPORT]: { label: 'Support', style: 'bg-amber-50 text-amber-700 border-amber-200' },
  [NotificationCategory.SELLER_KYC]: { label: 'Seller KYC', style: 'bg-purple-50 text-purple-700 border-purple-200' },
};

function CategoryIcon({ category }: { category: NotificationCategory }) {
  switch (category) {
    case NotificationCategory.BOOKING:
      return <Package className="w-4 h-4 text-blue-600" />;
    case NotificationCategory.SHIPMENT:
      return <Truck className="w-4 h-4 text-indigo-600" />;
    case NotificationCategory.WALLET:
      return <Wallet className="w-4 h-4 text-emerald-600" />;
    case NotificationCategory.SUPPORT:
      return <LifeBuoy className="w-4 h-4 text-amber-600" />;
    case NotificationCategory.SELLER_KYC:
      return <ShieldCheck className="w-4 h-4 text-purple-600" />;
    default:
      return <Bell className="w-4 h-4 text-slate-600" />;
  }
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    unreadCount: contextUnreadCount,
    markAsRead,
    markAllAsRead,
    clearRead,
    refreshNotifications,
  } = useNotifications();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: NotificationListResponse }>(
        '/notifications',
        {
          params: {
            page,
            limit: 20,
            ...(categoryFilter !== 'ALL' ? { category: categoryFilter } : {}),
            ...(unreadOnly ? { unreadOnly: true } : {}),
          },
        }
      );
      setItems(res.data.data.items);
      setUnreadCount(res.data.data.unreadCount);
      setTotalPages(res.data.data.pagination.totalPages);
      setTotal(res.data.data.pagination.total);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load notifications.'));
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, unreadOnly]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, contextUnreadCount]);

  const handleMarkOne = async (item: AppNotification, navigateToLink: boolean) => {
    if (!item.isRead) {
      await markAsRead(item._id);
      setItems((prev) =>
        prev.map((n) => (n._id === item._id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (navigateToLink && item.link) {
      navigate(item.link);
    }
  };

  const handleMarkAll = async () => {
    setBusyAction(true);
    try {
      await markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      showToast('All notifications marked as read.', 'success');
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearRead = async () => {
    setBusyAction(true);
    try {
      await clearRead();
      await loadNotifications();
      await refreshNotifications();
      showToast('Cleared read notifications.', 'success');
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time operational updates across your bookings, shipments, wallet, and support tickets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            disabled={busyAction || unreadCount === 0}
            onClick={() => void handleMarkAll()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All Read</span>
          </button>
          <button
            type="button"
            disabled={busyAction || items.every((i) => !i.isRead)}
            onClick={() => void handleClearRead()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Read</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCategoryFilter(tab.id);
                setPage(1);
              }}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                categoryFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => {
              setUnreadOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>Unread only ({unreadCount})</span>
        </label>
      </div>

      {/* Notifications List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-5">
            <LoadingSkeleton rows={5} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorBanner message={error} onRetry={loadNotifications} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={unreadOnly ? 'No unread notifications' : 'No notifications found'}
              description={
                unreadOnly
                  ? 'You have read all updates in this view.'
                  : 'New bookings, shipment status changes, wallet credits, and support updates will appear here automatically.'
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {items.map((item) => {
              const badge = CATEGORY_BADGES[item.category];
              return (
                <div
                  key={item._id}
                  className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    item.isRead ? 'bg-white' : 'bg-blue-50/35'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center shrink-0 mt-0.5">
                      <CategoryIcon category={item.category} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border ${badge.style}`}
                        >
                          {badge.label}
                        </span>
                        {!item.isRead && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded bg-blue-600 text-white">
                            New
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>

                      <h3
                        className={`text-sm mt-1 ${
                          item.isRead ? 'font-medium text-slate-800' : 'font-semibold text-slate-900'
                        }`}
                      >
                        {item.title}
                      </h3>
                      <p className="text-sm text-slate-600 mt-0.5">{item.message}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {!item.isRead && (
                      <button
                        type="button"
                        onClick={() => void handleMarkOne(item, false)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark Read</span>
                      </button>
                    )}
                    {item.link && (
                      <button
                        type="button"
                        onClick={() => void handleMarkOne(item, true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Showing page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded-md disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 bg-white border border-slate-300 rounded-md disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
