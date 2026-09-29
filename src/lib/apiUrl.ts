import { isNative } from './nativeBridge';

/**
 * Default production backend origin for KN FINANCE serverless APIs.
 */
const DEFAULT_PROD_API_BASE = 'https://kn-finance-be8m.vercel.app';

/**
 * Resolves the backend base URL for native mobile execution.
 * Allows overriding via VITE_API_BASE_URL for Vercel Preview testing.
 */
export function getNativeApiBaseUrl(): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (envBase) {
    if (!envBase.startsWith('https://')) {
      console.warn('[apiUrl] VITE_API_BASE_URL must use HTTPS in production environments.');
    }
    return envBase.replace(/\/+$/, '');
  }
  return DEFAULT_PROD_API_BASE;
}

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // On Web (running directly on Vercel deployment domain):
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app')) {
    return cleanPath;
  }

  // On Native Android / Capacitor (or localhost WebView execution):
  if (
    isNative ||
    (typeof window !== 'undefined' &&
      (window.location.protocol === 'capacitor:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'))
  ) {
    const base = getNativeApiBaseUrl();
    return `${base}${cleanPath}`;
  }

  return cleanPath;
}
