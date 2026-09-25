-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 016
-- Feature: Narrowly Scoped Server-Controlled Identity Linkage Repair &
--          Hardened Change PIN Function (Strict auth.uid() Resolution)
-- ==============================================================================

-- 1. Dedicated Server-Controlled Identity Linkage Repair Function
-- Atomically links an active company_user to their verified GoTrue auth identity.
-- Enforces:
--   a) Target user must exist and be 'active'
--   b) Auth identity cannot be claimed if already mapped to another user
--   c) Only callable by service_role (REVOKED from PUBLIC, anon, authenticated)
CREATE OR REPLACE FUNCTION repair_auth_user_linkage(
  p_trusted_company_user_id UUID,
  p_auth_user_id UUID
)
RETURNS TABLE (
  status TEXT,
  message TEXT
) AS $$
#variable_conflict use_column
DECLARE
  v_user RECORD;
  v_auth_record RECORD;
  v_existing_auth_user RECORD;
  v_old_auth_exists BOOLEAN;
BEGIN
  IF p_trusted_company_user_id IS NULL OR p_auth_user_id IS NULL THEN
    RETURN QUERY SELECT 'INVALID_INPUT'::TEXT, 'Invalid parameters.'::TEXT;
    RETURN;
  END IF;

  -- 1. Cryptographic binding check: Verify that p_auth_user_id actually exists in auth.users
  --    and its trusted user_metadata contains matching company_user_id
  SELECT id, (raw_user_meta_data->>'company_user_id')::TEXT AS meta_company_user_id
  INTO v_auth_record
  FROM auth.users
  WHERE id = p_auth_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Auth identity not found.'::TEXT;
    RETURN;
  END IF;

  IF v_auth_record.meta_company_user_id IS NULL OR v_auth_record.meta_company_user_id != p_trusted_company_user_id::TEXT THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Auth session metadata does not match target company user.'::TEXT;
    RETURN;
  END IF;

  -- 2. Locate the target company_user (Active only)
  SELECT id, company_id, auth_user_id, role, status
  INTO v_user
  FROM company_users
  WHERE id = p_trusted_company_user_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, 'Active user not found.'::TEXT;
    RETURN;
  END IF;

  -- 3. If already linked to this auth_user_id, NO-OP success (e.g. healthy Agent or Manager)
  IF v_user.auth_user_id = p_auth_user_id THEN
    RETURN QUERY SELECT 'SUCCESS'::TEXT, 'Linkage already correct.'::TEXT;
    RETURN;
  END IF;

  -- 4. Check if p_auth_user_id is already claimed by ANOTHER company_users record
  SELECT id, role, status INTO v_existing_auth_user
  FROM company_users
  WHERE auth_user_id = p_auth_user_id
    AND id != p_trusted_company_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT 'CONFLICT'::TEXT, 'Auth user ID is already linked to another company user.'::TEXT;
    RETURN;
  END IF;

  -- 5. Stale linkage verification: If v_user.auth_user_id is non-NULL, verify the old linkage is stale
  IF v_user.auth_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE id = v_user.auth_user_id
    ) INTO v_old_auth_exists;

    -- If the old auth user still exists in auth.users, verify it does not actively claim this company_user_id
    IF v_old_auth_exists THEN
      -- Check if old auth record metadata is stale or no longer matches
      IF EXISTS (
        SELECT 1 FROM auth.users 
        WHERE id = v_user.auth_user_id 
          AND (raw_user_meta_data->>'company_user_id') = p_trusted_company_user_id::TEXT
          AND id != p_auth_user_id
      ) THEN
        RETURN QUERY SELECT 'CONFLICT'::TEXT, 'Active session conflict with existing auth identity.'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 6. Atomically link auth_user_id
  UPDATE company_users
  SET auth_user_id = p_auth_user_id,
      updated_at = NOW()
  WHERE id = p_trusted_company_user_id;

  RETURN QUERY SELECT 'SUCCESS'::TEXT, 'Auth linkage repaired successfully.'::TEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions, auth;

-- Permissions on repair function: STRICTLY service_role only
REVOKE ALL ON FUNCTION repair_auth_user_linkage(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION repair_auth_user_linkage(UUID, UUID) TO service_role;


-- 2. Hardened Self-Service Change PIN Function
-- Strict auth.uid() identity resolution (NO arbitrary company_users.id parameters)
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
  -- ALWAYS enforce auth.uid() directly from the cryptographically verified JWT.
  -- If invoked by service_role (backend serverless endpoint), allow p_auth_user_id.
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

  -- 2. Locate Active User in Company strictly by authenticated identity
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

  -- 5. Locate Existing Credentials strictly for this user
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

-- Permissions on change_user_pin
REVOKE ALL ON FUNCTION change_user_pin(TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION change_user_pin(TEXT, TEXT, UUID) TO authenticated, service_role;
