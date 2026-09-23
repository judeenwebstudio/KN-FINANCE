import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getBorrowerLoanSummary,
  getTodayIsoDate,
  formatDisplayDate,
} from '../utils/loanCalculations';
import { resolveCollectorName } from '../utils/agentUtils';

interface BorrowerDetailsModalProps {
  isOpen: boolean;
  borrowerId: string | null;
  onClose: () => void;
}

export const BorrowerDetailsModal: React.FC<BorrowerDetailsModalProps> = ({
  isOpen,
  borrowerId,
  onClose,
}) => {
  const { borrowers, payments, manager, agents, addPayment } = useApp();

  // Find fresh borrower record by ID so state is reactive to changes
  const borrower = useMemo(() => {
    if (!borrowerId) return null;
    return borrowers.find((b) => b.id === borrowerId) || null;
  }, [borrowers, borrowerId]);

  // Collect Payment Dialog Sub-Modal State
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayIsoDate());
  const [collectorSelection, setCollectorSelection] = useState('manager');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Active agents for collection dropdown
  const activeAgents = useMemo(() => agents.filter((a) => a.status === 'active'), [agents]);

  // Calculate live loan summary using shared loan calculations
  const loanSummary = useMemo(() => {
    if (!borrower) return null;
    return getBorrowerLoanSummary(borrower, payments, getTodayIsoDate());
  }, [borrower, payments]);

  // Payments for this borrower, newest transaction first
  const borrowerPayments = useMemo(() => {
    if (!borrower) return [];
    return payments
      .filter((p) => p.borrowerId === borrower.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt));
  }, [payments, borrower]);

  if (!isOpen || !borrower || !loanSummary) return null;

  // Resolve assigned agent display name
  const assignedAgentDisplay = (() => {
    if (borrower.agentId) {
      const found = agents.find((a) => a.id === borrower.agentId);
      if (found) {
        return found.status === 'inactive' ? `${found.fullName} (Inactive)` : found.fullName;
      }
    }
    if (borrower.assignedAgent && borrower.assignedAgent.trim()) {
      const found = agents.find(
        (a) => a.fullName.toLowerCase() === borrower.assignedAgent!.trim().toLowerCase()
      );
      if (found) {
        return found.status === 'inactive' ? `${found.fullName} (Inactive)` : found.fullName;
      }
      return borrower.assignedAgent.trim();
    }
    return 'Unassigned';
  })();

  const isClosed = borrower.status === 'closed' || loanSummary.totalPending <= 0;

  // Open Collect Payment Dialog
  const handleOpenCollectPayment = () => {
    if (loanSummary.totalPending <= 0) return;
    setPaymentAmount(
      loanSummary.todayDue > 0
        ? String(loanSummary.todayDue)
        : String(loanSummary.totalPending)
    );
    setPaymentDate(getTodayIsoDate());
    setCollectorSelection('manager');
    setPaymentNote('');
    setPaymentError(null);
    setIsSubmittingPayment(false);
    setIsCollectModalOpen(true);
  };

  // Submit Payment
  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPayment) return;

    const parsedAmount = parseFloat(paymentAmount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentError('Please enter a valid amount greater than ₹0');
      return;
    }

    if (parsedAmount > loanSummary.totalPending) {
      setPaymentError(
        `Amount cannot exceed pending balance of ₹${loanSummary.totalPending.toLocaleString('en-IN')}`
      );
      return;
    }

    setIsSubmittingPayment(true);

    let collectedByRole: 'manager' | 'agent' = 'manager';
    let collectedByUserId: string | null = null;
    let collectedBy = manager?.fullName?.trim() || 'Manager';

    if (collectorSelection.startsWith('agent:')) {
      const agentId = collectorSelection.replace('agent:', '');
      const agentObj = agents.find((a) => a.id === agentId);
      collectedByRole = 'agent';
      collectedByUserId = agentId;
      collectedBy = agentObj?.fullName || 'Agent';
    }

    addPayment({
      borrowerId: borrower.id,
      borrowerName: borrower.borrowerName || borrower.name,
      amount: parsedAmount,
      paymentDate: paymentDate,
      financeType: borrower.financeType || 'Daily',
      collectedByUserId,
      collectedByRole,
      collectedBy,
      note: paymentNote.trim() || undefined,
    });

    setIsSubmittingPayment(false);
    setIsCollectModalOpen(false);
  };

  return (
    <>
      {/* Primary Borrower Details Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
                  Borrower Details
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isClosed
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {isClosed ? 'Closed' : 'Active'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#1e293b] mt-0.5">
                {borrower.borrowerName || borrower.name}
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              {!isClosed ? (
                <button
                  type="button"
                  onClick={handleOpenCollectPayment}
                  className="px-4 py-2 rounded-xl bg-[#4f46e5] text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-[#4338ca] active:scale-[0.98] transition-all flex items-center gap-1.5"
                >
                  <Plus size={16} />
                  <span>Collect Payment</span>
                </button>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>Loan Settled</span>
                </span>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Modal Body - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* 1. Loan Status Summary Cards (6 Cards Grid) */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] mb-3">
                Loan Status Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Total Loan */}
                <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-[#64748b]">Total Loan</span>
                  <p className="text-base sm:text-lg font-bold text-[#1e293b] mt-1">
                    ₹{(borrower.loanAmount || borrower.amount || 0).toLocaleString('en-IN')}
                  </p>
                </div>

                {/* Expected Return */}
                <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-[#64748b]">Expected Return</span>
                  <p className="text-base sm:text-lg font-bold text-[#1e293b] mt-1">
                    ₹{loanSummary.expectedReturn.toLocaleString('en-IN')}
                  </p>
                </div>

                {/* Total Paid */}
                <div className="bg-emerald-50/50 rounded-xl p-3.5 border border-emerald-100/60 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-emerald-800">Total Paid</span>
                  <p className="text-base sm:text-lg font-bold text-emerald-600 mt-1">
                    ₹{loanSummary.totalPaid.toLocaleString('en-IN')}
                  </p>
                </div>

                {/* Pending Amount */}
                <div className="bg-indigo-50/50 rounded-xl p-3.5 border border-indigo-100/60 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-indigo-800">Pending Amount</span>
                  <p className="text-base sm:text-lg font-bold text-[#4f46e5] mt-1">
                    ₹{loanSummary.totalPending.toLocaleString('en-IN')}
                  </p>
                </div>

                {/* Today's Due */}
                <div className="bg-amber-50/50 rounded-xl p-3.5 border border-amber-100/60 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-amber-800">Today's Due</span>
                  <p className="text-base sm:text-lg font-bold text-amber-700 mt-1">
                    ₹{loanSummary.todayDue.toLocaleString('en-IN')}
                  </p>
                </div>

                {/* Overdue Amount */}
                <div className="bg-rose-50/50 rounded-xl p-3.5 border border-rose-100/60 flex flex-col justify-between">
                  <span className="text-[11px] font-semibold text-rose-800">Overdue Amount</span>
                  <p className="text-base sm:text-lg font-bold text-rose-600 mt-1">
                    ₹{loanSummary.overdueAmount.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Borrower Summary Card */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f46e5] flex items-center gap-1.5">
                <Receipt size={14} />
                <span>Borrower & Loan Details</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-3.5 gap-x-6 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Borrower Name</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.borrowerName || borrower.name}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Phone Number</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.phoneNumber || borrower.phone}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Alternate Phone</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.alternatePhoneNumber || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Address</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.address || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Finance Type</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-[#4f46e5] text-xs font-semibold">
                    {borrower.financeType || 'Daily'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Assigned Agent</span>
                  <span className="font-semibold text-[#1e293b]">
                    {assignedAgentDisplay}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Loan Amount</span>
                  <span className="font-semibold text-[#1e293b]">
                    ₹{(borrower.loanAmount || borrower.amount || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Deducted Amount</span>
                  <span className="font-semibold text-[#1e293b]">
                    ₹{(borrower.deductedAmount || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Net Amount Given</span>
                  <span className="font-semibold text-[#1e293b]">
                    ₹{loanSummary.netAmountGiven.toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Expected Return</span>
                  <span className="font-semibold text-[#1e293b]">
                    ₹{loanSummary.expectedReturn.toLocaleString('en-IN')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Interest Rate</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.interestRate !== undefined ? `${borrower.interestRate}%` : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Repayment Duration</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.repaymentDuration || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Start Date</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.startDate || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">End Date</span>
                  <span className="font-semibold text-[#1e293b]">
                    {borrower.endDate || '—'}
                  </span>
                </div>

                {borrower.parcelTokenMode && (
                  <div>
                    <span className="text-slate-400 block text-[11px] font-medium">Mode</span>
                    <span className="inline-block px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[11px] font-semibold">
                      Parcel Token Active
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Payment History Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
                  Payment History ({borrowerPayments.length})
                </h3>
                {loanSummary.totalPaid > 0 && (
                  <span className="text-xs font-semibold text-emerald-600">
                    Total Collected: ₹{loanSummary.totalPaid.toLocaleString('en-IN')}
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-slate-200/80 overflow-hidden bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] sm:text-xs font-bold text-[#475569] tracking-wider uppercase">
                      <th className="py-3 px-4 sm:px-5">DATE</th>
                      <th className="py-3 px-4 sm:px-5">AMOUNT</th>
                      <th className="py-3 px-4 sm:px-5">COLLECTED BY</th>
                      <th className="py-3 px-4 sm:px-5">NOTE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {borrowerPayments.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-10 px-4 text-center text-[#64748b] font-medium"
                        >
                          No payments recorded yet.
                        </td>
                      </tr>
                    ) : (
                      borrowerPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 sm:px-5 font-semibold text-[#1e293b]">
                            {formatDisplayDate(p.paymentDate)}
                          </td>
                          <td className="py-3.5 px-4 sm:px-5 font-bold text-emerald-600">
                            ₹{p.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 sm:px-5 text-[#475569] font-medium">
                            {resolveCollectorName(p, manager, agents)}
                          </td>
                          <td className="py-3.5 px-4 sm:px-5 text-[#64748b]">
                            {p.note || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collect Payment Sub-Dialog Modal */}
      {isCollectModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Sub-Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                  Collect Payment
                </h3>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Record an installment or partial payment
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCollectModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sub-Modal Form */}
            <form onSubmit={handleSavePayment} className="p-5 space-y-4">
              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0 text-red-500" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* 1. Borrower Name (Read-Only) */}
              <div>
                <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                  Borrower
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={borrower.borrowerName || borrower.name}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-[#1e293b] cursor-not-allowed"
                />
              </div>

              {/* 2. Collection Date */}
              <div>
                <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                  Collection Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all cursor-pointer"
                />
              </div>

              {/* 3. Amount Collected */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#1e293b]">
                    Amount Collected <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-medium text-[#64748b]">
                    Pending: <strong className="text-[#4f46e5]">₹{loanSummary.totalPending.toLocaleString('en-IN')}</strong>
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    max={loanSummary.totalPending}
                    required
                    value={paymentAmount}
                    onChange={(e) => {
                      setPaymentAmount(e.target.value);
                      if (paymentError) setPaymentError(null);
                    }}
                    placeholder="Enter collected amount"
                    className="w-full h-10 pl-8 pr-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                  />
                </div>
              </div>

              {/* 4. Collected By */}
              <div>
                <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                  Collected By <span className="text-red-500">*</span>
                </label>
                <select
                  value={collectorSelection}
                  onChange={(e) => setCollectorSelection(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                >
                  <option value="manager">
                    Manager ({manager?.fullName?.trim() || 'Sirajudeen'})
                  </option>
                  {activeAgents.map((ag) => (
                    <option key={ag.id} value={`agent:${ag.id}`}>
                      {ag.fullName} (Agent)
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Payment Note */}
              <div>
                <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                  Payment Note (Optional)
                </label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="e.g. Cash collected at shop"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCollectModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2 rounded-xl bg-[#4f46e5] text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-[#4338ca] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingPayment ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
