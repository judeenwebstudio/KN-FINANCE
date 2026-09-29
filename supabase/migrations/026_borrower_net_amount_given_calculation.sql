-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 026
-- (NET AMOUNT GIVEN CALCULATION UPDATE & HISTORICAL BACKFILL)
--
-- Authoritative Business Rule:
-- 1. Net Amount Given = Loan Amount - Deducted Amount - Agent Commission
--    Example: ₹20,000 - ₹1,400 - ₹1,000 = ₹17,600
-- 2. LOAN_DISBURSED remains the full ₹20,000 principal.
-- 3. DEDUCTED_AMOUNT remains ₹1,400 retained company cash.
-- 4. Agent Commission is collected separately by the Agent from the Borrower.
-- 5. Agent Commission does NOT affect company cash ledger (0 AGENT_COMMISSION rows).
-- 6. Net Amount Given on borrowers table is updated by BEFORE INSERT/UPDATE trigger.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update validation constraint on borrowers table
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
    AND COALESCE(deducted_amount, 0) >= 0
    AND (COALESCE(deducted_amount, 0) + COALESCE(agent_commission, 0)) <= loan_amount
  );
END $$;

-- ------------------------------------------------------------------------------
-- 2. Update BEFORE INSERT OR UPDATE TRIGGER for net_amount_given calculation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_before_save_net_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.agent_commission := COALESCE(NEW.agent_commission, 0);
  NEW.deducted_amount := COALESCE(NEW.deducted_amount, 0);
  NEW.net_amount_given := COALESCE(NEW.loan_amount, 0) - NEW.deducted_amount - NEW.agent_commission;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Re-attach BEFORE trigger
DROP TRIGGER IF EXISTS trg_borrowers_before_save ON borrowers;
CREATE TRIGGER trg_borrowers_before_save
BEFORE INSERT OR UPDATE ON borrowers
FOR EACH ROW EXECUTE FUNCTION trg_borrower_before_save_net_amount();

-- ------------------------------------------------------------------------------
-- 3. Backfill Existing Borrowers (Updates Net Amount Given)
-- ------------------------------------------------------------------------------
UPDATE borrowers
SET net_amount_given = loan_amount - COALESCE(deducted_amount, 0) - COALESCE(agent_commission, 0);
