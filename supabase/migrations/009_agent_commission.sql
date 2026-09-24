-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 009 (AGENT COMMISSION SUPPORT)
-- Adds agent_commission column to borrowers table, updates net amount given
-- calculations and ensures cash ledger loan disbursement accuracy.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add agent_commission column to borrowers table (Default 0, Not Null)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'borrowers' AND column_name = 'agent_commission'
  ) THEN
    ALTER TABLE borrowers ADD COLUMN agent_commission NUMERIC(12, 2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Add validation constraint:
--    - agent_commission >= 0
--    - deducted_amount + agent_commission <= loan_amount
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_borrowers_agent_commission'
  ) THEN
    ALTER TABLE borrowers
    ADD CONSTRAINT chk_borrowers_agent_commission
    CHECK (
      agent_commission >= 0 
      AND (COALESCE(deducted_amount, 0) + agent_commission) <= loan_amount
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. BEFORE INSERT OR UPDATE TRIGGER to guarantee net_amount_given is computed
--    Net Amount Given = Loan Amount - Deducted Amount - Agent Commission
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_before_save_net_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.agent_commission := COALESCE(NEW.agent_commission, 0);
  NEW.deducted_amount := COALESCE(NEW.deducted_amount, 0);
  NEW.net_amount_given := NEW.loan_amount - NEW.deducted_amount - NEW.agent_commission;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_borrowers_before_save ON borrowers;
CREATE TRIGGER trg_borrowers_before_save
BEFORE INSERT OR UPDATE ON borrowers
FOR EACH ROW EXECUTE FUNCTION trg_borrower_before_save_net_amount();

-- ------------------------------------------------------------------------------
-- 4. UPDATE LOAN DISBURSEMENT TRIGGER
--    Uses the accurate net_amount_given for LOAN_DISBURSED cash ledger entry.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_loan_disbursement()
RETURNS TRIGGER AS $$
DECLARE
  v_net_amount NUMERIC(12, 2);
  v_company_user_id UUID;
  v_user_full_name TEXT;
BEGIN
  -- Authoritative net amount given calculation
  v_net_amount := COALESCE(
    NEW.net_amount_given,
    NEW.loan_amount - COALESCE(NEW.deducted_amount, 0) - COALESCE(NEW.agent_commission, 0)
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

-- Re-attach AFTER INSERT trigger to ensure fresh definition
DROP TRIGGER IF EXISTS trg_borrowers_after_insert_ledger ON borrowers;
CREATE TRIGGER trg_borrowers_after_insert_ledger
AFTER INSERT ON borrowers
FOR EACH ROW EXECUTE FUNCTION trg_borrower_loan_disbursement();

-- ------------------------------------------------------------------------------
-- 5. Backfill any legacy rows missing default values
-- ------------------------------------------------------------------------------
UPDATE borrowers 
SET agent_commission = 0 
WHERE agent_commission IS NULL;

UPDATE borrowers 
SET net_amount_given = loan_amount - COALESCE(deducted_amount, 0) - COALESCE(agent_commission, 0) 
WHERE net_amount_given IS NULL;
