-- Migration 011: Add collection schedule fields to borrowers table
-- Supports Finance-Type-Based Collection Schedule (Weekly day of week 1-7, Monthly day of month 1-31)

ALTER TABLE public.borrowers
  ADD COLUMN IF NOT EXISTS weekly_collection_day SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS monthly_collection_day SMALLINT NULL;

-- Comment on columns for clear documentation
COMMENT ON COLUMN public.borrowers.weekly_collection_day IS 'Weekday of collection for Weekly finance type (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday)';
COMMENT ON COLUMN public.borrowers.monthly_collection_day IS 'Day of month for Monthly finance type (1-31). Uses month-end capping for short months.';

-- Add check constraints safely with backward compatibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_borrower_weekly_collection_day'
  ) THEN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT chk_borrower_weekly_collection_day
      CHECK (weekly_collection_day IS NULL OR (weekly_collection_day BETWEEN 1 AND 7 AND finance_type = 'Weekly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_borrower_monthly_collection_day'
  ) THEN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT chk_borrower_monthly_collection_day
      CHECK (monthly_collection_day IS NULL OR (monthly_collection_day BETWEEN 1 AND 31 AND finance_type = 'Monthly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_borrower_daily_no_collection_day'
  ) THEN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT chk_borrower_daily_no_collection_day
      CHECK (finance_type <> 'Daily' OR (weekly_collection_day IS NULL AND monthly_collection_day IS NULL));
  END IF;
END $$;
