-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 033
-- (FINANCE-TYPE BASED ADD BORROWER COMMISSION & DEDUCTION ENFORCEMENT)
--
-- Authoritative Business Rules:
-- 1. ADD NEW BORROWER (INSERT):
--    - DAILY & WEEKLY: Server automatically calculates and enforces 5% Agent Commission
--      and 7% Deducted Amount (loan_amount * 0.05 and loan_amount * 0.07).
--    - MONTHLY: Server accepts user-supplied manual Agent Commission and Deducted Amount.
--    - Validation for Monthly: agent_commission >= 0 AND deducted_amount >= 0.
--    - Validation for Monthly: (agent_commission + deducted_amount) <= loan_amount.
--    - Net Amount Given = GREATEST(0, loan_amount - deducted_amount - agent_commission).
-- 2. EDIT BORROWER (UPDATE / RPC edit_borrower_record):
--    - Preserves Migration 032 manual Commission & Deduction editing for ALL finance types.
--    - Changing Loan Amount during edit does not overwrite custom commission/deduction.
--    - Validates non-negative amounts and total deductions <= loan amount.
-- 3. ACCOUNTING & LEDGER:
--    - LOAN_DISBURSED remains the full loan principal.
--    - DEDUCTED_AMOUNT is retained company cash (ledger inflow entry).
--    - Agent Commission is NON-CASH (0 rows in company_cash_ledger).
-- 4. DUAL-ROLE AUTHORIZATION (Preserves Migration 030):
--    - Manager can edit any borrower in company and reassign agents.
--    - Assigned Agent can edit only assigned borrowers; cannot reassign agents.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Trigger: trg_borrower_before_save_net_amount()
-- Enforces auto 5%/7% for Daily/Weekly on INSERT, while respecting manual values
-- for Monthly on INSERT and for all types on UPDATE.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_before_save_net_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.finance_type IN ('Daily', 'Weekly') THEN
      IF NEW.loan_amount IS NOT NULL AND NEW.loan_amount > 0 THEN
        NEW.agent_commission := ROUND(NEW.loan_amount * 0.05, 2);
        NEW.deducted_amount := ROUND(NEW.loan_amount * 0.07, 2);
        NEW.net_amount_given := GREATEST(0, NEW.loan_amount - NEW.deducted_amount - NEW.agent_commission);
      ELSE
        NEW.agent_commission := 0;
        NEW.deducted_amount := 0;
        NEW.net_amount_given := 0;
      END IF;
    ELSE -- 'Monthly' (or any custom finance type)
      NEW.agent_commission := GREATEST(0, COALESCE(NEW.agent_commission, 0));
      NEW.deducted_amount := GREATEST(0, COALESCE(NEW.deducted_amount, 0));
      IF (NEW.agent_commission + NEW.deducted_amount) > COALESCE(NEW.loan_amount, 0) THEN
        RAISE EXCEPTION 'The sum of Deducted Amount and Agent Commission cannot exceed the Loan Amount.';
      END IF;
      NEW.net_amount_given := GREATEST(0, COALESCE(NEW.loan_amount, 0) - NEW.deducted_amount - NEW.agent_commission);
    END IF;
  ELSE -- UPDATE (all finance types allow validated manual values)
    NEW.agent_commission := GREATEST(0, COALESCE(NEW.agent_commission, 0));
    NEW.deducted_amount := GREATEST(0, COALESCE(NEW.deducted_amount, 0));
    IF (NEW.agent_commission + NEW.deducted_amount) > COALESCE(NEW.loan_amount, 0) THEN
      RAISE EXCEPTION 'The sum of Deducted Amount and Agent Commission cannot exceed the Loan Amount.';
    END IF;
    NEW.net_amount_given := GREATEST(0, COALESCE(NEW.loan_amount, 0) - NEW.deducted_amount - NEW.agent_commission);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Re-attach BEFORE trigger on borrowers table
DROP TRIGGER IF EXISTS trg_borrowers_before_save ON borrowers;
CREATE TRIGGER trg_borrowers_before_save
BEFORE INSERT OR UPDATE ON borrowers
FOR EACH ROW EXECUTE FUNCTION trg_borrower_before_save_net_amount();

