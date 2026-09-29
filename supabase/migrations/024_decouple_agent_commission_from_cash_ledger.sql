-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 024
-- (DECOUPLE AGENT COMMISSION FROM COMPANY CASH LEDGER & STRICT SCHEMA SAFETY)
--
-- Authoritative Business Accounting Rule:
-- 1. Agent Commission is collected directly by the Agent from the Borrower.
-- 2. Agent Commission is NOT company cash movement and does NOT affect company_cash_ledger.
-- 3. trg_borrower_loan_disbursement() records LOAN_DISBURSED (full loan_amount) only.
-- 4. Strictly references borrowers.loan_amount (ZERO references to obsolete 'amount' column).
-- 5. Purges historical AGENT_COMMISSION entries from company_cash_ledger.
-- 6. Preserves borrowers.agent_commission reporting data and activity logging.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update trg_borrower_loan_disbursement() Trigger Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_loan_disbursement()
RETURNS TRIGGER AS $$
DECLARE
  v_loan_amount NUMERIC(12, 2);
  v_company_user_id UUID;
  v_user_full_name TEXT;
BEGIN
  -- Authoritative full loan principal issued from company cash
  v_loan_amount := COALESCE(NEW.loan_amount, 0);

  -- Resolve authenticated company user
  SELECT id, full_name INTO v_company_user_id, v_user_full_name
  FROM company_users
  WHERE auth_user_id = auth.uid()
    AND company_id = NEW.company_id
  LIMIT 1;

  -- 1. Insert LOAN_DISBURSED into cash ledger (Company Loan Principal Outflow)
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

  -- 2. Insert borrower_created activity log
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
-- 2. Clean up historical AGENT_COMMISSION ledger entries (Pure Company Cash Ledger)
-- ------------------------------------------------------------------------------
DELETE FROM company_cash_ledger
WHERE transaction_type = 'AGENT_COMMISSION';

-- Drop the unique index on AGENT_COMMISSION in cash ledger
DROP INDEX IF EXISTS uq_cash_ledger_agent_commission;
