-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 022 (AGENT COMMISSION CASH ACCOUNTING)
-- Enables dedicated AGENT_COMMISSION cash ledger transactions.
-- 1. Net Given to Borrower = Loan Amount - Deducted Amount (LOAN_DISBURSED)
-- 2. Agent Commission is recorded as a distinct cash outflow (AGENT_COMMISSION)
-- 3. Cash in Hand is reduced by both LOAN_DISBURSED and AGENT_COMMISSION.
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
  CHECK (transaction_type IN ('CASH_ADDED', 'CASH_DECREASED', 'LOAN_DISBURSED', 'PAYMENT_COLLECTED', 'AGENT_COMMISSION'));
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
  CHECK (source_type IN ('MANUAL', 'LOAN', 'PAYMENT', 'COMMISSION'));
END $$;

-- ------------------------------------------------------------------------------
-- 3. Unique Index to prevent duplicate AGENT_COMMISSION entries per borrower
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_agent_commission
ON company_cash_ledger(company_id, borrower_id)
WHERE transaction_type = 'AGENT_COMMISSION' AND borrower_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 4. Update trg_borrower_loan_disbursement() Trigger Function
--    - Inserts LOAN_DISBURSED with Net Amount Given (Loan - Deducted)
--    - Inserts AGENT_COMMISSION with Agent Commission Amount (if > 0)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_loan_disbursement()
RETURNS TRIGGER AS $$
DECLARE
  v_net_amount NUMERIC(12, 2);
  v_commission NUMERIC(12, 2);
  v_company_user_id UUID;
  v_user_full_name TEXT;
BEGIN
  -- Authoritative net amount given calculation: Loan Amount - Deducted Amount
  v_net_amount := COALESCE(
    NEW.net_amount_given,
    NEW.loan_amount - COALESCE(NEW.deducted_amount, 0)
  );
  v_commission := COALESCE(NEW.agent_commission, 0);

  -- Resolve authenticated company user
  SELECT id, full_name INTO v_company_user_id, v_user_full_name
  FROM company_users
  WHERE auth_user_id = auth.uid()
    AND company_id = NEW.company_id
  LIMIT 1;

  -- 1. Insert LOAN_DISBURSED into cash ledger (Borrower Net Loan Cash Outflow)
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

  -- 2. Insert AGENT_COMMISSION into cash ledger (Company Commission Outflow)
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
