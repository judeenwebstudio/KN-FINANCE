import React, { useState } from 'react';
import {
  X,
  Wallet,
  PlusCircle,
  MinusCircle,
  History,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAppDate } from '../utils/dateUtils';
import type { CashTransactionType } from '../types';

interface CashInHandModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CashInHandModal: React.FC<CashInHandModalProps> = ({ isOpen, onClose }) => {
  const {
    currentRole,
    cashLedger,
    companyCashSummary,
    getCashInHand,
    addManualCash,
    decreaseManualCash,
    settings,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'history' | 'add' | 'decrease'>('history');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Form states
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const currentCashInHand = getCashInHand();

  // Aggregate numbers (authoritative from companyCashSummary when available, fallback to ledger)
  const totalAdded = companyCashSummary?.totalAdded ?? cashLedger.filter(e => e.transactionType === 'CASH_ADDED').reduce((s, e) => s + e.amount, 0);
  const totalCollected = companyCashSummary?.totalCollected ?? cashLedger.filter(e => e.transactionType === 'PAYMENT_COLLECTED').reduce((s, e) => s + e.amount, 0);
  const totalDeducted = companyCashSummary?.totalDeducted ?? cashLedger.filter(e => e.transactionType === 'DEDUCTED_AMOUNT').reduce((s, e) => s + e.amount, 0);
  const totalDisbursed = companyCashSummary?.totalDisbursed ?? cashLedger.filter(e => e.transactionType === 'LOAN_DISBURSED').reduce((s, e) => s + e.amount, 0);
  const totalDecreased = companyCashSummary?.totalDecreased ?? cashLedger.filter(e => e.transactionType === 'CASH_DECREASED').reduce((s, e) => s + e.amount, 0);

  // AGENT VIEW — Aggregate Breakdown Only (Strict Security: No raw ledger, no add/decrease forms)
  if (currentRole === 'agent') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet size={20} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">Cash in Hand</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Authoritative company cash balance &amp; aggregate breakdown
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

          {/* Available Cash Summary Banner */}
          <div className="px-6 py-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-emerald-950 text-white shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  Current Available Balance
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold text-white mt-1 tracking-tight">
                  ₹{currentCashInHand.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-emerald-300 text-xs font-semibold">
                <ShieldCheck size={16} />
                <span>Verified Company Balance</span>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Aggregate Breakdown Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Company Cash Accounting Breakdown
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Cash Added */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <ArrowDownRight size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">Total Cash Added</p>
                      <p className="text-[11px] text-slate-400">Capital deposits &amp; additions</p>
                    </div>
                  </div>
                  <span className="text-sm sm:text-base font-extrabold text-emerald-600 shrink-0">
                    +₹{totalAdded.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* 2. Repayments Collected */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <ArrowDownRight size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">Repayments Collected</p>
                      <p className="text-[11px] text-slate-400">Borrower payment inflows</p>
                    </div>
                  </div>
                  <span className="text-sm sm:text-base font-extrabold text-blue-600 shrink-0">
                    +₹{totalCollected.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* 3. Deducted Amount */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                      <ArrowDownRight size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">Total Deducted Amount</p>
                      <p className="text-[11px] text-slate-400">Upfront retained company cash</p>
                    </div>
                  </div>
                  <span className="text-sm sm:text-base font-extrabold text-teal-600 shrink-0">
                    +₹{totalDeducted.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* 4. Loan Disbursed */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">Total Loans Disbursed</p>
                      <p className="text-[11px] text-slate-400">Total principal issued</p>
                    </div>
                  </div>
                  <span className="text-sm sm:text-base font-extrabold text-rose-600 shrink-0">
                    -₹{totalDisbursed.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* 5. Cash Decreased */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between sm:col-span-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">Total Cash Decreased</p>
                      <p className="text-[11px] text-slate-400">Expenses, withdrawals &amp; reductions</p>
                    </div>
                  </div>
                  <span className="text-sm sm:text-base font-extrabold text-amber-600 shrink-0">
                    -₹{totalDecreased.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Formula & Policy Breakdown Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/70 border border-indigo-100/80 space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs sm:text-sm">
                <Info size={16} className="text-indigo-600 shrink-0" />
                <span>Authoritative Cash in Hand Formula</span>
              </div>
              <div className="p-3 bg-white/80 backdrop-blur rounded-xl border border-indigo-100 font-mono text-xs text-indigo-950 font-semibold space-y-1">
                <div>
                  <span className="text-slate-500">Cash in Hand = </span>
                  <span className="text-emerald-700">Cash Added</span>
                  <span className="text-slate-500"> + </span>
                  <span className="text-blue-700">Collections</span>
                  <span className="text-slate-500"> + </span>
                  <span className="text-teal-700">Deductions</span>
                  <span className="text-slate-500"> - </span>
                  <span className="text-rose-700">Disbursements</span>
                  <span className="text-slate-500"> - </span>
                  <span className="text-amber-700">Decreases</span>
                </div>
              </div>
              <ul className="text-[11px] sm:text-xs text-indigo-900/80 space-y-1.5 list-disc list-inside">
                <li>
                  <strong className="text-indigo-950">Deducted Amount</strong> is retained company cash at disbursement and increases Cash in Hand.
                </li>
                <li>
                  <strong className="text-indigo-950">Agent Commission</strong> is independent agent compensation and has ₹0 effect on company Cash in Hand.
                </li>
              </ul>
            </div>

            {/* Scope Information Banner */}
            <div className="flex items-center gap-2.5 p-3.5 bg-slate-100/70 rounded-2xl border border-slate-200/60 text-slate-500 text-xs">
              <ShieldCheck size={16} className="text-slate-400 shrink-0" />
              <span>
                Detailed ledger transaction history and manual cash adjustments are restricted to Manager view.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const val = parseFloat(amountInput.replace(/,/g, ''));
    if (isNaN(val) || val <= 0) {
      setErrorMsg('Please enter a valid amount greater than ₹0.');
      return;
    }

    const note = noteInput.trim() || 'Manual cash addition';
    addManualCash(val, note);

    setAmountInput('');
    setNoteInput('');
    setSuccessMsg(`Successfully added ₹${val.toLocaleString('en-IN')} to Cash in Hand.`);
    setTimeout(() => {
      setSuccessMsg('');
      setActiveTab('history');
    }, 1200);
  };

  const handleDecreaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const val = parseFloat(amountInput.replace(/,/g, ''));
    if (isNaN(val) || val <= 0) {
      setErrorMsg('Please enter a valid amount greater than ₹0.');
      return;
    }

    if (val > currentCashInHand) {
      setErrorMsg(
        `Cannot decrease ₹${val.toLocaleString('en-IN')}. Available Cash in Hand is ₹${currentCashInHand.toLocaleString('en-IN')}.`
      );
      return;
    }

    const note = noteInput.trim() || 'Manual cash decrease / expense';
    decreaseManualCash(val, note);

    setAmountInput('');
    setNoteInput('');
    setSuccessMsg(`Successfully decreased ₹${val.toLocaleString('en-IN')} from Cash in Hand.`);
    setTimeout(() => {
      setSuccessMsg('');
      setActiveTab('history');
    }, 1200);
  };

  const filteredHistory = cashLedger
    .filter((entry) => entry.transactionType !== 'AGENT_COMMISSION')
    .filter((entry) => {
      if (filterType === 'ALL') return true;
      return entry.transactionType === filterType;
    });

  const getBadgeForType = (type: CashTransactionType) => {
    switch (type) {
      case 'CASH_ADDED':
        return {
          label: 'Cash Added',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          sign: '+',
          amountColor: 'text-emerald-600',
          icon: <ArrowDownRight size={14} className="text-emerald-600 shrink-0" />,
        };
      case 'PAYMENT_COLLECTED':
        return {
          label: 'Collection Inflow',
          color: 'bg-blue-50 text-blue-700 border-blue-200',
          sign: '+',
          amountColor: 'text-blue-600',
          icon: <ArrowDownRight size={14} className="text-blue-600 shrink-0" />,
        };
      case 'DEDUCTED_AMOUNT':
        return {
          label: 'Deduction Retained',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          sign: '+',
          amountColor: 'text-emerald-600',
          icon: <ArrowDownRight size={14} className="text-emerald-600 shrink-0" />,
        };
      case 'LOAN_DISBURSED':
        return {
          label: 'Loan Disbursed',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
          sign: '-',
          amountColor: 'text-rose-600',
          icon: <ArrowUpRight size={14} className="text-rose-600 shrink-0" />,
        };
      case 'CASH_DECREASED':
        return {
          label: 'Cash Decreased',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          sign: '-',
          amountColor: 'text-amber-600',
          icon: <ArrowUpRight size={14} className="text-amber-600 shrink-0" />,
        };
      default:
        return {
          label: type,
          color: 'bg-slate-50 text-slate-700 border-slate-200',
          sign: '',
          amountColor: 'text-slate-800',
          icon: null,
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Wallet size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">Cash in Hand</h2>
              <p className="text-xs text-slate-500 font-medium">
                Audited company cash ledger & reserve management
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

        {/* Available Cash Summary Banner */}
        <div className="px-6 py-4 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                Current Available Balance
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold text-white mt-0.5 tracking-tight flex items-center">
                <span>₹{currentCashInHand.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('add');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'add'
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : 'bg-white/10 hover:bg-white/20 text-emerald-300 border border-emerald-400/30'
                }`}
              >
                <PlusCircle size={15} />
                <span>+ Add Cash</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('decrease');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'decrease'
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                    : 'bg-white/10 hover:bg-white/20 text-rose-300 border border-rose-400/30'
                }`}
              >
                <MinusCircle size={15} />
                <span>- Decrease</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/60 px-6 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History size={16} />
            <span>Transaction Ledger ({cashLedger.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('add');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'add'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PlusCircle size={16} />
            <span>+ Add Cash</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('decrease');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`py-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'decrease'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MinusCircle size={16} />
            <span>- Decrease Cash</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* Type Filter Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { key: 'ALL', label: 'All' },
                  { key: 'CASH_ADDED', label: 'Cash Added' },
                  { key: 'PAYMENT_COLLECTED', label: 'Collections' },
                  { key: 'DEDUCTED_AMOUNT', label: 'Deductions' },
                  { key: 'LOAN_DISBURSED', label: 'Disbursements' },
                  { key: 'CASH_DECREASED', label: 'Decreased' },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilterType(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filterType === f.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Transactions List */}
              {filteredHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Wallet size={40} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No cash ledger transactions found.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Use "+ Add Cash" above to record your starting balance.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredHistory.map((entry) => {
                    const badge = getBadgeForType(entry.transactionType);
                    const formattedDate = formatAppDate(
                      entry.createdAt.substring(0, 10),
                      settings.dateFormat
                    );
                    const timePart = new Date(entry.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={entry.id}
                        className="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] hover:border-slate-200 transition-all flex items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5">{badge.icon}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}
                              >
                                {badge.label}
                              </span>
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {entry.note || badge.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                              <span>
                                {formattedDate} at {timePart}
                              </span>
                              {entry.performedByName && (
                                <>
                                  <span>•</span>
                                  <span>By {entry.performedByName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`text-sm sm:text-base font-extrabold ${badge.amountColor}`}
                          >
                            {badge.sign}₹{entry.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADD CASH FORM */}
          {activeTab === 'add' && (
            <form onSubmit={handleAddSubmit} className="space-y-4 max-w-lg mx-auto">
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 text-emerald-900 text-xs font-medium">
                Adding cash increases your company's available Cash in Hand. Use this for starting
                cash reserves or fresh capital additions.
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount to Add (₹) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold">
                    ₹
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="e.g. 400000"
                    required
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold text-base focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Preset Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400">Presets:</span>
                {[10000, 50000, 100000, 400000, 500000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountInput(preset.toString())}
                    className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                  >
                    +₹{preset.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason / Note (Optional)
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="e.g. Starting cash balance, Capital deposit"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
              >
                <PlusCircle size={18} />
                <span>Add Cash to Hand</span>
              </button>
            </form>
          )}

          {/* TAB 3: DECREASE CASH FORM */}
          {activeTab === 'decrease' && (
            <form onSubmit={handleDecreaseSubmit} className="space-y-4 max-w-lg mx-auto">
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-amber-900 text-xs font-medium">
                Decreasing cash records an outflow expense or withdrawal and reduces available Cash
                in Hand.
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount to Decrease (₹) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold">
                    ₹
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={currentCashInHand}
                    step="any"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="e.g. 5000"
                    required
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold text-base focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none transition-all"
                  />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Maximum available to decrease: ₹{currentCashInHand.toLocaleString('en-IN')}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason / Purpose *
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="e.g. Office rent, Bank deposit, Owner withdrawal"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-2"
              >
                <MinusCircle size={18} />
                <span>Decrease Cash</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
