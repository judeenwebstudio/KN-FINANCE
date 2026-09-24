-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 004 (CASH LEDGER & OUT FLOW)
-- Multi-tenant Company Cash Ledger & Out Flow Accounting
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COMPANY_CASH_LEDGER Table
-- Immutable audit ledger for all company cash movements.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('CASH_ADDED', 'CASH_DECREASED', 'LOAN_DISBURSED', 'PAYMENT_COLLECTED')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('MANUAL', 'LOAN', 'PAYMENT')),
  borrower_id UUID,
  payment_id UUID,
  note TEXT,
  performed_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Foreign Key constraints maintaining tenant isolation
  CONSTRAINT fk_cash_ledger_performed_by
    FOREIGN KEY (company_id, performed_by_user_id)
    REFERENCES company_users(company_id, id)
    ON DELETE SET NULL (performed_by_user_id),

  CONSTRAINT fk_cash_ledger_borrower
    FOREIGN KEY (company_id, borrower_id)
    REFERENCES borrowers(company_id, id)
    ON DELETE SET NULL (borrower_id),

  CONSTRAINT fk_cash_ledger_payment
    FOREIGN KEY (company_id, payment_id)
    REFERENCES payments(company_id, id)
    ON DELETE SET NULL (payment_id)
);

-- Prevent duplicate ledger entries for the same loan disbursement or payment
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_loan_disbursed
ON company_cash_ledger(company_id, borrower_id)
WHERE transaction_type = 'LOAN_DISBURSED' AND borrower_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_payment_collected
ON company_cash_ledger(company_id, payment_id)
WHERE transaction_type = 'PAYMENT_COLLECTED' AND payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_company_id ON company_cash_ledger(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_created_at ON company_cash_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_type ON company_cash_ledger(transaction_type);

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Isolation: Only Managers can view and manage company cash ledger.
-- Agents are strictly denied SELECT and direct manual INSERT.
-- ------------------------------------------------------------------------------
ALTER TABLE company_cash_ledger ENABLE ROW LEVEL SECURITY;

-- Managers can view all cash ledger transactions for their company
DROP POLICY IF EXISTS "Managers can view company cash ledger" ON company_cash_ledger;
CREATE POLICY "Managers can view company cash ledger"
ON company_cash_ledger
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Managers can insert manual cash entries
DROP POLICY IF EXISTS "Managers can insert company cash ledger" ON company_cash_ledger;
CREATE POLICY "Managers can insert company cash ledger"
ON company_cash_ledger
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Deny all direct client UPDATE and DELETE (Immutable Ledger)
DROP POLICY IF EXISTS "Deny direct update on cash ledger" ON company_cash_ledger;
CREATE POLICY "Deny direct update on cash ledger"
ON company_cash_ledger
FOR UPDATE
TO authenticated, anon
USING (false);

DROP POLICY IF EXISTS "Deny direct delete on cash ledger" ON company_cash_ledger;
CREATE POLICY "Deny direct delete on cash ledger"
ON company_cash_ledger
FOR DELETE
TO authenticated, anon
USING (false);

-- ------------------------------------------------------------------------------
-- 3. HELPER FUNCTIONS & VIEWS FOR CASH BALANCES (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- Returns current Cash in Hand and Total Out Flow for a company
CREATE OR REPLACE FUNCTION get_company_cash_summary()
RETURNS TABLE (
  cash_in_hand NUMERIC(12, 2),
  total_out_flow NUMERIC(12, 2),
  total_added NUMERIC(12, 2),
  total_decreased NUMERIC(12, 2),
  total_disbursed NUMERIC(12, 2),
  total_collected NUMERIC(12, 2)
) AS $$
#variable_conflict use_column
DECLARE
  v_company_id UUID;
  v_is_manager BOOLEAN;
  v_added NUMERIC(12, 2) := 0;
  v_decreased NUMERIC(12, 2) := 0;
  v_disbursed NUMERIC(12, 2) := 0;
  v_collected NUMERIC(12, 2) := 0;
BEGIN
  v_company_id := get_auth_company_id();
  v_is_manager := is_company_manager();

  -- Strictly deny non-managers
  IF v_company_id IS NULL OR NOT v_is_manager THEN
    RAISE EXCEPTION 'Access denied: Only active Managers can view cash summary.';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN transaction_type = 'CASH_ADDED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'CASH_DECREASED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'LOAN_DISBURSED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'PAYMENT_COLLECTED' THEN amount ELSE 0 END), 0)
  INTO v_added, v_decreased, v_disbursed, v_collected
  FROM company_cash_ledger
  WHERE company_cash_ledger.company_id = v_company_id;

  RETURN QUERY SELECT
    ((v_added + v_collected) - (v_decreased + v_disbursed))::NUMERIC(12, 2),
    (v_disbursed + v_decreased)::NUMERIC(12, 2),
    v_added,
    v_decreased,
    v_disbursed,
    v_collected;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

-- Revoke direct execution from anon, allow authenticated managers
REVOKE EXECUTE ON FUNCTION get_company_cash_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_company_cash_summary() TO authenticated, service_role;
