import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, AlertTriangle, Loader2, Phone } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  calculateBorrowerEndDate,
  parseCustomDate,
  calculateNetAmountGiven,
  toIsoDate,
} from '../utils/loanCalculations';
import { COLLECTION_METHODS } from '../types';
import type { Timeframe, Borrower, NewBorrowerInput, CollectionMethod } from '../types';

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
  const {
    borrowers,
    payments,
    agents,
    collectionLines,
    updateBorrower,
    currentRole,
    currentUser,
  } = useApp();

  const isAssigned = (
    Boolean(borrower?.agentId && currentUser?.companyUserId && borrower.agentId === currentUser.companyUserId) ||
    Boolean(borrower?.assignedAgent && currentUser?.fullName && borrower.assignedAgent.toLowerCase() === currentUser.fullName.toLowerCase())
  );
  const canEdit = currentRole === 'manager' || (currentRole === 'agent' && isAssigned);

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
  const [parcelTokenMode, setParcelTokenMode] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [agentCommission, setAgentCommission] = useState<string>('0');
  const [deductedAmount, setDeductedAmount] = useState<string>('0');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [repaymentDuration, setRepaymentDuration] = useState('50 Days');
  const [paymentDateIso, setPaymentDateIso] = useState<string>('');
  const [startDateIso, setStartDateIso] = useState<string>(getTodayIsoDate());
  const [isExistingLoan, setIsExistingLoan] = useState(false);

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

  // Derived financial values
  const parsedLoanAmount = useMemo(() => {
    const val = parseFloat(loanAmount);
    return isNaN(val) || val <= 0 ? 0 : val;
  }, [loanAmount]);

  const parsedAgentCommission = useMemo(() => {
    const val = parseFloat(agentCommission);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [agentCommission]);

  const parsedDeductedAmount = useMemo(() => {
    const val = parseFloat(deductedAmount);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [deductedAmount]);

  const calculatedNetAmountGiven = useMemo(() => {
    return calculateNetAmountGiven(parsedLoanAmount, parsedDeductedAmount, parsedAgentCommission);
  }, [parsedLoanAmount, parsedDeductedAmount, parsedAgentCommission]);

  // Formatted start date for display
  const formattedStartDate = useMemo(() => {
    if (!startDateIso) return '';
    const d = parseCustomDate(startDateIso);
    if (!d) return startDateIso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, [startDateIso]);

  // Formatted payment date for display
  const formattedPaymentDate = useMemo(() => {
    if (!paymentDateIso) return '';
    const d = parseCustomDate(paymentDateIso);
    if (!d) return paymentDateIso;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, [paymentDateIso]);

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
      setParcelTokenMode(Boolean(borrower.parcelTokenMode));
      setLoanAmount((borrower.loanAmount || borrower.amount || '').toString());
      setAgentCommission(
        borrower.agentCommission !== undefined && borrower.agentCommission !== null
          ? borrower.agentCommission.toString()
          : '0'
      );
      setDeductedAmount(
        borrower.deductedAmount !== undefined && borrower.deductedAmount !== null
          ? borrower.deductedAmount.toString()
          : '0'
      );
      setExpectedReturn((borrower.expectedReturn || '').toString());
      setRepaymentDuration(borrower.repaymentDuration || '50 Days');

      // Payment Date: safe empty display for historical NULL
      if (borrower.paymentDate) {
        const parsedP = parseCustomDate(borrower.paymentDate);
        setPaymentDateIso(parsedP ? toIsoDate(parsedP) : '');
      } else {
        setPaymentDateIso('');
      }

      // Due Start Date
      if (borrower.startDate) {
        const parsedS = parseCustomDate(borrower.startDate);
        setStartDateIso(parsedS ? toIsoDate(parsedS) : getTodayIsoDate());
      } else {
        setStartDateIso(getTodayIsoDate());
      }

      setIsExistingLoan(Boolean(borrower.isExistingLoan));
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

  const handleWeeklyCollectionDayChange = (newDay: number) => {
    setWeeklyCollectionDay(newDay);
  };

  const handleMonthlyCollectionDayChange = (newDay: number) => {
    setMonthlyCollectionDay(newDay);
  };

  const handlePaymentDateChange = (newPaymentIso: string) => {
    // Payment Date change is informational and never recalculates Due Start Date
    setPaymentDateIso(newPaymentIso);
  };

  const handleStartDateChange = (newStartIso: string) => {
    setStartDateIso(newStartIso);
  };

  const handleAgentChange = (newAgentId: string) => {
    setSelectedAgentId(newAgentId);
  };

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

  // Live Computed End Date (Due End Date)
  const calculatedEndDate = useMemo(() => {
    return calculateBorrowerEndDate(
      startDateIso,
      financeType,
      repaymentDuration,
      financeType === 'Weekly' ? weeklyCollectionDay : null,
      financeType === 'Monthly' ? monthlyCollectionDay : null,
      paymentDateIso || null
    );
  }, [startDateIso, financeType, repaymentDuration, weeklyCollectionDay, monthlyCollectionDay, paymentDateIso]);

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
      newErrors.bookNo = `Book No ${numBookNo} is already assigned to another borrower. Please select another Book No.`;
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
        newErrors.alternatePhoneNumber = 'Alternate Phone Number must be exactly 10 digits';
      }
    }

    const loanVal = parseFloat(loanAmount);
    if (!loanAmount.trim() || isNaN(loanVal) || loanVal <= 0) {
      newErrors.loanAmount = 'Valid Loan Amount is required';
    }

    const commVal = parseFloat(agentCommission);
    if (agentCommission.trim() !== '' && (isNaN(commVal) || commVal < 0)) {
      newErrors.agentCommission = 'Agent Commission must be greater than or equal to 0';
    }

    const deductVal = parseFloat(deductedAmount);
    if (deductedAmount.trim() !== '' && (isNaN(deductVal) || deductVal < 0)) {
      newErrors.deductedAmount = 'Deducted Amount must be greater than or equal to 0';
    }

    if (!isNaN(loanVal) && (parsedDeductedAmount + parsedAgentCommission) > loanVal) {
      newErrors.deductedAmount = 'The sum of Deducted Amount and Agent Commission cannot exceed the Loan Amount.';
    }

    const expReturnVal = parseFloat(expectedReturn);
    if (!expectedReturn.trim() || isNaN(expReturnVal) || expReturnVal <= 0) {
      newErrors.expectedReturn = 'Expected Return is required';
    } else if (!isNaN(loanVal) && expReturnVal < loanVal) {
      newErrors.expectedReturn = 'Expected Return must be greater than or equal to Loan Amount';
    } else if (totalPaid > 0 && expReturnVal < totalPaid) {
      newErrors.expectedReturn = `Cannot reduce Expected Return to ₹${expReturnVal.toLocaleString(
        'en-IN'
      )} because ₹${totalPaid.toLocaleString('en-IN')} has already been collected for this borrower.`;
    }

    if (!repaymentDuration) {
      newErrors.repaymentDuration = 'Repayment Duration is required';
    }

    if (!startDateIso) {
      newErrors.startDate = 'Due Start Date is required';
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

    if (!collectionMethod || !COLLECTION_METHODS.includes(collectionMethod)) {
      newErrors.collectionMethod = 'Please select a valid Collection Method';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!canEdit) {
      setSubmitError('Access denied: You do not have permission to edit this borrower.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    // Check if critical financial or schedule fields changed to prompt confirmation
    const oldLoan = borrower.loanAmount || borrower.amount || 0;
    const oldComm = borrower.agentCommission || 0;
    const oldDeduct = borrower.deductedAmount || 0;
    const oldExpReturn = borrower.expectedReturn || 0;
    const newLoan = parseFloat(loanAmount);
    const newExpReturn = parseFloat(expectedReturn);

    const isFinancialChanged =
      oldLoan !== newLoan ||
      oldComm !== parsedAgentCommission ||
      oldDeduct !== parsedDeductedAmount ||
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
    const expReturnVal = parseFloat(expectedReturn);
    const interestVal = parseFloat(calculatedInterestRate?.replace('%', '') || '0');

    const payload: Partial<NewBorrowerInput> = {
      bookNo: isNaN(numBookNo) ? null : numBookNo,
      borrowerName: borrowerName.trim(),
      phoneNumber: phoneNumber.trim(),
      alternatePhoneNumber: alternatePhoneNumber.trim() || undefined,
      address: address.trim() || undefined,
      financeType,
      weeklyCollectionDay: financeType === 'Weekly' ? weeklyCollectionDay : null,
      monthlyCollectionDay: financeType === 'Monthly' ? monthlyCollectionDay : null,
      collectionLine: collectionLine ? collectionLine.trim() : null,
      collectionMethod: collectionMethod ? collectionMethod.trim() : 'Hand Cash',
      agentId: currentRole === 'manager' ? (selectedAgentId || undefined) : borrower.agentId,
      agentCommission: parsedAgentCommission,
      parcelTokenMode,
      loanAmount: loanVal,
      deductedAmount: parsedDeductedAmount,
      netAmountGiven: calculatedNetAmountGiven,
      expectedReturn: expReturnVal,
      interestRate: interestVal,
      repaymentDuration,
      paymentDate: paymentDateIso ? formattedPaymentDate : undefined,
      startDate: formattedStartDate,
      endDate: calculatedEndDate || undefined,
      isExistingLoan,
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-[820px] max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header - Fixed at Top */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b]">
                Edit Borrower
              </h2>
              <p className="text-xs text-[#64748b] mt-0.5">
                {borrower.borrowerName || borrower.name} (Book #{borrower.bookNo || '—'})
              </p>
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
          <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {submitError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs sm:text-sm font-medium animate-in fade-in">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Section 1: Basic Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
                Borrower Details
              </h3>

              {/* Row 1: Book No, Borrower Name, Phone Number, Alternate Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Book No */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Book No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={bookNo}
                    onChange={(e) => setBookNo(e.target.value)}
                    placeholder="Enter Book No (e.g. 1)"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                  />
                  {errors.bookNo && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.bookNo}</p>
                  )}
                </div>

                {/* 2. Borrower Name */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Borrower Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    placeholder="Enter borrower name"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                  />
                  {errors.borrowerName && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.borrowerName}</p>
                  )}
                </div>

                {/* 3. Phone Number */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="tel"
                      maxLength={10}
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="10-digit mobile number"
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                    />
                  </div>
                  {errors.phoneNumber && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.phoneNumber}</p>
                  )}
                </div>

                {/* 4. Alternate Phone Number */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Alternate Phone (Optional)
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="tel"
                      maxLength={10}
                      value={alternatePhoneNumber}
                      onChange={(e) => setAlternatePhoneNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="Optional 10-digit mobile"
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                    />
                  </div>
                  {errors.alternatePhoneNumber && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.alternatePhoneNumber}</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Address
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter full address"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all resize-none"
                />
              </div>
            </div>

            {/* Section 2: Loan & Finance Configuration */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
                Loan Configuration
              </h3>

              {/* Finance Type, Repayment Duration, Assign to Agent, Line, Collection Method, Parcel Token Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
                {/* Finance Type */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Finance Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={financeType}
                    onChange={(e) => handleFinanceTypeChange(e.target.value as Timeframe)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                {/* Repayment Duration */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Repayment Duration <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={repaymentDuration}
                    onChange={(e) => setRepaymentDuration(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer font-medium"
                  >
                    {DURATION_OPTIONS[financeType].map((dur) => (
                      <option key={dur} value={dur}>
                        {dur}
                      </option>
                    ))}
                  </select>
                  {errors.repaymentDuration && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.repaymentDuration}</p>
                  )}
                </div>

                {/* Assign to Agent */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Assign to Agent
                  </label>
                  {currentRole === 'agent' ? (
                    <div className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-[#1e293b] font-medium flex items-center justify-between select-none">
                      <span className="truncate">{borrower.assignedAgent || currentUser?.fullName || 'Assigned to You'}</span>
                      <span className="text-[11px] font-semibold bg-indigo-50 text-[#4f46e5] px-2 py-0.5 rounded-md shrink-0 ml-2">
                        You
                      </span>
                    </div>
                  ) : (
                    <select
                      value={selectedAgentId}
                      onChange={(e) => handleAgentChange(e.target.value)}
                      disabled={activeAgents.length === 0 && !inactiveAssignedAgent}
                      className={`w-full h-11 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#4f46e5] transition-all ${
                        activeAgents.length === 0 && !inactiveAssignedAgent
                          ? 'bg-slate-50/70 text-slate-400 cursor-not-allowed'
                          : 'bg-white text-[#1e293b] cursor-pointer'
                      }`}
                    >
                      {activeAgents.length === 0 && !inactiveAssignedAgent ? (
                        <option value="">No Agents Available</option>
                      ) : (
                        <>
                          <option value="">Select an Agent (Optional)</option>
                          {inactiveAssignedAgent && (
                            <option value={inactiveAssignedAgent.id}>
                              {inactiveAssignedAgent.fullName} (Inactive)
                            </option>
                          )}
                          {activeAgents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.fullName}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  )}
                </div>

                {/* Line Dropdown */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Line <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={collectionLine}
                    onChange={(e) => setCollectionLine(e.target.value)}
                    disabled={activeLines.length === 0 && !inactiveAssignedLine}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {activeLines.length === 0 && !inactiveAssignedLine ? (
                      <option value="" disabled>
                        No collection lines available — Create a Line in Profile → Collection Lines
                      </option>
                    ) : (
                      <>
                        {activeLines.map((line) => (
                          <option key={line.id} value={line.name}>
                            {line.name}
                          </option>
                        ))}
                        {inactiveAssignedLine && !activeLines.some((l) => l.name === inactiveAssignedLine) && (
                          <option value={inactiveAssignedLine}>
                            {inactiveAssignedLine} (Inactive)
                          </option>
                        )}
                      </>
                    )}
                  </select>
                  {errors.collectionLine && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionLine}</p>
                  )}
                </div>

                {/* Collection Method Dropdown */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Collection Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={collectionMethod}
                    onChange={(e) => setCollectionMethod(e.target.value as CollectionMethod)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                  >
                    {COLLECTION_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                  {errors.collectionMethod && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionMethod}</p>
                  )}
                </div>

                {/* Parcel Token Mode */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Parcel Token Mode
                  </label>
                  <div className="flex items-center gap-2.5 h-11">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={parcelTokenMode}
                      onClick={() => setParcelTokenMode(!parcelTokenMode)}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                        parcelTokenMode ? 'bg-[#4f46e5]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                          parcelTokenMode ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-xs font-semibold text-[#64748b]">
                      {parcelTokenMode ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial Amounts: Loan Amount | Agent Commission | Deducted Amount | Expected Return */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 items-start">
                {/* 1. Loan Amount */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5 whitespace-nowrap">
                    Loan Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="e.g. 10000"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                  />
                  {errors.loanAmount && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.loanAmount}</p>
                  )}
                </div>

                {/* 2. Agent Commission */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5 whitespace-nowrap">
                    Agent Commission (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={agentCommission}
                    onChange={(e) => {
                      setAgentCommission(e.target.value);
                      if (errors.agentCommission || errors.deductedAmount) {
                        setErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.agentCommission;
                          delete copy.deductedAmount;
                          return copy;
                        });
                      }
                    }}
                    placeholder="e.g. 300"
                    className={`w-full h-11 px-3.5 rounded-xl border ${
                      errors.agentCommission ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm text-[#1e293b] font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all`}
                  />
                  {errors.agentCommission && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.agentCommission}</p>
                  )}
                </div>

                {/* 3. Deducted Amount */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5 whitespace-nowrap">
                    Deducted Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={deductedAmount}
                    onChange={(e) => {
                      setDeductedAmount(e.target.value);
                      if (errors.agentCommission || errors.deductedAmount) {
                        setErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.agentCommission;
                          delete copy.deductedAmount;
                          return copy;
                        });
                      }
                    }}
                    placeholder="e.g. 400"
                    className={`w-full h-11 px-3.5 rounded-xl border ${
                      errors.deductedAmount ? 'border-red-400 bg-red-50/20' : 'border-slate-200'
                    } text-sm text-[#1e293b] font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all`}
                  />
                  {errors.deductedAmount && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.deductedAmount}</p>
                  )}
                </div>

                {/* 4. Expected Return */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5 whitespace-nowrap">
                    Expected Return (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    placeholder="e.g. 10500"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                  />
                  {errors.expectedReturn && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.expectedReturn}</p>
                  )}
                </div>
              </div>

              {/* Interest Rate, Dynamic Collection Day/Date, Payment Date, Due Start Date, Due End Date */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${financeType === 'Daily' ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-4`}>
                {/* Interest Rate (AUTO-CALCULATED) */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Interest Rate (%)
                  </label>
                  <div className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-[#1e293b] font-semibold flex items-center select-none">
                    {calculatedInterestRate || (
                      <span className="text-slate-400 font-normal">Auto-calculated</span>
                    )}
                  </div>
                </div>

                {/* Dynamic Collection Day (Weekly) */}
                {financeType === 'Weekly' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                      Collection Day <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={weeklyCollectionDay}
                      onChange={(e) => handleWeeklyCollectionDayChange(parseInt(e.target.value, 10))}
                      className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                    >
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                      <option value={7}>Sunday</option>
                    </select>
                    {errors.weeklyCollectionDay && (
                      <p className="text-xs text-red-500 mt-1 font-medium">{errors.weeklyCollectionDay}</p>
                    )}
                  </div>
                )}

                {/* Dynamic Collection Date (Monthly) */}
                {financeType === 'Monthly' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                      Collection Date <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={monthlyCollectionDay}
                      onChange={(e) => handleMonthlyCollectionDayChange(parseInt(e.target.value, 10))}
                      className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {errors.monthlyCollectionDay && (
                      <p className="text-xs text-red-500 mt-1 font-medium">{errors.monthlyCollectionDay}</p>
                    )}
                  </div>
                )}

                {/* Payment Date (Loan Disbursement Date - Optional / Editable) */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDateIso}
                    onChange={(e) => handlePaymentDateChange(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                  />
                  <p className="text-[11px] text-[#64748b] mt-1 font-medium">
                    Selected: <span className="text-[#1e293b] font-semibold">{formattedPaymentDate || '—'}</span>
                  </p>
                  {errors.paymentDate && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.paymentDate}</p>
                  )}
                </div>

                {/* Due Start Date */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Due Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDateIso}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                  />
                  <p className="text-[11px] text-[#64748b] mt-1 font-medium">
                    Selected: <span className="text-[#1e293b] font-semibold">{formattedStartDate || '—'}</span>
                  </p>
                  {errors.startDate && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.startDate}</p>
                  )}
                </div>

                {/* Due End Date (AUTO-CALCULATED) */}
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Due End Date
                  </label>
                  <div className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-[#1e293b] font-semibold flex items-center select-none">
                    {calculatedEndDate || <span className="text-slate-400 font-normal">Auto-calculated</span>}
                  </div>
                  <p className="text-[11px] text-[#64748b] mt-1">
                    Inclusive count ({repaymentDuration})
                  </p>
                </div>
              </div>

              {/* Existing Loan Checkbox */}
              <div className="flex items-center pt-2">
                <input
                  id="edit-existing-loan-checkbox"
                  type="checkbox"
                  checked={isExistingLoan}
                  onChange={(e) => setIsExistingLoan(e.target.checked)}
                  className="w-4 h-4 rounded text-[#4f46e5] border-slate-300 focus:ring-[#4f46e5] accent-[#4f46e5] cursor-pointer"
                />
                <label
                  htmlFor="edit-existing-loan-checkbox"
                  className="ml-2.5 text-xs sm:text-sm font-medium text-[#475569] cursor-pointer select-none"
                >
                  This is an existing loan (manage past payments after saving)
                </label>
              </div>
            </div>

            {/* Highlighted Bottom Summary: Net Amount Given */}
            <div className="p-4 rounded-xl bg-[#f5f6ff] border border-[#e0e7ff] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs sm:text-sm font-semibold text-[#64748b] block">
                  Summary Calculation:
                </span>
                {totalPaid > 0 && (
                  <span className="text-xs font-semibold text-emerald-700 block">
                    Total Collected So Far: ₹{totalPaid.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <span className="text-sm sm:text-base font-bold text-[#4f46e5]">
                Net Amount Given: ₹{calculatedNetAmountGiven.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-11 px-5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.99] transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 px-6 rounded-xl bg-[#4f46e5] text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center gap-1.5 disabled:opacity-50"
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
                  {parsedLoanAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Agent Commission:</span>
                <span className="font-semibold text-slate-800">
                  ₹{(borrower.agentCommission || 0).toLocaleString('en-IN')} → ₹
                  {parsedAgentCommission.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deducted Amount:</span>
                <span className="font-semibold text-slate-800">
                  ₹{(borrower.deductedAmount || 0).toLocaleString('en-IN')} → ₹
                  {parsedDeductedAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Net Amount Given:</span>
                <span className="font-semibold text-slate-800">
                  ₹{(borrower.netAmountGiven ?? Math.max(0, (borrower.loanAmount || borrower.amount || 0) - (borrower.deductedAmount || 0) - (borrower.agentCommission || 0))).toLocaleString('en-IN')} → ₹
                  {calculatedNetAmountGiven.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Return:</span>
                <span className="font-semibold text-slate-800">
                  ₹{(borrower.expectedReturn || 0).toLocaleString('en-IN')} → ₹
                  {parseFloat(expectedReturn || '0').toLocaleString('en-IN')}
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
