import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  LifeBuoy,
  Package,
  ShieldCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { NotificationCategory, UserRole, type AppNotification } from '../../types/index.ts';

function getCategoryIcon(category: NotificationCategory) {
  switch (category) {
    case NotificationCategory.BOOKING:
      return Package;
    case NotificationCategory.SHIPMENT:
      return Truck;
    case NotificationCategory.WALLET:
      return Wallet;
    case NotificationCategory.SUPPORT:
      return LifeBuoy;
    case NotificationCategory.SELLER_KYC:
      return ShieldCheck;
    default:
      return Bell;
  }
}

function getCategoryStyle(category: NotificationCategory): string {
  switch (category) {
    case NotificationCategory.BOOKING:
      return 'bg-blue-50 text-blue-600';
    case NotificationCategory.SHIPMENT:
      return 'bg-indigo-50 text-indigo-600';
    case NotificationCategory.WALLET:
      return 'bg-emerald-50 text-emerald-600';
    case NotificationCategory.SUPPORT:
      return 'bg-amber-50 text-amber-600';
    case NotificationCategory.SELLER_KYC:
      return 'bg-purple-50 text-purple-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  if (!user) return null;

  const notificationsPath =
    user.role === UserRole.ADMIN
      ? '/admin/notifications'
      : user.role === UserRole.SELLER
        ? '/seller/notifications'
        : '/transporter/notifications';

  const handleOpenItem = async (item: AppNotification) => {
    setOpen(false);
    if (!item.isRead) {
      await markAsRead(item._id);
    }
    if (item.link) {
      navigate(item.link);
    }
  };

  const previewItems = notifications.slice(0, 7);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Open notifications"
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-md bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center leading-none tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 sm:inset-x-auto sm:top-auto sm:absolute sm:right-0 sm:mt-2 w-auto sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              <p className="text-xs text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread updates` : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-[60dvh] sm:max-h-96 overflow-y-auto divide-y divide-slate-100">
            {previewItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">No notifications yet</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Shipment updates, wallet credits, and ticket replies appear here.
                </p>
              </div>
            ) : (
              previewItems.map((item) => {
                const Icon = getCategoryIcon(item.category);
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => void handleOpenItem(item)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-slate-50 ${
                      item.isRead ? 'bg-white' : 'bg-blue-50/40'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${getCategoryStyle(
                        item.category
                      )}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-xs leading-snug ${
                            item.isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'
                          }`}
                        >
                          {item.title}
                        </p>
                        {!item.isRead && (
                          <span className="w-2 h-2 rounded-sm bg-blue-600 shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{item.message}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(notificationsPath);
              }}
              className="w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 py-0.5"
            >
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
