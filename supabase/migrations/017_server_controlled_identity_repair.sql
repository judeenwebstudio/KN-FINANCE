-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 017
-- Feature: Server-Controlled Identity Linkage Repair (app_metadata & Internal Email Validation)
--          Strictly Disallowing Client-Editable user_metadata from Identity Binding
-- ==============================================================================

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
  v_cred_count INT;
  v_old_auth_exists BOOLEAN;
BEGIN
  IF p_trusted_company_user_id IS NULL OR p_auth_user_id IS NULL THEN
    RETURN QUERY SELECT 'INVALID_INPUT'::TEXT, 'Invalid parameters.'::TEXT;
    RETURN;
  END IF;

  -- 1. Cryptographic binding check: Verify that p_auth_user_id exists in auth.users
  SELECT id, email, (raw_app_meta_data->>'company_user_id')::TEXT AS app_meta_company_user_id
  INTO v_auth_record
  FROM auth.users
  WHERE id = p_auth_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Auth identity not found.'::TEXT;
    RETURN;
  END IF;

  -- 2. Server-Controlled Authorization Verification
  -- Must match either server-controlled app_metadata OR legacy server-generated internal email
  -- (raw_user_meta_data is client-editable and strictly ignored)
  IF (v_auth_record.app_meta_company_user_id IS NOT NULL AND v_auth_record.app_meta_company_user_id = p_trusted_company_user_id::TEXT)
     OR (LOWER(COALESCE(v_auth_record.email, '')) = LOWER('u_' || p_trusted_company_user_id::TEXT || '@knfinance.internal')) THEN
    -- Verified via server-controlled source
    NULL;
  ELSE
    RETURN QUERY SELECT 'UNAUTHORIZED'::TEXT, 'Server authorization evidence does not match target company user.'::TEXT;
    RETURN;
  END IF;

  -- 3. Locate the target company_user (Active only)
  SELECT id, company_id, auth_user_id, role, status
  INTO v_user
  FROM company_users
  WHERE id = p_trusted_company_user_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, 'Active user not found.'::TEXT;
    RETURN;
  END IF;

  -- 4. Verify target user has exactly one credential record
  SELECT COUNT(*) INTO v_cred_count
  FROM user_credentials
  WHERE user_id = p_trusted_company_user_id;

  IF v_cred_count != 1 THEN
    RETURN QUERY SELECT 'CONFLICT'::TEXT, 'User credentials state is invalid.'::TEXT;
    RETURN;
  END IF;

  -- 5. If already linked to this auth_user_id, NO-OP success (e.g. healthy Agent or Manager)
  IF v_user.auth_user_id = p_auth_user_id THEN
    RETURN QUERY SELECT 'SUCCESS'::TEXT, 'Linkage already correct.'::TEXT;
    RETURN;
  END IF;

  -- 6. Check if p_auth_user_id is already claimed by ANOTHER company_users record
  SELECT id, role, status INTO v_existing_auth_user
  FROM company_users
  WHERE auth_user_id = p_auth_user_id
    AND id != p_trusted_company_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT 'CONFLICT'::TEXT, 'Auth user ID is already linked to another company user.'::TEXT;
    RETURN;
  END IF;

  -- 7. Stale linkage verification: If v_user.auth_user_id is non-NULL, verify old linkage is stale
  IF v_user.auth_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE id = v_user.auth_user_id
    ) INTO v_old_auth_exists;

    IF v_old_auth_exists THEN
      -- If the old auth user still exists in auth.users, verify it does not actively claim this company_user_id
      IF EXISTS (
        SELECT 1 FROM auth.users 
        WHERE id = v_user.auth_user_id 
          AND (
            (raw_app_meta_data->>'company_user_id') = p_trusted_company_user_id::TEXT
            OR LOWER(COALESCE(email, '')) = LOWER('u_' || p_trusted_company_user_id::TEXT || '@knfinance.internal')
          )
          AND id != p_auth_user_id
      ) THEN
        RETURN QUERY SELECT 'CONFLICT'::TEXT, 'Active session conflict with existing auth identity.'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- 8. Atomically link auth_user_id
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
