import React, { useState } from 'react';
import {
  X,
  ArrowUpRight,
  TrendingDown,
  Search,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAppDate } from '../utils/dateUtils';

interface OutFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OutFlowModal: React.FC<OutFlowModalProps> = ({ isOpen, onClose }) => {
  const { currentRole, cashLedger, companyCashSummary, getTotalOutFlow, settings } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LOAN_DISBURSED' | 'CASH_DECREASED'>('ALL');

  if (!isOpen) return null;

  const outFlowEntries = cashLedger.filter(
    (e) => e.transactionType === 'LOAN_DISBURSED' || e.transactionType === 'CASH_DECREASED'
  );

  const loanDisbursedEntries = outFlowEntries.filter((e) => e.transactionType === 'LOAN_DISBURSED');
  const manualDecreasedEntries = outFlowEntries.filter((e) => e.transactionType === 'CASH_DECREASED');
  const paymentEntries = cashLedger.filter((e) => e.transactionType === 'PAYMENT_COLLECTED');

  const rawDisbursed = loanDisbursedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const rawCollected = paymentEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const rawDecreased = manualDecreasedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Authoritative aggregate values (from RPC companyCashSummary when online, fallback to raw sums)
  const totalDisbursed = companyCashSummary?.totalDisbursed ?? rawDisbursed;
  const totalCollected = companyCashSummary?.totalCollected ?? rawCollected;
  const netLoanOutflow = Math.max(0, totalDisbursed - totalCollected);
  const totalDecreased = companyCashSummary?.totalDecreased ?? rawDecreased;
  const totalOutFlow = companyCashSummary?.totalOutFlow ?? getTotalOutFlow();

