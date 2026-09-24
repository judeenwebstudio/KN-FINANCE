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
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { hashPin, hashPinSync } from '../utils/security';
import { loginWithPin, restoreCloudSession, signOutOfCloud } from '../lib/authService';

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
  payments: PaymentRecord[];
  activityLogs: ActivityLogEntry[];
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
  toggleAgentStatus: (id: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setBorrowerFilter: (f: BorrowerFilter) => void;
  addBorrower: (data: NewBorrowerInput) => void;
  updateBorrower: (id: string, data: Partial<NewBorrowerInput>) => void;
  addPayment: (data: Omit<PaymentRecord, 'id' | 'createdAt'>) => void;
  addActivity: (entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) => void;
  getBorrowerPaidAmount: (borrowerId: string) => number;
  getBorrowerLastPaymentDate: (borrowerId: string) => string;
  getTodayCollectedAmount: (tf: Timeframe) => number;
  getDueBorrowersForDate: (targetDateIso: string, tf: Timeframe) => DueBorrowerItem[];
  getTodayDueCount: (tf: Timeframe) => number;
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
} from '../utils/loanCalculations';

export {
  getTodayIsoDate,
  formatDisplayDate,
  parseCustomDate,
  isPaymentDueOnDate,
};


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
        netAmountGiven: item.netAmountGiven || (item.loanAmount || item.amount || 0) - (item.deductedAmount || 0),
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
      localStorage.setItem('kn_finance_borrowers', JSON.stringify(borrowers));
    } catch (e) {
      console.error(e);
    }
  }, [borrowers]);

  useEffect(() => {
    try {
      localStorage.setItem('kn_finance_payments', JSON.stringify(payments));
    } catch (e) {
      console.error(e);
    }
  }, [payments]);

  useEffect(() => {
    try {
      localStorage.setItem('kn_finance_agents', JSON.stringify(agents));
    } catch (e) {
      console.error(e);
    }
  }, [agents]);

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
    if (data.mobile) {
      const cleanMobile = data.mobile.replace(/\D/g, '');
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
          mobile: data.mobile !== undefined ? data.mobile.replace(/\D/g, '') : agent.mobile,
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

  const toggleAgentStatus = (id: string) => {
    const target = agents.find((a) => a.id === id);
    if (target) {
      const isDeactivating = target.status === 'active';
      addActivity({
        action: isDeactivating ? 'agent_deactivated' : 'agent_updated',
        performedByUserId: null,
        performedByRole: 'manager',
        agentId: id,
        message: isDeactivating
          ? `Agent ${target.fullName} was deactivated.`
          : `Agent ${target.fullName} was activated.`,
      });
    }

    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.id !== id) return agent;
        const nextStatus: 'active' | 'inactive' = agent.status === 'active' ? 'inactive' : 'active';
        return { ...agent, status: nextStatus };
      })
    );
  };

  const addBorrower = (data: NewBorrowerInput) => {
    const now = new Date().toISOString();
    const newBorrower: Borrower = {
      id: Date.now().toString(),
      ...data,
      agentId: data.agentId !== undefined ? data.agentId : null,
      name: data.borrowerName,
      phone: data.phoneNumber,
      amount: data.loanAmount,
      status: 'active',
      dateAdded: now,
      createdAt: now,
    };
    setBorrowers(prev => [newBorrower, ...prev]);

    addActivity({
      action: 'borrower_created',
      performedByUserId: null,
      performedByRole: 'manager',
      borrowerId: newBorrower.id,
      message: `Borrower ${data.borrowerName.trim()} was added.`,
    });
  };

  const updateBorrower = (id: string, data: Partial<NewBorrowerInput>) => {
    const target = borrowers.find(b => b.id === id);
    const updatedName = data.borrowerName !== undefined ? data.borrowerName.trim() : (target?.borrowerName || target?.name || 'Borrower');

    setBorrowers(prev =>
      prev.map((borrower) => {
        if (borrower.id !== id) return borrower;
        return {
          ...borrower,
          ...data,
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
  };

  const addPayment = (data: Omit<PaymentRecord, 'id' | 'createdAt'>) => {
    const paymentId = Date.now().toString();
    const newPayment: PaymentRecord = {
      id: paymentId,
      ...data,
      note: data.note?.trim() || undefined,
      collectedByUserId: data.collectedByUserId !== undefined ? data.collectedByUserId : null,
      collectedByRole: data.collectedByRole || (data.collectedByUserId ? 'agent' : 'manager'),
      collectedBy: data.collectedBy || (data.collectedByRole === 'agent' ? 'Agent' : 'Manager'),
      createdAt: new Date().toISOString(),
    };
    setPayments(prev => [newPayment, ...prev]);

    // 1. Record payment_collected activity
    addActivity({
      action: 'payment_collected',
      performedByUserId: newPayment.collectedByUserId ?? null,
      performedByRole: newPayment.collectedByRole || 'manager',
      borrowerId: data.borrowerId,
      paymentId: paymentId,
      amount: data.amount,
      message: `₹${data.amount.toLocaleString('en-IN')} collected from ${data.borrowerName}.`,
    });

    // 2. If loan is fully paid (totalPaid >= expectedReturn), mark as closed and record ONE loan_closed activity
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
  };

  const getBorrowerPaidAmount = (borrowerId: string): number => {
    return payments
      .filter(p => p.borrowerId === borrowerId)
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const getBorrowerLastPaymentDate = (borrowerId: string): string => {
    const borrowerPayments = payments.filter(p => p.borrowerId === borrowerId);
    if (borrowerPayments.length === 0) return '-';
    const sorted = [...borrowerPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    const latest = sorted[0];
    if (!latest) return '-';
    const [y, m, d] = latest.paymentDate.split('-');
    return `${d}/${m}/${y}`;
  };

  const getTodayCollectedAmount = (tf: Timeframe): number => {
    const todayIso = getTodayIsoDate();
    return payments
      .filter(p => p.paymentDate === todayIso && p.financeType === tf)
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const getDueBorrowersForDate = (targetDateIso: string, tf: Timeframe): DueBorrowerItem[] => {
    const [y, m, d] = targetDateIso.split('-');
    const targetDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));

    const relevantBorrowers = borrowers.filter(
      (b) => (b.financeType || 'Daily') === tf && b.status === 'active'
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

  const getTodayDueCount = (tf: Timeframe): number => {
    const todayIso = getTodayIsoDate();
    const dues = getDueBorrowersForDate(todayIso, tf);
    return dues.length;
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
        payments,
        activityLogs,
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
        setTimeframe,
        setBorrowerFilter,
        addBorrower,
        updateBorrower,
        addPayment,
        addActivity,
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
