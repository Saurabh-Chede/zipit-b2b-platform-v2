import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiClient, ApiClientError } from '../services/api.ts';
import { getStoredAuthToken, resolveWebSocketUrl } from '../utils/apiConfig.ts';
import { useAuth } from './AuthContext.tsx';
import { useToast } from './ToastContext.tsx';
import type { AppNotification, NotificationListResponse } from '../types/index.ts';

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.get<{ success: boolean; data: NotificationListResponse }>(
        '/notifications',
        { params: { page: 1, limit: 25 } }
      );
      setNotifications(res.data.data.items);
      setUnreadCount(res.data.data.unreadCount);
    } catch {
      // Fail quietly; notifications retry on reconnect or manual refresh
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    unmountedRef.current = false;

    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    void refreshNotifications();

    const connectWebSocket = () => {
      if (unmountedRef.current || !user) return;
      const wsUrl = resolveWebSocketUrl({ token: getStoredAuthToken() || undefined });
      let opened = false;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          opened = true;
          reconnectAttemptRef.current = 0;
          // Re-sync state cleanly upon connect/reconnect
          void refreshNotifications();
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as {
              type?: string;
              notification?: AppNotification;
              notificationId?: string;
            };

            if (payload.type === 'notification:new' && payload.notification) {
              const incoming = payload.notification;
              setNotifications((prev) => {
                if (prev.some((item) => item._id === incoming._id)) {
                  return prev;
                }
                if (!incoming.isRead) {
                  setUnreadCount((count) => count + 1);
                }
                return [incoming, ...prev].slice(0, 50);
              });
              showToast(incoming.title, 'info');
            } else if (payload.type === 'notification:read' && payload.notificationId) {
              const targetId = payload.notificationId;
              setNotifications((prev) => {
                let decremented = false;
                const next = prev.map((item) => {
                  if (item._id === targetId && !item.isRead) {
                    decremented = true;
                    return { ...item, isRead: true, readAt: new Date().toISOString() };
                  }
                  return item;
                });
                if (decremented) {
                  setUnreadCount((count) => Math.max(0, count - 1));
                }
                return next;
              });
            } else if (payload.type === 'notification:read_all') {
              setNotifications((prev) =>
                prev.map((item) => (item.isRead ? item : { ...item, isRead: true }))
              );
              setUnreadCount(0);
            } else if (payload.type === 'notification:cleared_read') {
              setNotifications((prev) => prev.filter((item) => !item.isRead));
            }
          } catch {
            // Ignore malformed socket frames
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (unmountedRef.current || !user) return;

          const scheduleReconnect = () => {
            if (unmountedRef.current || !user) return;
            const attempt = reconnectAttemptRef.current;
            reconnectAttemptRef.current = Math.min(attempt + 1, 6);
            const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
            reconnectTimerRef.current = window.setTimeout(connectWebSocket, delayMs);
          };

          // If the handshake never opened, check whether the session expired (401) before looping
          if (!opened) {
            void apiClient
              .get('/auth/me')
              .then(() => {
                scheduleReconnect();
              })
              .catch((err) => {
                if (err instanceof ApiClientError && err.statusCode === 401) {
                  return;
                }
                scheduleReconnect();
              });
            return;
          }

          scheduleReconnect();
        };

        ws.onerror = () => {
          // Close triggers exponential reconnect
        };
      } catch {
        // Ignore browser WS construction errors in restricted contexts
      }
    };

    connectWebSocket();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, refreshNotifications, showToast]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => {
      let wasUnread = false;
      const next = prev.map((item) => {
        if (item._id === id && !item.isRead) {
          wasUnread = true;
          return { ...item, isRead: true, readAt: new Date().toISOString() };
        }
        return item;
      });
      if (wasUnread) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      return next;
    });

    try {
      await apiClient.patch(`/notifications/${id}/read`);
    } catch {
      await refreshNotifications();
    }
  }, [refreshNotifications]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    try {
      await apiClient.patch('/notifications/read-all');
    } catch {
      await refreshNotifications();
    }
  }, [refreshNotifications]);

  const clearRead = useCallback(async () => {
    setNotifications((prev) => prev.filter((item) => !item.isRead));
    try {
      await apiClient.delete('/notifications/read');
    } catch {
      await refreshNotifications();
    }
  }, [refreshNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        clearRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
