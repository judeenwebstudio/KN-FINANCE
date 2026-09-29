-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 025
-- (BORROWER DEDUCTED AMOUNT COMPANY CASH ACCOUNTING & IDEMPOTENT RECONCILIATION)
--
-- Authoritative Business Accounting Rule:
-- 1. Deducted Amount is money retained by the COMPANY (upfront documentation/fee).
-- 2. Deducted Amount MUST increase / remain in Company Cash in Hand.
-- 3. LOAN_DISBURSED continues to record the FULL loan amount (NEW.loan_amount).
-- 4. Deducted Amount is recorded as a distinct inflow entry (transaction_type = 'DEDUCTED_AMOUNT', source_type = 'DEDUCTION').
-- 5. Agent Commission remains completely independent and does NOT enter the ledger.
-- 6. Repayments (PAYMENT_COLLECTED) increase Cash in Hand and reduce Out Flow.
--
-- Accounting Formulas:
-- Cash in Hand = CASH_ADDED + PAYMENT_COLLECTED + DEDUCTED_AMOUNT - LOAN_DISBURSED - CASH_DECREASED
-- Out Flow     = MAX(0, LOAN_DISBURSED - PAYMENT_COLLECTED) + CASH_DECREASED
--
-- Example:
-- Starting Cash = ₹3,00,000
-- Loan Disbursed = ₹20,000 (Outflow)
-- Deducted Amount = ₹1,400 (Retained Inflow)
-- Repayment Collected = ₹2,000 (Inflow)
-- -> Cash in Hand = ₹3,00,000 - ₹20,000 + ₹1,400 + ₹2,000 = ₹2,83,400
-- -> Out Flow     = ₹20,000 - ₹2,000 = ₹18,000
-- -> Agent Commission = ₹1,000 (independent reporting)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update company_cash_ledger transaction_type constraint
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_cash_ledger_transaction_type_check'
  ) THEN
    ALTER TABLE company_cash_ledger DROP CONSTRAINT company_cash_ledger_transaction_type_check;
  END IF;

  ALTER TABLE company_cash_ledger
  ADD CONSTRAINT company_cash_ledger_transaction_type_check
  CHECK (transaction_type IN ('CASH_ADDED', 'CASH_DECREASED', 'LOAN_DISBURSED', 'PAYMENT_COLLECTED', 'AGENT_COMMISSION', 'DEDUCTED_AMOUNT'));
END $$;

-- ------------------------------------------------------------------------------
-- 2. Update company_cash_ledger source_type constraint
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_cash_ledger_source_type_check'
  ) THEN
    ALTER TABLE company_cash_ledger DROP CONSTRAINT company_cash_ledger_source_type_check;
  END IF;

  ALTER TABLE company_cash_ledger
  ADD CONSTRAINT company_cash_ledger_source_type_check
  CHECK (source_type IN ('MANUAL', 'LOAN', 'PAYMENT', 'COMMISSION', 'DEDUCTION'));
END $$;

-- ------------------------------------------------------------------------------
-- 3. Unique Index to prevent duplicate DEDUCTED_AMOUNT entries per borrower
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_deducted_amount
ON company_cash_ledger(company_id, borrower_id)
WHERE transaction_type = 'DEDUCTED_AMOUNT' AND borrower_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 4. Update trg_borrower_loan_disbursement() Trigger Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_loan_disbursement()
RETURNS TRIGGER AS $$
DECLARE
  v_loan_amount NUMERIC(12, 2);
  v_deducted_amount NUMERIC(12, 2);
  v_company_user_id UUID;
  v_user_full_name TEXT;
