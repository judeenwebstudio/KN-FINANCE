-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 006 (CASH LEDGER PERMISSIONS & HARDENING)
-- Grant minimum required table privileges to authenticated role so RLS can be evaluated,
-- while enforcing strict Manager-only visibility and complete immutability.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE-LEVEL PRIVILEGES
-- Grant SELECT & INSERT to authenticated role so PostgreSQL reaches RLS layer.
-- Strictly revoke UPDATE, DELETE, TRUNCATE, and all anon/public access.
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE company_cash_ledger FROM PUBLIC, anon;

GRANT SELECT, INSERT ON TABLE company_cash_ledger TO authenticated;
GRANT ALL ON TABLE company_cash_ledger TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE company_cash_ledger FROM authenticated;

-- ------------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict Isolation:
-- - Active Managers: Can SELECT and INSERT manual entries only for their own company.
-- - Agents: Strictly denied SELECT (RLS returns 0 rows) and denied direct INSERT.
-- - Anon / Unauthenticated: Denied all access.
-- - Direct UPDATE / DELETE: Denied for all client roles (Immutable Ledger).
-- ------------------------------------------------------------------------------
ALTER TABLE company_cash_ledger ENABLE ROW LEVEL SECURITY;

-- 2.1 SELECT Policy: Managers can view only their own company's cash ledger
DROP POLICY IF EXISTS "Managers can view company cash ledger" ON company_cash_ledger;
CREATE POLICY "Managers can view company cash ledger"
ON company_cash_ledger
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- 2.2 INSERT Policy: Managers can insert manual cash entries for their own company
DROP POLICY IF EXISTS "Managers can insert company cash ledger" ON company_cash_ledger;
CREATE POLICY "Managers can insert company cash ledger"
ON company_cash_ledger
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- 2.3 UPDATE Policy: Explicitly deny all client updates (Immutable Ledger)
DROP POLICY IF EXISTS "Deny direct update on cash ledger" ON company_cash_ledger;
CREATE POLICY "Deny direct update on cash ledger"
ON company_cash_ledger
FOR UPDATE
TO authenticated, anon
USING (false);

-- 2.4 DELETE Policy: Explicitly deny all client deletes (Immutable Ledger)
DROP POLICY IF EXISTS "Deny direct delete on cash ledger" ON company_cash_ledger;
CREATE POLICY "Deny direct delete on cash ledger"
ON company_cash_ledger
FOR DELETE
TO authenticated, anon
USING (false);

-- ------------------------------------------------------------------------------
-- 3. CASH SUMMARY FUNCTION PRIVILEGES & SECURITY
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION get_company_cash_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_company_cash_summary() TO authenticated, service_role;
