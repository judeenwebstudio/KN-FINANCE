-- Migration 013: Add collection_method column to borrowers table
-- Supports tracking collection method for borrower:
-- Hand Cash, Banking

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS collection_method TEXT NULL;

-- Comment on column
COMMENT ON COLUMN public.borrowers.collection_method IS 'Collection method for borrower (Hand Cash, Banking). Required for new borrowers; nullable for legacy records.';

-- Add check constraint allowing only the valid method names or NULL (for legacy records)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_borrower_collection_method'
  ) THEN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT chk_borrower_collection_method
      CHECK (collection_method IS NULL OR collection_method IN ('Hand Cash', 'Banking'));
  END IF;
END $$;
