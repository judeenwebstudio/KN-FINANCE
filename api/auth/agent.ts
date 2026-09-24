import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

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
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return res.status(401).json({ error: 'Invalid or expired manager session.' });
    }

    // Authoritatively verify Manager role from cryptographically verified token
    const meta = userData.user.user_metadata || {};
    const companyCode = String(meta.company_code || '').trim().toUpperCase();
    const role = meta.role || '';

    if (role !== 'manager' || !companyCode) {
      return res.status(403).json({ error: 'Forbidden: Only active company Managers can perform this operation.' });
    }

    // 2. Handle POST: Create Agent
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

      // Create Agent Auth Identity in GoTrue
      const internalEmail = `u_agent_${normMobile}_${companyCode.toLowerCase()}@knfinance.internal`;
      let authUserId: string;

      const { data: newAuthUser, error: authCreateErr } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        email_confirm: true,
        user_metadata: {
          role: 'agent',
          full_name: cleanName,
          company_code: companyCode,
        }
      });

      if (newAuthUser?.user) {
        authUserId = newAuthUser.user.id;
      } else {
        const { data: listResp } = await supabaseAdmin.auth.admin.listUsers();
        const existing = listResp?.users?.find(u => u.email === internalEmail);
        if (!existing) {
          console.error('[auth/agent] Failed to create auth user:', authCreateErr?.message);
          return res.status(500).json({ error: 'Could not create cloud auth identity for Agent.' });
        }
        authUserId = existing.id;
      }

      // Execute database-level agent creation transaction using companyCode
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('manager_create_cloud_agent', {
        p_company_code: companyCode,
        p_full_name: cleanName,
        p_mobile: normMobile,
        p_pin: cleanPin,
        p_auth_user_id: authUserId,
      });

      if (rpcErr) {
        console.error('[auth/agent] Create Agent RPC error:', rpcErr.message);
        return res.status(500).json({ error: 'Agent creation failed.' });
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (result.status === 'ERROR') {
        return res.status(400).json({ error: result.message });
      }
      if (result.status === 'UNAUTHORIZED') {
        return res.status(403).json({ error: result.message });
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
        }
      });
    }

    // 3. Handle PATCH: Toggle / Update Agent Status
    if (req.method === 'PATCH') {
      const { agentId, status } = req.body || {};

      if (!agentId) {
        return res.status(400).json({ error: 'agentId is required.' });
      }

      if (status !== 'active' && status !== 'inactive') {
        return res.status(400).json({ error: 'status must be active or inactive.' });
      }

      // Verify target Agent belongs to the same company
      const { data: targetAgent, error: targetErr } = await supabaseAdmin
        .from('company_users')
        .select('id, company_id, auth_user_id, role, full_name')
        .eq('id', agentId)
        .eq('company_id', managerProfile.company_id)
        .single();

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
      if (result.status !== 'SUCCESS') {
        return res.status(400).json({ error: result.message });
      }

      // Handle GoTrue Auth Session / Refresh Token Revocation on Deactivation
      if (targetAgent.auth_user_id) {
        try {
          if (status === 'inactive') {
            // Ban the user in GoTrue to revoke refresh tokens and prevent token refresh
            await supabaseAdmin.auth.admin.updateUserById(targetAgent.auth_user_id, {
              ban_duration: '876000h', // 100 years
            });
          } else {
            // Unban user when reactivated
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
