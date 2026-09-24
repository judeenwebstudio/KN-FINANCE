/**
 * KN FINANCE — Cloud Authentication Client Service
 *
 * Provides client-side helpers for Company Code + Mobile + 4-Digit PIN authentication.
 * All sensitive credential hashing, rate-limiting, and verification occurs strictly
 * on the trusted server-side (Vercel Serverless / PostgreSQL engine).
 *
 * Direct RPC execution from browser roles is completely disabled.
 * Raw PIN material is never persisted or retained.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { AuthUserSession } from '../types';

export interface LoginResult {
  success: boolean;
  user?: AuthUserSession;
  error?: string;
  isLocked?: boolean;
}

export interface BootstrapResult {
  success: boolean;
  user?: AuthUserSession;
  error?: string;
}

export interface AgentResult {
  success: boolean;
  agent?: {
    id: string;
    fullName: string;
    mobile: string;
    role: 'agent';
    status: 'active' | 'inactive';
    createdAt: string;
  };
  error?: string;
}

// In-flight request lock to prevent duplicate concurrent submissions
let isAuthenticating = false;

/**
 * Normalizes company code: uppercase and trimmed.
 */
export function normalizeCompanyCode(code: string): string {
  return (code || '').trim().toUpperCase();
}

/**
 * Normalizes mobile number: strips all non-numeric characters.
 */
export function normalizeMobile(mobile: string): string {
  return (mobile || '').replace(/\D/g, '');
}

/**
 * Validates 4-digit PIN format strictly.
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test((pin || '').trim());
}

/**
 * Authenticates a Manager or Agent using Company Code + Mobile + 4-digit PIN.
 * Communicates ONLY with the trusted server-side /api/auth/login endpoint.
 * NEVER falls back silently to local authentication or direct client RPC.
 */
export async function loginWithPin(
  companyCode: string,
  mobile: string,
  pin: string,
  keepLoggedIn: boolean = true
): Promise<LoginResult> {
  if (isAuthenticating) {
    return { success: false, error: 'Authentication already in progress. Please wait.' };
  }

  const normCode = normalizeCompanyCode(companyCode);
  const normMobile = normalizeMobile(mobile);
  const cleanPin = (pin || '').trim();

  // Client-side format checks (prevents unnecessary roundtrips on blatant typos)
  if (!normCode || normCode.length < 2) {
    return { success: false, error: 'Please enter a valid Company Code.' };
  }
  if (!normMobile || normMobile.length !== 10) {
    return { success: false, error: 'Mobile Number must be exactly 10 digits.' };
  }
  if (!isValidPin(cleanPin)) {
    return { success: false, error: 'PIN must be exactly 4 numeric digits.' };
  }

  isAuthenticating = true;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: normCode,
        mobile: normMobile,
        pin: cleanPin,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success) {
      if (data.session && supabase) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      if (!keepLoggedIn) {
        sessionStorage.setItem('kn_finance_session_only', 'true');
      } else {
        sessionStorage.removeItem('kn_finance_session_only');
      }

      return {
        success: true,
        user: data.user,
      };
    }

    return {
      success: false,
      error: data.error || 'Invalid company code, mobile number, or PIN.',
      isLocked: data.locked || response.status === 429,
    };

  } catch {
    return {
      success: false,
      error: 'Authentication service is unreachable. Please check your internet connection.',
    };
  } finally {
    isAuthenticating = false;
  }
}

/**
 * Bootstraps the first Cloud Manager account for a company.
 * Only callable via trusted /api/auth/bootstrap serverless endpoint.
 */
