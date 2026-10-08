-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 035 (PROPOSED FOR REVIEW)
-- (BORROWER PARCEL TOKEN MODE — ISOLATED HELPER RPC)
--
-- Authoritative Safety & Architecture Rules:
-- 1. Complete RPC Isolation & Backward Compatibility:
--    - Existing `edit_borrower_record` from Migration 033 is KEPT UNTOUCHED to ensure 100%
--      guaranteed compatibility with Android v9 and existing web builds.
--    - An independent, dedicated helper RPC `update_borrower_parcel_token_mode` is provided for
--      updating parcel_token_mode with strict role validation and row-level locking (FOR UPDATE).
-- 2. Schema:
--    - Uses existing column `public.borrowers.parcel_token_mode BOOLEAN NOT NULL DEFAULT FALSE`.
-- 3. Accounting & Ledger Safety:
--    - parcel_token_mode is an operational metadata toggle.
--    - Zero cash ledger entries created or modified.
--    - Cash in Hand, Loan Disbursed, and Collections remain 100% unchanged.
-- ==============================================================================

BEGIN;

-- Set a strict lock timeout to avoid blocking concurrent production transactions
SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------------------------
-- 1. Dedicated Minimal Helper RPC: update_borrower_parcel_token_mode()
-- (Touches ONLY parcel_token_mode; leaves all financial, ledger, and status logic untouched)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_borrower_parcel_token_mode(
  p_borrower_id UUID,
  p_parcel_token_mode BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_borrower RECORD;
BEGIN
  -- 1. Validate mandatory input
  IF p_parcel_token_mode IS NULL THEN
    RAISE EXCEPTION 'Invalid parcel token mode: A valid boolean value is required.';
  END IF;

  -- 2. Authenticate active company user session
  SELECT id, company_id, role INTO v_user
  FROM company_users
  WHERE auth_user_id = auth.uid() AND status = 'active'
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: Unable to resolve active company user session.';
  END IF;

  -- 3. Role validation (Active Manager and Agent only)
  IF v_user.role NOT IN ('manager', 'agent') THEN
    RAISE EXCEPTION 'Access denied: Unauthorized role.';
  END IF;

  -- 4. Verify borrower existence and lock row for update
  SELECT id, company_id, assigned_agent_id INTO v_borrower
  FROM borrowers
  WHERE id = p_borrower_id AND company_id = v_user.company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Borrower not found or does not belong to your company.';
  END IF;

  -- 5. Authorization check: Agent can only update borrowers assigned to them
  IF v_user.role = 'agent' AND (v_borrower.assigned_agent_id IS NULL OR v_borrower.assigned_agent_id <> v_user.id) THEN
    RAISE EXCEPTION 'Access denied: Agents can only update borrowers assigned to them.';
  END IF;

  -- 6. Update ONLY parcel_token_mode
  UPDATE borrowers
  SET
    parcel_token_mode = p_parcel_token_mode,
    updated_at = NOW()
  WHERE id = p_borrower_id AND company_id = v_user.company_id;

  RETURN jsonb_build_object(
    'success', true,
    'borrower_id', p_borrower_id,
    'parcel_token_mode', p_parcel_token_mode
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 2. Permissions Hardening
-- Revoke PUBLIC and anon; grant authenticated and service_role only.
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION update_borrower_parcel_token_mode(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_borrower_parcel_token_mode(UUID, BOOLEAN) TO authenticated, service_role;

COMMIT;
