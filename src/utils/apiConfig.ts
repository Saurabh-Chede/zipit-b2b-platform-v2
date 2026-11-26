export function resolveApiBaseUrl(rawApiUrl?: string): string {
  const value = (rawApiUrl ?? import.meta.env?.VITE_API_URL ?? '').trim();
  if (!value) {
    return '/api/v1';
  }

  const trimmed = value.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) {
    return trimmed;
  }
  return `${trimmed}/api/v1`;
}

export function buildApiUrl(path: string, rawApiUrl?: string): string {
  const base = resolveApiBaseUrl(rawApiUrl);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

const AUTH_TOKEN_STORAGE_KEY = 'zipit_auth_token';
const EXPLICIT_LOGOUT_STORAGE_KEY = 'zipit_logged_out';

export function isExplicitlyLoggedOut(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(EXPLICIT_LOGOUT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setExplicitLogoutFlag(loggedOut: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (loggedOut) {
      window.localStorage.setItem(EXPLICIT_LOGOUT_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(EXPLICIT_LOGOUT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or privacy-mode restrictions
  }
}

export function getStoredAuthToken(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (token && token.trim()) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token.trim());
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or privacy-mode restrictions
  }
}

export function resolveWebSocketUrl(options?: {
  rawWsUrl?: string;
  rawApiUrl?: string;
  locationProtocol?: string;
  locationHost?: string;
  token?: string;
}): string {
  const appendToken = (baseUrl: string) => {
    const token = options?.token?.trim();
    if (!token) return baseUrl;
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}token=${encodeURIComponent(token)}`;
  };

  const rawWsUrl = (options?.rawWsUrl ?? import.meta.env?.VITE_WS_URL ?? '').trim();
  if (rawWsUrl) {
    const trimmed = rawWsUrl.replace(/\/+$/, '');
    if (trimmed.endsWith('/ws/notifications')) {
      return appendToken(trimmed);
    }
    return appendToken(`${trimmed}/ws/notifications`);
  }

  const rawApiUrl = (options?.rawApiUrl ?? import.meta.env?.VITE_API_URL ?? '').trim();
  if (rawApiUrl && /^https?:\/\//i.test(rawApiUrl)) {
    const parsed = new URL(rawApiUrl);
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return appendToken(`${wsProtocol}//${parsed.host}/ws/notifications`);
  }

  const protocol =
    options?.locationProtocol ??
    (typeof window !== 'undefined' ? window.location.protocol : 'http:');
  const host =
    options?.locationHost ??
    (typeof window !== 'undefined' ? window.location.host : 'localhost:3000');
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return appendToken(`${wsProtocol}//${host}/ws/notifications`);
}

export const API_BASE_URL = resolveApiBaseUrl();
