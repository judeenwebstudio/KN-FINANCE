-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 021 (AGENT COMMISSION ACCOUNTING REPAIR)
-- Decouples Agent Commission from Net Amount Given, Loan Disbursement, and Cash in Hand.
-- Net Amount Given = Loan Amount - Deducted Amount (Agent Commission is NOT deducted).
-- LOAN_DISBURSED in Cash Ledger = Net Amount Given.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update validation constraint on borrowers table:
--    - agent_commission >= 0
--    - deducted_amount <= loan_amount (commission is independent)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_borrowers_agent_commission'
  ) THEN
    ALTER TABLE borrowers DROP CONSTRAINT chk_borrowers_agent_commission;
  END IF;

  ALTER TABLE borrowers
  ADD CONSTRAINT chk_borrowers_agent_commission
  CHECK (
    agent_commission >= 0 
    AND COALESCE(deducted_amount, 0) <= loan_amount
  );
END $$;

-- ------------------------------------------------------------------------------
-- 2. BEFORE INSERT OR UPDATE TRIGGER to guarantee net_amount_given is computed
--    Net Amount Given = Loan Amount - Deducted Amount (Commission is NOT deducted)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_before_save_net_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.agent_commission := COALESCE(NEW.agent_commission, 0);
  NEW.deducted_amount := COALESCE(NEW.deducted_amount, 0);
  NEW.net_amount_given := NEW.loan_amount - NEW.deducted_amount;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_borrowers_before_save ON borrowers;
CREATE TRIGGER trg_borrowers_before_save
BEFORE INSERT OR UPDATE ON borrowers
FOR EACH ROW EXECUTE FUNCTION trg_borrower_before_save_net_amount();

-- ------------------------------------------------------------------------------
-- 3. UPDATE LOAN DISBURSEMENT TRIGGER
--    Uses the accurate net_amount_given (Loan Amount - Deducted Amount) for
--    LOAN_DISBURSED cash ledger entry.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_loan_disbursement()
RETURNS TRIGGER AS $$
DECLARE
  v_net_amount NUMERIC(12, 2);
  v_company_user_id UUID;
  v_user_full_name TEXT;
BEGIN
  -- Authoritative net amount given calculation: Loan Amount - Deducted Amount
  v_net_amount := COALESCE(
    NEW.net_amount_given,
    NEW.loan_amount - COALESCE(NEW.deducted_amount, 0)
  );

  -- Resolve authenticated company user
  SELECT id, full_name INTO v_company_user_id, v_user_full_name
  FROM company_users
  WHERE auth_user_id = auth.uid()
    AND company_id = NEW.company_id
  LIMIT 1;

  -- 1. Insert LOAN_DISBURSED into cash ledger if actual cash was disbursed
  IF v_net_amount > 0 THEN
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
      v_net_amount,
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
    NEW.loan_amount,
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
