import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

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

/**
 * Constant-time comparison between provided and expected bootstrap secrets.
 * Uses SHA-256 digest to ensure identical buffer length and prevent timing attacks.
 */
function verifyBootstrapSecret(provided: string, expected: string): boolean {
  if (typeof provided !== 'string' || !provided || typeof expected !== 'string' || !expected) {
    return false;
  }
  const pHash = crypto.createHash('sha256').update(provided).digest();
  const eHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(pHash, eHash);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Mandatory Server-Side Bootstrap Configuration Check (Fail-closed)
    const requiredBootstrapSecret = process.env.MANAGER_BOOTSTRAP_SECRET || '';
    if (!requiredBootstrapSecret) {
      console.error('[auth/bootstrap] Service disabled: MANAGER_BOOTSTRAP_SECRET is not configured on this server.');
      return res.status(503).json({ error: 'Manager bootstrap service is not configured on this server.' });
    }

    // 2. Extract and Authorize Bootstrap Secret (MUST happen BEFORE any database operations or user creation)
    const providedSecret = String(
      req.body?.bootstrapSecret ||
      req.headers['x-bootstrap-secret'] ||
      (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : '') ||
      ''
    ).trim();

    if (!providedSecret || !verifyBootstrapSecret(providedSecret, requiredBootstrapSecret)) {
      return res.status(403).json({ error: 'Unauthorized: Invalid or missing bootstrap authorization secret.' });
    }

    const { companyCode, companyName, ownerName, mobile, email, pin } = req.body || {};

    // 3. Strict Input Validation
    const normCode = String(companyCode || '').trim().toUpperCase();
    const normMobile = String(mobile || '').replace(/\D/g, '');
    const cleanPin = String(pin || '').trim();
    const cleanName = String(ownerName || '').trim();
    const cleanCompanyName = String(companyName || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!normCode || normCode.length < 2 || normCode.length > 20) {
      return res.status(400).json({ error: 'Company Code must be between 2 and 20 alphanumeric characters.' });
    }

    if (!normMobile || normMobile.length !== 10) {
      return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 numeric digits.' });
    }

    if (!cleanCompanyName) {
      return res.status(400).json({ error: 'Company Name is required.' });
    }

    if (!cleanName) {
      return res.status(400).json({ error: 'Manager Full Name is required.' });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[auth/bootstrap] Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.');
      return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 4. IP Throttling on Bootstrap attempts (Max 5 attempts per 60 minutes per IP)
    const clientIp = getClientIp(req);
    const ipLookupKey = 'ip_boot:' + crypto.createHash('sha256').update(clientIp).digest('hex');

    if (clientIp !== 'unknown') {
      const { data: ipLimitData } = await supabaseAdmin.rpc('check_auth_rate_limit', {
        p_lookup_key: ipLookupKey,
      });
      const ipLimit = Array.isArray(ipLimitData) ? ipLimitData[0] : ipLimitData;
      if (ipLimit && ipLimit.is_locked) {
        return res.status(429).json({
          error: 'Too many account creation attempts from this network. Please try again later.',
          locked: true,
          lockoutSeconds: ipLimit.remaining_seconds,
        });
      }
    }

    // 5. Check if Company Already Exists and is Initialized
    const { data: existingCompany, error: findCompErr } = await supabaseAdmin
      .from('companies')
      .select('id, company_code, mobile, email')
      .eq('company_code', normCode)
      .maybeSingle();

    if (findCompErr) {
      console.error('[auth/bootstrap] Error checking company:', findCompErr.message);
      return res.status(500).json({ error: 'Bootstrap service check failed.' });
    }

    if (existingCompany) {
      // Check if any manager or user already exists for this company
      const { data: existingUsers } = await supabaseAdmin
        .from('company_users')
        .select('id, role')
        .eq('company_id', existingCompany.id)
        .limit(1);

      if (existingUsers && existingUsers.length > 0) {
        if (clientIp !== 'unknown') {
          await supabaseAdmin.rpc('record_auth_failure', {
            p_lookup_key: ipLookupKey,
            p_max_attempts: 5,
            p_lockout_minutes: 60,
          });
        }
        return res.status(409).json({
          error: 'Company code is already registered and initialized. Please sign in with your credentials.',
        });
      }
    }

    // 6. Create or Resolve Supabase Auth User
    const internalEmail = `u_${normMobile}_${normCode.toLowerCase()}@knfinance.internal`;
    let authUserId: string;

    const { data: newUser, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      email_confirm: true,
      user_metadata: {
        role: 'manager',
        full_name: cleanName,
        company_code: normCode,
      }
    });

    if (newUser?.user) {
      authUserId = newUser.user.id;
    } else {
      const { data: listResp } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listResp?.users?.find(u => u.email === internalEmail);
      if (!existing) {
        console.error('[auth/bootstrap] Failed to create auth user:', createAuthErr?.message);
        return res.status(500).json({ error: 'Could not create cloud auth identity.' });
      }
      authUserId = existing.id;
    }

    // 7. Execute Database-level Bootstrap Transaction
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('bootstrap_cloud_manager', {
      p_company_code: normCode,
      p_company_name: cleanCompanyName,
      p_owner_name: cleanName,
      p_mobile: normMobile,
      p_email: cleanEmail,
      p_pin: cleanPin,
      p_auth_user_id: authUserId,
    });

    if (rpcErr) {
      console.error('[auth/bootstrap] Bootstrap RPC error:', rpcErr.message);
      return res.status(500).json({ error: 'Manager account bootstrap failed.' });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result || result.status === 'ERROR') {
      return res.status(400).json({ error: result?.message || 'Bootstrap error.' });
    }

    // 8. Generate Authenticated Session (server-side only)
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: internalEmail,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      return res.status(500).json({ error: 'Session generation failed after bootstrap.' });
    }

    const clientForOtp = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: sessionData, error: sessionErr } = await clientForOtp.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    });

    if (sessionErr || !sessionData.session) {
      return res.status(500).json({ error: 'Could not establish authenticated session.' });
    }

    // 9. Return Safe Profile & Session (Zero borrower/payment data migrated)
    return res.status(200).json({
      success: true,
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at,
        expires_in: sessionData.session.expires_in,
        token_type: sessionData.session.token_type,
      },
      user: {
        companyUserId: result.company_user_id,
        companyId: result.company_id,
        companyCode: normCode,
        companyName: cleanCompanyName,
        fullName: cleanName,
        mobile: normMobile,
        role: 'manager',
        status: 'active',
      }
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth/bootstrap] Unexpected error:', msg);
    return res.status(500).json({ error: 'Internal server error during bootstrap.' });
  }
}
