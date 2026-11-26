import { buildApiUrl, getStoredAuthToken } from '../utils/apiConfig.ts';

export interface ClientErrorReportPayload {
  severity?: 'WARN' | 'ERROR' | 'FATAL';
  errorCode: string;
  message: string;
  route?: string;
  statusCode?: number;
  stack?: string;
  meta?: Record<string, unknown>;
}

const CLIENT_DEDUP_MS = 15_000;
const recentClientErrors = new Map<string, number>();
let handlersInstalled = false;

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function shouldSkipNoise(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('resizeobserver loop') ||
    normalized.includes('websocket') ||
    normalized.includes('hmr')
  );
}

export function reportClientError(payload: ClientErrorReportPayload): void {
  try {
    if (typeof window === 'undefined' || !payload.message) return;
    if (shouldSkipNoise(payload.message)) return;

    const route = payload.route || `${window.location.pathname}${window.location.search}`;
    if (route.includes('/alerts/client-error')) return;

    const signature = `${payload.severity || 'ERROR'}|${payload.errorCode}|${route}|${payload.message.slice(0, 120)}`;
    const now = Date.now();
    const lastSent = recentClientErrors.get(signature);
    if (typeof lastSent === 'number' && now - lastSent < CLIENT_DEDUP_MS) {
      return;
    }
    recentClientErrors.set(signature, now);
    if (recentClientErrors.size > 100) {
      const oldestKey = recentClientErrors.keys().next().value;
      if (oldestKey) recentClientErrors.delete(oldestKey);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const token = getStoredAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const csrf = getCookieValue('zipit_csrf');
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }

    void fetch(buildApiUrl('/alerts/client-error'), {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers,
      body: JSON.stringify({
        severity: payload.severity || 'ERROR',
        errorCode: payload.errorCode.slice(0, 100),
        message: payload.message.slice(0, 1000),
        route: route.slice(0, 300),
        statusCode: payload.statusCode,
        stack: payload.stack ? payload.stack.slice(0, 2500) : undefined,
        meta: payload.meta,
      }),
    }).catch(() => undefined);
  } catch {
    // Never throw inside error reporter
  }
}

export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined' || handlersInstalled) return;
  handlersInstalled = true;

  window.addEventListener('error', (event) => {
    const err = event.error instanceof Error ? event.error : null;
    const message = err?.message || event.message || 'Unhandled browser script error';
    reportClientError({
      severity: 'ERROR',
      errorCode: 'UI_UNCAUGHT_ERROR',
      message,
      stack: err?.stack,
      meta: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled Promise rejection in browser';
    reportClientError({
      severity: 'ERROR',
      errorCode: 'UI_UNHANDLED_REJECTION',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
