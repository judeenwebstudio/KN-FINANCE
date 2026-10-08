-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 034
-- (BORROWER PAYMENT / DISBURSEMENT DATE — TRANSACTION-SAFE MINIMAL ADDITIVE DDL)
--
-- Authoritative Safety & Architecture Rules:
-- 1. Definition:
--    - payment_date: The actual date on which the company gives / disburses the loan amount to the borrower.
--    - This is NOT a loan installment collection date.
--    - start_date: Retains its existing meaning as the repayment schedule start date for due date calculations.
-- 2. Transaction & Lock Safety:
--    - Sets lock_timeout = '5s' to prevent query queue stalls during DDL metadata update.
--    - Purely additive: Adds nullable column `payment_date DATE` to `public.borrowers` with NO index to minimize locking.
--    - ZERO table modifications, ZERO backfills, ZERO historical alterations. Existing borrowers remain NULL.
-- 3. Complete RPC Isolation & Backward Compatibility:
--    - Existing `edit_borrower_record` from Migration 033 is KEPT UNTOUCHED to ensure 100% guaranteed
--      compatibility with Android v9 and existing web builds.
--    - An independent, dedicated helper RPC `update_borrower_payment_date` is provided for updating
--      payment_date with strict role validation, row-level locking (FOR UPDATE), and non-null validation.
-- 4. Accounting & Ledger Safety:
--    - payment_date is a metadata annotation only.
--    - Zero cash ledger entries created.
--    - Cash in Hand, Out Flow, Deductions, and Net Amount Given remain 100% unchanged.
-- ==============================================================================

BEGIN;

-- Set a strict lock timeout to avoid blocking concurrent production transactions
SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------------------------
-- 1. Add nullable payment_date Column to borrowers Table (No index to minimize lock)
-- ------------------------------------------------------------------------------
ALTER TABLE public.borrowers
ADD COLUMN IF NOT EXISTS payment_date DATE;

-- ------------------------------------------------------------------------------
-- 2. Dedicated Minimal Helper RPC: update_borrower_payment_date()
-- (Touches ONLY payment_date; leaves all financial, ledger, and status logic untouched)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_borrower_payment_date(
  p_borrower_id UUID,
  p_payment_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_borrower RECORD;
BEGIN
  -- 1. Validate mandatory input
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Invalid payment date: A valid disbursement date is required.';
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

  -- 5. Authorization check: Agent can only update assigned borrowers
  IF v_user.role = 'agent' AND (v_borrower.assigned_agent_id IS NULL OR v_borrower.assigned_agent_id <> v_user.id) THEN
    RAISE EXCEPTION 'Access denied: Agents can only update borrowers assigned to them.';
  END IF;

  -- 6. Update ONLY payment_date
  UPDATE borrowers
  SET
    payment_date = p_payment_date,
    updated_at = NOW()
  WHERE id = p_borrower_id AND company_id = v_user.company_id;

  RETURN jsonb_build_object(
    'success', true,
    'borrower_id', p_borrower_id,
    'payment_date', p_payment_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 3. Permissions Hardening
-- Revoke PUBLIC and anon; grant authenticated and service_role only.
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION update_borrower_payment_date(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_borrower_payment_date(UUID, DATE) TO authenticated, service_role;

COMMIT;
