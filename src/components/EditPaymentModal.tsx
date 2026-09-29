import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { resolveCollectorName } from '../utils/agentUtils';
import { COLLECTION_METHODS } from '../types';
import type { Borrower, PaymentRecord, CollectionMethod } from '../types';
import { parseCustomDate } from '../utils/loanCalculations';
import { useModalBackHandler } from '../utils/useModalBackHandler';

interface EditPaymentModalProps {
  isOpen: boolean;
  payment: PaymentRecord | null;
  borrower: Borrower | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EditPaymentModal: React.FC<EditPaymentModalProps> = ({
  isOpen,
  payment,
  borrower,
  onClose,
  onSuccess,
}) => {
  useModalBackHandler(isOpen, onClose);

  const { updatePayment, manager, agents, currentRole, currentUser } = useApp();

  const isAssigned = (
    Boolean(borrower?.agentId && currentUser?.companyUserId && borrower.agentId === currentUser.companyUserId) ||
    Boolean(borrower?.assignedAgent && currentUser?.fullName && borrower.assignedAgent.toLowerCase() === currentUser.fullName.toLowerCase())
  );
  const canEdit = currentRole === 'manager' || (currentRole === 'agent' && isAssigned);

  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>('Hand Cash');
  const [note, setNote] = useState<string>('');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Initialize form fields when modal opens
  useEffect(() => {
    if (isOpen && payment) {
      setAmount((payment.amount || '').toString());

      if (payment.paymentDate) {
        const parsed = parseCustomDate(payment.paymentDate);
        if (parsed) {
          const yyyy = parsed.getFullYear();
          const mm = String(parsed.getMonth() + 1).padStart(2, '0');
          const dd = String(parsed.getDate()).padStart(2, '0');
          setPaymentDate(`${yyyy}-${mm}-${dd}`);
        } else {
          setPaymentDate(payment.paymentDate);
        }
      } else {
        setPaymentDate('');
      }

      setCollectionMethod((payment.collectionMethod as CollectionMethod) || 'Hand Cash');
      setNote(payment.note || '');
      setErrors({});
      setSubmitError(null);
      setIsConfirmOpen(false);
      setIsSubmitting(false);
    }
  }, [isOpen, payment]);

  const collectorDisplayName = useMemo(() => {
    if (!payment) return '—';
    return resolveCollectorName(payment, manager, agents);
  }, [payment, manager, agents]);

  if (!isOpen || !payment) return null;

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    const numAmount = parseFloat(amount);
    if (!amount.trim() || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Valid payment amount is required';
    }

    if (!paymentDate.trim()) {
      newErrors.paymentDate = 'Payment date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!canEdit) {
      setSubmitError('Access denied: You do not have permission to edit this payment record.');
      return;
    }

    if (!validate()) {
      return;
    }

    setIsConfirmOpen(true);
  };

  const executeSave = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const numAmount = parseFloat(amount);

    const res = await updatePayment(payment.id, {
      amount: numAmount,
      paymentDate,
      collectionMethod,
      note: note.trim() || undefined,
    });

    setIsSubmitting(false);
    setIsConfirmOpen(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setSubmitError(res.error || 'Failed to update payment record.');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
                Edit Payment
              </span>
              <h2 className="text-lg font-bold text-[#1e293b] mt-0.5">
                Update Repayment Record
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Read-Only Borrower Name */}
            <div>
              <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                Borrower
              </label>
              <input
                type="text"
                disabled
                value={borrower?.borrowerName || borrower?.name || payment.borrowerName || 'Borrower'}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 cursor-not-allowed"
              />
            </div>

            {/* Read-Only Collector */}
            <div>
              <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                Collected By
              </label>
              <input
                type="text"
                disabled
                value={collectorDisplayName}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600 cursor-not-allowed"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                Payment Amount (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1000"
                className={`w-full h-10 px-3.5 rounded-xl border ${
                  errors.amount ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                } text-sm font-semibold focus:outline-none focus:border-[#4f46e5] transition-all`}
              />
              {errors.amount && <p className="text-[11px] text-red-500 mt-1">{errors.amount}</p>}
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className={`w-full h-10 px-3.5 rounded-xl border ${
                  errors.paymentDate ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                } bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all`}
              />
              {errors.paymentDate && (
                <p className="text-[11px] text-red-500 mt-1">{errors.paymentDate}</p>
              )}
            </div>

            {/* Collection Method */}
            <div>
              <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                Collection Method
              </label>
              <select
                value={collectionMethod}
                onChange={(e) => setCollectionMethod(e.target.value as CollectionMethod)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]"
              >
                {COLLECTION_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                Note / Remark
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional payment notes or reason for correction"
                className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#4f46e5] transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-[#4f46e5] text-white text-xs font-semibold hover:bg-[#4338ca] active:scale-[0.98] transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Payment</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#1e293b]">Confirm Payment Update</h4>
                <p className="text-xs text-[#64748b] mt-1">
                  Payment will be changed from{' '}
                  <strong className="text-slate-800">
                    ₹{(payment.amount || 0).toLocaleString('en-IN')}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-[#4f46e5]">
                    ₹{parseFloat(amount || '0').toLocaleString('en-IN')}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              This will atomically correct the company cash ledger and recalculate the borrower's
              total paid balance and active/closed status.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={executeSave}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-xl bg-[#4f46e5] text-white text-xs font-semibold hover:bg-[#4338ca] flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Confirm & Save</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
