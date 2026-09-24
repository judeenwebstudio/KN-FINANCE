-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 002 (FINAL SECURITY HARDENING)
-- Row Level Security (RLS) & Multi-Tenant Access Control Policies
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper Security Functions (SECURITY DEFINER)
-- Resolve membership, tenant company_id, and role from auth.uid()
-- Safe search_path prevents search-path hijacking attacks.
-- SECURITY DEFINER prevents infinite RLS recursion on company_users.
-- ------------------------------------------------------------------------------

-- Retrieve the current authenticated user's company_users record (Active only)
CREATE OR REPLACE FUNCTION get_auth_company_user()
RETURNS company_users AS $$
  SELECT *
  FROM company_users
  WHERE auth_user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Retrieve the current authenticated user's company_id (Active only)
CREATE OR REPLACE FUNCTION get_auth_company_id()
RETURNS UUID AS $$
  SELECT company_id
  FROM company_users
  WHERE auth_user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Check if current authenticated user is an active Manager in their company
CREATE OR REPLACE FUNCTION is_company_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_users
    WHERE auth_user_id = auth.uid()
      AND role = 'manager'
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 2. Enable Row Level Security (RLS) on all business tables
-- ------------------------------------------------------------------------------
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. USER_CREDENTIALS Policies
-- STRICT SECURITY: Deny ALL direct client access to credentials.
-- PIN hashes are never selectable or modifiable by browser clients.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Deny all direct client access to user_credentials" ON user_credentials;
CREATE POLICY "Deny all direct client access to user_credentials"
ON user_credentials
FOR ALL
TO authenticated, anon
USING (false);

-- ------------------------------------------------------------------------------
-- 4. COMPANIES Policies
-- ------------------------------------------------------------------------------

-- Active company members can view their own company profile
DROP POLICY IF EXISTS "Company members can view own company" ON companies;
CREATE POLICY "Company members can view own company"
ON companies
FOR SELECT
TO authenticated
USING (id = get_auth_company_id());

-- Only Managers can update their company profile
DROP POLICY IF EXISTS "Managers can update own company" ON companies;
CREATE POLICY "Managers can update own company"
ON companies
FOR UPDATE
TO authenticated
USING (id = get_auth_company_id() AND is_company_manager())
WITH CHECK (id = get_auth_company_id() AND is_company_manager());

-- ------------------------------------------------------------------------------
-- 5. COMPANY_USERS Policies (Hardened Select Privacy)
-- ------------------------------------------------------------------------------

-- Managers can view all users in their own company
DROP POLICY IF EXISTS "Members can view company users" ON company_users;
DROP POLICY IF EXISTS "Managers can view all company users" ON company_users;
CREATE POLICY "Managers can view all company users"
ON company_users
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Agents can view ONLY their own profile; cannot enumerate other agents or manager
DROP POLICY IF EXISTS "Agents can view own profile only" ON company_users;
CREATE POLICY "Agents can view own profile only"
ON company_users
FOR SELECT
TO authenticated
USING (
  id = (get_auth_company_user()).id
  AND NOT is_company_manager()
);

-- Managers can add new agents/users to their company
DROP POLICY IF EXISTS "Managers can insert company users" ON company_users;
CREATE POLICY "Managers can insert company users"
ON company_users
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Managers can update users in their company (e.g. edit profile or deactivate)
DROP POLICY IF EXISTS "Managers can update company users" ON company_users;
CREATE POLICY "Managers can update company users"
ON company_users
FOR UPDATE
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
)
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- ------------------------------------------------------------------------------
-- 6. BORROWERS Policies
-- ------------------------------------------------------------------------------

-- Managers can view all borrowers in their company
DROP POLICY IF EXISTS "Managers can view all company borrowers" ON borrowers;
CREATE POLICY "Managers can view all company borrowers"
ON borrowers
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Agents can view ONLY borrowers explicitly assigned to them
DROP POLICY IF EXISTS "Agents can view assigned borrowers only" ON borrowers;
CREATE POLICY "Agents can view assigned borrowers only"
ON borrowers
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND assigned_agent_id = (get_auth_company_user()).id
);

