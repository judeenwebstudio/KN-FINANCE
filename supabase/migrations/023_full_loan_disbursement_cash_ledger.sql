-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 023 (FULL LOAN DISBURSEMENT CASH LEDGER)
-- Authoritative Business Accounting Rule:
-- 1. When a borrower is created, LOAN_DISBURSED records the FULL loan amount issued (NEW.loan_amount).
-- 2. AGENT_COMMISSION records the separate agent commission (NEW.agent_commission).
-- 3. Both LOAN_DISBURSED and AGENT_COMMISSION reduce company Cash in Hand.
-- 4. Repayments increase Cash in Hand as PAYMENT_COLLECTED.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update trg_borrower_loan_disbursement() Trigger Function
--    - LOAN_DISBURSED records the full loan amount issued (NEW.loan_amount)
--    - AGENT_COMMISSION records the dedicated agent commission (NEW.agent_commission)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_loan_disbursement()
RETURNS TRIGGER AS $$
DECLARE
  v_loan_amount NUMERIC(12, 2);
  v_commission NUMERIC(12, 2);
  v_company_user_id UUID;
  v_user_full_name TEXT;
BEGIN
  -- Authoritative full loan amount issued for cash ledger outflow
  v_loan_amount := COALESCE(NEW.loan_amount, NEW.amount, 0);
  v_commission := COALESCE(NEW.agent_commission, 0);

  -- Resolve authenticated company user
  SELECT id, full_name INTO v_company_user_id, v_user_full_name
  FROM company_users
  WHERE auth_user_id = auth.uid()
    AND company_id = NEW.company_id
  LIMIT 1;

  -- 1. Insert LOAN_DISBURSED into cash ledger (Full Loan Amount Issued)
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

  -- 2. Insert AGENT_COMMISSION into cash ledger (Separate Commission Outflow)
  IF v_commission > 0 THEN
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
      'AGENT_COMMISSION',
      v_commission,
      'COMMISSION',
      NEW.id,
      'Agent commission for ' || NEW.name,
      v_company_user_id,
      NOW()
    )
    ON CONFLICT (company_id, borrower_id)
    WHERE transaction_type = 'AGENT_COMMISSION' AND borrower_id IS NOT NULL
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
