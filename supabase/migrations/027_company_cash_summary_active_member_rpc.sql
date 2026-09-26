-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 027
-- Secure Company Cash Summary RPC for Active Company Members (Manager & Agent)
-- ==============================================================================
--
-- BUSINESS LOGIC & SECURITY RATIONALE:
-- 1. Cash in Hand and Out Flow are COMPANY CASH ACCOUNTING metrics.
--    Both Manager and Agent dashboards must display the authoritative company-wide totals.
-- 2. Raw company_cash_ledger table remains strictly protected under existing RLS (Manager-only SELECT).
--    Agents do NOT receive direct table access to raw ledger rows.
-- 3. get_company_cash_summary() is a SECURITY DEFINER RPC that:
--    - Resolves auth.uid() server-side via get_auth_company_id()
--    - Rejects unauthenticated users and inactive/non-company members
--    - Takes ZERO client parameters (prevents tenant parameter tampering)
--    - Returns only aggregated numbers (cash_in_hand, total_out_flow, etc.)
--    - Emits zero individual transactions, personal data, or ledger rows
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_company_cash_summary()
RETURNS TABLE (
  cash_in_hand NUMERIC(12, 2),
  total_out_flow NUMERIC(12, 2),
  total_added NUMERIC(12, 2),
  total_decreased NUMERIC(12, 2),
  total_disbursed NUMERIC(12, 2),
  total_collected NUMERIC(12, 2),
  total_deducted NUMERIC(12, 2)
) AS $$
#variable_conflict use_column
DECLARE
  v_company_id UUID;
  v_added NUMERIC(12, 2) := 0;
  v_decreased NUMERIC(12, 2) := 0;
  v_disbursed NUMERIC(12, 2) := 0;
  v_collected NUMERIC(12, 2) := 0;
  v_deducted NUMERIC(12, 2) := 0;
BEGIN
  -- Resolve active company_id from server-side authenticated session
  v_company_id := get_auth_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: Must be an active company member to view cash summary.';
  END IF;

  -- Aggregate company cash ledger entries for the authenticated user's company
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type = 'CASH_ADDED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'CASH_DECREASED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'LOAN_DISBURSED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'PAYMENT_COLLECTED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'DEDUCTED_AMOUNT' THEN amount ELSE 0 END), 0)
  INTO v_added, v_decreased, v_disbursed, v_collected, v_deducted
  FROM company_cash_ledger
  WHERE company_cash_ledger.company_id = v_company_id;

  -- Canonical Accounting Formulas:
  -- Cash in Hand = (CASH_ADDED + PAYMENT_COLLECTED + DEDUCTED_AMOUNT) - (CASH_DECREASED + LOAN_DISBURSED)
  -- Out Flow = MAX(0, LOAN_DISBURSED - PAYMENT_COLLECTED) + CASH_DECREASED
  RETURN QUERY SELECT
    ((v_added + v_collected + v_deducted) - (v_decreased + v_disbursed))::NUMERIC(12, 2),
    (GREATEST(0, v_disbursed - v_collected) + v_decreased)::NUMERIC(12, 2),
    v_added,
    v_decreased,
    v_disbursed,
    v_collected,
    v_deducted;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

-- Re-verify and enforce execution permissions
REVOKE EXECUTE ON FUNCTION get_company_cash_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_company_cash_summary() TO authenticated, service_role;
