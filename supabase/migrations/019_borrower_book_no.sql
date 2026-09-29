-- Migration 019: Add Manager-assigned Book No to borrowers table
-- Rules:
-- 1. Book No range: 1 to 1000 only.
-- 2. Book No belongs to the Borrower (not Agent).
-- 3. Book No must be unique per company (tenant isolation).
-- 4. Nullable for legacy records (do not mutate or retroactively assign).

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS book_no INTEGER NULL;

-- Comment on column
COMMENT ON COLUMN public.borrowers.book_no IS 'Manager-assigned borrower book number (1-1000). Unique per company; nullable for legacy records.';

-- Add check constraint enforcing valid range (1 to 1000) or NULL for legacy records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_borrower_book_no_range'
  ) THEN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT chk_borrower_book_no_range
      CHECK (book_no IS NULL OR (book_no >= 1 AND book_no <= 1000));
  END IF;
END $$;

-- Add partial unique index enforcing company-scoped uniqueness for non-null book numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_borrowers_company_book_no
  ON public.borrowers (company_id, book_no)
  WHERE book_no IS NOT NULL;
