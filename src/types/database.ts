/**
 * Database types for KN FINANCE (Supabase backend schema)
 *
 * NOTE: These types represent PostgreSQL rows, inserts, and updates for
 * multi-device cloud synchronization. They exist alongside the existing
 * client-side models in src/types.ts and do not mutate current app behavior.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'manager' | 'agent';
export type UserStatus = 'active' | 'inactive';
export type DbFinanceType = 'Daily' | 'Weekly' | 'Monthly';
export type BorrowerLoanStatus = 'active' | 'closed';

export interface DbCompany {
  id: string;
  company_code: string;
  company_name: string;
  owner_name: string | null;
  mobile: string | null;
  email: string | null;
  office_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCompanyInsert {
  id?: string;
  company_code: string;
  company_name: string;
  owner_name?: string | null;
  mobile?: string | null;
  email?: string | null;
  office_address?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbCompanyUpdate {
  company_code?: string;
  company_name?: string;
  owner_name?: string | null;
  mobile?: string | null;
  email?: string | null;
  office_address?: string | null;
  updated_at?: string;
}

export interface DbCompanyUser {
  id: string;
  company_id: string;
  auth_user_id: string | null;
  full_name: string;
  mobile: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface DbCompanyUserInsert {
  id?: string;
  company_id: string;
  auth_user_id?: string | null;
  full_name: string;
  mobile: string;
  role: UserRole;
  status?: UserStatus;
  created_at?: string;
  updated_at?: string;
}

export interface DbCompanyUserUpdate {
  full_name?: string;
  mobile?: string;
  role?: UserRole;
  status?: UserStatus;
  auth_user_id?: string | null;
  updated_at?: string;
}

export interface DbUserCredential {
  user_id: string;
  pin_hash: string;
  created_at: string;
  updated_at: string;
}

export interface DbBorrower {
  id: string;
  company_id: string;
  assigned_agent_id: string | null;
  name: string;
  phone: string;
  alternate_phone: string | null;
  address: string | null;
  finance_type: DbFinanceType;
  weekly_collection_day?: number | null;
  monthly_collection_day?: number | null;
  collection_line?: string | null;
  collection_method?: string | null;
  loan_amount: number;
  deducted_amount: number;
  agent_commission: number;
  net_amount_given?: number | null;
  expected_return: number;
  interest_rate: number | null;
  repayment_duration: string | null;
  start_date: string;
  end_date: string | null;
  existing_loan: boolean;
  status: BorrowerLoanStatus;
  parcel_token_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbBorrowerInsert {
  id?: string;
  company_id: string;
  assigned_agent_id?: string | null;
  name: string;
  phone: string;
  alternate_phone?: string | null;
  address?: string | null;
  finance_type: DbFinanceType;
  weekly_collection_day?: number | null;
  monthly_collection_day?: number | null;
  collection_line?: string | null;
  collection_method?: string | null;
  loan_amount: number;
  deducted_amount?: number;
  agent_commission?: number;
  net_amount_given?: number;
  expected_return: number;
  interest_rate?: number | null;
  repayment_duration?: string | null;
  start_date: string;
  end_date?: string | null;
  existing_loan?: boolean;
  status?: BorrowerLoanStatus;
  parcel_token_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DbBorrowerUpdate {
  assigned_agent_id?: string | null;
  name?: string;
  phone?: string;
  alternate_phone?: string | null;
  address?: string | null;
  finance_type?: DbFinanceType;
  weekly_collection_day?: number | null;
  monthly_collection_day?: number | null;
  collection_line?: string | null;
  collection_method?: string | null;
  loan_amount?: number;
  deducted_amount?: number;
  agent_commission?: number;
  net_amount_given?: number;
  expected_return?: number;
  interest_rate?: number | null;
  repayment_duration?: string | null;
  start_date?: string;
  end_date?: string | null;
  existing_loan?: boolean;
  status?: BorrowerLoanStatus;
  parcel_token_mode?: boolean;
  updated_at?: string;
}

export interface DbBorrowerDocument {
  id: string;
  company_id: string;
  borrower_id: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_user_id: string | null;
  created_at: string;
}

export interface DbBorrowerDocumentInsert {
  id?: string;
  company_id: string;
  borrower_id: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by_user_id?: string | null;
  created_at?: string;
}

export interface DbPayment {
  id: string;
  company_id: string;
  borrower_id: string;
  collected_by_user_id: string;
  amount: number;
  payment_date: string;
  finance_type: DbFinanceType;
  collection_method?: string | null;
  note: string | null;
  created_at: string;
}

export interface DbPaymentInsert {
  id?: string;
  company_id: string;
  borrower_id: string;
  collected_by_user_id: string;
  amount: number;
  payment_date: string;
  finance_type?: DbFinanceType;
  collection_method?: string | null;
  note?: string | null;
  created_at?: string;
}

export interface DbPaymentUpdate {
  amount?: number;
  payment_date?: string;
  finance_type?: DbFinanceType;
  collection_method?: string | null;
  note?: string | null;
}

export interface DbActivityLog {
  id: string;
  company_id: string;
  performed_by_user_id: string | null;
  action: string;
  borrower_id: string | null;
  agent_id: string | null;
  payment_id: string | null;
  amount: number | null;
  message: string;
  created_at: string;
}

export interface DbActivityLogInsert {
  id?: string;
  company_id: string;
  performed_by_user_id?: string | null;
  action: string;
  borrower_id?: string | null;
  agent_id?: string | null;
  payment_id?: string | null;
  amount?: number | null;
  message: string;
  created_at?: string;
}

export interface DbCompanySettings {
  company_id: string;
  language: string;
  date_format: string;
  payment_sound_alert: boolean;
  payment_banner_alert: boolean;
  confirm_before_payment: boolean;
  default_finance_type: DbFinanceType;
  keep_logged_in: boolean;
  updated_at: string;
}

export interface DbCompanySettingsInsert {
  company_id: string;
  language?: string;
  date_format?: string;
  payment_sound_alert?: boolean;
  payment_banner_alert?: boolean;
  confirm_before_payment?: boolean;
  default_finance_type?: DbFinanceType;
  keep_logged_in?: boolean;
  updated_at?: string;
}

export interface DbCompanySettingsUpdate {
  language?: string;
  date_format?: string;
  payment_sound_alert?: boolean;
  payment_banner_alert?: boolean;
  confirm_before_payment?: boolean;
  default_finance_type?: DbFinanceType;
  keep_logged_in?: boolean;
  updated_at?: string;
}

export interface DbCompanyCashLedger {
  id: string;
  company_id: string;
  transaction_type: 'CASH_ADDED' | 'CASH_DECREASED' | 'LOAN_DISBURSED' | 'PAYMENT_COLLECTED';
  amount: number;
  source_type: 'MANUAL' | 'LOAN' | 'PAYMENT';
  borrower_id: string | null;
  payment_id: string | null;
  note: string | null;
  performed_by_user_id: string | null;
  created_at: string;
}

export interface DbCompanyCashLedgerInsert {
  id?: string;
  company_id: string;
  transaction_type: 'CASH_ADDED' | 'CASH_DECREASED' | 'LOAN_DISBURSED' | 'PAYMENT_COLLECTED';
  amount: number;
  source_type?: 'MANUAL' | 'LOAN' | 'PAYMENT';
  borrower_id?: string | null;
  payment_id?: string | null;
  note?: string | null;
  performed_by_user_id?: string | null;
  created_at?: string;
}

export interface DbCompanyCashLedgerUpdate {
  note?: string | null;
}

/**
 * Top-level Database schema definition for Supabase client typing
 */
