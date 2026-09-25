-- Migration 014: Add collection_method column to payments table
-- Supports tracking payment collection method per transaction:
-- Hand Cash, Banking

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS collection_method TEXT NULL;

-- Comment on column
COMMENT ON COLUMN public.payments.collection_method IS 'Payment collection method (Hand Cash, Banking). Required for new payments; nullable for legacy records.';

-- Add check constraint allowing only valid method names or NULL (for legacy records)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_collection_method'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT chk_payment_collection_method
      CHECK (collection_method IS NULL OR collection_method IN ('Hand Cash', 'Banking'));
  END IF;
END $$;
