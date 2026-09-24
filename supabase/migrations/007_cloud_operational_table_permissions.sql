-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 007 (LEAST-PRIVILEGE OPERATIONAL PERMISSIONS)
-- Enforce strict least-privilege table grants on authenticated role:
-- - PostgreSQL reaches RLS layer only for operations genuinely executed by clients.
-- - Unnecessary TRUNCATE, REFERENCES, TRIGGER, UPDATE, and DELETE are strictly REVOKED.
-- - Serverless/trigger-managed tables (company_users, activity_logs) are SELECT-only.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HELPER SECURITY FUNCTIONS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION get_auth_company_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_auth_company_user() TO authenticated, service_role;

REVOKE ALL ON FUNCTION get_auth_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_auth_company_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION is_company_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_company_manager() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. USER_CREDENTIALS (Zero-Trust Shielding)
-- Deny ALL privileges to authenticated, anon, and public.
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE user_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE user_credentials TO service_role;

-- ------------------------------------------------------------------------------
-- 3. COMPANIES (Read-Only to Authenticated Members)
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE companies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE companies TO authenticated;
GRANT ALL ON TABLE companies TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE companies FROM authenticated;

-- ------------------------------------------------------------------------------
-- 4. COMPANY_USERS (Read-Only to Authenticated Members)
-- Agent provisioning and status management are handled authoritatively via /api/auth/agent.
-- Direct client INSERT, UPDATE, DELETE are strictly forbidden.
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE company_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE company_users TO authenticated;
GRANT ALL ON TABLE company_users TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE company_users FROM authenticated;

-- ------------------------------------------------------------------------------
-- 5. BORROWERS (Manager CRUD, Agent Assigned Read)
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE borrowers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE borrowers TO authenticated;
GRANT ALL ON TABLE borrowers TO service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE borrowers FROM authenticated;

-- ------------------------------------------------------------------------------
-- 6. PAYMENTS (Receipt Inflow: Manager Read/Insert, Agent Collection Insert)
-- Immutable: Direct UPDATE and DELETE strictly revoked.
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE payments TO authenticated;
GRANT ALL ON TABLE payments TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE payments FROM authenticated;

-- ------------------------------------------------------------------------------
-- 7. ACTIVITY_LOGS (Audit Trail: Read-Only to Clients)
-- Audit entries are generated exclusively by database triggers (SECURITY DEFINER).
-- Direct client INSERT, UPDATE, DELETE are strictly forbidden.
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE activity_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE activity_logs TO authenticated;
GRANT ALL ON TABLE activity_logs TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE activity_logs FROM authenticated;

-- ------------------------------------------------------------------------------
-- 8. COMPANY_SETTINGS (Preferences: Member Read, Manager Update)
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE company_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE company_settings TO authenticated;
GRANT ALL ON TABLE company_settings TO service_role;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE company_settings FROM authenticated;

-- ------------------------------------------------------------------------------
-- 9. RE-ASSERT & HARDEN ALL OPERATIONAL RLS POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_cash_ledger ENABLE ROW LEVEL SECURITY;

-- 9.1 COMPANIES RLS
DROP POLICY IF EXISTS "Members can view own company" ON companies;
CREATE POLICY "Members can view own company"
ON companies FOR SELECT TO authenticated
USING (id = get_auth_company_id());

-- 9.2 COMPANY_USERS RLS
DROP POLICY IF EXISTS "Managers can view company users" ON company_users;
CREATE POLICY "Managers can view company users"
ON company_users FOR SELECT TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Agents can view their own company profile" ON company_users;
CREATE POLICY "Agents can view their own company profile"
ON company_users FOR SELECT TO authenticated
USING (
  id = (get_auth_company_user()).id
  AND NOT is_company_manager()
);

-- Deny direct client insert/update/delete on company_users
DROP POLICY IF EXISTS "Managers can insert company users" ON company_users;
DROP POLICY IF EXISTS "Managers can update company users" ON company_users;

-- 9.3 BORROWERS RLS
DROP POLICY IF EXISTS "Managers can view all company borrowers" ON borrowers;
CREATE POLICY "Managers can view all company borrowers"
ON borrowers FOR SELECT TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Agents can view assigned borrowers only" ON borrowers;
CREATE POLICY "Agents can view assigned borrowers only"
ON borrowers FOR SELECT TO authenticated
USING (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND assigned_agent_id = (get_auth_company_user()).id
);

DROP POLICY IF EXISTS "Managers can create borrowers" ON borrowers;
CREATE POLICY "Managers can create borrowers"
ON borrowers FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Managers can update borrowers" ON borrowers;
CREATE POLICY "Managers can update borrowers"
ON borrowers FOR UPDATE TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
)
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Managers can delete borrowers" ON borrowers;
CREATE POLICY "Managers can delete borrowers"
ON borrowers FOR DELETE TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- 9.4 PAYMENTS RLS
DROP POLICY IF EXISTS "Managers can view all company payments" ON payments;
CREATE POLICY "Managers can view all company payments"
ON payments FOR SELECT TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Agents can view payments for assigned borrowers" ON payments;
CREATE POLICY "Agents can view payments for assigned borrowers"
ON payments FOR SELECT TO authenticated
USING (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND borrower_id IN (
    SELECT b.id
    FROM borrowers b
    WHERE b.company_id = get_auth_company_id()
      AND b.assigned_agent_id = (get_auth_company_user()).id
  )
);

DROP POLICY IF EXISTS "Managers can record payments" ON payments;
CREATE POLICY "Managers can record payments"
ON payments FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
  AND EXISTS (
    SELECT 1 FROM company_users u
    WHERE u.id = collected_by_user_id
      AND u.company_id = get_auth_company_id()
      AND u.status = 'active'
  )
);

DROP POLICY IF EXISTS "Agents can record payments for assigned borrowers only" ON payments;
CREATE POLICY "Agents can record payments for assigned borrowers only"
ON payments FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND collected_by_user_id = (get_auth_company_user()).id
  AND EXISTS (
    SELECT 1
    FROM borrowers b
    WHERE b.id = borrower_id
      AND b.company_id = get_auth_company_id()
      AND b.assigned_agent_id = (get_auth_company_user()).id
  )
);

-- 9.5 ACTIVITY_LOGS RLS
DROP POLICY IF EXISTS "Managers can view company activity logs" ON activity_logs;
CREATE POLICY "Managers can view company activity logs"
ON activity_logs FOR SELECT TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Agents can view their own activity logs" ON activity_logs;
CREATE POLICY "Agents can view their own activity logs"
ON activity_logs FOR SELECT TO authenticated
USING (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND performed_by_user_id = (get_auth_company_user()).id
);

-- Deny direct client inserts on activity_logs (Triggers use SECURITY DEFINER)
DROP POLICY IF EXISTS "Managers can insert activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Agents can insert activity logs within scope" ON activity_logs;

-- 9.6 COMPANY_SETTINGS RLS
DROP POLICY IF EXISTS "Members can view company settings" ON company_settings;
CREATE POLICY "Members can view company settings"
ON company_settings FOR SELECT TO authenticated
USING (company_id = get_auth_company_id());

DROP POLICY IF EXISTS "Managers can insert company settings" ON company_settings;
CREATE POLICY "Managers can insert company settings"
ON company_settings FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Managers can update company settings" ON company_settings;
CREATE POLICY "Managers can update company settings"
ON company_settings FOR UPDATE TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
)
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);