export interface Database {
  public: {
    Tables: {
      companies: {
        Row: DbCompany;
        Insert: DbCompanyInsert;
        Update: DbCompanyUpdate;
      };
      company_users: {
        Row: DbCompanyUser;
        Insert: DbCompanyUserInsert;
        Update: DbCompanyUserUpdate;
      };
      user_credentials: {
        Row: DbUserCredential;
        Insert: DbUserCredential;
        Update: Partial<DbUserCredential>;
      };
      borrowers: {
        Row: DbBorrower;
        Insert: DbBorrowerInsert;
        Update: DbBorrowerUpdate;
      };
      payments: {
        Row: DbPayment;
        Insert: DbPaymentInsert;
        Update: DbPaymentUpdate;
      };
      company_cash_ledger: {
        Row: DbCompanyCashLedger;
        Insert: DbCompanyCashLedgerInsert;
        Update: DbCompanyCashLedgerUpdate;
      };
      activity_logs: {
        Row: DbActivityLog;
        Insert: DbActivityLogInsert;
        Update: Partial<DbActivityLogInsert>;
      };
      company_settings: {
        Row: DbCompanySettings;
        Insert: DbCompanySettingsInsert;
        Update: DbCompanySettingsUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_auth_company_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      is_company_manager: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      verify_cloud_login: {
        Args: {
          p_company_code: string;
          p_mobile: string;
          p_pin: string;
        };
        Returns: {
          status: string;
          lockout_seconds: number | null;
          company_user_id: string;
          auth_user_id: string | null;
          company_id: string;
          company_code: string;
          company_name: string;
          full_name: string;
          mobile: string;
          role: string;
          user_status: string;
        }[];
      };
      bootstrap_cloud_manager: {
        Args: {
          p_company_code: string;
          p_company_name: string;
          p_owner_name: string;
          p_mobile: string;
          p_email: string;
          p_pin: string;
          p_auth_user_id: string;
        };
        Returns: {
          status: string;
          company_id: string;
          company_user_id: string;
          message: string;
        }[];
      };
      manager_create_cloud_agent: {
        Args: {
          p_manager_user_id: string;
          p_full_name: string;
          p_mobile: string;
          p_pin: string;
          p_auth_user_id: string;
        };
        Returns: {
          status: string;
          agent_id: string;
          message: string;
        }[];
      };
      manager_set_agent_status: {
        Args: {
          p_manager_user_id: string;
          p_agent_id: string;
          p_status: string;
        };
        Returns: {
          status: string;
          message: string;
        }[];
      };
      change_user_pin: {
        Args: {
          p_current_pin: string;
          p_new_pin: string;
          p_auth_user_id?: string | null;
        };
        Returns: {
          status: string;
          message: string;
          lockout_seconds: number | null;
        }[];
      };
    };
  };
}
