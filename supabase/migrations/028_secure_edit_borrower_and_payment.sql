-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 028
-- (SECURE TRANSACTIONAL BORROWER & PAYMENT EDITING + AUDIT TRAIL)
--
-- Authoritative Business Rules:
-- 1. Manager-only Authorization:
--    Only active Managers can edit borrower details or payment records.
--    Agents are strictly denied execution at database RPC level.
-- 2. Borrower Financial Consistency:
--    - Editing loan_amount updates LOAN_DISBURSED in company_cash_ledger atomically.
--    - Editing deducted_amount updates DEDUCTED_AMOUNT in company_cash_ledger atomically.
--    - Agent Commission remains independent with zero ledger effect.
--    - Net Amount Given = MAX(0, loan_amount - deducted_amount - agent_commission).
--    - If total paid > new expected_return, edit is rejected with clear error.
--    - Borrower status (active/closed) is dynamically synced based on total paid vs expected return.
-- 3. Payment Editing Consistency:
--    - Editing payment amount updates PAYMENT_COLLECTED in company_cash_ledger atomically.
--    - Rejects overpayment exceeding expected_return with an explicit error.
--    - Prevents duplicate or stale ledger entries.
--    - Re-evaluates borrower status (active/closed) and cash accounting metrics.
-- 4. Audit Trail & Immutability:
--    - Creates entity_audit_logs table tracking entity type, entity ID, previous & new values,
--      changed fields, and performing user (never storing auth secrets/credentials).
--    - Direct INSERT, UPDATE, and DELETE by clients are strictly denied by RLS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENTITY_AUDIT_LOGS Table & Strict RLS
-- Immutable audit log for historical edits to financial and master entities.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('BORROWER', 'PAYMENT', 'CASH_ENTRY')),
  entity_id UUID NOT NULL,
  performed_by_user_id UUID,
  action TEXT NOT NULL DEFAULT 'UPDATE' CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_entity_audit_logs_performed_by
    FOREIGN KEY (company_id, performed_by_user_id)
    REFERENCES company_users(company_id, id)
    ON DELETE SET NULL (performed_by_user_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_audit_logs_company_id ON entity_audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_entity_audit_logs_entity ON entity_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_audit_logs_created_at ON entity_audit_logs(created_at DESC);

-- RLS on entity_audit_logs: Managers only can SELECT; direct INSERT, UPDATE, and DELETE denied
ALTER TABLE entity_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view entity audit logs" ON entity_audit_logs;
CREATE POLICY "Managers can view entity audit logs"
ON entity_audit_logs
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Deny direct insert on entity audit logs" ON entity_audit_logs;
CREATE POLICY "Deny direct insert on entity audit logs"
ON entity_audit_logs
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct update on entity audit logs" ON entity_audit_logs;
CREATE POLICY "Deny direct update on entity audit logs"
ON entity_audit_logs
FOR UPDATE
TO authenticated, anon
USING (false);

DROP POLICY IF EXISTS "Deny direct delete on entity audit logs" ON entity_audit_logs;
CREATE POLICY "Deny direct delete on entity audit logs"
ON entity_audit_logs
FOR DELETE
TO authenticated, anon
USING (false);

-- ------------------------------------------------------------------------------
-- 2. Ensure Unique Indexes on company_cash_ledger
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_loan_disbursed
ON company_cash_ledger(company_id, borrower_id)
WHERE transaction_type = 'LOAN_DISBURSED' AND borrower_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_deducted_amount
ON company_cash_ledger(company_id, borrower_id)
WHERE transaction_type = 'DEDUCTED_AMOUNT' AND borrower_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_payment_collected
ON company_cash_ledger(company_id, payment_id)
WHERE transaction_type = 'PAYMENT_COLLECTED' AND payment_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. RPC: edit_borrower_record()
-- Secure atomic transaction for updating borrower master data and financial parameters.
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
  v_company_id UUID;
  v_user_id UUID;
  v_is_manager BOOLEAN;
  v_old_borrower RECORD;
  v_total_paid NUMERIC(12, 2) := 0;
  v_net_amount_given NUMERIC(12, 2) := 0;
  v_new_status TEXT := 'active';
  v_old_values JSONB;
  v_new_values JSONB;
  v_changed_fields JSONB := '[]'::jsonb;
BEGIN
  -- 1. Enforce Manager Authorization
  v_company_id := get_auth_company_id();
  v_is_manager := is_company_manager();

  IF v_company_id IS NULL OR NOT v_is_manager THEN
    RAISE EXCEPTION 'Access denied: Only company Managers can edit borrower details.';
  END IF;

  SELECT id INTO v_user_id
  FROM company_users
  WHERE auth_user_id = auth.uid() AND company_id = v_company_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: Unable to resolve active company user session.';
  END IF;

  -- 2. Fetch existing borrower record with lock
  SELECT * INTO v_old_borrower
  FROM borrowers
  WHERE id = p_borrower_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Borrower not found or does not belong to your company.';
  END IF;

  -- 3. Validate Book No uniqueness if changed
  IF p_book_no IS NOT NULL AND p_book_no > 0 THEN
    IF EXISTS (
      SELECT 1 FROM borrowers
      WHERE company_id = v_company_id
        AND book_no = p_book_no
        AND id <> p_borrower_id
    ) THEN
      RAISE EXCEPTION 'Book No % is already in use by another borrower in your company.', p_book_no;
    END IF;
  END IF;

  -- 4. Validate financial rules
  IF COALESCE(p_loan_amount, v_old_borrower.loan_amount) <= 0 THEN
    RAISE EXCEPTION 'Loan amount must be greater than zero.';
  END IF;

  IF (COALESCE(p_deducted_amount, 0) + COALESCE(p_agent_commission, 0)) > COALESCE(p_loan_amount, v_old_borrower.loan_amount) THEN
    RAISE EXCEPTION 'The sum of Deducted Amount and Agent Commission cannot exceed the Loan Amount.';
  END IF;

  IF COALESCE(p_expected_return, v_old_borrower.expected_return) < COALESCE(p_loan_amount, v_old_borrower.loan_amount) THEN
    RAISE EXCEPTION 'Expected return cannot be less than loan amount.';
  END IF;

  -- 5. Validate historical payment safety
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments
  WHERE borrower_id = p_borrower_id AND company_id = v_company_id;

  IF v_total_paid > COALESCE(p_expected_return, v_old_borrower.expected_return) THEN
    RAISE EXCEPTION 'Cannot reduce expected return to ₹% because ₹% has already been collected for this borrower.',
      TRIM(TO_CHAR(p_expected_return, '99,99,99,990')),
      TRIM(TO_CHAR(v_total_paid, '99,99,99,990'));
  END IF;

  -- 6. Calculate derived values
  v_net_amount_given := GREATEST(0, COALESCE(p_loan_amount, v_old_borrower.loan_amount) - COALESCE(p_deducted_amount, 0) - COALESCE(p_agent_commission, 0));

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
    'assigned_agent_id', p_assigned_agent_id,
    'collection_method', COALESCE(p_collection_method, v_old_borrower.collection_method),
    'loan_amount', COALESCE(p_loan_amount, v_old_borrower.loan_amount),
    'deducted_amount', COALESCE(p_deducted_amount, 0),
    'agent_commission', COALESCE(p_agent_commission, 0),
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
    assigned_agent_id = p_assigned_agent_id,
    collection_method = COALESCE(p_collection_method, collection_method),
    loan_amount = COALESCE(p_loan_amount, loan_amount),
    deducted_amount = COALESCE(p_deducted_amount, 0),
    agent_commission = COALESCE(p_agent_commission, 0),
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
  WHERE id = p_borrower_id AND company_id = v_company_id;

  -- 9. Correct company cash ledger entries atomically
  -- 9a. Update LOAN_DISBURSED entry
  IF COALESCE(p_loan_amount, v_old_borrower.loan_amount) > 0 THEN
    INSERT INTO company_cash_ledger (
      company_id, transaction_type, amount, source_type, borrower_id, note, performed_by_user_id, created_at
    )
    VALUES (
      v_company_id, 'LOAN_DISBURSED', COALESCE(p_loan_amount, v_old_borrower.loan_amount), 'LOAN', p_borrower_id, 'Loan disbursed to ' || COALESCE(p_name, v_old_borrower.name), v_user_id, NOW()
    )
    ON CONFLICT (company_id, borrower_id)
    WHERE transaction_type = 'LOAN_DISBURSED' AND borrower_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      note = 'Loan disbursed to ' || COALESCE(p_name, v_old_borrower.name);
  END IF;

  -- 9b. Update DEDUCTED_AMOUNT entry
  IF COALESCE(p_deducted_amount, 0) > 0 THEN
    INSERT INTO company_cash_ledger (
      company_id, transaction_type, amount, source_type, borrower_id, note, performed_by_user_id, created_at
    )
    VALUES (
      v_company_id, 'DEDUCTED_AMOUNT', p_deducted_amount, 'DEDUCTION', p_borrower_id, 'Deducted amount retained for ' || COALESCE(p_name, v_old_borrower.name), v_user_id, NOW()
    )
    ON CONFLICT (company_id, borrower_id)
    WHERE transaction_type = 'DEDUCTED_AMOUNT' AND borrower_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      note = 'Deducted amount retained for ' || COALESCE(p_name, v_old_borrower.name);
  ELSE
    DELETE FROM company_cash_ledger
    WHERE company_id = v_company_id
      AND borrower_id = p_borrower_id
      AND transaction_type = 'DEDUCTED_AMOUNT';
  END IF;

  -- 10. Record audit logs
  INSERT INTO entity_audit_logs (
    company_id, entity_type, entity_id, performed_by_user_id, action, previous_values, new_values, note, created_at
  )
  VALUES (
    v_company_id, 'BORROWER', p_borrower_id, v_user_id, 'UPDATE', v_old_values, v_new_values, 'Borrower details updated by Manager.', NOW()
  );

  INSERT INTO activity_logs (
    company_id, performed_by_user_id, action, borrower_id, message, created_at
  )
  VALUES (
    v_company_id, v_user_id, 'borrower_updated', p_borrower_id, 'Borrower ' || COALESCE(p_name, v_old_borrower.name) || ' was updated.', NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'borrower_id', p_borrower_id,
    'status', v_new_status,
    'net_amount_given', v_net_amount_given,
    'total_paid', v_total_paid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 4. RPC: edit_payment_record()
-- Secure atomic transaction for updating historical payment records & cash ledger.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION edit_payment_record(
  p_payment_id UUID,
  p_amount NUMERIC(12, 2),
  p_payment_date DATE,
  p_collection_method TEXT DEFAULT 'Hand Cash',
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_is_manager BOOLEAN;
  v_old_payment RECORD;
  v_borrower RECORD;
  v_other_paid NUMERIC(12, 2) := 0;
  v_new_total_paid NUMERIC(12, 2) := 0;
  v_new_status TEXT := 'active';
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN
  -- 1. Enforce Manager Authorization
  v_company_id := get_auth_company_id();
  v_is_manager := is_company_manager();

  IF v_company_id IS NULL OR NOT v_is_manager THEN
    RAISE EXCEPTION 'Access denied: Only company Managers can edit payment records.';
  END IF;

  SELECT id INTO v_user_id
  FROM company_users
  WHERE auth_user_id = auth.uid() AND company_id = v_company_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: Unable to resolve active company user session.';
  END IF;

  -- 2. Fetch existing payment record with lock
  SELECT * INTO v_old_payment
  FROM payments
  WHERE id = p_payment_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record not found or does not belong to your company.';
  END IF;

  -- 3. Validate new parameters
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Payment date is required.';
  END IF;

  IF p_collection_method IS NOT NULL AND p_collection_method NOT IN ('Hand Cash', 'Banking') THEN
    RAISE EXCEPTION 'Collection method must be either Hand Cash or Banking.';
  END IF;

  -- 4. Fetch borrower record with lock
  SELECT * INTO v_borrower
  FROM borrowers
  WHERE id = v_old_payment.borrower_id AND company_id = v_company_id
  FOR UPDATE;

  -- 5. Calculate new total paid & status
  SELECT COALESCE(SUM(amount), 0) INTO v_other_paid
  FROM payments
  WHERE borrower_id = v_old_payment.borrower_id
    AND company_id = v_company_id
    AND id <> p_payment_id;

  v_new_total_paid := v_other_paid + p_amount;

  -- Strict Overpayment Protection
  IF v_new_total_paid > v_borrower.expected_return THEN
    RAISE EXCEPTION 'Payment of ₹% rejected: total paid (₹%) would exceed borrower expected return (₹%). Maximum remaining payable is ₹%.',
      TRIM(TO_CHAR(p_amount, '99,99,99,990')),
      TRIM(TO_CHAR(v_new_total_paid, '99,99,99,990')),
      TRIM(TO_CHAR(v_borrower.expected_return, '99,99,99,990')),
      TRIM(TO_CHAR(GREATEST(0, v_borrower.expected_return - v_other_paid), '99,99,99,990'));
  END IF;

  IF v_new_total_paid = v_borrower.expected_return THEN
    v_new_status := 'closed';
  ELSE
    v_new_status := 'active';
  END IF;

  -- 6. Snapshot previous values for audit trail
  v_old_values := jsonb_build_object(
    'amount', v_old_payment.amount,
    'payment_date', v_old_payment.payment_date,
    'collection_method', v_old_payment.collection_method,
    'note', v_old_payment.note
  );

  v_new_values := jsonb_build_object(
    'amount', p_amount,
    'payment_date', p_payment_date,
    'collection_method', COALESCE(p_collection_method, v_old_payment.collection_method),
    'note', p_note
  );

  -- 7. Update payment record
  UPDATE payments
  SET
    amount = p_amount,
    payment_date = p_payment_date,
    collection_method = COALESCE(p_collection_method, collection_method),
    note = p_note
  WHERE id = p_payment_id AND company_id = v_company_id;

  -- 8. Update borrower status if changed
  IF v_borrower.status <> v_new_status THEN
    UPDATE borrowers
    SET status = v_new_status, updated_at = NOW()
    WHERE id = v_old_payment.borrower_id AND company_id = v_company_id;
  END IF;

  -- 9. Correct company cash ledger entry atomically
  INSERT INTO company_cash_ledger (
    company_id, transaction_type, amount, source_type, payment_id, borrower_id, note, performed_by_user_id, created_at
  )
  VALUES (
    v_company_id, 'PAYMENT_COLLECTED', p_amount, 'PAYMENT', p_payment_id, v_old_payment.borrower_id,
    'Collection received from ' || COALESCE(v_borrower.name, 'borrower') || ' (edited)',
    v_old_payment.collected_by_user_id,
    (p_payment_date::text || ' ' || TO_CHAR(v_old_payment.created_at, 'HH24:MI:SS+TZ'))::TIMESTAMPTZ
  )
  ON CONFLICT (company_id, payment_id)
  WHERE transaction_type = 'PAYMENT_COLLECTED' AND payment_id IS NOT NULL
  DO UPDATE SET
    amount = EXCLUDED.amount,
    note = 'Collection received from ' || COALESCE(v_borrower.name, 'borrower') || ' (edited)',
    created_at = (p_payment_date::text || ' ' || TO_CHAR(company_cash_ledger.created_at, 'HH24:MI:SS+TZ'))::TIMESTAMPTZ;

  -- 10. Record audit logs
  INSERT INTO entity_audit_logs (
    company_id, entity_type, entity_id, performed_by_user_id, action, previous_values, new_values, note, created_at
  )
  VALUES (
    v_company_id, 'PAYMENT', p_payment_id, v_user_id, 'UPDATE', v_old_values, v_new_values, 'Payment updated from ₹' || TRIM(TO_CHAR(v_old_payment.amount, '99,99,99,990')) || ' to ₹' || TRIM(TO_CHAR(p_amount, '99,99,99,990')), NOW()
  );

  INSERT INTO activity_logs (
    company_id, performed_by_user_id, action, borrower_id, payment_id, amount, message, created_at
  )
  VALUES (
    v_company_id, v_user_id, 'payment_updated', v_old_payment.borrower_id, p_payment_id, p_amount,
    'Payment of ₹' || TRIM(TO_CHAR(p_amount, '99,99,99,990')) || ' for ' || COALESCE(v_borrower.name, 'borrower') || ' was edited.', NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'borrower_id', v_old_payment.borrower_id,
    'new_total_paid', v_new_total_paid,
    'borrower_status', v_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 5. Permissions on RPC Functions
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION edit_borrower_record FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION edit_borrower_record TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION edit_payment_record FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION edit_payment_record TO authenticated, service_role;
