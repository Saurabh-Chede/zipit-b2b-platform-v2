import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { reportClientError } from './errorReporter.ts';
import { API_BASE_URL, getStoredAuthToken, setStoredAuthToken } from '../utils/apiConfig.ts';

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly requestId?: string;

  constructor(message: string, statusCode = 500, errorCode = 'REQUEST_FAILED', requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.requestId = requestId;
  }
}

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredAuthToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  const csrf = getCookieValue('zipit_csrf');
  if (csrf) {
    config.headers.set('X-CSRF-Token', csrf);
  }
  config.headers.set('X-Requested-With', 'XMLHttpRequest');
  return config;
});

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; errorCode?: string; requestId?: string }>) => {
    const config = error.config as RetryConfig | undefined;
    const method = (config?.method || 'get').toLowerCase();
    const status = error.response?.status;

    // Retry only safe GET requests on transient 502/503/network errors
    const isTransient = !error.response || status === 502 || status === 503;
    if (config && method === 'get' && isTransient && (config._retryCount ?? 0) < 1) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      await new Promise((r) => setTimeout(r, 400));
      return apiClient.request(config);
    }

    const serverMsg = error.response?.data?.message;
    const errorCode = error.response?.data?.errorCode || 'REQUEST_FAILED';
    const requestId = error.response?.data?.requestId;

    const friendlyMessage =
      serverMsg ||
      (status === 401
        ? 'Your session has expired. Please sign in again.'
        : status === 403
          ? 'You do not have permission to perform this action.'
          : status && status >= 500
            ? 'A server error occurred. Please try again shortly.'
            : 'Unable to reach the server. Please check your connection.');

    const requestUrl = config?.url || '';
    const isAuthProbe = requestUrl.includes('/auth/me') && status === 401;
    const isAlertEndpoint = requestUrl.includes('/alerts/client-error');

    if (
      status === 401 &&
      !requestUrl.includes('/auth/login') &&
      errorCode !== 'INVALID_CURRENT_PASSWORD' &&
      errorCode !== 'INVALID_CREDENTIALS'
    ) {
      setStoredAuthToken(null);
    }

    if (!isAlertEndpoint && !isAuthProbe) {
      // Only send client-side reports when backend wasn't reached (network failure/502/503)
      // or when an explicit client/UX API error happens that might indicate UI payload mismatch
      if (!error.response || status === 502 || status === 503 || status === 504) {
        reportClientError({
          severity: 'ERROR',
          errorCode: 'API_NETWORK_OR_GATEWAY_FAILURE',
          message: `${method.toUpperCase()} ${requestUrl}: ${friendlyMessage}`,
          route: requestUrl,
          statusCode: status || 503,
        });
      }
    }

    return Promise.reject(new ApiClientError(friendlyMessage, status || 500, errorCode, requestId));
  }
);

export function extractErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
