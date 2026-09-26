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

/**
 * Resolves API paths dynamically:
 * - Web (Vercel / Browser): Returns relative path (e.g., `/api/auth/login`)
 * - Native Android (Capacitor): Returns absolute HTTPS URL (e.g., `https://kn-finance-be8m.vercel.app/api/auth/login`)
 *
 * @param path Relative API endpoint path (e.g., '/api/auth/login')
 * @returns Fully resolved API URL
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // On Web: Always use relative path so same-origin requests & Vercel routing operate unchanged
  if (!isNative) {
    return cleanPath;
  }

  // On Native Android: Prepend verified HTTPS backend base URL
  const base = getNativeApiBaseUrl();
  return `${base}${cleanPath}`;
}
