import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Users,
  IndianRupee,
  ArrowDownLeft,
  CalendarClock,
  ChevronDown,
  User,
  Search,
  CheckCircle2,
  Wallet,
  TrendingDown,
  BadgePercent,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { type DashboardLineFilter } from '../types';
import { AddBorrowerModal } from './AddBorrowerModal';
import { ActiveBorrowersModal } from './ActiveBorrowersModal';
import { CollectionsModal } from './CollectionsModal';
import { DueTodayModal } from './DueTodayModal';
import { FinancialAnalyticsModal } from './FinancialAnalyticsModal';
import { BorrowerDetailsModal } from './BorrowerDetailsModal';
import { CashInHandModal } from './CashInHandModal';
import { OutFlowModal } from './OutFlowModal';
import { resolveAgentName } from '../utils/agentUtils';
import { getCurrentActionableDue, getTodayIsoDate } from '../utils/loanCalculations';
import { formatAppDate } from '../utils/dateUtils';

export const DashboardScreen: React.FC = () => {
  const {
    currentUser,
    currentRole,
    borrowers,
    payments,
    agents,
    settings,
    collectionLines,
    borrowerFilter,
    setBorrowerFilter,
    searchQuery,
    setSearchQuery,
    navigateTo,
    getTodayCollectedAmount,
    getTodayDueCount,
    getCashInHand,
    getTotalOutFlow,
    getBorrowerPaidAmount,
  } = useApp();

  const lineFilterOptions = useMemo(() => {
    const activeNames = collectionLines
      .filter((l) => l.status === 'active')
      .map((l) => l.name);
    return ['All Lines', ...activeNames];
  }, [collectionLines]);

  const [selectedLine, setSelectedLine] = useState<DashboardLineFilter>('All Lines');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isActiveBorrowersModalOpen, setIsActiveBorrowersModalOpen] = useState(false);
  const [isCollectionsModalOpen, setIsCollectionsModalOpen] = useState(false);
  const [isDueTodayModalOpen, setIsDueTodayModalOpen] = useState(false);
  const [isFinancialAnalyticsModalOpen, setIsFinancialAnalyticsModalOpen] = useState(false);
  const [isCashInHandModalOpen, setIsCashInHandModalOpen] = useState(false);
  const [isOutFlowModalOpen, setIsOutFlowModalOpen] = useState(false);
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<string | null>(null);
  const [restoreSuccessToast, setRestoreSuccessToast] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('kn_finance_restore_success') === 'true') {
        sessionStorage.removeItem('kn_finance_restore_success');
        setRestoreSuccessToast(true);
        const timer = setTimeout(() => setRestoreSuccessToast(false), 4500);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore storage error
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Role Scoped Borrowers: Agents see ONLY borrowers assigned to them
  const roleScopedBorrowers = currentRole === 'agent'
    ? borrowers.filter((b) =>
        b.agentId === currentUser?.companyUserId ||
        (b.assignedAgent && currentUser?.fullName && b.assignedAgent.toLowerCase() === currentUser.fullName.toLowerCase())
      )
    : borrowers;

  const activeRoleScopedBorrowers = roleScopedBorrowers.filter((b) => b.status === 'active');

  // Metrics calculated for summary cards
  const activeCount = activeRoleScopedBorrowers.length;
  const totalLoaned = activeRoleScopedBorrowers
    .reduce((acc, curr) => acc + (curr.loanAmount || curr.amount || 0), 0);
  const collectedToday = getTodayCollectedAmount();
  const dueTodayCount = getTodayDueCount();

  // Manager financial totals from company cash ledger
  const managerCashInHand = getCashInHand();
  const managerOutFlow = getTotalOutFlow();

  // Agent financial totals strictly scoped to logged-in Agent's assigned borrowers
  const agentFinancials = useMemo(() => {
    const agentBorrowers = roleScopedBorrowers;

    const agentLoanDisbursed = agentBorrowers.reduce(
      (sum, b) => sum + (b.loanAmount || b.amount || 0),
      0
    );

    const agentDeductedAmount = agentBorrowers.reduce(
      (sum, b) => sum + (b.deductedAmount || 0),
      0
    );

    const agentPaymentsCollected = agentBorrowers.reduce(
      (sum, b) => sum + getBorrowerPaidAmount(b.id),
      0
    );

    // Agent Cash in Hand = Inflows (Payments + Deductions) - Outflows (Loans)
    const agentCashInHand = agentPaymentsCollected + agentDeductedAmount - agentLoanDisbursed;

    // Agent Out Flow = MAX(0, Loans Disbursed - Payments Collected)
    const agentOutFlow = Math.max(0, agentLoanDisbursed - agentPaymentsCollected);

    return {
      agentLoanDisbursed,
      agentDeductedAmount,
      agentPaymentsCollected,
      agentCashInHand,
      agentOutFlow,
    };
  }, [roleScopedBorrowers, payments, getBorrowerPaidAmount]);

  const displayCashInHand = currentRole === 'manager' ? managerCashInHand : agentFinancials.agentCashInHand;
  const displayOutFlow = currentRole === 'manager' ? managerOutFlow : agentFinancials.agentOutFlow;

  // Agent Commission calculation:
  // - Manager: Sums agent commission across all company borrowers assigned to an agent (active + closed)
  // - Agent: Sums agent commission only for borrowers assigned to currentUser.companyUserId (active + closed)
  const agentCommissionTotal = useMemo(() => {
    if (currentRole === 'agent') {
      const agentUserId = currentUser?.companyUserId;
      const agentName = currentUser?.fullName?.toLowerCase();
      return roleScopedBorrowers
        .filter((b) =>
          (agentUserId && b.agentId === agentUserId) ||
          (!b.agentId && b.assignedAgent && agentName && b.assignedAgent.toLowerCase() === agentName)
        )
        .reduce((sum, b) => sum + (b.agentCommission || 0), 0);
    }

    // Manager scope: all borrowers assigned to an agent
    return borrowers
      .filter((b) => Boolean(b.agentId || (b.assignedAgent && b.assignedAgent.trim() !== '')))
      .reduce((sum, b) => sum + (b.agentCommission || 0), 0);
  }, [borrowers, roleScopedBorrowers, currentRole, currentUser]);

  const todayIso = getTodayIsoDate();

  // Filter borrowers for the Dashboard Table / Work Queue:
  // 1. Role scoping (Manager sees all company borrowers, Agent sees assigned only)
  // 2. Line filter ('All Lines' includes legacy null lines, specific line matches exact collectionLine)
  // 3. Status filter & Work Queue (Active view shows only borrowers with an actionable due today or overdue)
  // 4. Search query (matches borrower name or phone)
  const filteredBorrowers = roleScopedBorrowers.filter((b) => {
    // 1. Line filter ('All Lines' shows all; specific line requires trimmed case-insensitive match)
    if (selectedLine && selectedLine !== 'All Lines') {
      const bLine = b.collectionLine ? b.collectionLine.trim().toLowerCase() : '';
      const sLine = selectedLine.trim().toLowerCase();
      if (!bLine || bLine !== sLine) {
        return false;
      }
    }

    // 2. Status & Work Queue filter
    if (borrowerFilter === 'Active') {
      if (b.status !== 'active') return false;
      const actionableDue = getCurrentActionableDue(b, payments, todayIso);
      if (!actionableDue.hasActionableDue) return false;
    } else {
      if (b.status !== 'closed') return false;
    }

    // 3. Search query (name, phone, or book no)
    const query = searchQuery.trim().toLowerCase();
    if (query !== '') {
      const nameStr = (b.borrowerName || b.name || '').toLowerCase();
      const phoneStr = (b.phoneNumber || b.phone || '');
      const bookNoStr = b.bookNo !== null && b.bookNo !== undefined ? String(b.bookNo) : '';
      const matchesSearch =
        nameStr.includes(query) ||
        phoneStr.includes(query) ||
        bookNoStr === query ||
        bookNoStr.includes(query);
      if (!matchesSearch) return false;
    }

    return true;
  });

  const handleSelectLine = (line: DashboardLineFilter) => {
    setSelectedLine(line);
    setDropdownOpen(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7fb] w-full relative">
      {/* Post-restore success toast */}
      {restoreSuccessToast && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-3 duration-200">
          <CheckCircle2 size={20} className="shrink-0 text-white" />
          <span className="text-xs sm:text-sm font-semibold">Backup restored successfully.</span>
        </div>
      )}

      {/* Top Header - Spans Full Width */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
          {/* Left: KN FINANCE */}
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1e293b]">
            KN FINANCE
          </h1>

          {/* Right: Line Filter Dropdown, Profile Icon */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            {/* Line dropdown trigger */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#1e293b] bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                title="Filter by Line"
              >
                <span>{selectedLine}</span>
                <ChevronDown size={14} className="text-[#64748b]" />
              </button>

              {/* Line Dropdown panel */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 max-h-64 overflow-y-auto bg-white rounded-xl shadow-[0_4px_25px_rgba(0,0,0,0.12)] border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  {lineFilterOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleSelectLine(option)}
                      className={`w-full text-left px-4 py-2 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-between ${
                        selectedLine === option
                          ? 'bg-[#eef2ff] text-[#4f46e5]'
                          : 'text-[#1e293b] hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{option}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Profile/User Icon */}
            <button
              type="button"
              onClick={() => navigateTo('profile')}
              aria-label="Open Profile"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-indigo-50 text-[#475569] hover:text-[#4f46e5] flex items-center justify-center transition-colors border border-slate-200/80"
            >
              <User size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - Responsive Container max-width 1200px - 1400px */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* TOP ROW — PRIMARY FINANCIAL CARDS (Manager & Agent, 3-column prominent desktop layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* CARD 1: Cash in Hand */}
          <div
            {...(currentRole === 'manager'
              ? {
                  onClick: () => setIsCashInHandModalOpen(true),
                  role: 'button',
                  tabIndex: 0,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setIsCashInHandModalOpen(true);
                    }
                  },
                }
              : {})}
            className={`bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-emerald-100/80 hover:border-emerald-300 hover:shadow-lg active:scale-[0.99] transition-all ${
              currentRole === 'manager' ? 'cursor-pointer' : ''
            } group flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs sm:text-sm font-bold tracking-wide uppercase text-emerald-700/80 group-hover:text-emerald-700 transition-colors">
                  Cash in Hand
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentRole === 'manager' ? 'Available Company Cash' : 'Assigned Borrowers Cash'}
                </p>
              </div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
                <Wallet size={22} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#1e293b] tracking-tight">
              ₹{displayCashInHand.toLocaleString('en-IN')}
            </div>
          </div>

          {/* CARD 2: Out Flow */}
          <div
            {...(currentRole === 'manager'
              ? {
                  onClick: () => setIsOutFlowModalOpen(true),
                  role: 'button',
                  tabIndex: 0,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setIsOutFlowModalOpen(true);
                    }
                  },
                }
              : {})}
            className={`bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-rose-100/80 hover:border-rose-300 hover:shadow-lg active:scale-[0.99] transition-all ${
              currentRole === 'manager' ? 'cursor-pointer' : ''
            } group flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs sm:text-sm font-bold tracking-wide uppercase text-rose-700/80 group-hover:text-rose-700 transition-colors">
                  Out Flow
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentRole === 'manager' ? 'Total Loans & Reductions' : 'Assigned Loans & Reductions'}
                </p>
              </div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-all shadow-sm">
                <TrendingDown size={22} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#1e293b] tracking-tight">
              ₹{displayOutFlow.toLocaleString('en-IN')}
            </div>
          </div>

          {/* CARD 3: Agent Commission */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-indigo-100/80 hover:border-indigo-300 hover:shadow-lg transition-all flex flex-col justify-between group">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs sm:text-sm font-bold tracking-wide uppercase text-[#4f46e5] group-hover:text-[#4338ca] transition-colors">
                  Agent Commission
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {currentRole === 'manager' ? 'Total Company Agent Commissions' : 'My Total Commission'}
                </p>
              </div>
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-indigo-50 text-[#4f46e5] flex items-center justify-center shrink-0 group-hover:bg-[#4f46e5] group-hover:text-white transition-all shadow-sm">
                <BadgePercent size={22} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#1e293b] tracking-tight">
              ₹{agentCommissionTotal.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* SECOND ROW — OPERATIONAL SUMMARY CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {/* CARD 1: Active Borrowers (Clickable to open Active Borrowers Modal) */}
          <div
            onClick={() => setIsActiveBorrowersModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setIsActiveBorrowersModalOpen(true);
              }
            }}
            className="bg-white rounded-2xl p-4 sm:p-5 lg:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between cursor-pointer hover:border-[#c7d2fe] hover:shadow-md active:scale-[0.99] transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-semibold text-[#64748b] group-hover:text-[#4f46e5] transition-colors">
                Active Borrowers
              </span>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f3f0ff] flex items-center justify-center text-[#4f46e5] shrink-0 group-hover:bg-[#4f46e5] group-hover:text-white transition-colors">
                <Users size={18} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1e293b]">
              {activeCount}
            </div>
          </div>

          {/* CARD 2: Total Loaned (Clickable to open Financial Analytics Modal) */}
          <div
            onClick={() => setIsFinancialAnalyticsModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setIsFinancialAnalyticsModalOpen(true);
              }
            }}
            className="bg-white rounded-2xl p-4 sm:p-5 lg:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between cursor-pointer hover:border-[#c7d2fe] hover:shadow-md active:scale-[0.99] transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-semibold text-[#64748b] group-hover:text-[#4f46e5] transition-colors">
                Total Loaned
              </span>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f3f0ff] flex items-center justify-center text-[#4f46e5] shrink-0 group-hover:bg-[#4f46e5] group-hover:text-white transition-colors">
                <IndianRupee size={18} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1e293b]">
              ₹{totalLoaned.toLocaleString('en-IN')}
            </div>
          </div>

          {/* CARD 3: Collected Today (Clickable to open Collections Modal) */}
          <div
            onClick={() => setIsCollectionsModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setIsCollectionsModalOpen(true);
              }
            }}
            className="bg-white rounded-2xl p-4 sm:p-5 lg:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between cursor-pointer hover:border-[#c7d2fe] hover:shadow-md active:scale-[0.99] transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-semibold text-[#64748b] group-hover:text-[#4f46e5] transition-colors">
                Collected Today
              </span>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f3f0ff] flex items-center justify-center text-[#4f46e5] shrink-0 group-hover:bg-[#4f46e5] group-hover:text-white transition-colors">
                <ArrowDownLeft size={18} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1e293b]">
              ₹{collectedToday.toLocaleString('en-IN')}
            </div>
          </div>

          {/* CARD 4: Due Today (Clickable to open Due Today Modal) */}
          <div
            onClick={() => setIsDueTodayModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setIsDueTodayModalOpen(true);
              }
            }}
            className="bg-white rounded-2xl p-4 sm:p-5 lg:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between cursor-pointer hover:border-[#c7d2fe] hover:shadow-md active:scale-[0.99] transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-semibold text-[#64748b] group-hover:text-[#4f46e5] transition-colors">
                Due Today
              </span>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#f3f0ff] flex items-center justify-center text-[#4f46e5] shrink-0 group-hover:bg-[#4f46e5] group-hover:text-white transition-colors">
                <CalendarClock size={18} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1e293b]">
              {dueTodayCount}
            </div>
          </div>
        </div>

        {/* Dashboard Control Card - Full-width desktop responsive bar */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Search field */}
          <div className="relative w-full md:max-w-md">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or Book No..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/60 text-xs sm:text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:bg-white transition-all"
            />
          </div>

          {/* Controls: Active, Closed tabs and + Add Borrower */}
          <div className="flex items-center justify-between sm:justify-end gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setBorrowerFilter('Active')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  borrowerFilter === 'Active'
                    ? 'bg-[#4f46e5] text-white shadow-sm'
                    : 'text-[#64748b] hover:text-[#1e293b]'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setBorrowerFilter('Closed')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  borrowerFilter === 'Closed'
                    ? 'bg-[#4f46e5] text-white shadow-sm'
                    : 'text-[#64748b] hover:text-[#1e293b]'
                }`}
              >
                Closed
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="h-10 px-4 rounded-xl bg-[#4f46e5] text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
            >
              + Add Borrower
            </button>
          </div>
        </div>

        {/* Borrower Content Panel - Compact Professional Read-Only Work Queue Table */}
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] sm:text-xs font-bold text-[#475569] tracking-wider uppercase">
                  <th className="py-3.5 px-4 sm:px-6">BOOK NO</th>
                  <th className="py-3.5 px-4 sm:px-6">BORROWER</th>
                  <th className="py-3.5 px-4 sm:px-6">PHONE</th>
                  <th className="py-3.5 px-4 sm:px-6">LINE</th>
                  <th className="py-3.5 px-4 sm:px-6">TYPE</th>
                  <th className="py-3.5 px-4 sm:px-6">AGENT</th>
                  <th className="py-3.5 px-4 sm:px-6">DUE DATE</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">PENDING</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {filteredBorrowers.length === 0 ? (
                  /* Empty State: Keep headers visible, show exact empty text */
                  <tr>
                    <td
                      colSpan={8}
                      className="py-12 px-4 text-center text-[#64748b] font-medium"
                    >
                      No borrowers found.
                    </td>
                  </tr>
                ) : (
                  filteredBorrowers.map((borrower) => {
                    const agentName = resolveAgentName(borrower, agents) || 'Unassigned';
                    const paid = getBorrowerPaidAmount(borrower.id);
                    const expReturn = borrower.expectedReturn || borrower.loanAmount || 0;
                    const pending = borrower.status === 'closed' ? 0 : Math.max(0, expReturn - paid);
                    const actionableDue = getCurrentActionableDue(borrower, payments, todayIso);
                    const formattedDueDate = borrower.status === 'active' && actionableDue.dueDateIso
                      ? formatAppDate(actionableDue.dueDateIso, settings.dateFormat)
                      : '—';

                    return (
                      <tr
                        key={borrower.id}
                        className="hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-3.5 px-4 sm:px-6 text-[#1e293b] font-medium">
                          {borrower.bookNo !== null && borrower.bookNo !== undefined ? borrower.bookNo : '—'}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 font-semibold text-[#1e293b]">
                          {borrower.borrowerName || borrower.name}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-[#475569]">
                          {borrower.phoneNumber || borrower.phone || '—'}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-[#1e293b] font-medium">
                          {borrower.collectionLine || '—'}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6">
                          {borrower.collectionMethod ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                                borrower.collectionMethod === 'Banking'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              }`}
                            >
                              {borrower.collectionMethod}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-[#475569]">
                          <span className={agentName === 'Unassigned' ? 'text-slate-400 italic' : 'font-medium text-[#1e293b]'}>
                            {agentName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-[#1e293b] font-medium whitespace-nowrap">
                          {formattedDueDate}
                        </td>
                        <td className="py-3.5 px-4 sm:px-6 text-right">
                          <button
                            type="button"
                            onClick={() => setIsActiveBorrowersModalOpen(true)}
                            className="inline-flex items-center justify-end font-bold text-[#4f46e5] hover:text-[#4338ca] hover:underline focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/40 rounded px-1.5 py-0.5 -mr-1.5 transition-colors cursor-pointer"
                            title="Click to view all Active Borrowers"
                            aria-label={`Pending amount ₹${pending.toLocaleString('en-IN')}, click to view active borrowers`}
                          >
                            ₹{pending.toLocaleString('en-IN')}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add Borrower Modal */}
      <AddBorrowerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* Active Borrowers Modal */}
      <ActiveBorrowersModal
        isOpen={isActiveBorrowersModalOpen}
        onClose={() => setIsActiveBorrowersModalOpen(false)}
        onSelectBorrower={(borrowerId) => setSelectedBorrowerId(borrowerId)}
        selectedLine={selectedLine}
      />

      {/* Collections Modal */}
      <CollectionsModal
        isOpen={isCollectionsModalOpen}
        onClose={() => setIsCollectionsModalOpen(false)}
      />

      {/* Due Today Modal */}
      <DueTodayModal
        isOpen={isDueTodayModalOpen}
        onClose={() => setIsDueTodayModalOpen(false)}
      />

      {/* Financial Analytics Modal */}
      <FinancialAnalyticsModal
        isOpen={isFinancialAnalyticsModalOpen}
        onClose={() => setIsFinancialAnalyticsModalOpen(false)}
      />

      {/* Borrower Details & Collect Payment Modal */}
      <BorrowerDetailsModal
        isOpen={Boolean(selectedBorrowerId)}
        borrowerId={selectedBorrowerId}
        onClose={() => setSelectedBorrowerId(null)}
      />

      {/* Cash In Hand Modal (Manager only) */}
      {currentRole === 'manager' && (
        <>
          <CashInHandModal
            isOpen={isCashInHandModalOpen}
            onClose={() => setIsCashInHandModalOpen(false)}
          />
          <OutFlowModal
            isOpen={isOutFlowModalOpen}
            onClose={() => setIsOutFlowModalOpen(false)}
          />
        </>
      )}
    </div>
  );
};
