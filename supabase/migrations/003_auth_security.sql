-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 003 (REVISED & HARDENED)
-- Phase 2 / Step 2: Cloud Authentication Security, Rate Limiting & User Management
-- ==============================================================================

-- 1. Enable Required Extensions (Idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. AUTH_RATE_LIMITS (Brute-Force & Guessing Protection)
-- Tracks consecutive failed login attempts per normalized lookup_key (account or IP).
-- Automatically enforces temporary lockout after repeated failures.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key TEXT UNIQUE NOT NULL, -- SHA-256 hash of normalized 'COMPANY_CODE:MOBILE' or 'ip:IP_ADDRESS'
  failed_attempts INT NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup_key ON auth_rate_limits(lookup_key);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_locked_until ON auth_rate_limits(locked_until);

-- Attach standard updated_at trigger
DROP TRIGGER IF EXISTS set_auth_rate_limits_updated_at ON auth_rate_limits;
CREATE TRIGGER set_auth_rate_limits_updated_at
BEFORE UPDATE ON auth_rate_limits
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Enable Row Level Security: Deny all direct client access (only server-side service_role may access)
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct client access to auth_rate_limits" ON auth_rate_limits;
CREATE POLICY "Deny all direct client access to auth_rate_limits"
ON auth_rate_limits
FOR ALL
TO authenticated, anon
USING (false);

-- ------------------------------------------------------------------------------
-- 3. Rate-Limiting Stored Functions (SECURITY DEFINER, Fixed search_path)
-- ------------------------------------------------------------------------------

-- Generate lookup key from company code and mobile
CREATE OR REPLACE FUNCTION get_auth_lookup_key(
  p_company_code TEXT,
  p_mobile TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_norm_code TEXT := UPPER(TRIM(COALESCE(p_company_code, '')));
  v_norm_mobile TEXT := REGEXP_REPLACE(COALESCE(p_mobile, ''), '\D', '', 'g');
BEGIN
  RETURN encode(digest(v_norm_code || ':' || v_norm_mobile, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, extensions;

-- Check rate limit and lockout status
CREATE OR REPLACE FUNCTION check_auth_rate_limit(
  p_lookup_key TEXT
)
RETURNS TABLE (
  is_locked BOOLEAN,
  remaining_seconds INT
) AS $$
DECLARE
  v_rec RECORD;
  v_rem INT := 0;
BEGIN
  SELECT failed_attempts, locked_until
  INTO v_rec
  FROM auth_rate_limits
  WHERE lookup_key = p_lookup_key;

  IF FOUND AND v_rec.locked_until IS NOT NULL AND v_rec.locked_until > NOW() THEN
    v_rem := CEIL(EXTRACT(EPOCH FROM (v_rec.locked_until - NOW())))::INT;
    RETURN QUERY SELECT true, v_rem;
  ELSE
    RETURN QUERY SELECT false, 0;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

-- Record a failed login attempt; lock out if threshold reached (5 attempts -> 15 min lock)
CREATE OR REPLACE FUNCTION record_auth_failure(
  p_lookup_key TEXT,
  p_max_attempts INT DEFAULT 5,
  p_lockout_minutes INT DEFAULT 15
)
RETURNS TABLE (
  is_now_locked BOOLEAN,
  remaining_seconds INT
) AS $$
DECLARE
  v_attempts INT := 1;
  v_locked_until TIMESTAMPTZ := NULL;
  v_rem INT := 0;
BEGIN
  -- Insert or increment attempt counter
  INSERT INTO auth_rate_limits (lookup_key, failed_attempts, last_failed_at, locked_until)
  VALUES (p_lookup_key, 1, NOW(), NULL)
  ON CONFLICT (lookup_key) DO UPDATE
  SET 
    -- If previously expired lockout, reset counter to 1
    failed_attempts = CASE 
      WHEN auth_rate_limits.locked_until IS NOT NULL AND auth_rate_limits.locked_until <= NOW() THEN 1
      ELSE auth_rate_limits.failed_attempts + 1
    END,
    last_failed_at = NOW(),
    locked_until = CASE
      WHEN (CASE 
              WHEN auth_rate_limits.locked_until IS NOT NULL AND auth_rate_limits.locked_until <= NOW() THEN 1
              ELSE auth_rate_limits.failed_attempts + 1
            END) >= p_max_attempts
      THEN NOW() + (p_lockout_minutes || ' minutes')::INTERVAL
      ELSE NULL
    END
  RETURNING failed_attempts, auth_rate_limits.locked_until INTO v_attempts, v_locked_until;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    v_rem := CEIL(EXTRACT(EPOCH FROM (v_locked_until - NOW())))::INT;
    RETURN QUERY SELECT true, v_rem;
  ELSE
    RETURN QUERY SELECT false, 0;
  END IF;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- Reset rate limit counters on successful authentication
CREATE OR REPLACE FUNCTION record_auth_success(
  p_lookup_key TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE auth_rate_limits
  SET failed_attempts = 0,
      locked_until = NULL,
      updated_at = NOW()
  WHERE lookup_key = p_lookup_key;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 4. Password / PIN Hashing & Verification (Bcrypt via pgcrypto)
-- Slow, salted, timing-safe credential verification
-- ------------------------------------------------------------------------------

-- Hashes a 4-digit PIN using blowfish bcrypt with cost factor 10.
-- NOTE: Declared VOLATILE because gen_salt() generates fresh random salt on every call.
CREATE OR REPLACE FUNCTION hash_pin_bcrypt(
  p_pin TEXT
)
RETURNS TEXT AS $$
BEGIN
  IF p_pin IS NULL OR NOT (p_pin ~ '^\d{4}$') THEN
    RAISE EXCEPTION 'PIN must be exactly 4 numeric digits';
  END IF;
  RETURN crypt(p_pin, gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- Timing-safe verification of 4-digit PIN against stored bcrypt hash.
-- NOTE: Declared IMMUTABLE because crypt(text, text) is deterministic given a fixed hash/salt.
CREATE OR REPLACE FUNCTION verify_pin_bcrypt(
  p_pin TEXT,
  p_stored_hash TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_pin IS NULL OR p_stored_hash IS NULL OR NOT (p_pin ~ '^\d{4}$') THEN
    RETURN false;
  END IF;
  RETURN (crypt(p_pin, p_stored_hash) = p_stored_hash);
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 5. Server-Side Authentication Verification Function
-- Validates: Company Code + Mobile + 4-Digit PIN
-- Enforces: Rate-limiting, account status, bcrypt PIN comparison
-- Returns: Generic status codes to prevent account enumeration
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_cloud_login(
  p_company_code TEXT,
  p_mobile TEXT,
  p_pin TEXT
)
RETURNS TABLE (
  status TEXT, -- 'SUCCESS', 'INVALID_CREDENTIALS', 'LOCKED', 'INVALID_INPUT'
  lockout_seconds INT,
  company_user_id UUID,
  auth_user_id UUID,
  company_id UUID,
  company_code TEXT,
  company_name TEXT,
  full_name TEXT,
  mobile TEXT,
  role TEXT,
  user_status TEXT
) AS $$
#variable_conflict use_column
DECLARE
  v_norm_code TEXT := UPPER(TRIM(COALESCE(p_company_code, '')));
  v_norm_mobile TEXT := REGEXP_REPLACE(COALESCE(p_mobile, ''), '\D', '', 'g');
  v_clean_pin TEXT := TRIM(COALESCE(p_pin, ''));
  v_lookup_key TEXT;
  v_is_locked BOOLEAN;
  v_rem_sec INT;
  v_company RECORD;
  v_user RECORD;
  v_cred RECORD;
  v_pin_match BOOLEAN;
BEGIN
  -- Strict format validation
  IF LENGTH(v_norm_code) < 2 OR LENGTH(v_norm_mobile) != 10 OR NOT (v_clean_pin ~ '^\d{4}$') THEN
    RETURN QUERY SELECT 
      'INVALID_INPUT'::TEXT, 0, NULL::UUID, NULL::UUID, NULL::UUID, 
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_lookup_key := get_auth_lookup_key(v_norm_code, v_norm_mobile);

  -- 1. Check Rate Limit / Lockout
  SELECT is_locked, remaining_seconds INTO v_is_locked, v_rem_sec
  FROM check_auth_rate_limit(v_lookup_key);

  IF v_is_locked THEN
    RETURN QUERY SELECT 
      'LOCKED'::TEXT, v_rem_sec, NULL::UUID, NULL::UUID, NULL::UUID, 
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- 2. Locate Company
  SELECT id, companies.company_name, companies.company_code
  INTO v_company
  FROM companies
  WHERE companies.company_code = v_norm_code;

  IF NOT FOUND THEN
    -- Generic failure to prevent company enumeration
    SELECT is_now_locked, remaining_seconds INTO v_is_locked, v_rem_sec
    FROM record_auth_failure(v_lookup_key);
    
    IF v_is_locked THEN
      RETURN QUERY SELECT 'LOCKED'::TEXT, v_rem_sec, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    ELSE
      RETURN QUERY SELECT 'INVALID_CREDENTIALS'::TEXT, 0, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  -- 3. Locate Active User in Company
  SELECT id, company_users.auth_user_id, company_users.full_name, company_users.mobile, company_users.role, company_users.status
  INTO v_user
  FROM company_users
  WHERE company_users.company_id = v_company.id
    AND company_users.mobile = v_norm_mobile;

  -- If user not found OR user is inactive, record failure and return generic error
  IF NOT FOUND OR v_user.status != 'active' THEN
    SELECT is_now_locked, remaining_seconds INTO v_is_locked, v_rem_sec
    FROM record_auth_failure(v_lookup_key);

    IF v_is_locked THEN
      RETURN QUERY SELECT 'LOCKED'::TEXT, v_rem_sec, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    ELSE
      RETURN QUERY SELECT 'INVALID_CREDENTIALS'::TEXT, 0, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  -- 4. Locate Credentials & Verify PIN
  SELECT pin_hash
  INTO v_cred
  FROM user_credentials
  WHERE user_id = v_user.id;

  IF NOT FOUND OR v_cred.pin_hash IS NULL THEN
    SELECT is_now_locked, remaining_seconds INTO v_is_locked, v_rem_sec
    FROM record_auth_failure(v_lookup_key);

    IF v_is_locked THEN
      RETURN QUERY SELECT 'LOCKED'::TEXT, v_rem_sec, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    ELSE
      RETURN QUERY SELECT 'INVALID_CREDENTIALS'::TEXT, 0, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  -- Verify PIN using bcrypt
  v_pin_match := verify_pin_bcrypt(v_clean_pin, v_cred.pin_hash);

  IF NOT v_pin_match THEN
    SELECT is_now_locked, remaining_seconds INTO v_is_locked, v_rem_sec
    FROM record_auth_failure(v_lookup_key);

    IF v_is_locked THEN
      RETURN QUERY SELECT 'LOCKED'::TEXT, v_rem_sec, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    ELSE
      RETURN QUERY SELECT 'INVALID_CREDENTIALS'::TEXT, 0, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  -- 5. Successful Authentication: Reset failure counters
  PERFORM record_auth_success(v_lookup_key);

  RETURN QUERY SELECT 
    'SUCCESS'::TEXT,
    0,
    v_user.id,
    v_user.auth_user_id,
    v_company.id,
    v_company.company_code,
    v_company.company_name,
    v_user.full_name,
    v_user.mobile,
    v_user.role,
    v_user.status;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 6. Manager Account Bootstrap Function (Atomic Server-Only Setup)
-- Guarded against unauthorized claiming of existing companies.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bootstrap_cloud_manager(
  p_company_code TEXT,
  p_company_name TEXT,
  p_owner_name TEXT,
  p_mobile TEXT,
  p_email TEXT,
  p_pin TEXT,
  p_auth_user_id UUID
)
RETURNS TABLE (
  status TEXT,
  company_id UUID,
  company_user_id UUID,
  message TEXT
) AS $$
#variable_conflict use_column
DECLARE
  v_norm_code TEXT := UPPER(TRIM(COALESCE(p_company_code, '')));
  v_norm_mobile TEXT := REGEXP_REPLACE(COALESCE(p_mobile, ''), '\D', '', 'g');
  v_company_id UUID;
  v_user_id UUID;
  v_pin_hash TEXT;
  v_existing_user RECORD;
BEGIN
  -- Strict input validation
  IF LENGTH(v_norm_code) < 2 OR LENGTH(v_norm_code) > 20 THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, 'Company Code must be between 2 and 20 characters.'::TEXT;
    RETURN;
  END IF;

  IF LENGTH(v_norm_mobile) != 10 THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, 'Mobile Number must be exactly 10 digits.'::TEXT;
    RETURN;
  END IF;

  IF NOT (p_pin ~ '^\d{4}$') THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, 'PIN must be exactly 4 numeric digits.'::TEXT;
    RETURN;
  END IF;

  v_pin_hash := hash_pin_bcrypt(p_pin);

  -- 1. Check if Company exists (with row-level lock)
  SELECT id INTO v_company_id 
  FROM companies 
  WHERE company_code = v_norm_code
  FOR UPDATE;

  IF v_company_id IS NOT NULL THEN
    -- Company exists: Check if any user already belongs to this company
    SELECT id, auth_user_id, role INTO v_existing_user
    FROM company_users
    WHERE company_id = v_company_id
    LIMIT 1;

    IF FOUND THEN
      -- If the existing manager has the same auth_user_id, treat as idempotent
      IF v_existing_user.auth_user_id = p_auth_user_id THEN
        RETURN QUERY SELECT 'EXISTS'::TEXT, v_company_id, v_existing_user.id, 'Manager account is already configured.'::TEXT;
        RETURN;
      ELSE
        -- Strictly deny claiming or overwriting an already initialized company
        RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, 'Company code is already registered and initialized. Please sign in.'::TEXT;
        RETURN;
      END IF;
    END IF;
  ELSE
    -- Company does not exist: Create new company record
    INSERT INTO companies (company_code, company_name, owner_name, mobile, email)
    VALUES (v_norm_code, TRIM(p_company_name), TRIM(p_owner_name), v_norm_mobile, TRIM(p_email))
    RETURNING id INTO v_company_id;
  END IF;

  -- 2. Create Initial Manager User
  INSERT INTO company_users (company_id, auth_user_id, full_name, mobile, role, status)
  VALUES (v_company_id, p_auth_user_id, TRIM(p_owner_name), v_norm_mobile, 'manager', 'active')
  RETURNING id INTO v_user_id;

  -- 3. Create Credentials (Bcrypt PIN hash only)
  INSERT INTO user_credentials (user_id, pin_hash)
  VALUES (v_user_id, v_pin_hash)
  ON CONFLICT (user_id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash,
      updated_at = NOW();

  -- 4. Create Default Company Settings if not present
  INSERT INTO company_settings (company_id)
  VALUES (v_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  -- 5. Audit Log (Never logs PIN or credentials)
  INSERT INTO activity_logs (company_id, performed_by_user_id, action, message)
  VALUES (v_company_id, v_user_id, 'manager_bootstrapped', 'Cloud Manager account initialized successfully.');

  RETURN QUERY SELECT 'SUCCESS'::TEXT, v_company_id, v_user_id, 'Manager bootstrapped successfully.'::TEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 7. Manager Creates Agent Cloud Account Function
-- Authoritatively verifies that the caller is an active Manager of the same company.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION manager_create_cloud_agent(
  p_manager_user_id UUID,
  p_full_name TEXT,
  p_mobile TEXT,
  p_pin TEXT,
  p_auth_user_id UUID
)
RETURNS TABLE (
  status TEXT,
  agent_id UUID,
  message TEXT
) AS $$
#variable_conflict use_column
DECLARE
  v_caller_mgr company_users;
  v_norm_mobile TEXT := REGEXP_REPLACE(COALESCE(p_mobile, ''), '\D', '', 'g');
  v_pin_hash TEXT;
  v_agent_id UUID;
BEGIN
  -- 1. Authoritatively verify manager identity
  SELECT * INTO v_caller_mgr
  FROM company_users
  WHERE id = p_manager_user_id
    AND role = 'manager'
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, NULL::UUID, 'Caller is not an active company Manager.'::TEXT;
    RETURN;
  END IF;

  -- If auth.uid() is available (PostgREST session context), verify it matches
  IF auth.uid() IS NOT NULL AND v_caller_mgr.auth_user_id != auth.uid() THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, NULL::UUID, 'Caller auth identity does not match manager profile.'::TEXT;
    RETURN;
  END IF;

  -- 2. Validate inputs
  IF TRIM(COALESCE(p_full_name, '')) = '' THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, 'Agent Full Name is required.'::TEXT;
    RETURN;
  END IF;

  IF LENGTH(v_norm_mobile) != 10 THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, 'Mobile number must be exactly 10 digits.'::TEXT;
    RETURN;
  END IF;

  IF NOT (p_pin ~ '^\d{4}$') THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, 'PIN must be exactly 4 numeric digits.'::TEXT;
    RETURN;
  END IF;

  -- 3. Check if mobile already exists in this company
  IF EXISTS (
    SELECT 1 FROM company_users
    WHERE company_id = v_caller_mgr.company_id AND mobile = v_norm_mobile
  ) THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, 'A user with this mobile number already exists in your company.'::TEXT;
    RETURN;
  END IF;

  v_pin_hash := hash_pin_bcrypt(p_pin);

  -- 4. Insert Agent into company_users
  INSERT INTO company_users (company_id, auth_user_id, full_name, mobile, role, status)
  VALUES (v_caller_mgr.company_id, p_auth_user_id, TRIM(p_full_name), v_norm_mobile, 'agent', 'active')
  RETURNING id INTO v_agent_id;

  -- 5. Insert credentials
  INSERT INTO user_credentials (user_id, pin_hash)
  VALUES (v_agent_id, v_pin_hash);

  -- 6. Log Activity
  INSERT INTO activity_logs (company_id, performed_by_user_id, agent_id, action, message)
  VALUES (v_caller_mgr.company_id, v_caller_mgr.id, v_agent_id, 'agent_created', 'Agent ' || TRIM(p_full_name) || ' was added.');

  RETURN QUERY SELECT 'SUCCESS'::TEXT, v_agent_id, 'Agent created successfully.'::TEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 8. Manager Toggles Agent Active / Inactive Status Function
-- Authoritatively verifies Manager identity and same-company agent status modification.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION manager_set_agent_status(
  p_manager_user_id UUID,
  p_agent_id UUID,
  p_status TEXT
)
RETURNS TABLE (
  status TEXT,
  message TEXT
) AS $$
#variable_conflict use_column
DECLARE
  v_caller_mgr company_users;
  v_agent company_users;
BEGIN
  -- 1. Authoritatively verify manager identity
  SELECT * INTO v_caller_mgr
  FROM company_users
  WHERE id = p_manager_user_id
    AND role = 'manager'
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Caller is not an active company Manager.'::TEXT;
    RETURN;
  END IF;

  -- If auth.uid() is available (PostgREST session context), verify it matches
  IF auth.uid() IS NOT NULL AND v_caller_mgr.auth_user_id != auth.uid() THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Caller auth identity does not match manager profile.'::TEXT;
    RETURN;
  END IF;

  IF p_status NOT IN ('active', 'inactive') THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, 'Status must be active or inactive.'::TEXT;
    RETURN;
  END IF;

  -- 2. Locate target Agent in Manager's company
  SELECT * INTO v_agent
  FROM company_users
  WHERE id = p_agent_id AND company_id = v_caller_mgr.company_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, 'Agent not found in your company.'::TEXT;
    RETURN;
  END IF;

  IF v_agent.role != 'agent' THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, 'Cannot modify Manager status using this operation.'::TEXT;
    RETURN;
  END IF;

  -- 3. Update status
  UPDATE company_users
  SET status = p_status,
      updated_at = NOW()
  WHERE id = p_agent_id;

  -- 4. Log Activity
  INSERT INTO activity_logs (company_id, performed_by_user_id, agent_id, action, message)
  VALUES (
    v_caller_mgr.company_id,
    v_caller_mgr.id,
    p_agent_id,
    'agent_status_changed',
    'Agent ' || v_agent.full_name || ' status set to ' || p_status || '.'
  );

  RETURN QUERY SELECT 'SUCCESS'::TEXT, 'Agent status updated successfully.'::TEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 9. Explicit Permissions Hardening (GRANT / REVOKE MATRIX)
-- REVOKE all direct client execution from PUBLIC, anon, and authenticated roles.
-- GRANT execution ONLY to service_role (trusted server-side execution only).
-- ------------------------------------------------------------------------------

-- Deny all direct client table access to sensitive tables
REVOKE ALL ON auth_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON user_credentials FROM PUBLIC, anon, authenticated;

-- Revoke function execution from browser roles
REVOKE EXECUTE ON FUNCTION get_auth_lookup_key(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_auth_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_auth_failure(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_auth_success(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION hash_pin_bcrypt(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION verify_pin_bcrypt(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION verify_cloud_login(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION bootstrap_cloud_manager(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION manager_create_cloud_agent(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION manager_set_agent_status(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE exclusively to service_role
GRANT EXECUTE ON FUNCTION get_auth_lookup_key(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION check_auth_rate_limit(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_auth_failure(TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION record_auth_success(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION hash_pin_bcrypt(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION verify_pin_bcrypt(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION verify_cloud_login(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION bootstrap_cloud_manager(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION manager_create_cloud_agent(UUID, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION manager_set_agent_status(UUID, UUID, TEXT) TO service_role;
