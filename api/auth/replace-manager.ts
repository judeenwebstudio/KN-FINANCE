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

function cleanSecret(s: string): string {
  return String(s || '').trim().replace(/^["']|["']$/g, '');
}

/**
 * Constant-time comparison between provided and expected bootstrap secrets.
 * Uses SHA-256 digest to ensure identical buffer length and prevent timing attacks.
 * Automatically handles whitespace/newline trimming and surrounding quotes.
 */
function verifyBootstrapSecret(provided: string, expected: string): boolean {
  const pClean = cleanSecret(provided);
  const eClean = cleanSecret(expected);
  if (!pClean || !eClean) {
    return false;
  }
  const pHash = crypto.createHash('sha256').update(pClean).digest();
  const eHash = crypto.createHash('sha256').update(eClean).digest();
  return crypto.timingSafeEqual(pHash, eHash);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Mandatory Server-Side Bootstrap Configuration Check (Fail-closed)
    const requiredBootstrapSecret = process.env.MANAGER_BOOTSTRAP_SECRET || '';
    if (!cleanSecret(requiredBootstrapSecret)) {
      console.error('[auth/replace-manager] Service disabled: MANAGER_BOOTSTRAP_SECRET is not configured on this server.');
      return res.status(503).json({ error: 'Manager replacement service is not configured on this server.' });
    }

    // 2. Extract and Authorize Secret (Timing-safe comparison with clean normalization)
    const providedSecret = String(
      req.body?.bootstrapSecret ||
      req.headers['x-bootstrap-secret'] ||
      (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : '') ||
      ''
    );

    if (!verifyBootstrapSecret(providedSecret, requiredBootstrapSecret)) {
      const pLen = cleanSecret(providedSecret).length;
      const eLen = cleanSecret(requiredBootstrapSecret).length;
      console.error(`[auth/replace-manager] Secret check mismatch. Server secret length: ${eLen}, Provided secret length: ${pLen}`);
      return res.status(403).json({
        error: 'Unauthorized: Invalid or missing replacement authorization secret.',
        debug: {
          serverSecretConfigured: eLen > 0,
          providedSecretReceived: pLen > 0,
          serverSecretLength: eLen,
          providedSecretLength: pLen,
          lengthMatched: pLen === eLen,
        }
      });
    }

    const {
      companyCode,
      newFullName,
      newMobile,
      newEmail,
      newPin,
    } = req.body || {};

    // 3. Strict Input Validation & Normalization
    const normCode = String(companyCode || '').trim().toUpperCase();
    const normMobile = String(newMobile || '').replace(/\D/g, '');
    const cleanPin = String(newPin || '').trim();
    const cleanName = String(newFullName || '').trim();
    const cleanEmail = String(newEmail || '').trim().toLowerCase();

    if (!normCode || normCode.length < 2 || normCode.length > 20) {
      return res.status(400).json({ error: 'Company Code must be between 2 and 20 alphanumeric characters.' });
    }

    if (!normMobile || normMobile.length !== 10) {
      return res.status(400).json({ error: 'New Manager mobile number must be exactly 10 digits.' });
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'New Manager PIN must be exactly 4 numeric digits.' });
    }

    if (!cleanName) {
      return res.status(400).json({ error: 'New Manager Full Name is required.' });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[auth/replace-manager] Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.');
      return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 4. IP Throttling on Replacement attempts (Max 5 attempts per 60 minutes per IP)
    const clientIp = getClientIp(req);
    const ipLookupKey = 'ip_repl:' + crypto.createHash('sha256').update(clientIp).digest('hex');

    if (clientIp !== 'unknown') {
      const { data: ipLimitData } = await supabaseAdmin.rpc('check_auth_rate_limit', {
        p_lookup_key: ipLookupKey,
      });
      const ipLimit = Array.isArray(ipLimitData) ? ipLimitData[0] : ipLimitData;
      if (ipLimit && ipLimit.is_locked) {
        return res.status(429).json({
          error: 'Too many administrative requests from this network. Please try again later.',
          locked: true,
          lockoutSeconds: ipLimit.remaining_seconds,
        });
      }
    }

    // 5. Resolve Target Company
    const { data: company, error: compErr } = await supabaseAdmin
      .from('companies')
      .select('id, company_code, company_name')
      .eq('company_code', normCode)
      .maybeSingle();

    if (compErr || !company) {
      if (clientIp !== 'unknown') {
        await supabaseAdmin.rpc('record_auth_failure', {
          p_lookup_key: ipLookupKey,
          p_max_attempts: 5,
          p_lockout_minutes: 60,
        });
      }
      return res.status(404).json({ error: 'Target company not found.' });
    }

    // 6. Resolve Current Active Manager
    const { data: currentManager, error: mgrErr } = await supabaseAdmin
      .from('company_users')
      .select('id, company_id, auth_user_id, full_name, mobile, role, status')
      .eq('company_id', company.id)
      .eq('role', 'manager')
      .eq('status', 'active')
      .maybeSingle();

    if (mgrErr || !currentManager) {
      return res.status(409).json({ error: 'No active Manager found for this company to replace.' });
    }

    // 7. Idempotency & Conflict Check
    // If the active manager already has the requested mobile number and name:
    if (currentManager.mobile === normMobile && currentManager.full_name === cleanName) {
      return res.status(200).json({
        success: true,
        alreadyReplaced: true,
        companyId: company.id,
        companyUserId: currentManager.id,
        message: 'Manager is already active with the requested identity.',
      });
    }

    // Check if new mobile belongs to an existing Agent in the same company
    const { data: existingAgent } = await supabaseAdmin
      .from('company_users')
      .select('id, full_name, role, status')
      .eq('company_id', company.id)
      .eq('mobile', normMobile)
      .maybeSingle();

    if (existingAgent && existingAgent.id !== currentManager.id) {
      return res.status(409).json({
        error: `Mobile number ${normMobile} is already registered to user "${existingAgent.full_name}" (${existingAgent.role}) in this company. Cannot overwrite existing agent.`,
      });
    }

    // 8. Create NEW GoTrue Auth Identity
    const internalEmail = `u_mgr_${normMobile}_${normCode.toLowerCase()}@knfinance.internal`;
    let newAuthUserId = '';

    const { data: newAuthUser, error: authCreateErr } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      email_confirm: true,
      user_metadata: {
        role: 'manager',
        full_name: cleanName,
        company_code: normCode,
      },
    });

    if (newAuthUser?.user) {
      newAuthUserId = newAuthUser.user.id;
    } else {
      // If user exists in GoTrue from a prior partial attempt, reuse or inspect
      const { data: listResp } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listResp?.users?.find((u) => u.email === internalEmail);
      if (existing) {
        newAuthUserId = existing.id;
      } else {
        console.error('[auth/replace-manager] Failed to create GoTrue auth identity:', authCreateErr?.message);
        return res.status(500).json({ error: 'Could not create cloud authentication identity for new Manager.' });
      }
    }

    // 9. Execute Atomic PostgreSQL RPC: replace_company_manager
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('replace_company_manager', {
      p_company_id: company.id,
      p_old_manager_id: currentManager.id,
      p_new_auth_user_id: newAuthUserId,
      p_new_full_name: cleanName,
      p_new_mobile: normMobile,
      p_new_email: cleanEmail,
      p_new_pin: cleanPin,
    });

    // 10. Compensation on RPC Failure
    if (rpcErr) {
      console.error('[auth/replace-manager] RPC error, initiating rollback compensation:', rpcErr.message);
      // Delete newly created auth user so no orphaned auth user remains
      if (newAuthUserId) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        } catch (compErr: unknown) {
          const compMsg = compErr instanceof Error ? compErr.message : String(compErr);
          console.error('[auth/replace-manager] Auth compensation warning:', compMsg);
        }
      }
      return res.status(500).json({ error: 'Database transaction failed during Manager replacement.' });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    if (!result || result.status !== 'SUCCESS') {
      console.error('[auth/replace-manager] RPC returned non-success, compensating:', result?.message);
      if (newAuthUserId) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        } catch (compErr: unknown) {
          const compMsg = compErr instanceof Error ? compErr.message : String(compErr);
          console.error('[auth/replace-manager] Auth compensation warning:', compMsg);
        }
      }
      return res.status(400).json({ error: result?.message || 'Manager replacement rejected by database rules.' });
    }

    // 11. Revoke / Invalidate Old Manager Supabase Auth Identity
    let oldAuthRevoked = false;
    if (currentManager.auth_user_id) {
      const { error: oldAuthDelErr } = await supabaseAdmin.auth.admin.deleteUser(currentManager.auth_user_id);
      if (oldAuthDelErr) {
        console.error('[auth/replace-manager] Warning: Failed to delete old manager GoTrue auth identity:', oldAuthDelErr.message);
      } else {
        oldAuthRevoked = true;
      }
    }

    // 12. Reset IP throttle on success
    if (clientIp !== 'unknown') {
      await supabaseAdmin.rpc('record_auth_success', {
        p_lookup_key: ipLookupKey,
      });
    }

    // 13. Return Minimal Success Response (NEVER return PIN, pin_hash, or internal secrets)
    return res.status(200).json({
      success: true,
      companyId: result.company_id,
      newCompanyUserId: result.new_company_user_id,
      oldCompanyUserId: result.old_company_user_id,
      oldAuthRevoked,
      message: 'Manager replaced successfully.',
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth/replace-manager] Unexpected exception:', msg);
    return res.status(500).json({ error: 'Internal server error during Manager replacement.' });
  }
}