export async function bootstrapCloudManager(params: {
  companyCode: string;
  companyName: string;
  ownerName: string;
  mobile: string;
  email: string;
  pin: string;
  bootstrapSecret?: string;
}): Promise<BootstrapResult> {
  const normCode = normalizeCompanyCode(params.companyCode);
  const normMobile = normalizeMobile(params.mobile);
  const cleanPin = (params.pin || '').trim();

  if (!normCode || normCode.length < 2) {
    return { success: false, error: 'Company Code must be at least 2 characters.' };
  }
  if (!normMobile || normMobile.length !== 10) {
    return { success: false, error: 'Mobile number must be exactly 10 digits.' };
  }
  if (!isValidPin(cleanPin)) {
    return { success: false, error: 'PIN must be exactly 4 numeric digits.' };
  }

  try {
    const response = await fetch('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyCode: normCode,
        companyName: params.companyName.trim(),
        ownerName: params.ownerName.trim(),
        mobile: normMobile,
        email: params.email.trim(),
        pin: cleanPin,
        bootstrapSecret: params.bootstrapSecret,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success) {
      if (data.session && supabase) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      return {
        success: true,
        user: data.user,
      };
    }

    return {
      success: false,
      error: data.error || 'Manager bootstrap failed.',
    };
  } catch {
    return {
      success: false,
      error: 'Bootstrap service is unreachable. Please check your internet connection.',
    };
  }
}

/**
 * Creates a new cloud Agent within the Manager's company.
 * Enforces authoritative Manager JWT verification on the server.
 */
export async function createCloudAgent(params: {
  fullName: string;
  mobile: string;
  pin: string;
}): Promise<AgentResult> {
  if (!supabase) {
    return { success: false, error: 'Cloud service not available.' };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Authentication required.' };
  }

  try {
    const response = await fetch('/api/auth/agent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        fullName: params.fullName.trim(),
        mobile: normalizeMobile(params.mobile),
        pin: params.pin.trim(),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success) {
      return { success: true, agent: data.agent };
    }

    return { success: false, error: data.error || 'Failed to create agent.' };
  } catch {
    return { success: false, error: 'Agent management service unreachable.' };
  }
}

/**
 * Modifies an Agent's active/inactive status.
 * Enforces authoritative Manager JWT verification on the server.
 */
export async function setCloudAgentStatus(
  agentId: string,
  status: 'active' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Cloud service not available.' };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Authentication required.' };
  }

  try {
    const response = await fetch('/api/auth/agent', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ agentId, status }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.success) {
      return { success: true };
    }

    return { success: false, error: data.error || 'Failed to update agent status.' };
  } catch {
    return { success: false, error: 'Agent management service unreachable.' };
  }
}

/**
 * Restores an existing authenticated session from Supabase on app startup.
 * Automatically verifies that the user is still marked 'active'.
 * If the user has been deactivated, immediately signs out and returns null.
 */
export async function restoreCloudSession(): Promise<AuthUserSession | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session) {
      return null;
    }

    // Verify session user in company_users via RLS helper
    const client = supabase as any;
    const { data: userProfile, error: profileErr } = await client
      .from('company_users')
      .select('id, company_id, full_name, mobile, role, status, companies(company_code, company_name)')
      .eq('auth_user_id', session.user.id)
      .eq('status', 'active')
      .single();

    if (profileErr || !userProfile) {
      // Inactive account or unlinked user: immediately sign out from cloud
      await supabase.auth.signOut();
      sessionStorage.removeItem('kn_finance_session_only');
      return null;
    }

    const companyData = Array.isArray(userProfile.companies)
      ? userProfile.companies[0]
      : userProfile.companies;

    return {
      companyUserId: userProfile.id,
      companyId: userProfile.company_id,
      companyCode: companyData?.company_code || '',
      companyName: companyData?.company_name || '',
      fullName: userProfile.full_name,
      mobile: userProfile.mobile,
      role: userProfile.role as 'manager' | 'agent',
      status: userProfile.status as 'active' | 'inactive',
    };
  } catch {
    return null;
  }
}

/**
 * Signs out from Supabase cloud authentication.
 */
export async function signOutOfCloud(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors during signout
    }
  }
  sessionStorage.removeItem('kn_finance_session_only');
}