BEGIN
  -- Authoritative loan and deduction columns (ZERO references to obsolete 'amount' column)
  v_loan_amount := COALESCE(NEW.loan_amount, 0);
  v_deducted_amount := COALESCE(NEW.deducted_amount, 0);

  -- Resolve authenticated company user
  SELECT id, full_name INTO v_company_user_id, v_user_full_name
  FROM company_users
  WHERE auth_user_id = auth.uid()
    AND company_id = NEW.company_id
  LIMIT 1;

  -- 1. Insert LOAN_DISBURSED into cash ledger (Full Loan Outflow)
  IF v_loan_amount > 0 THEN
    INSERT INTO company_cash_ledger (
      company_id,
      transaction_type,
      amount,
      source_type,
      borrower_id,
      note,
      performed_by_user_id,
      created_at
    )
    VALUES (
      NEW.company_id,
      'LOAN_DISBURSED',
      v_loan_amount,
      'LOAN',
      NEW.id,
      'Loan disbursed to ' || NEW.name,
      v_company_user_id,
      NOW()
    )
    ON CONFLICT (company_id, borrower_id)
    WHERE transaction_type = 'LOAN_DISBURSED' AND borrower_id IS NOT NULL
    DO NOTHING;
  END IF;

  -- 2. Insert DEDUCTED_AMOUNT into cash ledger (Company Retained Cash Inflow)
  IF v_deducted_amount > 0 THEN
    INSERT INTO company_cash_ledger (
      company_id,
      transaction_type,
      amount,
      source_type,
      borrower_id,
      note,
      performed_by_user_id,
      created_at
    )
    VALUES (
      NEW.company_id,
      'DEDUCTED_AMOUNT',
      v_deducted_amount,
      'DEDUCTION',
      NEW.id,
      'Deducted amount retained for ' || NEW.name,
      v_company_user_id,
      NOW()
    )
    ON CONFLICT (company_id, borrower_id)
    WHERE transaction_type = 'DEDUCTED_AMOUNT' AND borrower_id IS NOT NULL
    DO NOTHING;
  END IF;

  -- 3. Insert borrower_created activity log
  INSERT INTO activity_logs (
    company_id,
    performed_by_user_id,
    action,
    borrower_id,
    amount,
    message,
    created_at
  )
  VALUES (
    NEW.company_id,
    v_company_user_id,
    'borrower_created',
    NEW.id,
    v_loan_amount,
    'Borrower ' || NEW.name || ' was added.',
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Re-attach AFTER INSERT trigger
DROP TRIGGER IF EXISTS trg_borrowers_after_insert_ledger ON borrowers;
CREATE TRIGGER trg_borrowers_after_insert_ledger
AFTER INSERT ON borrowers
FOR EACH ROW EXECUTE FUNCTION trg_borrower_loan_disbursement();

-- ------------------------------------------------------------------------------
-- 5. Safely Replace get_company_cash_summary() SQL Helper Function
-- (Must DROP first because return type table signature expands with total_deducted)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_company_cash_summary();

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
  v_is_manager BOOLEAN;
  v_added NUMERIC(12, 2) := 0;
  v_decreased NUMERIC(12, 2) := 0;
  v_disbursed NUMERIC(12, 2) := 0;
  v_collected NUMERIC(12, 2) := 0;
  v_deducted NUMERIC(12, 2) := 0;
BEGIN
  v_company_id := get_auth_company_id();
  v_is_manager := is_company_manager();

  IF v_company_id IS NULL OR NOT v_is_manager THEN
    RAISE EXCEPTION 'Access denied: Only active Managers can view cash summary.';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN transaction_type = 'CASH_ADDED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'CASH_DECREASED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'LOAN_DISBURSED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'PAYMENT_COLLECTED' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'DEDUCTED_AMOUNT' THEN amount ELSE 0 END), 0)
  INTO v_added, v_decreased, v_disbursed, v_collected, v_deducted
  FROM company_cash_ledger
  WHERE company_cash_ledger.company_id = v_company_id;

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

-- Re-apply execution permissions
REVOKE EXECUTE ON FUNCTION get_company_cash_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_company_cash_summary() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. Historical Reconciliation for Existing Borrowers with Deducted Amount > 0
-- (Fully Idempotent — will not duplicate if executed multiple times)
-- ------------------------------------------------------------------------------
INSERT INTO company_cash_ledger (
  company_id,
  transaction_type,
  amount,
  source_type,
  borrower_id,
  note,
  created_at
)
SELECT
  b.company_id,
  'DEDUCTED_AMOUNT',
  b.deducted_amount,
  'DEDUCTION',
  b.id,
  'Deducted amount retained for ' || b.name,
  b.created_at
FROM borrowers b
WHERE COALESCE(b.deducted_amount, 0) > 0
ON CONFLICT (company_id, borrower_id)
WHERE transaction_type = 'DEDUCTED_AMOUNT' AND borrower_id IS NOT NULL
DO NOTHING;
