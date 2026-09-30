-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 031
-- (SERVER-AUTHORITATIVE 5% AGENT COMMISSION & 7% DEDUCTED AMOUNT)
--
-- Authoritative Business Rules:
-- 1. Agent Commission is automatically 5% of Loan Amount (loan_amount * 0.05).
--    - Example: ₹10,000 * 0.05 = ₹500.
--    - Outside company cash ledger (0 rows in company_cash_ledger).
-- 2. Deducted Amount is automatically 7% of Loan Amount (loan_amount * 0.07).
--    - Example: ₹10,000 * 0.07 = ₹700.
--    - Retained company cash (recorded as DEDUCTED_AMOUNT in company_cash_ledger).
-- 3. Net Amount Given = GREATEST(0, loan_amount - deducted_amount - agent_commission).
--    - Example: ₹10,000 - ₹700 - ₹500 = ₹8,800.
-- 4. Loan Disbursed = full principal (loan_amount).
-- 5. Preserves all Migration 030 dual-role authorization (Manager & Assigned Agent).
-- 6. Preserves atomic ledger updates, overpayment protections, and audit trail.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Trigger: trg_borrower_before_save_net_amount()
-- Guarantees server-side computation of 5% Commission, 7% Deduction, and Net Amount Given.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_borrower_before_save_net_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.loan_amount IS NOT NULL AND NEW.loan_amount > 0 THEN
    NEW.agent_commission := ROUND(NEW.loan_amount * 0.05, 2);
    NEW.deducted_amount := ROUND(NEW.loan_amount * 0.07, 2);
    NEW.net_amount_given := GREATEST(0, NEW.loan_amount - NEW.deducted_amount - NEW.agent_commission);
  ELSE
    NEW.agent_commission := 0;
    NEW.deducted_amount := 0;
    NEW.net_amount_given := 0;
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
-- Updates borrower records with server-computed 5% Commission & 7% Deduction,
-- preserving Migration 030 dual-role authorization and atomic ledger consistency.
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

  -- 5. Calculate authoritative financial values (5% Commission, 7% Deduction)
  v_loan_amount := COALESCE(p_loan_amount, v_old_borrower.loan_amount);

  IF v_loan_amount <= 0 THEN
    RAISE EXCEPTION 'Loan amount must be greater than zero.';
  END IF;

  v_agent_commission := ROUND(v_loan_amount * 0.05, 2);
  v_deducted_amount := ROUND(v_loan_amount * 0.07, 2);
  v_net_amount_given := GREATEST(0, v_loan_amount - v_deducted_amount - v_agent_commission);

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

  IF v_total_paid >= COALESCE(p_expected_return, v_old_borrower.expected_return) THEN
    v_new_status := 'closed';
  ELSE
    v_new_status := 'active';
  END IF;

  -- 7. Snapshot previous values for audit trail
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
    'interest_rate', p_interest_rate,
    'finance_type', COALESCE(p_finance_type, v_old_borrower.finance_type),
    'repayment_duration', COALESCE(p_repayment_duration, v_old_borrower.repayment_duration),
    'start_date', COALESCE(p_start_date, v_old_borrower.start_date),
    'end_date', p_end_date,
    'weekly_collection_day', p_weekly_collection_day,
    'monthly_collection_day', p_monthly_collection_day,
    'status', v_new_status
  );

  -- 8. Update borrower record
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
    interest_rate = p_interest_rate,
    finance_type = COALESCE(p_finance_type, finance_type),
    repayment_duration = COALESCE(p_repayment_duration, repayment_duration),
    start_date = COALESCE(p_start_date, start_date),
    end_date = p_end_date,
    weekly_collection_day = p_weekly_collection_day,
    monthly_collection_day = p_monthly_collection_day,
    status = v_new_status,
    updated_at = NOW()
  WHERE id = p_borrower_id AND company_id = v_user.company_id;

  -- 9. Correct company cash ledger entries atomically
  IF v_loan_amount > 0 THEN
    INSERT INTO company_cash_ledger (
      company_id, transaction_type, amount, source_type, borrower_id, note, performed_by_user_id, created_at
    )
    VALUES (
      v_user.company_id, 'LOAN_DISBURSED', v_loan_amount, 'LOAN', p_borrower_id, 'Loan disbursed to ' || COALESCE(p_name, v_old_borrower.name), v_user.id, NOW()
    )
    ON CONFLICT (company_id, borrower_id)
    WHERE transaction_type = 'LOAN_DISBURSED' AND borrower_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      note = 'Loan disbursed to ' || COALESCE(p_name, v_old_borrower.name);
  END IF;

  IF v_deducted_amount > 0 THEN
    INSERT INTO company_cash_ledger (
      company_id, transaction_type, amount, source_type, borrower_id, note, performed_by_user_id, created_at
    )
    VALUES (
      v_user.company_id, 'DEDUCTED_AMOUNT', v_deducted_amount, 'DEDUCTION', p_borrower_id, 'Deducted amount retained for ' || COALESCE(p_name, v_old_borrower.name), v_user.id, NOW()
    )
    ON CONFLICT (company_id, borrower_id)
    WHERE transaction_type = 'DEDUCTED_AMOUNT' AND borrower_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      note = 'Deducted amount retained for ' || COALESCE(p_name, v_old_borrower.name);
  ELSE
    DELETE FROM company_cash_ledger
    WHERE company_id = v_user.company_id
      AND borrower_id = p_borrower_id
      AND transaction_type = 'DEDUCTED_AMOUNT';
  END IF;

  -- 10. Record audit logs
  INSERT INTO entity_audit_logs (
    company_id, entity_type, entity_id, performed_by_user_id, action, previous_values, new_values, note, created_at
  )
  VALUES (
    v_user.company_id, 'BORROWER', p_borrower_id, v_user.id, 'UPDATE', v_old_values, v_new_values,
    'Borrower details updated by ' || INITCAP(v_user.role) || '.', NOW()
  );

  INSERT INTO activity_logs (
    company_id, performed_by_user_id, action, borrower_id, message, created_at
  )
  VALUES (
    v_user.company_id, v_user.id, 'borrower_updated', p_borrower_id,
    'Borrower ' || COALESCE(p_name, v_old_borrower.name) || ' was updated.', NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'borrower_id', p_borrower_id,
    'status', v_new_status,
    'loan_amount', v_loan_amount,
    'agent_commission', v_agent_commission,
    'deducted_amount', v_deducted_amount,
    'net_amount_given', v_net_amount_given,
    'total_paid', v_total_paid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Grant permissions for edit_borrower_record RPC
REVOKE ALL ON FUNCTION edit_borrower_record(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION edit_borrower_record(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER
) TO authenticated;
