-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 010 (BORROWER DOCUMENTS & STORAGE RLS)
-- Adds borrower_documents metadata table, private storage bucket, and strict RLS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Create borrower_documents metadata table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS borrower_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_by_user_id UUID REFERENCES company_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. Performance Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_borrower_documents_company ON borrower_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_borrower_documents_borrower ON borrower_documents(borrower_id);
CREATE INDEX IF NOT EXISTS idx_borrower_documents_company_borrower ON borrower_documents(company_id, borrower_id);

-- ------------------------------------------------------------------------------
-- 3. Enable RLS on borrower_documents
-- ------------------------------------------------------------------------------
ALTER TABLE borrower_documents ENABLE ROW LEVEL SECURITY;

-- Policy 1: Manager full access (SELECT, INSERT, UPDATE, DELETE) for own company
DROP POLICY IF EXISTS "Manager full access on borrower_documents" ON borrower_documents;
CREATE POLICY "Manager full access on borrower_documents"
ON borrower_documents
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.auth_user_id = auth.uid()
      AND cu.company_id = borrower_documents.company_id
      AND cu.role = 'manager'
      AND cu.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.auth_user_id = auth.uid()
      AND cu.company_id = borrower_documents.company_id
      AND cu.role = 'manager'
      AND cu.status = 'active'
  )
);

-- Policy 2: Agent read-only access (SELECT ONLY) for documents of assigned borrowers in own company
DROP POLICY IF EXISTS "Agent read-only access on assigned borrower_documents" ON borrower_documents;
CREATE POLICY "Agent read-only access on assigned borrower_documents"
ON borrower_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    JOIN borrowers b ON b.assigned_agent_id = cu.id
    WHERE cu.auth_user_id = auth.uid()
      AND cu.company_id = borrower_documents.company_id
      AND cu.role = 'agent'
      AND cu.status = 'active'
      AND b.id = borrower_documents.borrower_id
      AND b.company_id = borrower_documents.company_id
  )
);

-- ------------------------------------------------------------------------------
-- 4. Storage Bucket Setup (Private bucket borrower-documents)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'borrower-documents',
  'borrower-documents',
  false,
  10485760, -- 10 MB in bytes
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

-- ------------------------------------------------------------------------------
-- 5. Storage Objects RLS Policies
-- Path format: <company_id>/<borrower_id>/<file_uuid>-<filename>
-- ------------------------------------------------------------------------------

-- Storage Policy 1: SELECT (Manager in same company OR Agent assigned to borrower in same company)
DROP POLICY IF EXISTS "Manager and Assigned Agent can select borrower-documents" ON storage.objects;
CREATE POLICY "Manager and Assigned Agent can select borrower-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'borrower-documents'
  AND (
    -- Manager in same company
    EXISTS (
      SELECT 1 FROM company_users cu
      WHERE cu.auth_user_id = auth.uid()
        AND cu.company_id::text = split_part(name, '/', 1)
        AND cu.role = 'manager'
        AND cu.status = 'active'
    )
    OR
    -- Agent assigned to borrower in same company
    EXISTS (
      SELECT 1 FROM company_users cu
      JOIN borrowers b ON b.assigned_agent_id = cu.id
      WHERE cu.auth_user_id = auth.uid()
        AND cu.company_id::text = split_part(name, '/', 1)
        AND cu.role = 'agent'
        AND cu.status = 'active'
        AND b.id::text = split_part(name, '/', 2)
        AND b.company_id::text = split_part(name, '/', 1)
    )
  )
);

-- Storage Policy 2: INSERT (Manager in same company only)
DROP POLICY IF EXISTS "Manager can insert borrower-documents" ON storage.objects;
CREATE POLICY "Manager can insert borrower-documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'borrower-documents'
  AND EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.auth_user_id = auth.uid()
      AND cu.company_id::text = split_part(name, '/', 1)
      AND cu.role = 'manager'
      AND cu.status = 'active'
  )
);

-- Storage Policy 3: DELETE (Manager in same company only)
DROP POLICY IF EXISTS "Manager can delete borrower-documents" ON storage.objects;
CREATE POLICY "Manager can delete borrower-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'borrower-documents'
  AND EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.auth_user_id = auth.uid()
      AND cu.company_id::text = split_part(name, '/', 1)
      AND cu.role = 'manager'
      AND cu.status = 'active'
  )
);
