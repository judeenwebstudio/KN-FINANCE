-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 029
-- (FIX EDIT_PAYMENT_RECORD TIMESTAMPTZ CONSTRUCTION & PRESERVE ATOMIC ACCOUNTING)
--
-- Authoritative Fix:
-- Replaces string-concatenated timestamptz construction (+TZ resulting in '+UTC' syntax error)
-- with robust, native PostgreSQL date/time arithmetic:
--   v_new_created_at := (p_payment_date + (COALESCE(v_old_payment.created_at, NOW()) AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC';
--
-- Preserved Authoritative Invariants:
-- 1. Manager-only authorization check (is_company_manager() & fail-closed user session).
-- 2. Strict overpayment rejection (total paid > expected_return).
-- 3. Dynamic borrower status sync (active vs closed).
-- 4. Atomic company_cash_ledger PAYMENT_COLLECTED correction (no duplicate rows).
-- 5. Immutable audit logging to entity_audit_logs and activity_logs.
-- ==============================================================================

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
  v_new_created_at TIMESTAMPTZ;
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

  -- 9. Correct company cash ledger entry atomically with safe timezone handling
  v_new_created_at := (p_payment_date + (COALESCE(v_old_payment.created_at, NOW()) AT TIME ZONE 'UTC')::time) AT TIME ZONE 'UTC';

  INSERT INTO company_cash_ledger (
    company_id, transaction_type, amount, source_type, payment_id, borrower_id, note, performed_by_user_id, created_at
  )
  VALUES (
    v_company_id,
    'PAYMENT_COLLECTED',
    p_amount,
    'PAYMENT',
    p_payment_id,
    v_old_payment.borrower_id,
    'Collection received from ' || COALESCE(v_borrower.name, 'borrower') || ' (edited)',
    v_old_payment.collected_by_user_id,
    v_new_created_at
  )
  ON CONFLICT (company_id, payment_id)
  WHERE transaction_type = 'PAYMENT_COLLECTED' AND payment_id IS NOT NULL
  DO UPDATE SET
    amount = EXCLUDED.amount,
    note = 'Collection received from ' || COALESCE(v_borrower.name, 'borrower') || ' (edited)',
    created_at = EXCLUDED.created_at;

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
-- Permissions on edit_payment_record
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION edit_payment_record FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION edit_payment_record TO authenticated, service_role;