-- ------------------------------------------------------------------------------
-- 2. RPC: edit_borrower_record()
-- Preserves Migration 032 manual Commission & Deduction for all finance types,
-- with strict validation, atomic cash ledger sync, and dual-role authorization.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION edit_borrower_record(
  p_borrower_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_alternate_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_book_no INTEGER DEFAULT NULL,
  p_collection_line TEXT DEFAULT NULL,
  p_assigned_agent_id UUID DEFAULT NULL,
  p_collection_method TEXT DEFAULT 'Hand Cash',
  p_loan_amount NUMERIC(12, 2) DEFAULT NULL,
  p_deducted_amount NUMERIC(12, 2) DEFAULT 0,
  p_agent_commission NUMERIC(12, 2) DEFAULT 0,
  p_expected_return NUMERIC(12, 2) DEFAULT NULL,
  p_interest_rate NUMERIC(5, 2) DEFAULT NULL,
  p_finance_type TEXT DEFAULT 'Daily',
  p_repayment_duration TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_weekly_collection_day INTEGER DEFAULT NULL,
  p_monthly_collection_day INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_old_borrower RECORD;
  v_effective_assigned_agent_id UUID;
  v_loan_amount NUMERIC(12, 2);
  v_agent_commission NUMERIC(12, 2);
  v_deducted_amount NUMERIC(12, 2);
  v_net_amount_given NUMERIC(12, 2);
  v_total_paid NUMERIC(12, 2) := 0;
  v_new_status TEXT := 'active';
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN
  -- 1. Resolve active company user session
  SELECT id, company_id, role INTO v_user
  FROM company_users
  WHERE auth_user_id = auth.uid() AND status = 'active'
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: Unable to resolve active company user session.';
  END IF;

  -- 2. Fetch existing borrower record with lock
  SELECT * INTO v_old_borrower
  FROM borrowers
  WHERE id = p_borrower_id AND company_id = v_user.company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Borrower not found or does not belong to your company.';
  END IF;

  -- 3. Authorization Check (Manager or Assigned Agent)
  IF v_user.role = 'manager' THEN
    v_effective_assigned_agent_id := p_assigned_agent_id;
  ELSIF v_user.role = 'agent' THEN
    IF v_old_borrower.assigned_agent_id IS NULL OR v_old_borrower.assigned_agent_id <> v_user.id THEN
      RAISE EXCEPTION 'Access denied: Agents can only edit borrowers assigned to them.';
    END IF;
    -- Agents CANNOT change assigned agent; preserve existing assignment server-side
    v_effective_assigned_agent_id := v_old_borrower.assigned_agent_id;
  ELSE
    RAISE EXCEPTION 'Access denied: Unauthorized role.';
  END IF;

  -- 4. Validate Book No uniqueness if changed
  IF p_book_no IS NOT NULL AND p_book_no > 0 THEN
    IF EXISTS (
      SELECT 1 FROM borrowers
      WHERE company_id = v_user.company_id
        AND book_no = p_book_no
        AND id <> p_borrower_id
    ) THEN
      RAISE EXCEPTION 'Book No % is already in use by another borrower in your company.', p_book_no;
    END IF;
  END IF;

  -- 5. Calculate and validate financial values
  v_loan_amount := COALESCE(p_loan_amount, v_old_borrower.loan_amount);

  IF v_loan_amount <= 0 THEN
    RAISE EXCEPTION 'Loan amount must be greater than zero.';
  END IF;

  v_agent_commission := COALESCE(p_agent_commission, v_old_borrower.agent_commission, 0);
  v_deducted_amount := COALESCE(p_deducted_amount, v_old_borrower.deducted_amount, 0);

  IF v_agent_commission < 0 OR v_deducted_amount < 0 THEN
    RAISE EXCEPTION 'Agent Commission and Deducted Amount must be greater than or equal to zero.';
  END IF;

  IF (v_deducted_amount + v_agent_commission) > v_loan_amount THEN
    RAISE EXCEPTION 'The sum of Deducted Amount and Agent Commission cannot exceed the Loan Amount.';
  END IF;

  IF COALESCE(p_expected_return, v_old_borrower.expected_return) < v_loan_amount THEN
    RAISE EXCEPTION 'Expected return cannot be less than loan amount.';
  END IF;

  -- 6. Validate historical payment safety
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments
  WHERE borrower_id = p_borrower_id AND company_id = v_user.company_id;

  IF v_total_paid > COALESCE(p_expected_return, v_old_borrower.expected_return) THEN
    RAISE EXCEPTION 'Cannot reduce expected return to ₹% because ₹% has already been collected for this borrower.',
      TRIM(TO_CHAR(p_expected_return, '99,99,99,990')),
      TRIM(TO_CHAR(v_total_paid, '99,99,99,990'));
  END IF;

  -- 7. Calculate derived values
  v_net_amount_given := GREATEST(0, v_loan_amount - v_deducted_amount - v_agent_commission);

  IF v_total_paid >= COALESCE(p_expected_return, v_old_borrower.expected_return) THEN
    v_new_status := 'closed';
  ELSE
    v_new_status := 'active';
  END IF;

  -- 8. Snapshot previous values for audit trail
  v_old_values := jsonb_build_object(
    'name', v_old_borrower.name,
    'phone', v_old_borrower.phone,
    'alternate_phone', v_old_borrower.alternate_phone,
    'address', v_old_borrower.address,
    'book_no', v_old_borrower.book_no,
    'collection_line', v_old_borrower.collection_line,
    'assigned_agent_id', v_old_borrower.assigned_agent_id,
    'collection_method', v_old_borrower.collection_method,
    'loan_amount', v_old_borrower.loan_amount,
    'deducted_amount', v_old_borrower.deducted_amount,
    'agent_commission', v_old_borrower.agent_commission,
    'net_amount_given', v_old_borrower.net_amount_given,
    'expected_return', v_old_borrower.expected_return,
    'interest_rate', v_old_borrower.interest_rate,
    'finance_type', v_old_borrower.finance_type,
    'repayment_duration', v_old_borrower.repayment_duration,
    'start_date', v_old_borrower.start_date,
    'end_date', v_old_borrower.end_date,
    'weekly_collection_day', v_old_borrower.weekly_collection_day,
    'monthly_collection_day', v_old_borrower.monthly_collection_day,
    'status', v_old_borrower.status
  );

  v_new_values := jsonb_build_object(
    'name', COALESCE(p_name, v_old_borrower.name),
    'phone', COALESCE(p_phone, v_old_borrower.phone),
    'alternate_phone', p_alternate_phone,
    'address', p_address,
    'book_no', p_book_no,
    'collection_line', p_collection_line,
    'assigned_agent_id', v_effective_assigned_agent_id,
    'collection_method', COALESCE(p_collection_method, v_old_borrower.collection_method),
    'loan_amount', v_loan_amount,
    'deducted_amount', v_deducted_amount,
    'agent_commission', v_agent_commission,
    'net_amount_given', v_net_amount_given,
    'expected_return', COALESCE(p_expected_return, v_old_borrower.expected_return),
    'interest_rate', COALESCE(p_interest_rate, v_old_borrower.interest_rate),
    'finance_type', COALESCE(p_finance_type, v_old_borrower.finance_type),
    'repayment_duration', COALESCE(p_repayment_duration, v_old_borrower.repayment_duration),
    'start_date', COALESCE(p_start_date, v_old_borrower.start_date),
    'end_date', COALESCE(p_end_date, v_old_borrower.end_date),
    'weekly_collection_day', p_weekly_collection_day,
    'monthly_collection_day', p_monthly_collection_day,
    'status', v_new_status
  );

  -- 9. Update borrower record
  UPDATE borrowers
  SET
    name = COALESCE(p_name, name),
    phone = COALESCE(p_phone, phone),
    alternate_phone = p_alternate_phone,
    address = p_address,
    book_no = p_book_no,
    collection_line = p_collection_line,
    assigned_agent_id = v_effective_assigned_agent_id,
    collection_method = COALESCE(p_collection_method, collection_method),
    loan_amount = v_loan_amount,
    deducted_amount = v_deducted_amount,
    agent_commission = v_agent_commission,
    net_amount_given = v_net_amount_given,
    expected_return = COALESCE(p_expected_return, expected_return),
    interest_rate = COALESCE(p_interest_rate, interest_rate),
    finance_type = COALESCE(p_finance_type, finance_type),
    repayment_duration = COALESCE(p_repayment_duration, repayment_duration),
    start_date = COALESCE(p_start_date, start_date),
    end_date = COALESCE(p_end_date, end_date),
    weekly_collection_day = p_weekly_collection_day,
    monthly_collection_day = p_monthly_collection_day,
    status = v_new_status,
    updated_at = NOW()
  WHERE id = p_borrower_id AND company_id = v_user.company_id;

  -- 10. Atomically sync company cash ledger for loan principal (LOAN_DISBURSED)
  IF EXISTS (
    SELECT 1 FROM company_cash_ledger
    WHERE company_id = v_user.company_id
      AND borrower_id = p_borrower_id
      AND transaction_type = 'LOAN_DISBURSED'
  ) THEN
    UPDATE company_cash_ledger
    SET
      amount = v_loan_amount,
      note = 'Loan disbursed to ' || COALESCE(p_name, v_old_borrower.name)
    WHERE company_id = v_user.company_id
      AND borrower_id = p_borrower_id
      AND transaction_type = 'LOAN_DISBURSED';
  ELSE
    INSERT INTO company_cash_ledger (
      company_id,
      transaction_type,
      amount,
      source_type,
      borrower_id,
      note,
      performed_by_user_id,
      created_at
    ) VALUES (
      v_user.company_id,
      'LOAN_DISBURSED',
      v_loan_amount,
      'LOAN',
      p_borrower_id,
      'Loan disbursed to ' || COALESCE(p_name, v_old_borrower.name),
      v_user.id,
      COALESCE(p_start_date, v_old_borrower.start_date, CURRENT_DATE)
    );
  END IF;

  -- 11. Atomically sync company cash ledger for Deducted Amount (DEDUCTED_AMOUNT)
  IF v_deducted_amount > 0 THEN
    IF EXISTS (
      SELECT 1 FROM company_cash_ledger
      WHERE company_id = v_user.company_id
        AND borrower_id = p_borrower_id
        AND transaction_type = 'DEDUCTED_AMOUNT'
    ) THEN
      UPDATE company_cash_ledger
      SET
        amount = v_deducted_amount,
        note = 'Deducted amount retained for ' || COALESCE(p_name, v_old_borrower.name)
      WHERE company_id = v_user.company_id
        AND borrower_id = p_borrower_id
        AND transaction_type = 'DEDUCTED_AMOUNT';
    ELSE
      INSERT INTO company_cash_ledger (
        company_id,
        transaction_type,
        amount,
        source_type,
        borrower_id,
        note,
        performed_by_user_id,
        created_at
      ) VALUES (
        v_user.company_id,
        'DEDUCTED_AMOUNT',
        v_deducted_amount,
        'DEDUCTION',
        p_borrower_id,
        'Deducted amount retained for ' || COALESCE(p_name, v_old_borrower.name),
        v_user.id,
        COALESCE(p_start_date, v_old_borrower.start_date, CURRENT_DATE)
      );
    END IF;
  ELSE
    DELETE FROM company_cash_ledger
    WHERE company_id = v_user.company_id
      AND borrower_id = p_borrower_id
      AND transaction_type = 'DEDUCTED_AMOUNT';
  END IF;

  -- 12. Record audit logs
  INSERT INTO entity_audit_logs (
    company_id,
    entity_type,
    entity_id,
    action,
    performed_by,
    old_values,
    new_values
  ) VALUES (
    v_user.company_id,
    'borrower',
    p_borrower_id,
    'EDIT',
    v_user.id,
    v_old_values,
    v_new_values
  );

  INSERT INTO activity_logs (
    company_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    v_user.company_id,
    v_user.id,
    'edit_borrower',
    'borrower',
    p_borrower_id,
    jsonb_build_object(
      'borrower_name', COALESCE(p_name, v_old_borrower.name),
      'loan_amount', v_loan_amount,
      'deducted_amount', v_deducted_amount,
      'agent_commission', v_agent_commission,
      'net_amount_given', v_net_amount_given,
      'finance_type', COALESCE(p_finance_type, v_old_borrower.finance_type),
      'editor_role', v_user.role
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'borrower_id', p_borrower_id,
    'status', v_new_status,
    'loan_amount', v_loan_amount,
    'deducted_amount', v_deducted_amount,
    'agent_commission', v_agent_commission,
    'net_amount_given', v_net_amount_given
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

REVOKE ALL ON FUNCTION edit_borrower_record(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION edit_borrower_record(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER
) TO authenticated;
