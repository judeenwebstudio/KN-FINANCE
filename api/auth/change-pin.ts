import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getClientIp(req: VercelRequest): string {
  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Authoritatively Authenticate Caller via Bearer Token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Authentication token is required.' });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[auth/change-pin] Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.');
      return res.status(500).json({ error: 'Change PIN service is temporarily unavailable.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    const authUserId = userData.user.id;

    // 2. Validate Request Body
    const { currentPin, newPin } = req.body || {};
    const cleanCurr = String(currentPin || '').trim();
    const cleanNew = String(newPin || '').trim();

    if (!cleanCurr) {
      return res.status(400).json({ error: 'Current PIN is required.' });
    }

    if (!/^\d{4}$/.test(cleanCurr)) {
      return res.status(400).json({ error: 'Current PIN must be exactly 4 numeric digits.' });
    }

    if (!cleanNew) {
      return res.status(400).json({ error: 'New PIN is required.' });
    }

    if (!/^\d{4}$/.test(cleanNew)) {
      return res.status(400).json({ error: 'New PIN must be exactly 4 numeric digits.' });
    }

    if (cleanCurr === cleanNew) {
      return res.status(400).json({ error: 'New PIN must be different from current PIN.' });
    }

    // 3. Client IP Rate Limiting Check
    const clientIp = getClientIp(req);
    const ipLookupKey = 'ip:' + crypto.createHash('sha256').update(clientIp).digest('hex');

    if (clientIp !== 'unknown') {
      const { data: ipLimitData } = await supabaseAdmin.rpc('check_auth_rate_limit', {
        p_lookup_key: ipLookupKey,
      });
      const ipLimit = Array.isArray(ipLimitData) ? ipLimitData[0] : ipLimitData;
      if (ipLimit && ipLimit.is_locked) {
        return res.status(429).json({
          error: 'Too many requests from this network. Please try again later.',
          locked: true,
          lockoutSeconds: ipLimit.remaining_seconds,
        });
      }
    }

    // 4. Primary Identity Check & Narrowly Scoped Server-Controlled Legacy Linkage Repair
    // Check if the authenticated user is already directly linked in company_users
    const { data: directUser, error: directErr } = await supabaseAdmin
      .from('company_users')
      .select('id, company_id, status')
      .eq('auth_user_id', authUserId)
      .eq('status', 'active')
      .maybeSingle();

    if (directErr) {
      console.error('[auth/change-pin] Database query error on direct identity check:', directErr.message);
      return res.status(500).json({ error: 'Failed to verify account identity. Please try again.' });
    }

    // If unlinked in company_users (e.g. legacy Manager), perform server-controlled repair
    if (!directUser) {
      let trustedCompanyUserId: string | null = null;

      // Evidence 1 (Preferred): Server-controlled app_metadata (immutable by client)
      if (typeof userData.user.app_metadata?.company_user_id === 'string' && userData.user.app_metadata.company_user_id.trim()) {
        trustedCompanyUserId = userData.user.app_metadata.company_user_id.trim();
      }
      // Evidence 2 (Legacy Migration Only): Server-generated internal email format
      else if (typeof userData.user.email === 'string') {
        const emailMatch = userData.user.email.match(/^u_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@knfinance\.internal$/i);
        if (emailMatch) {
          trustedCompanyUserId = emailMatch[1].toLowerCase();
        }
      }

      // NOTE: user_metadata is client-editable and is strictly NOT used for identity repair.
      // NOTE: Request body and query parameters are never trusted.

      if (!trustedCompanyUserId) {
        return res.status(403).json({
          success: false,
          error: 'User session is not associated with an authoritative company profile. Please log in again.',
        });
      }

      const { data: repairData, error: repairErr } = await supabaseAdmin.rpc('repair_auth_user_linkage', {
        p_trusted_company_user_id: trustedCompanyUserId,
        p_auth_user_id: authUserId,
      });

      if (repairErr) {
        console.error('[auth/change-pin] Identity linkage check error:', repairErr.message);
        return res.status(500).json({ error: 'Failed to verify account identity. Please try again.' });
      }

      const repairResult = Array.isArray(repairData) ? repairData[0] : repairData;

      if (!repairResult || repairResult.status !== 'SUCCESS') {
        const status = repairResult?.status;
        if (status === 'UNAUTHORIZED' || status === 'NOT_FOUND') {
          return res.status(403).json({
            success: false,
            error: 'User account is inactive or session identity is invalid.',
          });
        }
        if (status === 'CONFLICT') {
          return res.status(409).json({
            success: false,
            error: 'Account identity conflict detected. Please log out and log in again.',
          });
        }
        return res.status(400).json({
          success: false,
          error: 'Unable to verify account linkage. Please contact support.',
        });
      }
    }

    // 5. Execute Hardened Change PIN Stored Function (Strict auth.uid() Resolution)
    const { data, error: rpcErr } = await supabaseAdmin.rpc('change_user_pin', {
      p_current_pin: cleanCurr,
      p_new_pin: cleanNew,
      p_auth_user_id: authUserId,
    });

    if (rpcErr) {
      console.error('[auth/change-pin] RPC error:', rpcErr.message);
      return res.status(500).json({ error: 'Failed to process PIN change. Please try again.' });
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      return res.status(500).json({ error: 'Unexpected server response. Please try again.' });
    }

    switch (result.status) {
      case 'SUCCESS':
        return res.status(200).json({
          success: true,
          message: result.message || 'PIN changed successfully.',
        });

      case 'LOCKED':
        if (clientIp !== 'unknown') {
          await supabaseAdmin.rpc('record_auth_failure', {
            p_lookup_key: ipLookupKey,
            p_max_attempts: 10,
            p_lockout_minutes: 15,
          });
        }
        return res.status(429).json({
          success: false,
          error: result.message || 'Account is temporarily locked.',
          locked: true,
          lockoutSeconds: result.lockout_seconds,
        });

      case 'INVALID_CREDENTIALS':
        if (clientIp !== 'unknown') {
          await supabaseAdmin.rpc('record_auth_failure', {
            p_lookup_key: ipLookupKey,
            p_max_attempts: 10,
            p_lockout_minutes: 15,
          });
        }
        return res.status(400).json({
          success: false,
          error: result.message || 'Current PIN is incorrect.',
        });

      case 'SAME_PIN':
        return res.status(400).json({
          success: false,
          error: result.message || 'New PIN must be different from current PIN.',
        });

      case 'INVALID_INPUT':
        return res.status(400).json({
          success: false,
          error: result.message || 'PIN must be exactly 4 numeric digits.',
        });

      case 'UNAUTHORIZED':
        return res.status(403).json({
          success: false,
          error: result.message || 'Unauthorized.',
        });

      default:
        return res.status(400).json({
          success: false,
          error: result.message || 'Could not change PIN.',
        });
    }
  } catch (error: any) {
    console.error('[auth/change-pin] Unhandled error:', error?.message || error);
    return res.status(500).json({ error: 'Internal server error while changing PIN.' });
  }
}
