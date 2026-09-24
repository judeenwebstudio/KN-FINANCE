import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

/**
 * Public frontend environment variables for Supabase.
 *
 * Supports current Supabase naming:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY (with backward-compatible fallback to VITE_SUPABASE_ANON_KEY)
 *
 * SECURITY NOTICE:
 * Under NO circumstances should SUPABASE_SERVICE_ROLE_KEY or any privileged
 * secret be used here. Only public URL and publishable keys are permitted in client bundles.
 */
const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawSupabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

/**
 * Checks whether valid Supabase environment variables are provided.
 * Rejects undefined, empty, or default placeholder configurations.
 */
export const isSupabaseConfigured: boolean = Boolean(
  rawSupabaseUrl &&
  rawSupabaseKey &&
  rawSupabaseUrl.startsWith('https://') &&
  rawSupabaseKey.length > 20 &&
  !rawSupabaseUrl.includes('your-project-id')
);

/**
 * Initialized Supabase client typed with KN FINANCE database schema.
 * If credentials are not configured yet, client is null to prevent runtime crashes.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(rawSupabaseUrl as string, rawSupabaseKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface ConnectionHealthResult {
  configured: boolean;
  connected: boolean;
  message: string;
  error?: string;
}

/**
 * Development-safe health check helper.
 * Verifies connectivity without exposing secrets, credentials, or tokens.
 */
export async function checkSupabaseConnection(): Promise<ConnectionHealthResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      configured: false,
      connected: false,
      message: 'Supabase project/environment configuration required. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local',
    };
  }

  try {
    // Test connectivity using a lightweight query with head: true
    const { error } = await supabase.from('companies').select('count', { count: 'exact', head: true });

    if (error) {
      // In an RLS-protected database without an authenticated session,
      // Postgres returns code 42501 (permission denied).
      // This confirms that:
      // 1. Endpoint is reachable
      // 2. Publishable key is accepted
      // 3. Table exists in schema cache (otherwise 404/PGRST205 is returned)
      // 4. RLS / access control is actively protecting data
      if (error.code === '42501') {
        return {
          configured: true,
          connected: true,
          message: 'Supabase connected successfully. Database endpoint and schema verified with RLS active.',
        };
      }

      return {
        configured: true,
        connected: false,
        message: `Supabase reached but returned error: ${error.message}`,
        error: error.message,
      };
    }

    return {
      configured: true,
      connected: true,
      message: 'Supabase connection verified successfully.',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      connected: false,
      message: `Failed to connect to Supabase: ${errorMsg}`,
      error: errorMsg,
    };
  }
}
