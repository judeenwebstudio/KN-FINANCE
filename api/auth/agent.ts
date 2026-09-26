import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Authoritatively Authenticate Caller using Bearer token
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Authentication token is required.' });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Server authentication configuration is missing.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return res.status(401).json({ error: 'Invalid or expired manager session.' });
    }

    const authUserId = userData.user.id;

    // 2. Authoritatively verify Manager role & company from company_users (NOT client-provided metadata)
    let { data: managerProfile, error: mgrErr } = await supabaseAdmin
      .from('company_users')
      .select('id, company_id, full_name, mobile, role, status, companies(id, company_code, company_name)')
      .eq('auth_user_id', authUserId)
      .eq('status', 'active')
      .maybeSingle();

    if (mgrErr) {
      console.error('[auth/agent] Database query error verifying manager:', mgrErr.message);
      return res.status(500).json({ error: 'Failed to verify manager identity.' });
    }

    // Handle unlinked legacy manager session repair if necessary
    if (!managerProfile) {
      let trustedCompanyUserId: string | null = null;
      if (typeof userData.user.app_metadata?.company_user_id === 'string' && userData.user.app_metadata.company_user_id.trim()) {
        trustedCompanyUserId = userData.user.app_metadata.company_user_id.trim();
      } else if (typeof userData.user.email === 'string') {
        const emailMatch = userData.user.email.match(/^u_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@knfinance\.internal$/i);
        if (emailMatch) {
          trustedCompanyUserId = emailMatch[1].toLowerCase();
        }
      }

      if (trustedCompanyUserId) {
        const { data: repairData, error: repairErr } = await supabaseAdmin.rpc('repair_auth_user_linkage', {
          p_trusted_company_user_id: trustedCompanyUserId,
          p_auth_user_id: authUserId,
        });

        if (!repairErr && Array.isArray(repairData) ? repairData[0]?.status === 'SUCCESS' : repairData?.status === 'SUCCESS') {
          const { data: refetchedProfile } = await supabaseAdmin
            .from('company_users')
            .select('id, company_id, full_name, mobile, role, status, companies(id, company_code, company_name)')
            .eq('auth_user_id', authUserId)
            .eq('status', 'active')
            .maybeSingle();
          managerProfile = refetchedProfile;
        }
      }
    }

    if (!managerProfile || managerProfile.role !== 'manager' || managerProfile.status !== 'active') {
      return res.status(403).json({ error: 'Forbidden: Only active company Managers can perform this operation.' });
    }

    const companyData = Array.isArray(managerProfile.companies)
      ? managerProfile.companies[0]
      : managerProfile.companies;
    const companyCode = String(companyData?.company_code || '').trim().toUpperCase();

    if (!companyCode || !managerProfile.company_id) {
      return res.status(403).json({ error: 'Forbidden: No active company found for this manager.' });
    }

    // 3. Handle POST: Create Agent
    if (req.method === 'POST') {
      const { fullName, mobile, pin } = req.body || {};

      const cleanName = String(fullName || '').trim();
      const normMobile = String(mobile || '').replace(/\D/g, '');
      const cleanPin = String(pin || '').trim();

      if (!cleanName) {
        return res.status(400).json({ error: 'Agent Full Name is required.' });
      }

      if (!normMobile || normMobile.length !== 10) {
        return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
      }

      if (!/^\d{4}$/.test(cleanPin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 numeric digits.' });
      }

      if (managerProfile.mobile && managerProfile.mobile.replace(/\D/g, '') === normMobile) {
        return res.status(400).json({ error: 'Mobile number cannot be the same as the Manager’s mobile number.' });
      }

      // Create Agent Auth Identity in GoTrue
      const internalEmail = `u_agent_${normMobile}_${companyCode.toLowerCase()}@knfinance.internal`;
      let agentAuthUserId: string;

      const { data: newAuthUser, error: authCreateErr } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        email_confirm: true,
        user_metadata: {
          role: 'agent',
          full_name: cleanName,
          company_code: companyCode,
        },
      });

      if (newAuthUser?.user) {
        agentAuthUserId = newAuthUser.user.id;
      } else {
        const { data: listResp } = await supabaseAdmin.auth.admin.listUsers();
        const existing = listResp?.users?.find((u) => u.email === internalEmail);
        if (!existing) {
          console.error('[auth/agent] Failed to create auth user:', authCreateErr?.message);
          return res.status(500).json({ error: 'Could not create cloud auth identity for Agent.' });
        }
        agentAuthUserId = existing.id;
      }

      // Execute database-level agent creation transaction using companyCode
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('manager_create_cloud_agent', {
        p_company_code: companyCode,
        p_full_name: cleanName,
        p_mobile: normMobile,
        p_pin: cleanPin,
        p_auth_user_id: agentAuthUserId,
      });

      if (rpcErr) {
        console.error('[auth/agent] Create Agent RPC error:', rpcErr.message);
        return res.status(500).json({ error: 'Agent creation failed.' });
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!result || result.status === 'ERROR') {
        return res.status(400).json({ error: result?.message || 'Agent creation failed.' });
      }
      if (result.status === 'UNAUTHORIZED') {
        return res.status(403).json({ error: result?.message || 'Unauthorized.' });
      }

      return res.status(201).json({
        success: true,
        agent: {
          id: result.agent_id,
          fullName: cleanName,
          mobile: normMobile,
          role: 'agent',
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      });
    }

    // 4. Handle PATCH: Toggle / Update Agent Status
    if (req.method === 'PATCH') {
      const { agentId, status } = req.body || {};

      if (!agentId) {
        return res.status(400).json({ error: 'agentId is required.' });
      }

      if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ error: 'status must be active or inactive.' });
      }

      // Verify target Agent belongs to the manager's company
      const { data: targetAgent, error: targetErr } = await supabaseAdmin
        .from('company_users')
        .select('id, company_id, auth_user_id, role, full_name')
        .eq('id', agentId)
        .eq('company_id', managerProfile.company_id)
        .maybeSingle();

      if (targetErr || !targetAgent) {
        return res.status(404).json({ error: 'Agent not found in your company.' });
      }

      if (targetAgent.role !== 'agent') {
        return res.status(400).json({ error: 'Cannot modify Manager status using this operation.' });
      }

      // Execute database-level status update
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('manager_set_agent_status', {
        p_manager_user_id: managerProfile.id,
        p_agent_id: agentId,
        p_status: status,
      });

      if (rpcErr) {
        console.error('[auth/agent] Set Status RPC error:', rpcErr.message);
        return res.status(500).json({ error: 'Status update failed.' });
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!result || result.status !== 'SUCCESS') {
        return res.status(400).json({ error: result?.message || 'Status update failed.' });
      }

      // Handle GoTrue Auth Session / Refresh Token Revocation on Deactivation
      if (targetAgent.auth_user_id) {
        try {
          if (status === 'inactive') {
            await supabaseAdmin.auth.admin.updateUserById(targetAgent.auth_user_id, {
              ban_duration: '876000h', // 100 years
            });
          } else {
            await supabaseAdmin.auth.admin.updateUserById(targetAgent.auth_user_id, {
              ban_duration: 'none',
            });
          }
        } catch (banErr) {
          console.error('[auth/agent] Warning: Could not update GoTrue user ban state:', banErr);
        }
      }

      return res.status(200).json({
        success: true,
        message: result.message,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth/agent] Unexpected error:', msg);
    return res.status(500).json({ error: 'Internal server error processing agent request.' });
  }
}