-- Managers can create borrowers
DROP POLICY IF EXISTS "Managers can create borrowers" ON borrowers;
CREATE POLICY "Managers can create borrowers"
ON borrowers
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Managers can update borrowers
DROP POLICY IF EXISTS "Managers can update borrowers" ON borrowers;
CREATE POLICY "Managers can update borrowers"
ON borrowers
FOR UPDATE
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
)
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Managers can delete borrowers
DROP POLICY IF EXISTS "Managers can delete borrowers" ON borrowers;
CREATE POLICY "Managers can delete borrowers"
ON borrowers
FOR DELETE
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- ------------------------------------------------------------------------------
-- 7. PAYMENTS Policies
-- ------------------------------------------------------------------------------

-- Managers can view all payments in their company
DROP POLICY IF EXISTS "Managers can view all company payments" ON payments;
CREATE POLICY "Managers can view all company payments"
ON payments
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Agents can view payments only for borrowers assigned to them
DROP POLICY IF EXISTS "Agents can view payments for assigned borrowers" ON payments;
CREATE POLICY "Agents can view payments for assigned borrowers"
ON payments
FOR SELECT
TO authenticated
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

-- Managers can record payments (collector must be an active user of the company)
DROP POLICY IF EXISTS "Managers can record payments" ON payments;
CREATE POLICY "Managers can record payments"
ON payments
FOR INSERT
TO authenticated
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

-- Agents can record payments ONLY for borrowers assigned to them, and collected_by MUST be self
DROP POLICY IF EXISTS "Agents can record payments for assigned borrowers only" ON payments;
CREATE POLICY "Agents can record payments for assigned borrowers only"
ON payments
FOR INSERT
TO authenticated
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

-- ------------------------------------------------------------------------------
-- 8. ACTIVITY_LOGS Policies (Anti-Spoofing Hardened)
-- ------------------------------------------------------------------------------

-- Managers can view all activity logs for their company
DROP POLICY IF EXISTS "Managers can view company activity logs" ON activity_logs;
CREATE POLICY "Managers can view company activity logs"
ON activity_logs
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- Agents can view activity logs for actions they performed
DROP POLICY IF EXISTS "Agents can view their own activity logs" ON activity_logs;
CREATE POLICY "Agents can view their own activity logs"
ON activity_logs
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND performed_by_user_id = (get_auth_company_user()).id
);

-- Managers can insert activity logs (performed_by MUST be authenticated manager)
DROP POLICY IF EXISTS "Members can insert activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Managers can insert activity logs" ON activity_logs;
CREATE POLICY "Managers can insert activity logs"
ON activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
  AND performed_by_user_id = (get_auth_company_user()).id
);

-- Agents can insert activity logs ONLY for own actions within assigned scope
DROP POLICY IF EXISTS "Agents can insert activity logs within scope" ON activity_logs;
CREATE POLICY "Agents can insert activity logs within scope"
ON activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND performed_by_user_id = (get_auth_company_user()).id
  -- Anti-spoofing: Agent cannot associate log with another agent
  AND (agent_id IS NULL OR agent_id = (get_auth_company_user()).id)
  -- Anti-spoofing: Borrower must be assigned to this agent
  AND (
    borrower_id IS NULL
    OR EXISTS (
      SELECT 1 FROM borrowers b
      WHERE b.id = borrower_id
        AND b.company_id = get_auth_company_id()
        AND b.assigned_agent_id = (get_auth_company_user()).id
    )
  )
  -- Anti-spoofing: Payment must be collected by this agent
  AND (
    payment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = payment_id
        AND p.company_id = get_auth_company_id()
        AND p.collected_by_user_id = (get_auth_company_user()).id
    )
  )
);

-- ------------------------------------------------------------------------------
-- 9. COMPANY_SETTINGS Policies
-- ------------------------------------------------------------------------------

-- Members can view their company settings
DROP POLICY IF EXISTS "Members can view company settings" ON company_settings;
CREATE POLICY "Members can view company settings"
ON company_settings
FOR SELECT
TO authenticated
USING (company_id = get_auth_company_id());

-- Managers can insert and update company settings
DROP POLICY IF EXISTS "Managers can insert company settings" ON company_settings;
CREATE POLICY "Managers can insert company settings"
ON company_settings
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

DROP POLICY IF EXISTS "Managers can update company settings" ON company_settings;
CREATE POLICY "Managers can update company settings"
ON company_settings
FOR UPDATE
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
)
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);
