-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 005 (CLOUD BORROWER & PAYMENT SYNC)
-- Atomic Cloud Borrower Creation, Payment Collections & Cash Ledger Synchronization
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure Optional net_amount_given column exists on borrowers table
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'borrowers' AND column_name = 'net_amount_given'
  ) THEN
    ALTER TABLE borrowers ADD COLUMN net_amount_given NUMERIC(12, 2);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. AUTOMATIC ATOMIC LOAN DISBURSEMENT TRIGGER
-- When a borrower is inserted in Supabase:
-- 1. Calculates actual net cash handed over: loan_amount - deducted_amount.
-- 2. Inserts exactly ONE 'LOAN_DISBURSED' entry into company_cash_ledger.
-- 3. Inserts a 'borrower_created' audit entry in activity_logs.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_loan_disbursement()
RETURNS TRIGGER AS $$
DECLARE
  v_net_amount NUMERIC(12, 2);
  v_company_user_id UUID;
  v_user_full_name TEXT;
BEGIN
  -- Net amount given calculation
  v_net_amount := NEW.loan_amount - COALESCE(NEW.deducted_amount, 0);

  -- Update NEW.net_amount_given if null
  IF NEW.net_amount_given IS NULL THEN
    NEW.net_amount_given := v_net_amount;
  END IF;

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

DROP TRIGGER IF EXISTS trg_borrowers_after_insert_ledger ON borrowers;
CREATE TRIGGER trg_borrowers_after_insert_ledger
AFTER INSERT ON borrowers
FOR EACH ROW EXECUTE FUNCTION trg_borrower_loan_disbursement();

-- ------------------------------------------------------------------------------
-- 3. AUTOMATIC ATOMIC PAYMENT COLLECTION & CASH IN HAND TRIGGER
-- When a payment is inserted (by Manager or Agent):
-- 1. Inserts exactly ONE 'PAYMENT_COLLECTED' entry into company_cash_ledger.
-- 2. Checks if total payments >= expected_return, automatically marks borrower 'closed'.
-- 3. Inserts 'payment_collected' (and optionally 'loan_closed') activity logs.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_payment_collection_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_borrower_name TEXT;
  v_expected_return NUMERIC(12, 2);
  v_borrower_status TEXT;
  v_total_paid NUMERIC(12, 2);
  v_collector_name TEXT;
  v_collector_role TEXT;
BEGIN
  -- Retrieve borrower details
  SELECT name, expected_return, status
  INTO v_borrower_name, v_expected_return, v_borrower_status
  FROM borrowers
  WHERE id = NEW.borrower_id AND company_id = NEW.company_id;

  -- Retrieve collector name/role
  SELECT full_name, role
  INTO v_collector_name, v_collector_role
  FROM company_users
  WHERE id = NEW.collected_by_user_id AND company_id = NEW.company_id;

  -- 1. Insert PAYMENT_COLLECTED into company_cash_ledger (Atomic Cash in Hand increment)
  -- Uses SECURITY DEFINER so Agents can record payments without needing direct ledger RLS.
  INSERT INTO company_cash_ledger (
    company_id,
    transaction_type,
    amount,
    source_type,
    payment_id,
    borrower_id,
    note,
    performed_by_user_id,
    created_at
  )
  VALUES (
    NEW.company_id,
    'PAYMENT_COLLECTED',
    NEW.amount,
    'PAYMENT',
    NEW.id,
    NEW.borrower_id,
    'Collection received from ' || COALESCE(v_borrower_name, 'borrower'),
    NEW.collected_by_user_id,
    NOW()
  )
  ON CONFLICT (company_id, payment_id)
  WHERE transaction_type = 'PAYMENT_COLLECTED' AND payment_id IS NOT NULL
  DO NOTHING;

  -- 2. Insert payment_collected activity log
  INSERT INTO activity_logs (
    company_id,
    performed_by_user_id,
    action,
    borrower_id,
    payment_id,
    amount,
    message,
    created_at
  )
  VALUES (
    NEW.company_id,
    NEW.collected_by_user_id,
    'payment_collected',
    NEW.borrower_id,
    NEW.id,
    NEW.amount,
    '₹' || TRIM(TO_CHAR(NEW.amount, '99,99,99,990')) || ' collected from ' || COALESCE(v_borrower_name, 'borrower') || '.',
    NOW()
  );

  -- 3. Check for Loan Closure (Total Paid >= Expected Return)
  IF v_expected_return IS NOT NULL AND v_expected_return > 0 THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM payments
    WHERE borrower_id = NEW.borrower_id AND company_id = NEW.company_id;

    IF v_total_paid >= v_expected_return AND v_borrower_status = 'active' THEN
      UPDATE borrowers
      SET status = 'closed', updated_at = NOW()
      WHERE id = NEW.borrower_id AND company_id = NEW.company_id;

      INSERT INTO activity_logs (
        company_id,
        performed_by_user_id,
        action,
        borrower_id,
        payment_id,
        message,
        created_at
      )
      VALUES (
        NEW.company_id,
        NEW.collected_by_user_id,
        'loan_closed',
        NEW.borrower_id,
        NEW.id,
        'Loan for ' || COALESCE(v_borrower_name, 'borrower') || ' was closed.',
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_payments_after_insert_ledger ON payments;
CREATE TRIGGER trg_payments_after_insert_ledger
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION trg_payment_collection_ledger();

-- ------------------------------------------------------------------------------
-- 4. Ensure RLS policies are strictly hardened and verified
-- ------------------------------------------------------------------------------

-- Ensure Agent can view payments for assigned borrowers
DROP POLICY IF EXISTS "Agents can view payments for assigned borrowers" ON payments;
CREATE POLICY "Agents can view payments for assigned borrowers"
ON payments
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND (
    is_company_manager()
    OR (
      NOT is_company_manager()
      AND (
        collected_by_user_id = (get_auth_company_user()).id
        OR borrower_id IN (
          SELECT b.id
          FROM borrowers b
          WHERE b.company_id = get_auth_company_id()
            AND b.assigned_agent_id = (get_auth_company_user()).id
        )
      )
    )
  )
);

-- Ensure Agent can record payments for assigned borrowers
DROP POLICY IF EXISTS "Agents can record payments for assigned borrowers only" ON payments;
CREATE POLICY "Agents can record payments for assigned borrowers only"
ON payments
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND (
    is_company_manager()
    OR (
      NOT is_company_manager()
      AND collected_by_user_id = (get_auth_company_user()).id
      AND EXISTS (
        SELECT 1
        FROM borrowers b
        WHERE b.id = borrower_id
          AND b.company_id = get_auth_company_id()
          AND b.assigned_agent_id = (get_auth_company_user()).id
      )
    )
  )
);
