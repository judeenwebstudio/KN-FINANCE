-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 018 (DYNAMIC COLLECTION LINES)
-- Multi-tenant Dynamic Company Collection Lines & Borrower Association
-- ==============================================================================

-- 1. Remove the legacy hard-coded collection line CHECK constraint from Migration 012
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_borrower_collection_line'
  ) THEN
    ALTER TABLE public.borrowers DROP CONSTRAINT chk_borrower_collection_line;
  END IF;
END $$;

-- 2. Create company_collection_lines table
CREATE TABLE IF NOT EXISTS public.company_collection_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite Unique Constraint: enables tenant isolation
  CONSTRAINT uq_company_collection_lines_company_id_id UNIQUE (company_id, id)
);

-- 3. Case-Insensitive Unique Index per Company
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_collection_lines_unique_name
ON public.company_collection_lines (company_id, LOWER(TRIM(name)));

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_company_collection_lines_company_id 
ON public.company_collection_lines(company_id);

CREATE INDEX IF NOT EXISTS idx_company_collection_lines_status 
ON public.company_collection_lines(company_id, status);

-- 4. Updated At Trigger
DROP TRIGGER IF EXISTS set_company_collection_lines_updated_at ON public.company_collection_lines;
CREATE TRIGGER set_company_collection_lines_updated_at
BEFORE UPDATE ON public.company_collection_lines
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 5. Data Migration: Preserve existing distinct borrower lines only if referenced by existing borrowers
-- For a clean tenant or company with no existing borrower lines, company_collection_lines will start empty.
INSERT INTO public.company_collection_lines (company_id, name, status)
SELECT DISTINCT b.company_id, TRIM(b.collection_line), 'active'
FROM public.borrowers b
WHERE b.collection_line IS NOT NULL 
  AND TRIM(b.collection_line) <> ''
ON CONFLICT (company_id, LOWER(TRIM(name))) DO NOTHING;

-- 6. Table Privileges & Row Level Security (RLS) Policies
REVOKE ALL ON TABLE public.company_collection_lines FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.company_collection_lines TO authenticated;

ALTER TABLE public.company_collection_lines ENABLE ROW LEVEL SECURITY;

-- 6a. SELECT: Authenticated Manager & Agent can view collection lines for their own company
DROP POLICY IF EXISTS "Users can view company collection lines" ON public.company_collection_lines;
CREATE POLICY "Users can view company collection lines"
ON public.company_collection_lines
FOR SELECT
TO authenticated
USING (
  company_id = get_auth_company_id()
);

-- 6b. INSERT: Only active Manager can create collection lines for their company
DROP POLICY IF EXISTS "Managers can insert company collection lines" ON public.company_collection_lines;
CREATE POLICY "Managers can insert company collection lines"
ON public.company_collection_lines
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_auth_company_id()
  AND is_company_manager()
);

-- 6c. UPDATE: Only active Manager can update collection lines for their company
DROP POLICY IF EXISTS "Managers can update company collection lines" ON public.company_collection_lines;
CREATE POLICY "Managers can update company collection lines"
ON public.company_collection_lines
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

-- 6d. DELETE: Denied direct delete (use Active / Inactive status instead)
DROP POLICY IF EXISTS "Deny direct delete on company collection lines" ON public.company_collection_lines;
CREATE POLICY "Deny direct delete on company collection lines"
ON public.company_collection_lines
FOR DELETE
TO authenticated, anon
USING (false);

-- 7. Atomic Rename RPC Function
-- Atomically renames the line in company_collection_lines AND updates all associated borrowers in the same company
CREATE OR REPLACE FUNCTION public.rename_company_collection_line(
  p_line_id UUID,
  p_new_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id UUID;
  v_is_manager BOOLEAN;
  v_trimmed_name TEXT;
  v_old_name TEXT;
  v_affected_borrowers INT;
BEGIN
  v_company_id := get_auth_company_id();
  v_is_manager := is_company_manager();

  -- Security check: Manager authorization
  IF v_company_id IS NULL OR NOT v_is_manager THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only an active Company Manager can rename collection lines');
  END IF;

  v_trimmed_name := TRIM(COALESCE(p_new_name, ''));
  IF v_trimmed_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Collection line name cannot be blank');
  END IF;

  -- Verify line exists in caller company
  SELECT name INTO v_old_name
  FROM public.company_collection_lines
  WHERE id = p_line_id AND company_id = v_company_id;

  IF v_old_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Collection line not found in your company');
  END IF;

  -- Check case-insensitive duplicate collision within the same company
  IF EXISTS (
    SELECT 1 FROM public.company_collection_lines
    WHERE company_id = v_company_id
      AND id <> p_line_id
      AND LOWER(TRIM(name)) = LOWER(v_trimmed_name)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A collection line with this name already exists');
  END IF;

  -- 1. Update line name in company_collection_lines
  UPDATE public.company_collection_lines
  SET name = v_trimmed_name, updated_at = NOW()
  WHERE id = p_line_id AND company_id = v_company_id;

  -- 2. Atomically update borrowers referencing the old line name in this company
  UPDATE public.borrowers
  SET collection_line = v_trimmed_name, updated_at = NOW()
  WHERE company_id = v_company_id
    AND collection_line = v_old_name;
  GET DIAGNOSTICS v_affected_borrowers = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'old_name', v_old_name,
    'new_name', v_trimmed_name,
    'affected_borrowers', v_affected_borrowers
  );
END;
$$;

-- Revoke public access and grant to authenticated users
REVOKE ALL ON FUNCTION public.rename_company_collection_line(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_company_collection_line(UUID, TEXT) TO authenticated;
