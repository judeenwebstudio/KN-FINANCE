import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase Admin client using server-only credentials
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { companyCode, mobile, pin } = req.body || {};

    // 1. Strict Input Validation & Normalization
    const normCode = String(companyCode || '').trim().toUpperCase();
    const normMobile = String(mobile || '').replace(/\D/g, '');
    const cleanPin = String(pin || '').trim();

    if (!normCode || normCode.length < 2 || normCode.length > 20) {
      return res.status(400).json({ error: 'Invalid company code, mobile number, or PIN.' });
    }

    if (!normMobile || normMobile.length !== 10) {
      return res.status(400).json({ error: 'Invalid company code, mobile number, or PIN.' });
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'Invalid company code, mobile number, or PIN.' });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[auth/login] Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
      return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 2. Dual-Dimension Rate Limiting: Dimension 2 (Client IP Throttling)
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

    // 3. Database-level Verification with Rate Limiting (Dimension 1) & Bcrypt
    const { data, error } = await supabaseAdmin.rpc('verify_cloud_login', {
      p_company_code: normCode,
      p_mobile: normMobile,
      p_pin: cleanPin,
    });

    if (error) {
      console.error('[auth/login] RPC error:', error.message);
      return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
    }

    const authResult = Array.isArray(data) ? data[0] : data;

    if (!authResult) {
      if (clientIp !== 'unknown') {
        await supabaseAdmin.rpc('record_auth_failure', {
          p_lookup_key: ipLookupKey,
          p_max_attempts: 20,
          p_lockout_minutes: 30,
        });
      }
      return res.status(401).json({ error: 'Invalid company code, mobile number, or PIN.' });
    }

    // 4. Handle Account Rate-Limit Lockout
    if (authResult.status === 'LOCKED') {
      if (clientIp !== 'unknown') {
        await supabaseAdmin.rpc('record_auth_failure', {
          p_lookup_key: ipLookupKey,
          p_max_attempts: 20,
          p_lockout_minutes: 30,
        });
      }
      const minutes = Math.max(1, Math.ceil((authResult.lockout_seconds || 900) / 60));
      return res.status(429).json({
        error: `Too many failed login attempts. For security, this account is temporarily locked. Please try again in ${minutes} minutes.`,
        locked: true,
        lockoutSeconds: authResult.lockout_seconds,
      });
    }

    // 5. Handle Invalid Credentials / Inactive User
    if (authResult.status !== 'SUCCESS') {
      if (clientIp !== 'unknown') {
        await supabaseAdmin.rpc('record_auth_failure', {
          p_lookup_key: ipLookupKey,
          p_max_attempts: 20,
          p_lockout_minutes: 30,
        });
      }
      return res.status(401).json({ error: 'Invalid company code, mobile number, or PIN.' });
    }

    // 6. Reset IP failure counter on successful account login
    if (clientIp !== 'unknown') {
      await supabaseAdmin.rpc('record_auth_success', {
        p_lookup_key: ipLookupKey,
      });
    }

    // 7. Establish Supabase Auth Session
    const authUserId = authResult.auth_user_id;
    const internalEmail = `u_${authResult.company_user_id}@knfinance.internal`;

    let userRecord = null;
    if (authUserId) {
      const { data: userResp } = await supabaseAdmin.auth.admin.getUserById(authUserId);
      userRecord = userResp?.user;
    }

    if (!userRecord) {
      // Create confirmed internal user in auth.users
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        email_confirm: true,
        user_metadata: {
          company_user_id: authResult.company_user_id,
          company_id: authResult.company_id,
          role: authResult.role,
        }
      });

      if (createErr || !newUser.user) {
        console.error('[auth/login] Failed to create auth identity:', createErr?.message);
        return res.status(500).json({ error: 'Authentication session generation failed.' });
      }

      userRecord = newUser.user;

      // Link newly created auth user ID back to company_users
      await supabaseAdmin
        .from('company_users')
        .update({ auth_user_id: userRecord.id })
        .eq('id', authResult.company_user_id);
    }

    // Generate authenticated session using admin link verification (no email dispatched)
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userRecord.email || internalEmail,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[auth/login] Failed to generate token link:', linkErr?.message);
      return res.status(500).json({ error: 'Authentication token generation failed.' });
    }

    // Exchange token for full session tokens on the server
    const clientForOtp = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: sessionData, error: sessionErr } = await clientForOtp.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'email',
    });

    if (sessionErr || !sessionData.session) {
      console.error('[auth/login] verifyOtp failed:', sessionErr?.message);
      return res.status(500).json({ error: 'Could not create secure session.' });
    }

    // 8. Return Safe Profile & Session (NEVER return PIN, pin_hash, or internal secrets)
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
        companyUserId: authResult.company_user_id,
        companyId: authResult.company_id,
        companyCode: authResult.company_code,
        companyName: authResult.company_name,
        fullName: authResult.full_name,
        mobile: authResult.mobile,
        role: authResult.role,
        status: authResult.user_status,
      }
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth/login] Unexpected error:', msg);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
}
