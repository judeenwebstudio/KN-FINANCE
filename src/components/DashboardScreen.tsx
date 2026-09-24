import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Timeframe } from '../types';
import { AddBorrowerModal } from './AddBorrowerModal';
import { ActiveBorrowersModal } from './ActiveBorrowersModal';
import { CollectionsModal } from './CollectionsModal';
import { DueTodayModal } from './DueTodayModal';
import { FinancialAnalyticsModal } from './FinancialAnalyticsModal';
import { BorrowerDetailsModal } from './BorrowerDetailsModal';
import { CashInHandModal } from './CashInHandModal';
import { OutFlowModal } from './OutFlowModal';
import { resolveAgentName } from '../utils/agentUtils';

export const DashboardScreen: React.FC = () => {
  const {
    currentUser,
    currentRole,
    borrowers,
    agents,
    timeframe,
    setTimeframe,
    borrowerFilter,
    setBorrowerFilter,
    searchQuery,
    setSearchQuery,
    navigateTo,
    getTodayCollectedAmount,
    getTodayDueCount,
    getCashInHand,
    getTotalOutFlow,
  } = useApp();

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

  // Filter borrowers by the selected timeframe (Daily, Weekly, Monthly)
  const timeframeBorrowers = roleScopedBorrowers.filter((b) => (b.financeType || 'Daily') === timeframe);

  // Metrics calculated strictly from borrowers in the selected timeframe
  const activeCount = timeframeBorrowers.filter((b) => b.status === 'active').length;
  const totalLoaned = timeframeBorrowers
    .filter((b) => b.status === 'active')
    .reduce((acc, curr) => acc + (curr.loanAmount || curr.amount || 0), 0);
  const collectedToday = getTodayCollectedAmount(timeframe);
  const dueTodayCount = getTodayDueCount(timeframe);
  const cashInHand = getCashInHand();
  const outFlow = getTotalOutFlow();

  // Filter borrowers based on Active/Closed tab and Search query
  const filteredBorrowers = timeframeBorrowers.filter((b) => {
    const matchesFilter =
      borrowerFilter === 'Active' ? b.status === 'active' : b.status === 'closed';
    const query = searchQuery.trim().toLowerCase();
    const nameStr = (b.borrowerName || b.name || '').toLowerCase();
    const phoneStr = (b.phoneNumber || b.phone || '');
    const matchesSearch = query === '' || nameStr.includes(query) || phoneStr.includes(query);
    return matchesFilter && matchesSearch;
  });

  const handleSelectTimeframe = (tf: Timeframe) => {
    setTimeframe(tf);
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

          {/* Right: Daily Dropdown, Profile Icon */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            {/* Daily dropdown trigger */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#1e293b] bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
              >
                <span>{timeframe}</span>
                <ChevronDown size={14} className="text-[#64748b]" />
              </button>

              {/* Dropdown panel matching Screenshot 5 */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-white rounded-xl shadow-[0_4px_25px_rgba(0,0,0,0.12)] border border-slate-100 py-1.5 z-50 overflow-hidden">
                  {(['Daily', 'Weekly', 'Monthly'] as Timeframe[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleSelectTimeframe(option)}
                      className={`w-full text-left px-4 py-2 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-between ${
                        timeframe === option
                          ? 'bg-[#eef2ff] text-[#4f46e5]'
                          : 'text-[#1e293b] hover:bg-slate-50'
                      }`}
                    >
                      {option}
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
        {/* TOP ROW — PRIMARY FINANCIAL CARDS (Manager Only, 2-column prominent desktop layout) */}
        {currentRole === 'manager' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {/* CARD 1: Cash in Hand (Clickable to open Cash in Hand Modal) */}
            <div
              onClick={() => setIsCashInHandModalOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsCashInHandModalOpen(true);
                }
              }}
              className="bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-emerald-100/80 hover:border-emerald-300 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-xs sm:text-sm font-bold tracking-wide uppercase text-emerald-700/80 group-hover:text-emerald-700 transition-colors">
                    Cash in Hand
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Available Company Cash</p>
                </div>
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
                  <Wallet size={22} />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#1e293b] tracking-tight">
                ₹{cashInHand.toLocaleString('en-IN')}
              </div>
            </div>

            {/* CARD 2: Out Flow (Clickable to open Out Flow Breakdown Modal) */}
            <div
              onClick={() => setIsOutFlowModalOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsOutFlowModalOpen(true);
                }
              }}
              className="bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-rose-100/80 hover:border-rose-300 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-xs sm:text-sm font-bold tracking-wide uppercase text-rose-700/80 group-hover:text-rose-700 transition-colors">
                    Out Flow
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Total Loans &amp; Reductions</p>
                </div>
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-all shadow-sm">
                  <TrendingDown size={22} />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#1e293b] tracking-tight">
                ₹{outFlow.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        )}

        {/* SECOND ROW — OPERATIONAL CARDS (4-column layout on desktop, 2x2 on mobile/tablet) */}
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
              placeholder="Search by name or phone..."
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

            {currentRole === 'manager' && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="h-10 px-4 rounded-xl bg-[#4f46e5] text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
              >
                + Add Borrower
              </button>
            )}
          </div>
        </div>

        {/* Borrower Content Panel - Spans available width */}
        <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 min-h-[300px] flex flex-col justify-center">
          {filteredBorrowers.length === 0 ? (
            /* Empty State: EXACTLY text-only, NO illustration/icon */
            <div className="text-center py-12 sm:py-16 px-4">
              <h3 className="text-base sm:text-lg font-bold text-[#1e293b] mb-2">
                No Borrowers Found
              </h3>
              <p className="text-xs sm:text-sm text-[#64748b] max-w-sm mx-auto leading-relaxed">
                There are no active borrowers. Try a different category or add a new borrower.
              </p>
            </div>
          ) : (
            /* Populated State */
            <div className="divide-y divide-slate-100">
              {filteredBorrowers.map((borrower) => (
                <div
                  key={borrower.id}
                  onClick={() => setSelectedBorrowerId(borrower.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedBorrowerId(borrower.id);
                    }
                  }}
                  className="py-4 flex items-center justify-between first:pt-0 last:pb-0 hover:bg-slate-50/80 px-3 rounded-xl transition-all cursor-pointer group"
                >
                  <div className="space-y-1">
                    <h4 className="text-sm sm:text-base font-semibold text-[#1e293b] group-hover:text-[#4f46e5] transition-colors">
                      {borrower.borrowerName || borrower.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                      <span>{borrower.phoneNumber || borrower.phone}</span>
                      {(() => {
                        const agentName = resolveAgentName(borrower, agents);
                        return agentName ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-[#475569] text-[10px] font-semibold">
                            Agent: {agentName}
                          </span>
                        ) : null;
                      })()}
                      {borrower.repaymentDuration && (
                        <span>• {borrower.repaymentDuration}</span>
                      )}
                      {borrower.endDate && (
                        <span>• End: {borrower.endDate}</span>
                      )}
                      {borrower.parcelTokenMode && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-[#4f46e5] text-[10px] font-semibold">
                          Parcel Token
                        </span>
                      )}
                      {borrower.isExistingLoan && (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">
                          Existing Loan
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm sm:text-base font-bold text-[#1e293b]">
                      ₹{(borrower.loanAmount || borrower.amount || 0).toLocaleString('en-IN')}
                    </p>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mt-0.5 ${
                        borrower.status === 'active'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {borrower.status === 'active' ? 'Active' : 'Closed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
