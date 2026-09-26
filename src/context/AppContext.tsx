import React, { createContext, useContext, useState, useEffect } from 'react';
import type {
  Screen,
  ManagerAccount,
  CompanyProfile,
  AuthUserSession,
  AgentUser,
  StoredAgentRecord,
  Borrower,
  PaymentRecord,
  Timeframe,
  BorrowerFilter,
  NewBorrowerInput,
  ActivityLogEntry,
  AppSettings,
  CashLedgerEntry,
  CompanyCollectionLine,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { hashPin, hashPinSync } from '../utils/security';
import {
  loginWithPin,
  restoreCloudSession,
  signOutOfCloud,
  createCloudAgent,
  setCloudAgentStatus,
} from '../lib/authService';

export type { NewBorrowerInput };

export interface DueBorrowerItem {
  borrower: Borrower;
  dueAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: 'Pending' | 'Partial';
}

interface AppContextType {
  screen: Screen;
  currentUser: AuthUserSession | null;
  currentRole: 'manager' | 'agent';
  isCloudAuth: boolean;
  manager: ManagerAccount | null;
  company: CompanyProfile | null;
  agents: AgentUser[];
  borrowers: Borrower[];
  collectionLines: CompanyCollectionLine[];
  payments: PaymentRecord[];
  activityLogs: ActivityLogEntry[];
  cashLedger: CashLedgerEntry[];
  timeframe: Timeframe;
  borrowerFilter: BorrowerFilter;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  navigateTo: (screen: Screen) => void;
  registerManager: (data: { fullName: string; email: string; mobile: string; pin: string; keepLoggedIn: boolean }) => string;
  updateManager: (data: { fullName?: string; mobile?: string; pin?: string }) => void;
  cloudLogin: (companyCode: string, mobile: string, pin: string, keepLoggedIn?: boolean) => Promise<{ success: boolean; error?: string; isLocked?: boolean }>;
  login: (mobileOrEmail: string, pin: string) => { success: boolean; error?: string };
  logout: () => void;
  updateCompany: (data: CompanyProfile) => void;
  addAgent: (data: { fullName: string; mobile: string; pin: string }) => Promise<{ success: boolean; error?: string }>;
  updateAgent: (id: string, data: { fullName?: string; mobile?: string; pin?: string; status?: 'active' | 'inactive' }) => Promise<{ success: boolean; error?: string }>;
  toggleAgentStatus: (id: string) => Promise<{ success: boolean; error?: string }>;
  addCollectionLine: (name: string) => Promise<{ success: boolean; error?: string }>;
  updateCollectionLine: (id: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  toggleCollectionLineStatus: (id: string) => Promise<{ success: boolean; error?: string }>;
  setTimeframe: (tf: Timeframe) => void;
  setBorrowerFilter: (f: BorrowerFilter) => void;
  addBorrower: (data: NewBorrowerInput) => Promise<{ success: boolean; error?: string; borrowerId?: string }>;
  updateBorrower: (id: string, data: Partial<NewBorrowerInput>) => Promise<{ success: boolean; error?: string }>;
  addPayment: (data: Omit<PaymentRecord, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  addActivity: (entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) => void;
  getCashInHand: () => number;
  getTotalOutFlow: () => number;
  addManualCash: (amount: number, note?: string) => void;
  decreaseManualCash: (amount: number, note?: string) => void;
  getBorrowerPaidAmount: (borrowerId: string) => number;
  getBorrowerLastPaymentDate: (borrowerId: string) => string;
  getTodayCollectedAmount: (tf?: Timeframe) => number;
  getDueBorrowersForDate: (targetDateIso: string, tf?: Timeframe) => DueBorrowerItem[];
  getTodayDueCount: (tf?: Timeframe) => number;
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

import {
  getTodayIsoDate,
  formatDisplayDate,
  parseCustomDate,
  isPaymentDueOnDate,
  toIsoDate,
} from '../utils/loanCalculations';
import { supabase } from '../lib/supabase';

export {
  getTodayIsoDate,
  formatDisplayDate,
  parseCustomDate,
  isPaymentDueOnDate,
  toIsoDate,
};

function toDbDate(val?: string | null): string | null {
  if (!val) return null;
  const d = parseCustomDate(val);
  return d ? toIsoDate(d) : val;
}

function mapDbBorrowerToApp(row: any, allAgents: AgentUser[]): Borrower {
  const assignedAgentObj = allAgents.find(a => a.id === row.assigned_agent_id);
  const loanAmt = Number(row.loan_amount) || Number(row.amount) || 0;
  const deductedAmt = Number(row.deducted_amount) || 0;
  const agentComm = Number(row.agent_commission) || 0;
  const netAmt = row.net_amount_given !== null && row.net_amount_given !== undefined
    ? Number(row.net_amount_given)
    : Math.max(0, loanAmt - deductedAmt);
  const expectedRet = Number(row.expected_return) || loanAmt;
  const borrowerName = row.name || row.borrower_name || 'Borrower';
  const phoneVal = row.phone || row.mobile || '';

  return {
    id: row.id,
    bookNo: row.book_no !== null && row.book_no !== undefined ? Number(row.book_no) : null,
    name: borrowerName,
    borrowerName: borrowerName,
    phone: phoneVal,
    phoneNumber: phoneVal,
    alternatePhoneNumber: row.alternate_phone || '',
    address: row.address || '',
    financeType: row.finance_type || 'Daily',
    weeklyCollectionDay: row.weekly_collection_day !== null && row.weekly_collection_day !== undefined ? Number(row.weekly_collection_day) : undefined,
    monthlyCollectionDay: row.monthly_collection_day !== null && row.monthly_collection_day !== undefined ? Number(row.monthly_collection_day) : undefined,
    collectionLine: row.collection_line || null,
    collectionMethod: row.collection_method || null,
    agentId: row.assigned_agent_id || null,
    assignedAgent: assignedAgentObj?.fullName || '',
    agentCommission: agentComm,
    parcelTokenMode: Boolean(row.parcel_token_mode),
    amount: loanAmt,
    loanAmount: loanAmt,
    deductedAmount: deductedAmt,
    netAmountGiven: netAmt,
    expectedReturn: expectedRet,
    interestRate: Number(row.interest_rate) || 0,
    repaymentDuration: row.repayment_duration || '50 Days',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    isExistingLoan: Boolean(row.existing_loan),
    status: (row.status as 'active' | 'closed') || 'active',
    dateAdded: row.created_at || new Date().toISOString(),
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function mapDbPaymentToApp(row: any, allBorrowers: Borrower[], allAgents: AgentUser[], currentMgrName?: string): PaymentRecord {
  const borrowerObj = allBorrowers.find(b => b.id === row.borrower_id);
  const collectorAgent = allAgents.find(a => a.id === row.collected_by_user_id);
  const isAgent = Boolean(collectorAgent) || (row.collected_by_user_id && row.collected_by_user_id !== 'manager');
  return {
    id: row.id,
    borrowerId: row.borrower_id || '',
    borrowerName: borrowerObj?.borrowerName || borrowerObj?.name || 'Borrower',
    amount: Number(row.amount) || 0,
    paymentDate: row.payment_date || '',
    collectedByUserId: row.collected_by_user_id || null,
    collectedByRole: isAgent ? 'agent' : 'manager',
    collectedBy: collectorAgent?.fullName || (isAgent ? 'Agent' : (currentMgrName || 'Manager')),
    financeType: row.finance_type || borrowerObj?.financeType || 'Daily',
    collectionMethod: row.collection_method || null,
    note: row.note || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function mapDbCashLedgerToApp(row: any): CashLedgerEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    transactionType: row.transaction_type,
    amount: Number(row.amount) || 0,
    sourceType: row.source_type || 'MANUAL',
    borrowerId: row.borrower_id || undefined,
    paymentId: row.payment_id || undefined,
    note: row.note || undefined,
    performedByUserId: row.performed_by_user_id || null,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function generateCompanyCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return code;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUserSession | null>(null);

  const currentRole: 'manager' | 'agent' = currentUser ? currentUser.role : 'manager';
  const isCloudAuth: boolean = currentUser !== null;

  const [manager, setManager] = useState<ManagerAccount | null>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_manager');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [company, setCompany] = useState<CompanyProfile | null>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_company');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [agents, setAgents] = useState<StoredAgentRecord[]>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_agents');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [screen, setScreen] = useState<Screen>(() => {
    try {
      const savedManager = localStorage.getItem('kn_finance_manager');
      const isLoggedIn = localStorage.getItem('kn_finance_logged_in') === 'true';
      if (savedManager && isLoggedIn) {
        return 'dashboard';
      }
    } catch {
      // fallback
    }
    return 'welcome';
  });

  // Restore authenticated cloud session on application launch
  useEffect(() => {
    let isMounted = true;
    restoreCloudSession()
      .then((session) => {
        if (isMounted) {
          if (session) {
            setCurrentUser(session);
            setScreen('dashboard');
          } else {
            setCurrentUser(null);
            const savedMgr = localStorage.getItem('kn_finance_manager');
            if (!savedMgr && localStorage.getItem('kn_finance_logged_in') === 'true') {
              localStorage.removeItem('kn_finance_logged_in');
              setScreen('login');
            }
          }
        }
      })
      .catch(() => {
        // Fallback to offline/local session
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const [borrowers, setBorrowers] = useState<Borrower[]>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_borrowers');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: Partial<Borrower>) => ({
        id: item.id || Date.now().toString(),
        name: item.name || item.borrowerName || 'Borrower',
        borrowerName: item.borrowerName || item.name || 'Borrower',
        phone: item.phone || item.phoneNumber || '',
        phoneNumber: item.phoneNumber || item.phone || '',
        alternatePhoneNumber: item.alternatePhoneNumber || '',
        address: item.address || '',
        financeType: item.financeType || 'Daily',
        agentId: item.agentId !== undefined ? item.agentId : null,
        assignedAgent: item.assignedAgent || '',
        parcelTokenMode: Boolean(item.parcelTokenMode),
        amount: item.amount || item.loanAmount || 0,
        loanAmount: item.loanAmount || item.amount || 0,
        deductedAmount: item.deductedAmount || 0,
        agentCommission: item.agentCommission || 0,
        netAmountGiven: item.netAmountGiven ?? Math.max(0, (item.loanAmount || item.amount || 0) - (item.deductedAmount || 0)),
        expectedReturn: item.expectedReturn || item.amount || 0,
        interestRate: item.interestRate || 0,
        repaymentDuration: item.repaymentDuration || '50 Days',
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        isExistingLoan: Boolean(item.isExistingLoan),
        status: item.status || 'active',
        dateAdded: item.dateAdded || item.createdAt || new Date().toISOString(),
        createdAt: item.createdAt || item.dateAdded || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  });

  const [payments, setPayments] = useState<PaymentRecord[]>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_payments');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: Partial<PaymentRecord>) => ({
        id: item.id || Date.now().toString(),
        borrowerId: item.borrowerId || '',
        borrowerName: item.borrowerName || '',
        amount: item.amount || 0,
        paymentDate: item.paymentDate || '',
        collectedBy: item.collectedBy || 'Manager',
        collectedByUserId: item.collectedByUserId !== undefined ? item.collectedByUserId : null,
        collectedByRole: item.collectedByRole || (item.collectedByUserId ? 'agent' : 'manager'),
        financeType: item.financeType || 'Daily',
        createdAt: item.createdAt || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  });

  const [collectionLines, setCollectionLines] = useState<CompanyCollectionLine[]>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_collection_lines');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: any) => ({
        id: item.id || `line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        companyId: item.companyId || item.company_id,
        name: item.name || '',
        status: (item.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
        createdAt: item.createdAt || item.created_at || new Date().toISOString(),
        updatedAt: item.updatedAt || item.updated_at || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  });

  const [timeframe, setTimeframe] = useState<Timeframe>('Daily');
  const [borrowerFilter, setBorrowerFilter] = useState<BorrowerFilter>('Active');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    try {
      if (manager) {
        localStorage.setItem('kn_finance_manager', JSON.stringify(manager));
      }
    } catch (e) {
      console.error(e);
    }
  }, [manager]);

  useEffect(() => {
    try {
      if (!isCloudAuth) {
        localStorage.setItem('kn_finance_borrowers', JSON.stringify(borrowers));
      }
    } catch (e) {
      console.error(e);
    }
  }, [borrowers, isCloudAuth]);

  useEffect(() => {
    try {
      if (!isCloudAuth) {
        localStorage.setItem('kn_finance_payments', JSON.stringify(payments));
      }
    } catch (e) {
      console.error(e);
    }
  }, [payments, isCloudAuth]);

  useEffect(() => {
    try {
      if (!isCloudAuth) {
        localStorage.setItem('kn_finance_collection_lines', JSON.stringify(collectionLines));
      }
    } catch (e) {
      console.error(e);
    }
  }, [collectionLines, isCloudAuth]);

  useEffect(() => {
    try {
      if (!isCloudAuth) {
        localStorage.setItem('kn_finance_agents', JSON.stringify(agents));
      }
    } catch (e) {
      console.error(e);
    }
  }, [agents, isCloudAuth]);

  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_cash_ledger');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      if (!isCloudAuth) {
        localStorage.setItem('kn_finance_cash_ledger', JSON.stringify(cashLedger));
      }
    } catch (e) {
      console.error(e);
    }
  }, [cashLedger, isCloudAuth]);

  // Cloud Data Synchronizer
  const fetchCloudData = async () => {
    if (!supabase || !currentUser) return;
    try {
      // 1. Fetch Agents (Manager gets all agents, Agent gets their own profile)
      let currentAgentList: StoredAgentRecord[] = [];
      const { data: uData, error: uErr } = await (supabase as any)
        .from('company_users')
        .select('*')
        .eq('company_id', currentUser.companyId)
        .eq('role', 'agent')
        .order('created_at', { ascending: true });

      if (!uErr && Array.isArray(uData)) {
        if (currentUser.role === 'agent' && uData.length === 0) {
          currentAgentList = [{
            id: currentUser.companyUserId,
            fullName: currentUser.fullName,
            mobile: currentUser.mobile,
            role: 'agent' as const,
            status: 'active' as const,
            createdAt: new Date().toISOString(),
            pinHash: '',
          }];
        } else {
          currentAgentList = uData.map(u => ({
            id: u.id,
            fullName: u.full_name,
            mobile: u.mobile,
            role: 'agent' as const,
            status: u.status as 'active' | 'inactive',
            createdAt: u.created_at,
            pinHash: '',
          }));
        }
        setAgents(currentAgentList);
      }

      // 2. Fetch Borrowers (RLS enforces company scope for manager, assigned-only for agent)
      const { data: bData, error: bErr } = await (supabase as any)
        .from('borrowers')
        .select('*')
        .eq('company_id', currentUser.companyId)
        .order('created_at', { ascending: false });

      let currentBorrowerList: Borrower[] = [];
      if (!bErr && bData) {
        currentBorrowerList = (bData as any[]).map(b => mapDbBorrowerToApp(b, currentAgentList));
        setBorrowers(currentBorrowerList);
      }

      // 3. Fetch Payments (RLS enforces company scope for manager, permitted-only for agent)
      const { data: pData, error: pErr } = await (supabase as any)
        .from('payments')
        .select('*')
        .eq('company_id', currentUser.companyId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!pErr && pData) {
        const mappedPayments = (pData as any[]).map(p => mapDbPaymentToApp(p, currentBorrowerList, currentAgentList, currentUser.fullName));
        setPayments(mappedPayments);
      }

      // 4. Fetch Collection Lines (Manager & Agent can view)
      const { data: clData, error: clErr } = await (supabase as any)
        .from('company_collection_lines')
        .select('*')
        .eq('company_id', currentUser.companyId)
        .order('created_at', { ascending: true });

      if (!clErr && clData && (clData as any[]).length > 0) {
        setCollectionLines((clData as any[]).map(cl => ({
          id: cl.id,
          companyId: cl.company_id,
          name: cl.name,
          status: cl.status as 'active' | 'inactive',
          createdAt: cl.created_at,
          updatedAt: cl.updated_at,
        })));
      }

      // 5. Fetch Cash Ledger (Manager only)
      if (currentUser.role === 'manager') {
        const { data: cData, error: cErr } = await (supabase as any)
          .from('company_cash_ledger')
          .select('*')
          .eq('company_id', currentUser.companyId)
          .order('created_at', { ascending: false });

        if (!cErr && cData) {
          setCashLedger((cData as any[]).map(mapDbCashLedgerToApp));
        }
      }
    } catch (err) {
      console.error('Error in fetchCloudData:', err);
    }
  };

  // Sync cloud data on user session change and subscribe to realtime Postgres changes
  useEffect(() => {
    if (!currentUser || !supabase) return;

    fetchCloudData();

    // Subscribe to realtime database changes for instant cross-device updates
    const channel = supabase
      .channel(`kn_sync_${currentUser.companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrowers' }, () => {
        fetchCloudData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchCloudData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_collection_lines' }, () => {
        fetchCloudData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_cash_ledger' }, () => {
        if (currentUser.role === 'manager') fetchCloudData();
      })
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [currentUser?.companyUserId]);

  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_activity_logs');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('kn_finance_activity_logs', JSON.stringify(activityLogs));
    } catch (e) {
      console.error(e);
    }
  }, [activityLogs]);

  const addActivity = (entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) => {
    const newEntry: ActivityLogEntry = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    setActivityLogs((prev) => [newEntry, ...prev]);
  };

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('kn_finance_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      }
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('kn_finance_settings', JSON.stringify(settings));
    } catch (e) {
      console.error(e);
    }
  }, [settings]);

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem('kn_finance_settings', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });

    if (partial.keepLoggedIn !== undefined) {
      setManager((prev) => (prev ? { ...prev, keepLoggedIn: partial.keepLoggedIn! } : null));
    }

    addActivity({
      action: 'settings_updated',
      performedByUserId: null,
      performedByRole: 'manager',
      message: 'Settings were updated.',
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.setItem('kn_finance_settings', JSON.stringify(DEFAULT_SETTINGS));
    } catch (e) {
      console.error(e);
    }

    setManager((prev) => (prev ? { ...prev, keepLoggedIn: DEFAULT_SETTINGS.keepLoggedIn } : null));

    addActivity({
      action: 'settings_reset',
      performedByUserId: null,
      performedByRole: 'manager',
      message: 'Settings were reset to default.',
    });
  };

  const navigateTo = (newScreen: Screen) => {
    setScreen(newScreen);
    window.scrollTo(0, 0);
  };

  const registerManager = (data: {
    fullName: string;
    email: string;
    mobile: string;
    pin: string;
    keepLoggedIn: boolean;
  }) => {
    const code = generateCompanyCode();
    const newManager: ManagerAccount = {
      ...data,
      pinHash: hashPinSync(data.pin),
      companyCode: code,
    };
    setManager(newManager);
    localStorage.setItem('kn_finance_manager', JSON.stringify(newManager));
    if (data.keepLoggedIn) {
      localStorage.setItem('kn_finance_logged_in', 'true');
    }
    navigateTo('success');
    return code;
  };

  const cloudLogin = async (
    companyCode: string,
    mobile: string,
    pin: string,
    keepLoggedIn: boolean = true
  ): Promise<{ success: boolean; error?: string; isLocked?: boolean }> => {
    const res = await loginWithPin(companyCode, mobile, pin, keepLoggedIn);
    if (res.success && res.user) {
      setCurrentUser(res.user);
      localStorage.setItem('kn_finance_logged_in', 'true');
      addActivity({
        action: 'login',
        performedByUserId: res.user.companyUserId,
        performedByRole: res.user.role,
        message: `${res.user.fullName} (${res.user.role}) logged in.`,
      });
      navigateTo('dashboard');
      return { success: true };
    }
    return { success: false, error: res.error, isLocked: res.isLocked };
  };

  const login = (mobileOrEmail: string, pin: string): { success: boolean; error?: string } => {
    if (!manager) {
      return { success: false, error: 'No manager account found. Please register first.' };
    }
    const matchesUser =
      manager.mobile.trim() === mobileOrEmail.trim() ||
      manager.email.trim().toLowerCase() === mobileOrEmail.trim().toLowerCase();

    if (!matchesUser) {
      return { success: false, error: 'Invalid Mobile Number or Email Address.' };
    }

    const matchesPin =
      (manager.pin && manager.pin === pin) ||
      (manager.pinHash && hashPinSync(pin) === manager.pinHash);

    if (!matchesPin) {
      return { success: false, error: 'Incorrect 4-digit PIN.' };
    }

    localStorage.setItem('kn_finance_logged_in', 'true');
    addActivity({
      action: 'login',
      performedByUserId: null,
      performedByRole: 'manager',
      message: `${manager.fullName} logged in.`,
    });
    navigateTo('dashboard');
    return { success: true };
  };

  const logout = () => {
    signOutOfCloud().catch(() => {});
    setCurrentUser(null);
    localStorage.removeItem('kn_finance_logged_in');
    navigateTo('login');
  };

  const updateCompany = (data: CompanyProfile) => {
    setCompany(prev => {
      const updated = {
        ...prev,
        ...data,
      };

      localStorage.setItem(
        'kn_finance_company',
        JSON.stringify(updated)
      );

      return updated;
    });

    addActivity({
      action: 'company_updated',
      performedByUserId: null,
      performedByRole: 'manager',
      message: 'Company details were updated.',
    });
  };

  const updateManager = (data: { fullName?: string; mobile?: string; pin?: string }) => {
    setManager((prev) => {
      if (!prev) return null;
      const updated: ManagerAccount = {
        ...prev,
        fullName: data.fullName !== undefined ? data.fullName.trim() : prev.fullName,
        mobile: data.mobile !== undefined ? data.mobile.trim() : prev.mobile,
        pin: data.pin !== undefined ? data.pin.trim() : prev.pin,
        pinHash: data.pin !== undefined ? hashPinSync(data.pin.trim()) : prev.pinHash,
      };
      localStorage.setItem('kn_finance_manager', JSON.stringify(updated));
      return updated;
    });

    if (data.pin) {
      addActivity({
        action: 'pin_changed',
        performedByUserId: null,
        performedByRole: 'manager',
        message: 'Manager PIN was changed.',
      });
    }
    if (data.fullName !== undefined || data.mobile !== undefined) {
      addActivity({
        action: 'manager_updated',
        performedByUserId: null,
        performedByRole: 'manager',
        message: 'Manager profile was updated.',
      });
    }
  };

  const addAgent = async (data: {
    fullName: string;
    mobile: string;
    pin: string;
  }): Promise<{ success: boolean; error?: string }> => {
    const cleanMobile = data.mobile.replace(/\D/g, '');

    if (isCloudAuth && currentUser) {
      if (currentUser.mobile && currentUser.mobile.replace(/\D/g, '') === cleanMobile) {
        return { success: false, error: 'Mobile number cannot be the same as the Manager’s mobile number.' };
      }
      const duplicate = agents.find((a) => a.mobile.replace(/\D/g, '') === cleanMobile);
      if (duplicate) {
        return { success: false, error: 'An agent with this mobile number already exists in your company.' };
      }

      const res = await createCloudAgent({
        fullName: data.fullName,
        mobile: cleanMobile,
        pin: data.pin,
      });

      if (!res.success) {
        return { success: false, error: res.error || 'Failed to create agent in cloud.' };
      }

      await fetchCloudData();
      addActivity({
        action: 'agent_created',
        performedByUserId: currentUser.companyUserId,
        performedByRole: currentUser.role,
        agentId: res.agent?.id,
        message: `Agent ${data.fullName.trim()} was added.`,
      });

      return { success: true };
    }

    // Local / Offline fallback
    if (manager && manager.mobile.replace(/\D/g, '') === cleanMobile) {
      return { success: false, error: 'Mobile number cannot be the same as the Manager’s mobile number.' };
    }
    const duplicate = agents.find((a) => a.mobile.replace(/\D/g, '') === cleanMobile);
    if (duplicate) {
      return { success: false, error: 'An agent with this mobile number already exists.' };
    }

    const pinHash = await hashPin(data.pin);
    const newAgent: StoredAgentRecord = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fullName: data.fullName.trim(),
      mobile: cleanMobile,
      role: 'agent',
      status: 'active',
      createdAt: new Date().toISOString(),
      pinHash,
    };

    setAgents((prev) => [newAgent, ...prev]);

    addActivity({
      action: 'agent_created',
      performedByUserId: null,
      performedByRole: 'manager',
      agentId: newAgent.id,
      message: `Agent ${data.fullName.trim()} was added.`,
    });

    return { success: true };
  };

  const updateAgent = async (
    id: string,
    data: { fullName?: string; mobile?: string; pin?: string; status?: 'active' | 'inactive' }
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanMobile = data.mobile ? data.mobile.replace(/\D/g, '') : undefined;

    if (isCloudAuth && currentUser && supabase) {
      if (cleanMobile && currentUser.mobile && currentUser.mobile.replace(/\D/g, '') === cleanMobile) {
        return { success: false, error: 'Mobile number cannot be the same as the Manager’s mobile number.' };
      }
      if (cleanMobile) {
        const duplicate = agents.find((a) => a.id !== id && a.mobile.replace(/\D/g, '') === cleanMobile);
        if (duplicate) {
          return { success: false, error: 'Another agent with this mobile number already exists in your company.' };
        }
      }

      if (data.pin) {
        const target = agents.find((a) => a.id === id);
        const nameToUse = data.fullName?.trim() || target?.fullName || '';
        const mobileToUse = cleanMobile || target?.mobile || '';
        const res = await createCloudAgent({
          fullName: nameToUse,
          mobile: mobileToUse,
          pin: data.pin,
        });
        if (!res.success) {
          return { success: false, error: res.error || 'Failed to update agent credentials.' };
        }
      } else if (data.fullName !== undefined || cleanMobile !== undefined) {
        const updatePayload: any = {};
        if (data.fullName !== undefined) updatePayload.full_name = data.fullName.trim();
        if (cleanMobile !== undefined) updatePayload.mobile = cleanMobile;
        const { error: upErr } = await (supabase as any)
          .from('company_users')
          .update(updatePayload)
          .eq('id', id)
          .eq('company_id', currentUser.companyId);

        if (upErr) {
          return { success: false, error: upErr.message || 'Failed to update agent in cloud.' };
        }
      }

      await fetchCloudData();
      addActivity({
        action: 'agent_updated',
        performedByUserId: currentUser.companyUserId,
        performedByRole: currentUser.role,
        agentId: id,
        message: `Agent ${data.fullName?.trim() || 'details'} was updated.`,
      });

      return { success: true };
    }

    // Local / Offline fallback
    if (cleanMobile) {
      if (manager && manager.mobile.replace(/\D/g, '') === cleanMobile) {
        return { success: false, error: 'Mobile number cannot be the same as the Manager’s mobile number.' };
      }
      const duplicate = agents.find((a) => a.id !== id && a.mobile.replace(/\D/g, '') === cleanMobile);
      if (duplicate) {
        return { success: false, error: 'Another agent with this mobile number already exists.' };
      }
    }

    let newPinHash: string | undefined = undefined;
    if (data.pin) {
      newPinHash = await hashPin(data.pin);
    }

    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.id !== id) return agent;
        return {
          ...agent,
          fullName: data.fullName !== undefined ? data.fullName.trim() : agent.fullName,
          mobile: cleanMobile !== undefined ? cleanMobile : agent.mobile,
          status: data.status !== undefined ? data.status : agent.status,
          pinHash: newPinHash !== undefined ? newPinHash : agent.pinHash,
        };
      })
    );

    addActivity({
      action: 'agent_updated',
      performedByUserId: null,
      performedByRole: 'manager',
      agentId: id,
      message: `Agent ${data.fullName?.trim() || 'details'} was updated.`,
    });

    return { success: true };
  };

  const toggleAgentStatus = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const target = agents.find((a) => a.id === id);
    if (!target) {
      return { success: false, error: 'Agent not found' };
    }
    const nextStatus: 'active' | 'inactive' = target.status === 'active' ? 'inactive' : 'active';

    if (isCloudAuth && currentUser) {
      const res = await setCloudAgentStatus(id, nextStatus);
      if (!res.success) {
        return { success: false, error: res.error || 'Failed to update agent status in cloud.' };
      }
      await fetchCloudData();
      addActivity({
        action: nextStatus === 'inactive' ? 'agent_deactivated' : 'agent_updated',
        performedByUserId: currentUser.companyUserId,
        performedByRole: currentUser.role,
        agentId: id,
        message: nextStatus === 'inactive'
          ? `Agent ${target.fullName} was deactivated.`
          : `Agent ${target.fullName} was activated.`,
      });
      return { success: true };
    }

    // Local / Offline fallback
    addActivity({
      action: nextStatus === 'inactive' ? 'agent_deactivated' : 'agent_updated',
      performedByUserId: null,
      performedByRole: 'manager',
      agentId: id,
      message: nextStatus === 'inactive'
        ? `Agent ${target.fullName} was deactivated.`
        : `Agent ${target.fullName} was activated.`,
    });

    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.id !== id) return agent;
        return { ...agent, status: nextStatus };
      })
    );
    return { success: true };
  };

  const addCollectionLine = async (name: string): Promise<{ success: boolean; error?: string }> => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: 'Line name cannot be blank' };
    }

    if (collectionLines.some(l => l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, error: 'A collection line with this name already exists' };
    }

    if (isCloudAuth && currentUser && supabase) {
      try {
        const { error } = await (supabase as any)
          .from('company_collection_lines')
          .insert({
            company_id: currentUser.companyId,
            name: trimmed,
            status: 'active',
          })
          .select()
          .single();

        if (error) {
          console.error('Supabase addCollectionLine error:', error);
          return { success: false, error: error.message };
        }

        await fetchCloudData();
        addActivity({
          action: 'collection_line_created',
          performedByUserId: currentUser.companyUserId,
          performedByRole: currentUser.role,
          message: `Collection line "${trimmed}" was created.`,
        });
        return { success: true };
      } catch (err: any) {
        console.error('addCollectionLine exception:', err);
        return { success: false, error: err.message || 'Failed to add collection line in cloud.' };
      }
    }

    // Local / Offline fallback
    const now = new Date().toISOString();
    const newLine: CompanyCollectionLine = {
      id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: trimmed,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    setCollectionLines(prev => [...prev, newLine]);
    addActivity({
      action: 'collection_line_created',
      performedByUserId: null,
      performedByRole: 'manager',
      message: `Collection line "${trimmed}" was created.`,
    });
    return { success: true };
  };

  const updateCollectionLine = async (id: string, newName: string): Promise<{ success: boolean; error?: string }> => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return { success: false, error: 'Line name cannot be blank' };
    }

    const existingLine = collectionLines.find(l => l.id === id);
    if (!existingLine) {
      return { success: false, error: 'Collection line not found' };
    }

    const oldName = existingLine.name;

    if (collectionLines.some(l => l.id !== id && l.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return { success: false, error: 'A collection line with this name already exists' };
    }

    if (oldName === trimmed) {
      return { success: true };
    }

    if (isCloudAuth && currentUser && supabase) {
      try {
        const { data: rpcData, error: rpcErr } = await (supabase as any)
          .rpc('rename_company_collection_line', {
            p_line_id: id,
            p_new_name: trimmed,
          });

        if (!rpcErr && rpcData) {
          const res = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
          if (res.success === false) {
            return { success: false, error: res.error || 'Failed to rename collection line' };
          }
        } else {
          // Fallback direct table updates
          const { error: lineErr } = await (supabase as any)
            .from('company_collection_lines')
            .update({ name: trimmed, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('company_id', currentUser.companyId);

          if (lineErr) {
            return { success: false, error: lineErr.message };
          }

          await (supabase as any)
            .from('borrowers')
            .update({ collection_line: trimmed, updated_at: new Date().toISOString() })
            .eq('company_id', currentUser.companyId)
            .eq('collection_line', oldName);
        }

        await fetchCloudData();
        addActivity({
          action: 'collection_line_updated',
          performedByUserId: currentUser.companyUserId,
          performedByRole: currentUser.role,
          message: `Collection line "${oldName}" was renamed to "${trimmed}".`,
        });
        return { success: true };
      } catch (err: any) {
        console.error('updateCollectionLine exception:', err);
        return { success: false, error: err.message || 'Failed to update collection line in cloud.' };
      }
    }

    // Local / Offline fallback
    const now = new Date().toISOString();
    setCollectionLines(prev => prev.map(l => l.id === id ? { ...l, name: trimmed, updatedAt: now } : l));
    setBorrowers(prev => prev.map(b => b.collectionLine === oldName ? { ...b, collectionLine: trimmed } : b));
    addActivity({
      action: 'collection_line_updated',
      performedByUserId: null,
      performedByRole: 'manager',
      message: `Collection line "${oldName}" was renamed to "${trimmed}".`,
    });
    return { success: true };
  };

  const toggleCollectionLineStatus = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const target = collectionLines.find((l) => l.id === id);
    if (!target) {
      return { success: false, error: 'Collection line not found' };
    }

    const nextStatus: 'active' | 'inactive' = target.status === 'active' ? 'inactive' : 'active';
    const now = new Date().toISOString();

    if (isCloudAuth && currentUser && supabase) {
      try {
        const { error } = await (supabase as any)
          .from('company_collection_lines')
          .update({ status: nextStatus, updated_at: now })
          .eq('id', id)
          .eq('company_id', currentUser.companyId);

        if (error) {
          return { success: false, error: error.message };
        }

        await fetchCloudData();
        addActivity({
          action: 'collection_line_status_changed',
          performedByUserId: currentUser.companyUserId,
          performedByRole: currentUser.role,
          message: `Collection line "${target.name}" was ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`,
        });
        return { success: true };
      } catch (err: any) {
        console.error('toggleCollectionLineStatus exception:', err);
        return { success: false, error: err.message || 'Failed to toggle collection line status.' };
      }
    }

    // Local / Offline fallback
    setCollectionLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        return { ...line, status: nextStatus, updatedAt: now };
      })
    );

    addActivity({
      action: 'collection_line_status_changed',
      performedByUserId: null,
      performedByRole: 'manager',
      message: `Collection line "${target.name}" was ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`,
    });
    return { success: true };
  };

  const addBorrower = async (data: NewBorrowerInput): Promise<{ success: boolean; error?: string; borrowerId?: string }> => {
    const parsedBookNo = data.bookNo !== undefined && data.bookNo !== null ? Number(data.bookNo) : null;
    const assignedAgentId = (isCloudAuth && currentUser?.role === 'agent')
      ? currentUser.companyUserId
      : (data.agentId || null);

    if (isCloudAuth && currentUser && supabase) {
      try {
        const startIso = toDbDate(data.startDate) || getTodayIsoDate();
        const endIso = toDbDate(data.endDate);

        const { data: insertedData, error } = await (supabase as any)
          .from('borrowers')
          .insert({
            company_id: currentUser.companyId,
            book_no: parsedBookNo,
            name: data.borrowerName.trim(),
            phone: data.phoneNumber.trim(),
            alternate_phone: data.alternatePhoneNumber?.trim() || null,
            address: data.address?.trim() || null,
            finance_type: data.financeType,
            weekly_collection_day: data.financeType === 'Weekly' && data.weeklyCollectionDay ? Number(data.weeklyCollectionDay) : null,
            monthly_collection_day: data.financeType === 'Monthly' && data.monthlyCollectionDay ? Number(data.monthlyCollectionDay) : null,
            collection_line: data.collectionLine ? data.collectionLine.trim() : null,
            collection_method: data.collectionMethod ? data.collectionMethod.trim() : null,
            assigned_agent_id: assignedAgentId,
            loan_amount: data.loanAmount,
            deducted_amount: data.deductedAmount,
            agent_commission: Number(data.agentCommission) || 0,
            net_amount_given: data.netAmountGiven,
            expected_return: data.expectedReturn,
            interest_rate: data.interestRate,
            repayment_duration: data.repaymentDuration,
            start_date: startIso,
            end_date: endIso,
            existing_loan: Boolean(data.isExistingLoan),
            parcel_token_mode: Boolean(data.parcelTokenMode),
            status: 'active',
          })
          .select('id')
          .single();

        if (error) {
          console.error('Supabase addBorrower error:', error);
          if (
            error.code === '23505' ||
            (error.message && error.message.includes('idx_borrowers_company_book_no')) ||
            (error.message && error.message.includes('chk_borrower_book_no_range'))
          ) {
            return {
              success: false,
              error: `Book No ${parsedBookNo} is already assigned to another borrower. Please select another Book No.`,
            };
          }
          return { success: false, error: error.message };
        }

        const newId = insertedData?.id;
        await fetchCloudData();
        return { success: true, borrowerId: newId };
      } catch (err: any) {
        console.error('addBorrower exception:', err);
        return { success: false, error: err.message || 'Failed to create borrower in cloud.' };
      }
    }

    // Local / Offline fallback
    if (parsedBookNo !== null && borrowers.some(b => b.bookNo === parsedBookNo)) {
      return {
        success: false,
        error: `Book No ${parsedBookNo} is already assigned to another borrower. Please select another Book No.`,
      };
    }

    const now = new Date().toISOString();
    const resolvedAgentId = (currentRole === 'agent' && currentUser?.companyUserId)
      ? currentUser.companyUserId
      : (data.agentId !== undefined ? data.agentId : null);

    const newBorrower: Borrower = {
      id: Date.now().toString(),
      bookNo: parsedBookNo,
      ...data,
      weeklyCollectionDay: data.financeType === 'Weekly' && data.weeklyCollectionDay ? Number(data.weeklyCollectionDay) : null,
      monthlyCollectionDay: data.financeType === 'Monthly' && data.monthlyCollectionDay ? Number(data.monthlyCollectionDay) : null,
      collectionLine: data.collectionLine ? data.collectionLine.trim() : null,
      collectionMethod: data.collectionMethod ? data.collectionMethod.trim() : null,
      agentId: resolvedAgentId,
      agentCommission: Number(data.agentCommission) || 0,
      name: data.borrowerName,
      phone: data.phoneNumber,
      amount: data.loanAmount,
      status: 'active',
      dateAdded: now,
      createdAt: now,
    };
    setBorrowers(prev => [newBorrower, ...prev]);

    const loanDisbursedAmt = newBorrower.loanAmount || newBorrower.amount || 0;
    const commissionAmt = newBorrower.agentCommission || 0;

    if (loanDisbursedAmt > 0) {
      const ledgerEntry: CashLedgerEntry = {
        id: `cash_loan_${newBorrower.id}_${Date.now()}`,
        companyId: currentUser?.companyId,
        transactionType: 'LOAN_DISBURSED',
        amount: loanDisbursedAmt,
        sourceType: 'LOAN',
        borrowerId: newBorrower.id,
        borrowerName: newBorrower.borrowerName,
        note: `Loan disbursed to ${newBorrower.borrowerName}`,
        performedByUserId: currentUser?.companyUserId || null,
        performedByName: currentUser?.fullName || (currentRole === 'agent' ? 'Agent' : 'Manager'),
        createdAt: now,
      };
      setCashLedger(prev => {
        if (prev.some(e => e.transactionType === 'LOAN_DISBURSED' && e.borrowerId === newBorrower.id)) {
          return prev;
        }
        return [ledgerEntry, ...prev];
      });
    }

    if (commissionAmt > 0) {
      const commEntry: CashLedgerEntry = {
        id: `cash_comm_${newBorrower.id}_${Date.now()}`,
        companyId: currentUser?.companyId,
        transactionType: 'AGENT_COMMISSION',
        amount: commissionAmt,
        sourceType: 'COMMISSION',
        borrowerId: newBorrower.id,
        borrowerName: newBorrower.borrowerName,
        note: `Agent commission for ${newBorrower.borrowerName}`,
        performedByUserId: currentUser?.companyUserId || null,
        performedByName: currentUser?.fullName || (currentRole === 'agent' ? 'Agent' : 'Manager'),
        createdAt: now,
      };
      setCashLedger(prev => {
        if (prev.some(e => e.transactionType === 'AGENT_COMMISSION' && e.borrowerId === newBorrower.id)) {
          return prev;
        }
        return [commEntry, ...prev];
      });
    }

    addActivity({
      action: 'borrower_created',
      performedByUserId: currentUser?.companyUserId || null,
      performedByRole: currentRole,
      borrowerId: newBorrower.id,
      message: `Borrower ${data.borrowerName.trim()} was added.`,
    });

    return { success: true, borrowerId: newBorrower.id };
  };

  const updateBorrower = async (id: string, data: Partial<NewBorrowerInput>): Promise<{ success: boolean; error?: string }> => {
    if (isCloudAuth && currentUser && supabase) {
      try {
        const updatePayload: any = {};
        if (data.bookNo !== undefined) {
          updatePayload.book_no = data.bookNo !== null ? Number(data.bookNo) : null;
        }
        if (data.borrowerName !== undefined) updatePayload.name = data.borrowerName.trim();
        if (data.phoneNumber !== undefined) updatePayload.phone = data.phoneNumber.trim();
        if (data.alternatePhoneNumber !== undefined) updatePayload.alternate_phone = data.alternatePhoneNumber.trim() || null;
        if (data.address !== undefined) updatePayload.address = data.address.trim() || null;
        if (data.financeType !== undefined) updatePayload.finance_type = data.financeType;
        if (data.weeklyCollectionDay !== undefined) {
          updatePayload.weekly_collection_day = data.weeklyCollectionDay ? Number(data.weeklyCollectionDay) : null;
        }
        if (data.monthlyCollectionDay !== undefined) {
          updatePayload.monthly_collection_day = data.monthlyCollectionDay ? Number(data.monthlyCollectionDay) : null;
        }
        if (data.collectionLine !== undefined) {
          updatePayload.collection_line = data.collectionLine ? data.collectionLine.trim() : null;
        }
        if (data.collectionMethod !== undefined) {
          updatePayload.collection_method = data.collectionMethod ? data.collectionMethod.trim() : null;
        }
        if (data.agentId !== undefined) updatePayload.assigned_agent_id = data.agentId || null;
        if (data.agentCommission !== undefined) updatePayload.agent_commission = data.agentCommission;
        if (data.loanAmount !== undefined) updatePayload.loan_amount = data.loanAmount;
        if (data.deductedAmount !== undefined) updatePayload.deducted_amount = data.deductedAmount;
        if (data.netAmountGiven !== undefined) updatePayload.net_amount_given = data.netAmountGiven;
        if (data.expectedReturn !== undefined) updatePayload.expected_return = data.expectedReturn;
        if (data.interestRate !== undefined) updatePayload.interest_rate = data.interestRate;
        if (data.repaymentDuration !== undefined) updatePayload.repayment_duration = data.repaymentDuration;
        if (data.startDate !== undefined) updatePayload.start_date = toDbDate(data.startDate);
        if (data.endDate !== undefined) updatePayload.end_date = toDbDate(data.endDate);
        if (data.isExistingLoan !== undefined) updatePayload.existing_loan = data.isExistingLoan;
        if (data.parcelTokenMode !== undefined) updatePayload.parcel_token_mode = data.parcelTokenMode;

        const { error } = await (supabase as any)
          .from('borrowers')
          .update(updatePayload)
          .eq('id', id)
          .eq('company_id', currentUser.companyId);

        if (error) {
          console.error('Supabase updateBorrower error:', error);
          return { success: false, error: error.message };
        }

        await fetchCloudData();
        return { success: true };
      } catch (err: any) {
        console.error('updateBorrower exception:', err);
        return { success: false, error: err.message || 'Failed to update borrower.' };
      }
    }

    // Local / Offline fallback
    const target = borrowers.find(b => b.id === id);
    const updatedName = data.borrowerName !== undefined ? data.borrowerName.trim() : (target?.borrowerName || target?.name || 'Borrower');

    setBorrowers(prev =>
      prev.map((borrower) => {
        if (borrower.id !== id) return borrower;
        return {
          ...borrower,
          ...data,
          agentCommission: data.agentCommission !== undefined ? data.agentCommission : (borrower.agentCommission || 0),
          name: data.borrowerName !== undefined ? data.borrowerName : borrower.name,
          borrowerName: data.borrowerName !== undefined ? data.borrowerName : borrower.borrowerName,
          phone: data.phoneNumber !== undefined ? data.phoneNumber : borrower.phone,
          phoneNumber: data.phoneNumber !== undefined ? data.phoneNumber : borrower.phoneNumber,
          amount: data.loanAmount !== undefined ? data.loanAmount : borrower.amount,
          loanAmount: data.loanAmount !== undefined ? data.loanAmount : borrower.loanAmount,
          agentId: data.agentId !== undefined ? data.agentId : borrower.agentId,
        };
      })
    );

    addActivity({
      action: 'borrower_updated',
      performedByUserId: null,
      performedByRole: 'manager',
      borrowerId: id,
      message: `Borrower ${updatedName} details were updated.`,
    });

    return { success: true };
  };

  const addPayment = async (data: Omit<PaymentRecord, 'id' | 'createdAt'>): Promise<{ success: boolean; error?: string }> => {
    if (isCloudAuth && currentUser && supabase) {
      try {
        const paymentDateIso = toDbDate(data.paymentDate) || getTodayIsoDate();
        const { error } = await (supabase as any)
          .from('payments')
          .insert({
            company_id: currentUser.companyId,
            borrower_id: data.borrowerId,
            collected_by_user_id: currentUser.companyUserId,
            amount: data.amount,
            payment_date: paymentDateIso,
            finance_type: data.financeType,
            collection_method: data.collectionMethod ? data.collectionMethod.trim() : null,
            note: data.note?.trim() || null,
          });

        if (error) {
          console.error('Supabase addPayment error:', error);
          return { success: false, error: error.message };
        }

        await fetchCloudData();
        return { success: true };
      } catch (err: any) {
        console.error('addPayment exception:', err);
        return { success: false, error: err.message || 'Failed to record payment.' };
      }
    }

    // Local / Offline fallback
    const paymentId = Date.now().toString();
    const now = new Date().toISOString();
    const newPayment: PaymentRecord = {
      id: paymentId,
      ...data,
      collectionMethod: data.collectionMethod ? data.collectionMethod.trim() : null,
      note: data.note?.trim() || undefined,
      collectedByUserId: data.collectedByUserId !== undefined ? data.collectedByUserId : null,
      collectedByRole: data.collectedByRole || (data.collectedByUserId ? 'agent' : 'manager'),
      collectedBy: data.collectedBy || (data.collectedByRole === 'agent' ? 'Agent' : 'Manager'),
      createdAt: now,
    };
    setPayments(prev => [newPayment, ...prev]);

    if (data.amount > 0) {
      const ledgerEntry: CashLedgerEntry = {
        id: `cash_pay_${paymentId}`,
        companyId: currentUser?.companyId,
        transactionType: 'PAYMENT_COLLECTED',
        amount: data.amount,
        sourceType: 'PAYMENT',
        paymentId: paymentId,
        borrowerId: data.borrowerId,
        borrowerName: data.borrowerName,
        note: `Collection received from ${data.borrowerName}`,
        performedByUserId: newPayment.collectedByUserId ?? null,
        performedByName: newPayment.collectedBy || (newPayment.collectedByRole === 'agent' ? 'Agent' : 'Manager'),
        createdAt: now,
      };
      setCashLedger(prev => {
        if (prev.some(e => e.transactionType === 'PAYMENT_COLLECTED' && e.paymentId === paymentId)) {
          return prev;
        }
        return [ledgerEntry, ...prev];
      });
    }

    addActivity({
      action: 'payment_collected',
      performedByUserId: newPayment.collectedByUserId ?? null,
      performedByRole: newPayment.collectedByRole || 'manager',
      borrowerId: data.borrowerId,
      paymentId: paymentId,
      amount: data.amount,
      message: `₹${data.amount.toLocaleString('en-IN')} collected from ${data.borrowerName}.`,
    });

    setBorrowers(prev =>
      prev.map(b => {
        if (b.id !== data.borrowerId) return b;
        const currentPaid = payments
          .filter(p => p.borrowerId === b.id)
          .reduce((sum, p) => sum + p.amount, 0);
        const totalAfterThis = currentPaid + data.amount;
        const expReturn = b.expectedReturn || b.loanAmount || 0;
        if (totalAfterThis >= expReturn && b.status === 'active') {
          addActivity({
            action: 'loan_closed',
            performedByUserId: newPayment.collectedByUserId ?? null,
            performedByRole: newPayment.collectedByRole || 'manager',
            borrowerId: b.id,
            paymentId: paymentId,
            message: `Loan for ${b.borrowerName || b.name} was closed.`,
          });
          return { ...b, status: 'closed' };
        }
        return b;
      })
    );

    return { success: true };
  };

  const getBorrowerPaidAmount = (borrowerId: string): number => {
    return payments
      .filter(p => p.borrowerId === borrowerId)
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const getBorrowerLastPaymentDate = (borrowerId: string): string => {
    const borrowerPayments = payments.filter(p => p.borrowerId === borrowerId);
    if (borrowerPayments.length === 0) return '-';
    const sorted = [...borrowerPayments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
    const latest = sorted[0];
    if (!latest || !latest.paymentDate) return '-';
    return formatDisplayDate(latest.paymentDate) || '-';
  };

  const getTodayCollectedAmount = (tf?: Timeframe): number => {
    const todayIso = getTodayIsoDate();
    return payments
      .filter(p => p.paymentDate === todayIso && (!tf || p.financeType === tf))
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const getDueBorrowersForDate = (targetDateIso: string, tf?: Timeframe): DueBorrowerItem[] => {
    const [y, m, d] = targetDateIso.split('-');
    const targetDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));

    // Role-scoped borrowers for due calculation
    const roleScopedList = currentRole === 'agent'
      ? borrowers.filter(
          (b) =>
            b.agentId === currentUser?.companyUserId ||
            (b.assignedAgent &&
              currentUser?.fullName &&
              b.assignedAgent.toLowerCase() === currentUser.fullName.toLowerCase())
        )
      : borrowers;

    const relevantBorrowers = roleScopedList.filter(
      (b) => (!tf || (b.financeType || 'Daily') === tf) && b.status === 'active'
    );

    const dueItems: DueBorrowerItem[] = [];

    for (const b of relevantBorrowers) {
      const { isDue, scheduledAmount } = isPaymentDueOnDate(b, targetDate);
      if (!isDue || scheduledAmount <= 0) continue;

      // Check payments recorded on this target date
      const paidForDate = payments
        .filter((p) => p.borrowerId === b.id && p.paymentDate === targetDateIso)
        .reduce((sum, p) => sum + p.amount, 0);

      const pending = Math.max(0, scheduledAmount - paidForDate);

      // If fully paid, the borrower is not counted as unpaid due for that date
      if (paidForDate >= scheduledAmount) {
        continue;
      }

      dueItems.push({
        borrower: b,
        dueAmount: scheduledAmount,
        paidAmount: paidForDate,
        pendingAmount: pending,
        status: paidForDate > 0 ? 'Partial' : 'Pending',
      });
    }

    return dueItems;
  };

  const getTodayDueCount = (tf?: Timeframe): number => {
    const todayIso = getTodayIsoDate();
    const dues = getDueBorrowersForDate(todayIso, tf);
    return dues.length;
  };

  const getCashInHand = (): number => {
    const inflows = cashLedger
      .filter(e => e.transactionType === 'CASH_ADDED' || e.transactionType === 'PAYMENT_COLLECTED')
      .reduce((sum, e) => sum + e.amount, 0);
    const outflows = cashLedger
      .filter(e => e.transactionType === 'LOAN_DISBURSED' || e.transactionType === 'CASH_DECREASED' || e.transactionType === 'AGENT_COMMISSION')
      .reduce((sum, e) => sum + e.amount, 0);
    return inflows - outflows;
  };

  const getTotalOutFlow = (): number => {
    return cashLedger
      .filter(e => e.transactionType === 'LOAN_DISBURSED' || e.transactionType === 'CASH_DECREASED')
      .reduce((sum, e) => sum + e.amount, 0);
  };

  const addManualCash = async (amount: number, note?: string) => {
    if (amount <= 0) return;
    if (isCloudAuth && currentUser && supabase) {
      try {
        await (supabase as any)
          .from('company_cash_ledger')
          .insert({
            company_id: currentUser.companyId,
            transaction_type: 'CASH_ADDED',
            amount: amount,
            source_type: 'MANUAL',
            note: note?.trim() || 'Cash added to hand',
            performed_by_user_id: currentUser.companyUserId,
          });
        await fetchCloudData();
      } catch (e) {
        console.error('Failed to insert cash addition to cloud ledger:', e);
      }
      return;
    }

    const now = new Date().toISOString();
    const isFirstEntry = cashLedger.length === 0;
    const newEntry: CashLedgerEntry = {
      id: `cash_add_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      companyId: currentUser?.companyId,
      transactionType: 'CASH_ADDED',
      amount,
      sourceType: 'MANUAL',
      note: note?.trim() || (isFirstEntry ? 'Initial Starting Cash' : 'Cash added to hand'),
      performedByUserId: currentUser?.companyUserId || null,
      performedByName: currentUser?.fullName || 'Manager',
      createdAt: now,
    };
    setCashLedger(prev => [newEntry, ...prev]);
  };

  const decreaseManualCash = async (amount: number, note?: string) => {
    if (amount <= 0) return;
    if (isCloudAuth && currentUser && supabase) {
      try {
        await (supabase as any)
          .from('company_cash_ledger')
          .insert({
            company_id: currentUser.companyId,
            transaction_type: 'CASH_DECREASED',
            amount: amount,
            source_type: 'MANUAL',
            note: note?.trim() || 'Cash withdrawn / decreased',
            performed_by_user_id: currentUser.companyUserId,
          });
        await fetchCloudData();
      } catch (e) {
        console.error('Failed to insert cash decrease to cloud ledger:', e);
      }
      return;
    }

    const now = new Date().toISOString();
    const newEntry: CashLedgerEntry = {
      id: `cash_dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      companyId: currentUser?.companyId,
      transactionType: 'CASH_DECREASED',
      amount,
      sourceType: 'MANUAL',
      note: note?.trim() || 'Cash withdrawn / decreased',
      performedByUserId: currentUser?.companyUserId || null,
      performedByName: currentUser?.fullName || 'Manager',
      createdAt: now,
    };
    setCashLedger(prev => [newEntry, ...prev]);
  };

  const sanitizedAgents: AgentUser[] = agents.map(({ pinHash: _pinHash, ...safeAgent }) => safeAgent);

  return (
    <AppContext.Provider
      value={{
        screen,
        currentUser,
        currentRole,
        isCloudAuth,
        manager,
        company,
        agents: sanitizedAgents,
        borrowers,
        collectionLines,
        payments,
        activityLogs,
        cashLedger,
        timeframe,
        borrowerFilter,
        searchQuery,
        setSearchQuery,
        navigateTo,
        registerManager,
        updateManager,
        cloudLogin,
        login,
        logout,
        updateCompany,
        addAgent,
        updateAgent,
        toggleAgentStatus,
        addCollectionLine,
        updateCollectionLine,
        toggleCollectionLineStatus,
        setTimeframe,
        setBorrowerFilter,
        addBorrower,
        updateBorrower,
        addPayment,
        addActivity,
        getCashInHand,
        getTotalOutFlow,
        addManualCash,
        decreaseManualCash,
        getBorrowerPaidAmount,
        getBorrowerLastPaymentDate,
        getTodayCollectedAmount,
        getDueBorrowersForDate,
        getTodayDueCount,
        settings,
        updateSettings,
        resetSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
