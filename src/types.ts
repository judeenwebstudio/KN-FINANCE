export type Screen = 
  | 'welcome' 
  | 'register' 
  | 'success' 
  | 'login' 
  | 'dashboard' 
  | 'profile';

export interface ManagerAccount {
  fullName: string;
  email: string;
  mobile: string;
  pin: string;
  companyCode: string;
  keepLoggedIn: boolean;
}

export interface CompanyProfile {
  companyName: string;
  ownerName?: string;
  mobile?: string;
  email?: string;
  officeAddress?: string;
}

export interface AgentUser {
  id: string;
  fullName: string;
  mobile: string;
  role: 'agent';
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface StoredAgentRecord extends AgentUser {
  pinHash: string;
}

export interface Borrower {
  id: string;
  name: string;
  borrowerName: string;
  phone: string;
  phoneNumber: string;
  alternatePhoneNumber?: string;
  address?: string;
  financeType: 'Daily' | 'Weekly' | 'Monthly';
  agentId?: string | null;
  assignedAgent?: string;
  parcelTokenMode: boolean;
  amount: number; // loanAmount
  loanAmount: number;
  deductedAmount: number;
  netAmountGiven: number;
  expectedReturn: number;
  interestRate: number;
  repaymentDuration: string;
  startDate: string;
  endDate: string;
  isExistingLoan: boolean;
  status: 'active' | 'closed';
  dateAdded: string;
  createdAt: string;
}

export type NewBorrowerInput = {
  borrowerName: string;
  phoneNumber: string;
  alternatePhoneNumber?: string;
  address?: string;
  financeType: 'Daily' | 'Weekly' | 'Monthly';
  agentId?: string | null;
  assignedAgent?: string;
  parcelTokenMode: boolean;
  loanAmount: number;
  deductedAmount: number;
  netAmountGiven: number;
  expectedReturn: number;
  interestRate: number;
  repaymentDuration: string;
  startDate: string;
  endDate: string;
  isExistingLoan: boolean;
};

export interface PaymentRecord {
  id: string;
  borrowerId: string;
  borrowerName: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  collectedBy: string; // e.g. 'Manager'
  collectedByUserId?: string | null;
  collectedByRole?: 'manager' | 'agent';
  note?: string;
  financeType: 'Daily' | 'Weekly' | 'Monthly';
  createdAt: string;
}

export type Timeframe = 'Daily' | 'Weekly' | 'Monthly';
export type BorrowerFilter = 'Active' | 'Closed';

export type ActivityAction =
  | 'login'
  | 'borrower_created'
  | 'borrower_updated'
  | 'payment_collected'
  | 'loan_closed'
  | 'agent_created'
  | 'agent_updated'
  | 'agent_deactivated'
  | 'manager_updated'
  | 'company_updated'
  | 'pin_changed';

export interface ActivityLogEntry {
  id: string;
  action: ActivityAction;
  performedByUserId: string | null;
  performedByRole: 'manager' | 'agent';
  borrowerId?: string;
  agentId?: string;
  paymentId?: string;
  amount?: number;
  message: string;
  createdAt: string; // ISO string
}
