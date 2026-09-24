-- ==============================================================================
-- KN FINANCE — SUPABASE SCHEMA MIGRATION 001 (FINAL HARDENED)
-- Multi-Tenant Schema for Finance Companies, Users, Borrowers, Payments,
-- Activity Logs, and Settings with Database-Enforced Relational Integrity
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Updated At Timestamp Trigger Function
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 3. COMPANIES (Tenants)
-- Every financial entity has an independent tenant record.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  owner_name TEXT,
  mobile TEXT,
  email TEXT,
  office_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_companies_updated_at ON companies;
CREATE TRIGGER set_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. COMPANY_USERS (Memberships)
-- Holds Manager and Agent users scoped strictly to their respective companies.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auth_user_id UUID, -- Optionally links to Supabase auth.users(id)
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'agent')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_users_company_mobile UNIQUE (company_id, mobile),
  -- Composite Unique Constraint: enables cross-company foreign-key enforcement
  CONSTRAINT uq_company_users_company_id_id UNIQUE (company_id, id)
);

-- Partial Unique Index: Strictly ONE manager per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_manager_per_company
ON company_users(company_id)
WHERE role = 'manager';

-- Partial Unique Index: An auth identity cannot map to multiple KN FINANCE memberships
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_users_unique_auth_user
ON company_users(auth_user_id)
WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_users_company_id ON company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_company_users_auth_user_id ON company_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_company_users_mobile ON company_users(mobile);

DROP TRIGGER IF EXISTS set_company_users_updated_at ON company_users;
CREATE TRIGGER set_company_users_updated_at
BEFORE UPDATE ON company_users
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 5. USER_CREDENTIALS (Isolated Authentication Store)
-- Isolated from public profiles. PIN hashes are never selectable by browser clients.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_credentials (
  user_id UUID PRIMARY KEY REFERENCES company_users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_user_credentials_updated_at ON user_credentials;
CREATE TRIGGER set_user_credentials_updated_at
BEFORE UPDATE ON user_credentials
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. BORROWERS
-- Loan records belonging to a company, optionally assigned to an active Agent.
-- Hardened with composite foreign keys and financial/date integrity checks.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS borrowers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assigned_agent_id UUID,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  alternate_phone TEXT,
  address TEXT,
  finance_type TEXT NOT NULL CHECK (finance_type IN ('Daily', 'Weekly', 'Monthly')),
  loan_amount NUMERIC(12, 2) NOT NULL CHECK (loan_amount > 0),
  deducted_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  expected_return NUMERIC(12, 2) NOT NULL,
  interest_rate NUMERIC(5, 2),
  repayment_duration TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  existing_loan BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  parcel_token_mode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite Unique Constraint: enables payments & activity_logs cross-company enforcement
  CONSTRAINT uq_borrowers_company_id_id UNIQUE (company_id, id),

  -- Composite FK: assigned agent MUST belong to the EXACT same company
  -- PostgreSQL 15+ column-specific SET NULL: nullifies ONLY assigned_agent_id, NEVER company_id
  CONSTRAINT fk_borrowers_assigned_agent
    FOREIGN KEY (company_id, assigned_agent_id)
    REFERENCES company_users(company_id, id)
    ON DELETE SET NULL (assigned_agent_id),

  -- Financial & Date Integrity Checks
  CONSTRAINT chk_borrowers_deducted_amount
    CHECK (deducted_amount >= 0 AND deducted_amount <= loan_amount),
  CONSTRAINT chk_borrowers_expected_return
    CHECK (expected_return >= loan_amount),
  CONSTRAINT chk_borrowers_dates
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_borrowers_company_id ON borrowers(company_id);
CREATE INDEX IF NOT EXISTS idx_borrowers_assigned_agent ON borrowers(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_borrowers_phone ON borrowers(phone);
CREATE INDEX IF NOT EXISTS idx_borrowers_status ON borrowers(status);
CREATE INDEX IF NOT EXISTS idx_borrowers_finance_type ON borrowers(finance_type);

DROP TRIGGER IF EXISTS set_borrowers_updated_at ON borrowers;
CREATE TRIGGER set_borrowers_updated_at
BEFORE UPDATE ON borrowers
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. PAYMENTS
-- Repayment collection transactions.
-- Hardened with composite foreign keys enforcing same-company borrower & collector.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL,
  collected_by_user_id UUID NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  finance_type TEXT NOT NULL DEFAULT 'Daily' CHECK (finance_type IN ('Daily', 'Weekly', 'Monthly')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite Unique Constraint: enables activity_logs cross-company enforcement
  CONSTRAINT uq_payments_company_id_id UNIQUE (company_id, id),

  -- Composite FK: borrower MUST belong to the EXACT same company
  CONSTRAINT fk_payments_borrower_company
    FOREIGN KEY (company_id, borrower_id)
    REFERENCES borrowers(company_id, id)
    ON DELETE CASCADE,

  -- Composite FK: collector MUST belong to the EXACT same company
  CONSTRAINT fk_payments_collector_company
    FOREIGN KEY (company_id, collected_by_user_id)
    REFERENCES company_users(company_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_borrower_id ON payments(borrower_id);
CREATE INDEX IF NOT EXISTS idx_payments_collected_by ON payments(collected_by_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

-- ------------------------------------------------------------------------------
-- 8. ACTIVITY_LOGS
-- Comprehensive audit trail for business actions.
-- Hardened with composite foreign keys preventing cross-company references.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  performed_by_user_id UUID,
  action TEXT NOT NULL,
  borrower_id UUID,
  agent_id UUID,
  payment_id UUID,
  amount NUMERIC(12, 2),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite FKs: all relational audit references MUST belong to the SAME company
  -- PostgreSQL 15+ column-specific SET NULL: nullifies ONLY the specific relationship ID, NEVER company_id
  CONSTRAINT fk_activity_logs_performed_by
    FOREIGN KEY (company_id, performed_by_user_id)
    REFERENCES company_users(company_id, id)
    ON DELETE SET NULL (performed_by_user_id),

  CONSTRAINT fk_activity_logs_borrower
    FOREIGN KEY (company_id, borrower_id)
    REFERENCES borrowers(company_id, id)
    ON DELETE SET NULL (borrower_id),

  CONSTRAINT fk_activity_logs_agent
    FOREIGN KEY (company_id, agent_id)
    REFERENCES company_users(company_id, id)
    ON DELETE SET NULL (agent_id),

  CONSTRAINT fk_activity_logs_payment
    FOREIGN KEY (company_id, payment_id)
    REFERENCES payments(company_id, id)
    ON DELETE SET NULL (payment_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_company_id ON activity_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 9. COMPANY_SETTINGS
-- Per-company application configuration and preferences.
-- Hardened with validation constraints matching application types.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'en',
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  payment_sound_alert BOOLEAN NOT NULL DEFAULT TRUE,
  payment_banner_alert BOOLEAN NOT NULL DEFAULT TRUE,
  confirm_before_payment BOOLEAN NOT NULL DEFAULT TRUE,
  default_finance_type TEXT NOT NULL DEFAULT 'Daily',
  keep_logged_in BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Settings Validation Constraints
  CONSTRAINT chk_company_settings_language
    CHECK (language IN ('en', 'ta')),
  CONSTRAINT chk_company_settings_date_format
    CHECK (date_format IN ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  CONSTRAINT chk_company_settings_default_finance_type
    CHECK (default_finance_type IN ('Daily', 'Weekly', 'Monthly'))
);

DROP TRIGGER IF EXISTS set_company_settings_updated_at ON company_settings;
CREATE TRIGGER set_company_settings_updated_at
BEFORE UPDATE ON company_settings
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
