import React, { useState } from 'react';
import {
  X,
  ArrowUpRight,
  TrendingDown,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAppDate } from '../utils/dateUtils';

interface OutFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OutFlowModal: React.FC<OutFlowModalProps> = ({ isOpen, onClose }) => {
  const { cashLedger, getTotalOutFlow, settings } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LOAN_DISBURSED' | 'CASH_DECREASED' | 'AGENT_COMMISSION'>('ALL');

  if (!isOpen) return null;

  const totalOutFlow = getTotalOutFlow();

  const outFlowEntries = cashLedger.filter(
    (e) => e.transactionType === 'LOAN_DISBURSED' || e.transactionType === 'CASH_DECREASED' || e.transactionType === 'AGENT_COMMISSION'
  );

  const loanDisbursedEntries = outFlowEntries.filter((e) => e.transactionType === 'LOAN_DISBURSED');
  const manualDecreasedEntries = outFlowEntries.filter((e) => e.transactionType === 'CASH_DECREASED');
  const commissionEntries = outFlowEntries.filter((e) => e.transactionType === 'AGENT_COMMISSION');

  const totalLoanDisbursed = loanDisbursedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalManualDecreased = manualDecreasedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalCommission = commissionEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

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
                Total Outgoing Cash
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border-b border-slate-100 shrink-0">
          <div
            onClick={() => setFilterType(filterType === 'LOAN_DISBURSED' ? 'ALL' : 'LOAN_DISBURSED')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterType === 'LOAN_DISBURSED'
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
              <span>Loan Disbursed</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">
                {loanDisbursedEntries.length}
              </span>
            </div>
            <div className="text-base sm:text-lg font-extrabold text-rose-700">
              ₹{totalLoanDisbursed.toLocaleString('en-IN')}
            </div>
          </div>

          <div
            onClick={() => setFilterType(filterType === 'AGENT_COMMISSION' ? 'ALL' : 'AGENT_COMMISSION')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              filterType === 'AGENT_COMMISSION'
                ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-400/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
              <span>Agent Commission</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                {commissionEntries.length}
              </span>
            </div>
            <div className="text-base sm:text-lg font-extrabold text-indigo-700">
              ₹{totalCommission.toLocaleString('en-IN')}
            </div>
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
              ₹{totalManualDecreased.toLocaleString('en-IN')}
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
              onClick={() => setFilterType('AGENT_COMMISSION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'AGENT_COMMISSION'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Commissions ({commissionEntries.length})
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
              const isCommission = entry.transactionType === 'AGENT_COMMISSION';

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
                          : isCommission
                          ? 'bg-indigo-50 text-indigo-600'
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
                              : isCommission
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isLoan ? 'Loan Disbursed' : isCommission ? 'Agent Commission' : 'Expense / Decrease'}
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
                        isLoan ? 'text-rose-600' : isCommission ? 'text-indigo-600' : 'text-amber-600'
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
