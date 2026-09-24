-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 008
-- Phase 2: Secure Multi-Tenant Manager Replacement Infrastructure
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. replace_company_manager Stored Procedure
-- Atomically retires current active Manager and promotes a new Manager for a company.
-- Preserves historical company_users records, audit history, and single-manager index.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION replace_company_manager(
  p_company_id UUID,
  p_old_manager_id UUID,
  p_new_auth_user_id UUID,
  p_new_full_name TEXT,
  p_new_mobile TEXT,
  p_new_email TEXT,
  p_new_pin TEXT
)
RETURNS TABLE (
  status TEXT,
  new_company_user_id UUID,
  old_company_user_id UUID,
  company_id UUID,
  message TEXT
) AS $$
#variable_conflict use_column
DECLARE
  v_norm_mobile TEXT := REGEXP_REPLACE(COALESCE(p_new_mobile, ''), '\D', '', 'g');
  v_clean_name TEXT := TRIM(COALESCE(p_new_full_name, ''));
  v_clean_email TEXT := TRIM(COALESCE(p_new_email, ''));
  v_clean_pin TEXT := TRIM(COALESCE(p_new_pin, ''));
  v_company RECORD;
  v_old_mgr RECORD;
  v_new_user_id UUID;
  v_existing_mobile_user RECORD;
  v_existing_auth_user RECORD;
  v_pin_hash TEXT;
BEGIN
  -- 1. Input Validation
  IF p_company_id IS NULL THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'Company ID is required.'::TEXT;
    RETURN;
  END IF;

  IF p_old_manager_id IS NULL THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'Current Manager ID is required.'::TEXT;
    RETURN;
  END IF;

  IF p_new_auth_user_id IS NULL THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'New Auth User ID is required.'::TEXT;
    RETURN;
  END IF;

  IF v_clean_name = '' THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'New Manager full name is required.'::TEXT;
    RETURN;
  END IF;

  IF LENGTH(v_norm_mobile) != 10 THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'New Manager mobile number must be exactly 10 digits.'::TEXT;
    RETURN;
  END IF;

  IF NOT (v_clean_pin ~ '^\d{4}$') THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'New Manager PIN must be exactly 4 numeric digits.'::TEXT;
    RETURN;
  END IF;

  -- 2. Validate Company Existence (with row lock)
  SELECT id, company_code, company_name INTO v_company
  FROM companies
  WHERE id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'Target company does not exist.'::TEXT;
    RETURN;
  END IF;

  -- 3. Validate Current (Old) Manager
  SELECT id, company_id, auth_user_id, role, status, mobile, full_name INTO v_old_mgr
  FROM company_users
  WHERE id = p_old_manager_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'Current Manager record not found.'::TEXT;
    RETURN;
  END IF;

  IF v_old_mgr.company_id != p_company_id THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'Current Manager does not belong to the specified company.'::TEXT;
    RETURN;
  END IF;

  IF v_old_mgr.role != 'manager' THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'Specified user is not currently the company Manager.'::TEXT;
    RETURN;
  END IF;

  IF v_old_mgr.status != 'active' THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'Current Manager account is not active.'::TEXT;
    RETURN;
  END IF;

  -- 4. Check if new auth_user_id is already mapped to another user
  SELECT id, company_id INTO v_existing_auth_user
  FROM company_users
  WHERE auth_user_id = p_new_auth_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'The new Auth User ID is already linked to an existing membership.'::TEXT;
    RETURN;
  END IF;

  -- 5. Check if new mobile is already in use by another active/inactive user in this company
  SELECT id, full_name, role, status INTO v_existing_mobile_user
  FROM company_users
  WHERE company_id = p_company_id
    AND mobile = v_norm_mobile
    AND id != p_old_manager_id;

  IF FOUND THEN
    RETURN QUERY SELECT 'ERROR'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID, 'The specified mobile number is already registered for another user in this company.'::TEXT;
    RETURN;
  END IF;

  -- 6. Hash New PIN using project bcrypt helper
  v_pin_hash := hash_pin_bcrypt(v_clean_pin);

  -- --------------------------------------------------------------------------
  -- ATOMIC TRANSITION STEPS
  -- --------------------------------------------------------------------------

  -- Step A: Retire Old Manager
  -- Demote role to 'agent', set status to 'inactive', unlink auth_user_id
  -- This frees up the partial unique index idx_one_manager_per_company
  UPDATE company_users
  SET role = 'agent',
      status = 'inactive',
      auth_user_id = NULL,
      updated_at = NOW()
  WHERE id = p_old_manager_id;

  -- Step B: Remove Old Manager credentials from user_credentials
  DELETE FROM user_credentials
  WHERE user_id = p_old_manager_id;

  -- Step C: Create New Manager row in company_users
  INSERT INTO company_users (
    company_id,
    auth_user_id,
    full_name,
    mobile,
    role,
    status
  )
  VALUES (
    p_company_id,
    p_new_auth_user_id,
    v_clean_name,
    v_norm_mobile,
    'manager',
    'active'
  )
  RETURNING id INTO v_new_user_id;

  -- Step D: Store New Manager credentials in user_credentials
  INSERT INTO user_credentials (user_id, pin_hash)
  VALUES (v_new_user_id, v_pin_hash);

  -- Step E: Update Company informational fields
  UPDATE companies
  SET owner_name = v_clean_name,
      mobile = v_norm_mobile,
      email = COALESCE(NULLIF(v_clean_email, ''), email),
      updated_at = NOW()
  WHERE id = p_company_id;

  -- Step F: Record activity log
  INSERT INTO activity_logs (
    company_id,
    performed_by_user_id,
    action,
    message
  )
  VALUES (
    p_company_id,
    v_new_user_id,
    'manager_replaced',
    'Company Manager account successfully replaced.'
  );

  RETURN QUERY SELECT 
    'SUCCESS'::TEXT,
    v_new_user_id,
    p_old_manager_id,
    p_company_id,
    'Manager replaced successfully.'::TEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 2. Privileges & Access Lockdown
-- Strictly revoke direct browser access. Only service_role may execute this RPC.
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION replace_company_manager(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION replace_company_manager(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION replace_company_manager(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION replace_company_manager(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
