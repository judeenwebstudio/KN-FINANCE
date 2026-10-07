import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_EXACT_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'https://kn-finance-be8m.vercel.app',
  'https://kn.ratestack.in',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const VERCEL_PREVIEW_PATTERN = /^https:\/\/kn-finance[a-zA-Z0-9-]*\.vercel\.app$/;

/**
 * Validates if an origin is permitted under strict CORS policy.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (ALLOWED_EXACT_ORIGINS.has(cleanOrigin)) {
    return true;
  }
  return VERCEL_PREVIEW_PATTERN.test(cleanOrigin);
}

/**
 * Handles CORS headers and preflight OPTIONS requests for API routes.
 * @returns true if the request was an OPTIONS preflight and handled, false if execution should continue.
 */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = (req.headers.origin as string) || '';

  if (origin) {
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, apikey, x-bootstrap-secret'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.setHeader('Vary', 'Origin');
    } else {
      if (req.method === 'OPTIONS') {
        res.status(403).json({ error: 'Origin not allowed by CORS policy' });
        return true;
      }
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}