  // AGENT VIEW — Aggregate Breakdown Only (Strict Security: No raw ledger transactions)
  if (currentRole === 'agent') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <TrendingDown size={20} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">Out Flow Breakdown</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Authoritative company outgoing cash analysis &amp; net loan outflow
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Hero Banner */}
          <div className="px-6 py-5 bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900 text-white shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
                  Total Net Outflow
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold text-white mt-1 tracking-tight">
                  ₹{totalOutFlow.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-rose-300 text-xs font-semibold">
                <ShieldCheck size={16} />
                <span>Verified Outflow Balance</span>
              </div>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border-b border-slate-100 shrink-0">
            <div className="p-4 rounded-2xl bg-white border border-rose-200/80 shadow-sm">
              <div className="text-xs font-bold text-slate-600 mb-1">
                Outstanding Loan Outflow
              </div>
              <div className="text-xl font-extrabold text-rose-700">
                ₹{netLoanOutflow.toLocaleString('en-IN')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                ₹{totalDisbursed.toLocaleString('en-IN')} issued • ₹{totalCollected.toLocaleString('en-IN')} repaid
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-amber-200/80 shadow-sm">
              <div className="text-xs font-bold text-slate-600 mb-1">
                Expenses / Cash Decreased
              </div>
              <div className="text-xl font-extrabold text-amber-700">
                ₹{totalDecreased.toLocaleString('en-IN')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Company withdrawals &amp; expenses
              </p>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Calculation Steps Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Out Flow Calculation Steps
              </h3>

              <div className="space-y-2.5">
                {/* Step 1: Disbursed */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Total Loans Disbursed</p>
                      <p className="text-[11px] text-slate-400">Total principal disbursed to borrowers</p>
                    </div>
                  </div>
                  <span className="text-sm font-extrabold text-rose-600">
                    ₹{totalDisbursed.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Step 2: Collected */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={16} className="rotate-180" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Less: Repayments Collected</p>
                      <p className="text-[11px] text-slate-400">Recovered principal from borrowers</p>
                    </div>
                  </div>
                  <span className="text-sm font-extrabold text-blue-600">
                    -₹{totalCollected.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Step 3: Net Loan Outflow */}
                <div className="p-3.5 rounded-2xl bg-rose-50/50 border border-rose-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-rose-900">Net Outstanding Loan Outflow</p>
                    <p className="text-[11px] text-rose-700/70">max(0, Disbursed - Repaid)</p>
                  </div>
                  <span className="text-sm font-extrabold text-rose-700">
                    = ₹{netLoanOutflow.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Step 4: Decreases */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Plus: Cash Decreased / Expenses</p>
                      <p className="text-[11px] text-slate-400">Operational withdrawals &amp; expenses</p>
                    </div>
                  </div>
                  <span className="text-sm font-extrabold text-amber-600">
                    +₹{totalDecreased.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Step 5: Total Net Outflow */}
                <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-xs font-bold text-white">Authoritative Net Out Flow</p>
                    <p className="text-[11px] text-slate-300">Net Loans Outflow + Expenses</p>
                  </div>
                  <span className="text-base font-extrabold text-rose-300">
                    ₹{totalOutFlow.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Formula & Policy Breakdown Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-50/70 border border-rose-100/80 space-y-3">
              <div className="flex items-center gap-2 text-rose-950 font-bold text-xs sm:text-sm">
                <Info size={16} className="text-rose-600 shrink-0" />
                <span>Authoritative Out Flow Formula</span>
              </div>
              <div className="p-3 bg-white/80 backdrop-blur rounded-xl border border-rose-100 font-mono text-xs text-rose-950 font-semibold space-y-1">
                <div>
                  <span className="text-slate-500">Out Flow = </span>
                  <span className="text-rose-700">max(0, Disbursed - Repaid)</span>
                  <span className="text-slate-500"> + </span>
                  <span className="text-amber-700">Cash Decreased</span>
                </div>
              </div>
              <p className="text-[11px] sm:text-xs text-rose-900/80">
                Borrower repayments continuously reduce the company's active Out Flow as principal is recovered.
              </p>
            </div>

            {/* Scope Information Banner */}
            <div className="flex items-center gap-2.5 p-3.5 bg-slate-100/70 rounded-2xl border border-slate-200/60 text-slate-500 text-xs">
              <ShieldCheck size={16} className="text-slate-400 shrink-0" />
              <span>
                Detailed transaction entries and audit lists are restricted to Manager view.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredEntries = outFlowEntries.filter((entry) => {
    if (filterType !== 'ALL' && entry.transactionType !== filterType) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    const noteMatch = (entry.note || '').toLowerCase().includes(query);
    const borrowerMatch = (entry.borrowerName || '').toLowerCase().includes(query);
    return noteMatch || borrowerMatch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <TrendingDown size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Out Flow Breakdown</h2>
              <p className="text-xs text-slate-500 font-medium">
                Complete outgoing company cash analysis & disbursements
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Total Out Flow Hero Banner */}
        <div className="px-6 py-4 bg-gradient-to-br from-rose-900 via-rose-800 to-slate-900 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-200">
                Total Net Outflow
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold text-white mt-0.5 tracking-tight">
                ₹{totalOutFlow.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-rose-200">Total Outflow Events</span>
              <div className="text-xl font-bold text-white mt-0.5">
                {outFlowEntries.length} Transactions
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border-b border-slate-100 shrink-0">
          <div
            onClick={() => setFilterType(filterType === 'LOAN_DISBURSED' ? 'ALL' : 'LOAN_DISBURSED')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterType === 'LOAN_DISBURSED'
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
              <span>Outstanding Loans</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">
                {loanDisbursedEntries.length}
              </span>
            </div>
            <div className="text-base sm:text-lg font-extrabold text-rose-700">
              ₹{netLoanOutflow.toLocaleString('en-IN')}
            </div>
            {totalCollected > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                ₹{totalDisbursed.toLocaleString('en-IN')} issued • ₹{totalCollected.toLocaleString('en-IN')} repaid
              </p>
            )}
          </div>

          <div
            onClick={() => setFilterType(filterType === 'CASH_DECREASED' ? 'ALL' : 'CASH_DECREASED')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterType === 'CASH_DECREASED'
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
              <span>Expenses</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">
                {manualDecreasedEntries.length}
              </span>
            </div>
            <div className="text-base sm:text-lg font-extrabold text-amber-700">
              ₹{totalDecreased.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by borrower or note..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({outFlowEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('LOAN_DISBURSED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'LOAN_DISBURSED'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Loans ({loanDisbursedEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('CASH_DECREASED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'CASH_DECREASED'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Expenses ({manualDecreasedEntries.length})
            </button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
          {filteredEntries.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <TrendingDown size={40} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No outflow transactions found.</p>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const formattedDate = formatAppDate(
                entry.createdAt.substring(0, 10),
                settings.dateFormat
              );
              const timePart = new Date(entry.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const isLoan = entry.transactionType === 'LOAN_DISBURSED';

              return (
                <div
                  key={entry.id}
                  className="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] hover:border-slate-200 transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isLoan
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      <ArrowUpRight size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {entry.borrowerName || entry.note || 'Outflow Transaction'}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            isLoan
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isLoan ? 'Loan Disbursed' : 'Expense / Decrease'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formattedDate} at {timePart}
                        {entry.performedByName ? ` • By ${entry.performedByName}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm sm:text-base font-extrabold ${
                        isLoan ? 'text-rose-600' : 'text-amber-600'
                      }`}
                    >
                      -₹{(entry.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
