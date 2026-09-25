-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 015
-- Feature: Self-Service Change PIN RPC Function for Manager & Agent
-- ==============================================================================

-- 1. Create or Replace change_user_pin RPC function
-- Allows an authenticated user (Manager or Agent) to securely change their own PIN.
-- Strictly validates:
--   a) Format (exactly 4 numeric digits for both old and new PIN)
--   b) Current PIN must not equal New PIN
--   c) Caller authentication (via auth.uid() or verified service_role auth_user_id)
--   d) Rate limiting / lockout status per user (via company_code + mobile lookup key)
--   e) Timing-safe bcrypt verification of current PIN
--   f) Server-side bcrypt hashing of new PIN (pgcrypto bf cost 10)
--   g) Safe audit logging without recording plaintext PIN or hash
--   h) Strict isolation: updates only the authenticated user's own credentials
CREATE OR REPLACE FUNCTION change_user_pin(
  p_current_pin TEXT,
  p_new_pin TEXT,
  p_auth_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  status TEXT,
  message TEXT,
  lockout_seconds INT
) AS $$
#variable_conflict use_column
DECLARE
  v_effective_auth_id UUID;
  v_user RECORD;
  v_company RECORD;
  v_cred RECORD;
  v_lookup_key TEXT;
  v_is_locked BOOLEAN;
  v_rem_sec INT;
  v_clean_curr TEXT := TRIM(COALESCE(p_current_pin, ''));
  v_clean_new TEXT := TRIM(COALESCE(p_new_pin, ''));
  v_new_hash TEXT;
BEGIN
  -- Determine effective auth user id:
  -- If invoked by an authenticated browser client (auth.role() = 'authenticated'),
  -- ALWAYS enforce auth.uid() directly from the cryptographically verified JWT to prevent spoofing.
  -- If invoked by service_role (backend serverless endpoint), allow p_auth_user_id fallback.
  IF auth.role() = 'authenticated' THEN
    v_effective_auth_id := auth.uid();
  ELSE
    v_effective_auth_id := COALESCE(auth.uid(), p_auth_user_id);
  END IF;

  IF v_effective_auth_id IS NULL THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Authentication required.'::TEXT, 0;
    RETURN;
  END IF;

  -- 1. Strict PIN format validation
  IF NOT (v_clean_curr ~ '^\d{4}$') THEN
    RETURN QUERY SELECT 'INVALID_INPUT'::TEXT, 'Current PIN must be exactly 4 numeric digits.'::TEXT, 0;
    RETURN;
  END IF;

  IF NOT (v_clean_new ~ '^\d{4}$') THEN
    RETURN QUERY SELECT 'INVALID_INPUT'::TEXT, 'New PIN must be exactly 4 numeric digits.'::TEXT, 0;
    RETURN;
  END IF;

  IF v_clean_curr = v_clean_new THEN
    RETURN QUERY SELECT 'SAME_PIN'::TEXT, 'New PIN must be different from current PIN.'::TEXT, 0;
    RETURN;
  END IF;

  -- 2. Locate Active User in Company
  SELECT id, company_id, auth_user_id, full_name, mobile, role, status
  INTO v_user
  FROM company_users
  WHERE company_users.auth_user_id = v_effective_auth_id
    AND company_users.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'User account is inactive or not found.'::TEXT, 0;
    RETURN;
  END IF;

  -- 3. Locate Company
  SELECT id, company_code, company_name
  INTO v_company
  FROM companies
  WHERE id = v_user.company_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Company profile not found.'::TEXT, 0;
    RETURN;
  END IF;

  -- 4. Check Rate Limit / Lockout
  v_lookup_key := get_auth_lookup_key(v_company.company_code, v_user.mobile);

  SELECT is_locked, remaining_seconds INTO v_is_locked, v_rem_sec
  FROM check_auth_rate_limit(v_lookup_key);

  IF v_is_locked THEN
    RETURN QUERY SELECT 
      'LOCKED'::TEXT, 
      'Account is temporarily locked due to repeated failed attempts. Please try again in ' || v_rem_sec || ' seconds.'::TEXT, 
      v_rem_sec;
    RETURN;
  END IF;

  -- 5. Locate Existing Credentials
  SELECT pin_hash
  INTO v_cred
  FROM user_credentials
  WHERE user_id = v_user.id;

  IF NOT FOUND OR v_cred.pin_hash IS NULL THEN
    RETURN QUERY SELECT 'INVALID_CREDENTIALS'::TEXT, 'Current PIN is incorrect.'::TEXT, 0;
    RETURN;
  END IF;

  -- 6. Verify Current PIN with timing-safe bcrypt
  IF NOT verify_pin_bcrypt(v_clean_curr, v_cred.pin_hash) THEN
    SELECT is_now_locked, remaining_seconds INTO v_is_locked, v_rem_sec
    FROM record_auth_failure(v_lookup_key);

    IF v_is_locked THEN
      RETURN QUERY SELECT 
        'LOCKED'::TEXT, 
        'Too many failed attempts. Account is temporarily locked for ' || v_rem_sec || ' seconds.'::TEXT, 
        v_rem_sec;
    ELSE
      RETURN QUERY SELECT 'INVALID_CREDENTIALS'::TEXT, 'Current PIN is incorrect.'::TEXT, 0;
    END IF;
    RETURN;
  END IF;

  -- 7. Hash New PIN Server-Side with blowfish bcrypt (cost 10)
  v_new_hash := hash_pin_bcrypt(v_clean_new);

  -- 8. Atomic Update of user_credentials (strictly isolated to v_user.id)
  UPDATE user_credentials
  SET pin_hash = v_new_hash,
      updated_at = NOW()
  WHERE user_id = v_user.id;

  -- 9. Reset rate limit counters on successful PIN change
  PERFORM record_auth_success(v_lookup_key);

  -- 10. Record safe audit log entry (no sensitive credentials or hashes logged)
  INSERT INTO activity_logs (
    company_id,
    performed_by_user_id,
    action,
    message
  )
  VALUES (
    v_user.company_id,
    v_user.id,
    'pin_changed',
    'PIN successfully changed for ' || v_user.role || ' (' || v_user.full_name || ').'
  );

  RETURN QUERY SELECT 'SUCCESS'::TEXT, 'PIN changed successfully.'::TEXT, 0;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- 2. Grant and Revoke Permissions
REVOKE ALL ON FUNCTION change_user_pin(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION change_user_pin(TEXT, TEXT, UUID) TO authenticated, service_role;
