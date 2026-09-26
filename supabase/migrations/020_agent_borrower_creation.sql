-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 020 (AGENT BORROWER CREATION)
-- Authorizes authenticated active Agents to create borrowers assigned to themselves.
-- Strictly enforces company scoping and self-assignment in RLS.
-- Preserves Manager borrower creation and existing tenant isolation.
-- ==============================================================================

-- 1. Ensure Table Grants for INSERT on borrowers
GRANT INSERT ON TABLE public.borrowers TO authenticated;

-- 2. Preserve / Re-assert Manager INSERT policy
DROP POLICY IF EXISTS "Managers can create borrowers" ON public.borrowers;
CREATE POLICY "Managers can create borrowers"
ON public.borrowers FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- 3. Add Agent INSERT policy enforcing self-assignment within caller's company
DROP POLICY IF EXISTS "Agents can create assigned borrowers" ON public.borrowers;
CREATE POLICY "Agents can create assigned borrowers"
ON public.borrowers FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND NOT is_company_manager()
  AND assigned_agent_id = (get_auth_company_user()).id
);
