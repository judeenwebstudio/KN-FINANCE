import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateBorrowerEndDate, parseCustomDate } from '../utils/loanCalculations';
import { COLLECTION_METHODS } from '../types';
import type { Timeframe, Borrower, NewBorrowerInput, CollectionMethod } from '../types';
import { useModalBackHandler } from '../utils/useModalBackHandler';

interface EditBorrowerModalProps {
  isOpen: boolean;
  borrower: Borrower | null;
  onClose: () => void;
  onSuccess?: () => void;
}

// Duration options per finance type
const DURATION_OPTIONS: Record<Timeframe, string[]> = {
  Daily: ['30 Days', '50 Days', '60 Days', '90 Days', '100 Days'],
  Weekly: ['10 Weeks', '12 Weeks', '15 Weeks', '20 Weeks'],
  Monthly: [
    '1 Month',
    '2 Months',
    '3 Months',
    '4 Months',
    '5 Months',
    '6 Months',
    '7 Months',
    '8 Months',
    '9 Months',
    '10 Months',
    '11 Months',
    '12 Months',
  ],
};

function getTodayIsoDate(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const EditBorrowerModal: React.FC<EditBorrowerModalProps> = ({
  isOpen,
  borrower,
  onClose,
  onSuccess,
}) => {
  useModalBackHandler(isOpen, onClose);

  const {
    borrowers,
    payments,
    agents,
    collectionLines,
    updateBorrower,
    currentRole,
  } = useApp();

  // Active collection lines for borrower assignment
  const activeLines = useMemo(
    () => collectionLines.filter((l) => l.status === 'active'),
    [collectionLines]
  );

  // Active agents available for assignment
  const activeAgents = useMemo(() => agents.filter((a) => a.status === 'active'), [agents]);

  // Form Fields State
  const [bookNo, setBookNo] = useState<string>('');
  const [borrowerName, setBorrowerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [financeType, setFinanceType] = useState<Timeframe>('Daily');
  const [weeklyCollectionDay, setWeeklyCollectionDay] = useState<number>(1);
  const [monthlyCollectionDay, setMonthlyCollectionDay] = useState<number>(1);
  const [collectionLine, setCollectionLine] = useState<string>('');
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>('Hand Cash');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agentCommission, setAgentCommission] = useState('0');
  const [loanAmount, setLoanAmount] = useState('');
  const [deductedAmount, setDeductedAmount] = useState('0');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [repaymentDuration, setRepaymentDuration] = useState('50 Days');
  const [startDateIso, setStartDateIso] = useState(getTodayIsoDate());

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Total collected so far for this borrower
  const totalPaid = useMemo(() => {
    if (!borrower) return 0;
    return payments
      .filter((p) => p.borrowerId === borrower.id)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [borrower, payments]);

  // Used Book Numbers in current company (excluding this borrower)
  const usedBookNos = useMemo(() => {
    const set = new Set<number>();
    for (const b of borrowers) {
      if (b.bookNo !== null && b.bookNo !== undefined && b.id !== borrower?.id) {
        set.add(b.bookNo);
      }
    }
    return set;
  }, [borrowers, borrower?.id]);

  // Inactive assigned agent fallback preservation
  const inactiveAssignedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    const found = agents.find((a) => a.id === selectedAgentId);
    return found && found.status === 'inactive' ? found : null;
  }, [selectedAgentId, agents]);

  // Inactive assigned line fallback preservation
  const inactiveAssignedLine = useMemo(() => {
    const lineName = borrower?.collectionLine;
    if (!lineName) return null;
    const isPresentInActive = activeLines.some((l) => l.name === lineName);
    return !isPresentInActive ? lineName : null;
  }, [borrower, activeLines]);

  // Populate form with borrower's current values
  useEffect(() => {
    if (isOpen && borrower) {
      setBookNo(
        borrower.bookNo !== null && borrower.bookNo !== undefined ? String(borrower.bookNo) : ''
      );
      setBorrowerName(borrower.borrowerName || borrower.name || '');
      setPhoneNumber(borrower.phoneNumber || borrower.phone || '');
      setAlternatePhoneNumber(borrower.alternatePhoneNumber || '');
      setAddress(borrower.address || '');
      setFinanceType(borrower.financeType || 'Daily');

      const parsedStart = parseCustomDate(borrower.startDate);
      const startDay1to7 = parsedStart
        ? parsedStart.getDay() === 0
          ? 7
          : parsedStart.getDay()
        : 1;
      setWeeklyCollectionDay(borrower.weeklyCollectionDay || startDay1to7);
      setMonthlyCollectionDay(
        borrower.monthlyCollectionDay || (parsedStart ? parsedStart.getDate() : 1)
      );

      setCollectionLine(borrower.collectionLine || activeLines[0]?.name || '');
      setCollectionMethod((borrower.collectionMethod as CollectionMethod) || 'Hand Cash');
      setSelectedAgentId(borrower.agentId || '');
      setAgentCommission(
        borrower.agentCommission !== undefined ? borrower.agentCommission.toString() : '0'
      );
      setLoanAmount((borrower.loanAmount || borrower.amount || '').toString());
      setDeductedAmount((borrower.deductedAmount || '0').toString());
      setExpectedReturn((borrower.expectedReturn || '').toString());
      setRepaymentDuration(borrower.repaymentDuration || '50 Days');

      if (borrower.startDate) {
        const parsed = parseCustomDate(borrower.startDate);
        if (parsed) {
          const yyyy = parsed.getFullYear();
          const mm = String(parsed.getMonth() + 1).padStart(2, '0');
          const dd = String(parsed.getDate()).padStart(2, '0');
          setStartDateIso(`${yyyy}-${mm}-${dd}`);
        } else {
          setStartDateIso(borrower.startDate);
        }
      } else {
        setStartDateIso(getTodayIsoDate());
      }

      setErrors({});
      setSubmitError(null);
      setIsConfirmOpen(false);
      setIsSubmitting(false);
    }
  }, [isOpen, borrower, activeLines]);

  // Handlers
  const handleFinanceTypeChange = (newType: Timeframe) => {
    setFinanceType(newType);
    const options = DURATION_OPTIONS[newType];
    if (!options.includes(repaymentDuration)) {
      setRepaymentDuration(options[1] || options[0]);
    }
    if (newType === 'Weekly') {
      const parsed = parseCustomDate(startDateIso);
      if (parsed) {
        const jsDay = parsed.getDay();
        setWeeklyCollectionDay(jsDay === 0 ? 7 : jsDay);
      }
    }
  };

  const handleAgentChange = (newAgentId: string) => {
    setSelectedAgentId(newAgentId);
    if (newAgentId) {
      if (!agentCommission || parseFloat(agentCommission) === 0) {
        setAgentCommission('500');
      }
    } else {
      setAgentCommission('0');
    }
  };

  // Live Computed Net Amount Given
  const calculatedNetAmountGiven = useMemo(() => {
    const loan = parseFloat(loanAmount) || 0;
    const deducted = parseFloat(deductedAmount) || 0;
    const commission = parseFloat(agentCommission) || 0;
    return Math.max(0, loan - deducted - commission);
  }, [loanAmount, deductedAmount, agentCommission]);

  // Live Computed Interest Rate
  const calculatedInterestRate = useMemo(() => {
    const loan = parseFloat(loanAmount);
    const expReturn = parseFloat(expectedReturn);
    if (isNaN(loan) || isNaN(expReturn) || loan <= 0 || expReturn < loan) {
      return null;
    }
    const rate = ((expReturn - loan) / loan) * 100;
    return Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(2)}%`;
  }, [loanAmount, expectedReturn]);

  // Live Computed End Date
  const calculatedEndDate = useMemo(() => {
    return calculateBorrowerEndDate(
      startDateIso,
      financeType,
      repaymentDuration,
      financeType === 'Weekly' ? weeklyCollectionDay : null,
      financeType === 'Monthly' ? monthlyCollectionDay : null
    );
  }, [startDateIso, financeType, repaymentDuration, weeklyCollectionDay, monthlyCollectionDay]);

  if (!isOpen || !borrower) return null;

  // Validate form before submission
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    const numBookNo = parseInt(bookNo, 10);
    if (!bookNo || isNaN(numBookNo)) {
      newErrors.bookNo = 'Book No is required';
    } else if (numBookNo < 1 || numBookNo > 1000) {
      newErrors.bookNo = 'Book No must be between 1 and 1000';
    } else if (usedBookNos.has(numBookNo)) {
      newErrors.bookNo = `Book No ${numBookNo} is already assigned to another borrower.`;
    }

    if (!borrowerName.trim()) {
      newErrors.borrowerName = 'Borrower Name is required';
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!cleanPhone) {
      newErrors.phoneNumber = 'Phone Number is required';
    } else if (cleanPhone.length !== 10) {
      newErrors.phoneNumber = 'Phone Number must be exactly 10 digits';
    }

    if (alternatePhoneNumber.trim()) {
      const cleanAlt = alternatePhoneNumber.replace(/\D/g, '');
      if (cleanAlt.length !== 10) {
        newErrors.alternatePhoneNumber = 'Alternate Phone must be exactly 10 digits';
      }
    }

    const loanVal = parseFloat(loanAmount);
    if (!loanAmount.trim() || isNaN(loanVal) || loanVal <= 0) {
      newErrors.loanAmount = 'Valid Loan Amount is required';
    }

    const deductedVal = parseFloat(deductedAmount || '0');
    if (isNaN(deductedVal) || deductedVal < 0) {
      newErrors.deductedAmount = 'Deducted amount cannot be negative';
    } else if (!isNaN(loanVal) && deductedVal > loanVal) {
      newErrors.deductedAmount = 'Deducted amount cannot exceed Loan Amount';
    }

    const commissionVal = parseFloat(agentCommission || '0');
    if (isNaN(commissionVal) || commissionVal < 0) {
      newErrors.agentCommission = 'Agent Commission cannot be negative';
    } else if (!isNaN(loanVal) && !isNaN(deductedVal) && deductedVal + commissionVal > loanVal) {
      newErrors.agentCommission = 'Total deductions (Deducted Amount + Commission) cannot exceed Loan Amount';
    }

    const expReturnVal = parseFloat(expectedReturn);
    if (!expectedReturn.trim() || isNaN(expReturnVal) || expReturnVal <= 0) {
      newErrors.expectedReturn = 'Expected Return is required';
    } else if (!isNaN(loanVal) && expReturnVal < loanVal) {
      newErrors.expectedReturn = 'Expected Return cannot be less than Loan Amount';
    } else if (totalPaid > 0 && expReturnVal < totalPaid) {
      newErrors.expectedReturn = `Cannot reduce Expected Return to ₹${expReturnVal.toLocaleString(
        'en-IN'
      )} because ₹${totalPaid.toLocaleString('en-IN')} has already been collected for this borrower.`;
    }

    if (!repaymentDuration) {
      newErrors.repaymentDuration = 'Repayment Duration is required';
    }

    if (!startDateIso) {
      newErrors.startDate = 'Start Date is required';
    }

    if (financeType === 'Weekly') {
      if (!weeklyCollectionDay || weeklyCollectionDay < 1 || weeklyCollectionDay > 7) {
        newErrors.weeklyCollectionDay = 'Collection Day is required';
      }
    }

    if (financeType === 'Monthly') {
      if (!monthlyCollectionDay || monthlyCollectionDay < 1 || monthlyCollectionDay > 31) {
        newErrors.monthlyCollectionDay = 'Collection Date is required';
      }
    }

    if (activeLines.length === 0 && !inactiveAssignedLine) {
      newErrors.collectionLine = 'No collection lines available.';
    } else if (!collectionLine || !collectionLine.trim()) {
      newErrors.collectionLine = 'Please select a valid Line';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (currentRole !== 'manager') {
      setSubmitError('Access denied: Only company Managers can edit borrower details.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    // Check if critical financial or schedule fields changed to prompt confirmation
    const oldLoan = borrower.loanAmount || borrower.amount || 0;
    const oldDeducted = borrower.deductedAmount || 0;
    const oldExpReturn = borrower.expectedReturn || 0;
    const newLoan = parseFloat(loanAmount);
    const newDeducted = parseFloat(deductedAmount || '0');
    const newExpReturn = parseFloat(expectedReturn);

    const isFinancialChanged =
      oldLoan !== newLoan ||
      oldDeducted !== newDeducted ||
      oldExpReturn !== newExpReturn ||
      borrower.financeType !== financeType ||
      borrower.repaymentDuration !== repaymentDuration;

    if (isFinancialChanged) {
      setIsConfirmOpen(true);
    } else {
      executeSave();
    }
  };

  const executeSave = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const numBookNo = parseInt(bookNo, 10);
    const loanVal = parseFloat(loanAmount);
    const deductedVal = parseFloat(deductedAmount || '0');
    const commissionVal = parseFloat(agentCommission || '0');
    const expReturnVal = parseFloat(expectedReturn);
    const interestVal = loanVal > 0 ? ((expReturnVal - loanVal) / loanVal) * 100 : 0;

    const payload: Partial<NewBorrowerInput> = {
      bookNo: numBookNo,
      borrowerName: borrowerName.trim(),
      phoneNumber: phoneNumber.trim(),
      alternatePhoneNumber: alternatePhoneNumber.trim() || undefined,
      address: address.trim() || undefined,
      financeType,
      weeklyCollectionDay: financeType === 'Weekly' ? weeklyCollectionDay : null,
      monthlyCollectionDay: financeType === 'Monthly' ? monthlyCollectionDay : null,
      collectionLine: collectionLine.trim() || undefined,
      collectionMethod,
      agentId: selectedAgentId || undefined,
      agentCommission: commissionVal,
      loanAmount: loanVal,
      deductedAmount: deductedVal,
      netAmountGiven: calculatedNetAmountGiven,
      expectedReturn: expReturnVal,
      interestRate: Math.round(interestVal * 100) / 100,
      repaymentDuration,
      startDate: startDateIso,
      endDate: calculatedEndDate || undefined,
    };

    const res = await updateBorrower(borrower.id, payload);

    setIsSubmitting(false);
    setIsConfirmOpen(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setSubmitError(res.error || 'Failed to update borrower.');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
                Edit Borrower
              </span>
              <h2 className="text-xl font-bold text-[#1e293b] mt-0.5">
                {borrower.borrowerName || borrower.name}
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

          {/* Form Body - Scrollable */}
          <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {submitError && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2">
                <AlertCircle size={18} className="text-red-500 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Section 1: Identity & Contact */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] border-b border-slate-100 pb-1.5">
                Borrower Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Book No */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Book No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={bookNo}
                    onChange={(e) => setBookNo(e.target.value)}
                    placeholder="1 to 1000"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.bookNo ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm focus:outline-none focus:border-[#4f46e5] transition-all`}
                  />
                  {errors.bookNo && <p className="text-[11px] text-red-500 mt-1">{errors.bookNo}</p>}
                </div>

                {/* Borrower Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Borrower Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    placeholder="Full name"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.borrowerName ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm focus:outline-none focus:border-[#4f46e5] transition-all`}
                  />
                  {errors.borrowerName && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.borrowerName}</p>
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.phoneNumber ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm focus:outline-none focus:border-[#4f46e5] transition-all`}
                  />
                  {errors.phoneNumber && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.phoneNumber}</p>
                  )}
                </div>

                {/* Alternate Phone */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Alternate Phone
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={alternatePhoneNumber}
                    onChange={(e) => setAlternatePhoneNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="Optional 10-digit mobile"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.alternatePhoneNumber ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm focus:outline-none focus:border-[#4f46e5] transition-all`}
                  />
                  {errors.alternatePhoneNumber && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.alternatePhoneNumber}</p>
                  )}
                </div>

                {/* Address */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">Address</label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Borrower full residential/business address"
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#4f46e5] transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Collection & Assignment */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] border-b border-slate-100 pb-1.5">
                Collection & Assignment
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Collection Line */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Collection Line <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={collectionLine}
                    onChange={(e) => setCollectionLine(e.target.value)}
                    className={`w-full h-10 px-3 rounded-xl border ${
                      errors.collectionLine ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]`}
                  >
                    {activeLines.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                    {inactiveAssignedLine && (
                      <option value={inactiveAssignedLine}>
                        {inactiveAssignedLine} (Inactive)
                      </option>
                    )}
                  </select>
                  {errors.collectionLine && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.collectionLine}</p>
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

                {/* Assigned Agent */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Assigned Agent
                  </label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => handleAgentChange(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]"
                  >
                    <option value="">Unassigned (Manager Collects)</option>
                    {activeAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fullName}
                      </option>
                    ))}
                    {inactiveAssignedAgent && (
                      <option value={inactiveAssignedAgent.id}>
                        {inactiveAssignedAgent.fullName} (Inactive)
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: Financial & Loan Configuration */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] border-b border-slate-100 pb-1.5">
                Financial Details & Schedule
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Finance Type */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Finance Type
                  </label>
                  <select
                    value={financeType}
                    onChange={(e) => handleFinanceTypeChange(e.target.value as Timeframe)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                {/* Repayment Duration */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Repayment Duration <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={repaymentDuration}
                    onChange={(e) => setRepaymentDuration(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]"
                  >
                    {DURATION_OPTIONS[financeType].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Schedule Day/Date */}
                {financeType === 'Weekly' ? (
                  <div>
                    <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                      Weekly Collection Day <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={weeklyCollectionDay}
                      onChange={(e) => setWeeklyCollectionDay(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]"
                    >
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                      <option value={7}>Sunday</option>
                    </select>
                  </div>
                ) : financeType === 'Monthly' ? (
                  <div>
                    <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                      Monthly Collection Date <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={monthlyCollectionDay}
                      onChange={(e) => setMonthlyCollectionDay(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                          {d === 1 || d === 21 || d === 31
                            ? 'st'
                            : d === 2 || d === 22
                            ? 'nd'
                            : d === 3 || d === 23
                            ? 'rd'
                            : 'th'}{' '}
                          of month
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                      Collection Schedule
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Daily"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                    />
                  </div>
                )}

                {/* Loan Amount */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Loan Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="e.g. 20000"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.loanAmount ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm font-semibold focus:outline-none focus:border-[#4f46e5]`}
                  />
                  {errors.loanAmount && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.loanAmount}</p>
                  )}
                </div>

                {/* Deducted Amount */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Deducted Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={deductedAmount}
                    onChange={(e) => setDeductedAmount(e.target.value)}
                    placeholder="0"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.deductedAmount ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm focus:outline-none focus:border-[#4f46e5]`}
                  />
                  {errors.deductedAmount && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.deductedAmount}</p>
                  )}
                </div>

                {/* Agent Commission */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Agent Commission (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={agentCommission}
                    onChange={(e) => setAgentCommission(e.target.value)}
                    placeholder="0"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.agentCommission ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm focus:outline-none focus:border-[#4f46e5]`}
                  />
                  {errors.agentCommission && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.agentCommission}</p>
                  )}
                </div>

                {/* Expected Return */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Expected Return (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    placeholder="e.g. 24000"
                    className={`w-full h-10 px-3.5 rounded-xl border ${
                      errors.expectedReturn ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm font-semibold focus:outline-none focus:border-[#4f46e5]`}
                  />
                  {errors.expectedReturn && (
                    <p className="text-[11px] text-red-500 mt-1">{errors.expectedReturn}</p>
                  )}
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDateIso}
                    onChange={(e) => setStartDateIso(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5]"
                  />
                </div>

                {/* Computed End Date */}
                <div>
                  <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                    Projected End Date
                  </label>
                  <input
                    type="text"
                    disabled
                    value={calculatedEndDate || '—'}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Real-time Financial Breakdown Summary Card */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Net Amount Given to Borrower:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    ₹{calculatedNetAmountGiven.toLocaleString('en-IN')}
                  </span>
                </div>
                {calculatedInterestRate && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Calculated Interest Rate:</span>
                    <span className="font-bold text-indigo-600">{calculatedInterestRate}</span>
                  </div>
                )}
                {totalPaid > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                    <span className="font-semibold text-emerald-700">Total Collected So Far:</span>
                    <span className="font-bold text-emerald-700">
                      ₹{totalPaid.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-[#4f46e5] text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-[#4338ca] active:scale-[0.98] transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Dialog Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#1e293b]">Confirm Borrower Update</h4>
                <p className="text-xs text-[#64748b] mt-1">
                  You are changing financial or schedule parameters for{' '}
                  <strong className="text-slate-800">
                    {borrower.borrowerName || borrower.name}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Loan Amount:</span>
                <span className="font-semibold text-slate-800">
                  ₹{(borrower.loanAmount || borrower.amount || 0).toLocaleString('en-IN')} → ₹
                  {parseFloat(loanAmount || '0').toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Return:</span>
                <span className="font-semibold text-slate-800">
                  ₹{(borrower.expectedReturn || 0).toLocaleString('en-IN')} → ₹
                  {parseFloat(expectedReturn || '0').toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deducted Amount:</span>
                <span className="font-semibold text-slate-800">
                  ₹{(borrower.deductedAmount || 0).toLocaleString('en-IN')} → ₹
                  {parseFloat(deductedAmount || '0').toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              This action will atomically update the borrower, recalculate loan status, and
              synchronize company cash ledger entries.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={executeSave}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-[#4f46e5] text-white text-xs font-semibold hover:bg-[#4338ca] flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
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
