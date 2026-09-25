-- Migration 012: Add collection_line column to borrowers table
-- Supports assigning borrowers to one of four collection lines:
-- Karumandapam, Manachanallur, Thiruverumbur, Lalgudi

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS collection_line TEXT NULL;

-- Comment on column
COMMENT ON COLUMN public.borrowers.collection_line IS 'Collection line for borrower (Karumandapam, Manachanallur, Thiruverumbur, Lalgudi). Required for new borrowers; nullable for legacy records.';

-- Add check constraint allowing only the four valid line names or NULL (for legacy records)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_borrower_collection_line'
  ) THEN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT chk_borrower_collection_line
      CHECK (collection_line IS NULL OR collection_line IN ('Karumandapam', 'Manachanallur', 'Thiruverumbur', 'Lalgudi'));
  END IF;
END $$;
