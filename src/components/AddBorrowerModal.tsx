import React, { useState, useEffect, useMemo } from 'react';
import { X, Phone } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Timeframe, Borrower, NewBorrowerInput } from '../types';

interface AddBorrowerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBorrower?: Borrower | null;
  onUpdate?: (borrowerId: string, data: Partial<NewBorrowerInput>) => void;
}

// Duration options per finance type
const DURATION_OPTIONS: Record<Timeframe, string[]> = {
  Daily: ['30 Days', '50 Days', '60 Days', '90 Days', '100 Days'],
  Weekly: ['10 Weeks', '12 Weeks', '15 Weeks', '20 Weeks'],
  Monthly: ['3 Months', '6 Months', '9 Months', '12 Months', '24 Months'],
};

// Helper to format Date object into DD/MM/YYYY
function formatDateDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Helper to get today in YYYY-MM-DD for <input type="date">
function getTodayIsoDate(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Calculate end date based on Start Date (YYYY-MM-DD), Finance Type, and Repayment Duration
function calculateEndDate(startDateIso: string, financeType: Timeframe, durationStr: string): string {
  if (!startDateIso || !durationStr) return '';

  const [yearStr, monthStr, dayStr] = startDateIso.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  if (isNaN(year) || isNaN(monthIndex) || isNaN(day)) return '';

  const date = new Date(year, monthIndex, day);
  const numMatch = durationStr.match(/\d+/);
  const count = numMatch ? parseInt(numMatch[0], 10) : 0;

  if (count <= 0) return '';

  if (financeType === 'Daily') {
    // Inclusive: Start Date + (Duration - 1 days)
    date.setDate(date.getDate() + (count - 1));
  } else if (financeType === 'Weekly') {
    // Inclusive: Start Date + (count * 7 - 1 days)
    date.setDate(date.getDate() + (count * 7 - 1));
  } else if (financeType === 'Monthly') {
    // Start Date + count months - 1 day
    date.setMonth(date.getMonth() + count);
    date.setDate(date.getDate() - 1);
  }

  return formatDateDDMMYYYY(date);
}

export const AddBorrowerModal: React.FC<AddBorrowerModalProps> = ({
  isOpen,
  onClose,
  initialBorrower,
  onUpdate,
}) => {
  const { addBorrower, timeframe, agents, settings } = useApp();

  // Determine initial default finance type from settings or timeframe
  const defaultType = settings?.defaultFinanceType || timeframe || 'Daily';

  // Form Fields
  const [borrowerName, setBorrowerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [financeType, setFinanceType] = useState<Timeframe>(defaultType);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [parcelTokenMode, setParcelTokenMode] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [deductedAmount, setDeductedAmount] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [repaymentDuration, setRepaymentDuration] = useState('50 Days');
  const [startDateIso, setStartDateIso] = useState(getTodayIsoDate());
  const [isExistingLoan, setIsExistingLoan] = useState(false);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Active agents available for assignment
  const activeAgents = useMemo(() => agents.filter((a) => a.status === 'active'), [agents]);

  // Check if initialBorrower is assigned to an agent that was deactivated later
  const inactiveAssignedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    const found = agents.find((a) => a.id === selectedAgentId);
    return found && found.status === 'inactive' ? found : null;
  }, [selectedAgentId, agents]);

  // Reset or sync when opened
  useEffect(() => {
    if (isOpen) {
      if (initialBorrower) {
        setBorrowerName(initialBorrower.borrowerName || initialBorrower.name || '');
        setPhoneNumber(initialBorrower.phoneNumber || initialBorrower.phone || '');
        setAlternatePhoneNumber(initialBorrower.alternatePhoneNumber || '');
        setAddress(initialBorrower.address || '');
        setFinanceType(initialBorrower.financeType || 'Daily');
        setSelectedAgentId(initialBorrower.agentId || '');
        setParcelTokenMode(Boolean(initialBorrower.parcelTokenMode));
        setLoanAmount((initialBorrower.loanAmount || initialBorrower.amount || '').toString());
        setDeductedAmount((initialBorrower.deductedAmount || '0').toString());
        setExpectedReturn((initialBorrower.expectedReturn || '').toString());
        setRepaymentDuration(initialBorrower.repaymentDuration || '50 Days');
        setIsExistingLoan(Boolean(initialBorrower.isExistingLoan));
      } else {
        const initialType = settings?.defaultFinanceType || timeframe || 'Daily';
        setBorrowerName('');
        setPhoneNumber('');
        setAlternatePhoneNumber('');
        setAddress('');
        setFinanceType(initialType);
        const initialDurations = DURATION_OPTIONS[initialType];
        setRepaymentDuration(initialDurations[1] || initialDurations[0]);
        setStartDateIso(getTodayIsoDate());
        setSelectedAgentId('');
        setLoanAmount('');
        setDeductedAmount('');
        setExpectedReturn('');
        setParcelTokenMode(false);
        setIsExistingLoan(false);
      }
      setErrors({});
    }
  }, [isOpen, timeframe, initialBorrower, settings?.defaultFinanceType]);

  // When financeType changes, adjust repaymentDuration default
  const handleFinanceTypeChange = (newType: Timeframe) => {
    setFinanceType(newType);
    const options = DURATION_OPTIONS[newType];
    if (!options.includes(repaymentDuration)) {
      setRepaymentDuration(options[1] || options[0]);
    }
  };

  // Interest calculation
  const calculatedInterestRate = useMemo(() => {
    const loan = parseFloat(loanAmount);
    const expReturn = parseFloat(expectedReturn);

    if (isNaN(loan) || isNaN(expReturn) || loan <= 0 || expReturn < loan) {
      return null;
    }

    const rate = ((expReturn - loan) / loan) * 100;
    // Format nicely without excessive trailing decimals
    return Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(2)}%`;
  }, [loanAmount, expectedReturn]);

  // Net Amount Given calculation
  const calculatedNetAmountGiven = useMemo(() => {
    const loan = parseFloat(loanAmount) || 0;
    const deducted = parseFloat(deductedAmount) || 0;
    const net = Math.max(0, loan - deducted);
    return net;
  }, [loanAmount, deductedAmount]);

  // End Date calculation
  const calculatedEndDate = useMemo(() => {
    return calculateEndDate(startDateIso, financeType, repaymentDuration);
  }, [startDateIso, financeType, repaymentDuration]);

  // Formatted start date for display
  const formattedStartDate = useMemo(() => {
    if (!startDateIso) return '';
    const [y, m, d] = startDateIso.split('-');
    return `${d}/${m}/${y}`;
  }, [startDateIso]);

  if (!isOpen) return null;

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

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

    const deductedVal = parseFloat(deductedAmount || '0');
    if (!isNaN(loanVal) && !isNaN(deductedVal) && deductedVal > loanVal) {
      newErrors.deductedAmount = 'Deducted amount cannot exceed loan amount';
    } else if (deductedVal < 0) {
      newErrors.deductedAmount = 'Deducted amount cannot be negative';
    }

    const expReturnVal = parseFloat(expectedReturn);
    if (!expectedReturn.trim() || isNaN(expReturnVal) || expReturnVal <= 0) {
      newErrors.expectedReturn = 'Expected Return is required';
    } else if (!isNaN(loanVal) && expReturnVal < loanVal) {
      newErrors.expectedReturn = 'Expected Return must be greater than or equal to Loan Amount';
    }

    if (!repaymentDuration) {
      newErrors.repaymentDuration = 'Repayment Duration is required';
    }

    if (!startDateIso) {
      newErrors.startDate = 'Start Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const loanVal = parseFloat(loanAmount);
    const deductedVal = parseFloat(deductedAmount || '0');
    const expReturnVal = parseFloat(expectedReturn);
    const interestVal = parseFloat(calculatedInterestRate?.replace('%', '') || '0');

    const payload: NewBorrowerInput = {
      borrowerName: borrowerName.trim(),
      phoneNumber: phoneNumber.trim(),
      alternatePhoneNumber: alternatePhoneNumber.trim() || undefined,
      address: address.trim() || undefined,
      financeType,
      agentId: selectedAgentId ? selectedAgentId : null,
      parcelTokenMode,
      loanAmount: loanVal,
      deductedAmount: deductedVal,
      netAmountGiven: calculatedNetAmountGiven,
      expectedReturn: expReturnVal,
      interestRate: interestVal,
      repaymentDuration,
      startDate: formattedStartDate,
      endDate: calculatedEndDate,
      isExistingLoan,
    };

    if (initialBorrower && onUpdate) {
      onUpdate(initialBorrower.id, payload);
    } else {
      const res = await addBorrower(payload);
      if (res && !res.success) {
        setErrors(prev => ({ ...prev, general: res.error || 'Failed to save borrower to cloud' }));
        return;
      }
    }

    // Reset and close
    setBorrowerName('');
    setPhoneNumber('');
    setAlternatePhoneNumber('');
    setAddress('');
    setSelectedAgentId('');
    setLoanAmount('');
    setDeductedAmount('');
    setExpectedReturn('');
    setParcelTokenMode(false);
    setIsExistingLoan(false);
    setErrors({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm">
      {/* Modal Container: centered, 700px - 800px width on desktop, max-h 85-90vh */}
      <div className="w-full max-w-[760px] max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header - Fixed at Top */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1e293b]">
              Add New Borrower
            </h2>
            <p className="text-xs text-[#64748b] mt-0.5">
              Enter loan details and borrower information
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

        {/* Modal Body - Vertically Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
              Borrower Details
            </h3>

            {/* 1. Borrower Name */}
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

            {/* 2 & 3. Phone & Alternate Phone (2 Columns on Desktop) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 2. Phone Number */}
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

              {/* 3. Alternate Phone Number */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Alternate Phone Number (Optional)
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

            {/* 4. Address */}
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

            {/* 5, 6, 7. Finance Type, Assign to Agent, Parcel Token Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
              {/* 5. Finance Type */}
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

              {/* 6. Assign to Agent */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Assign to Agent
                </label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
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
              </div>

              {/* 7. Parcel Token Mode */}
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

            {/* 8, 9, 10, 11: Amounts & Interest Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 8. Loan Amount */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Loan Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="e.g. 10,000"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] transition-all"
                />
                {errors.loanAmount && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.loanAmount}</p>
                )}
              </div>

              {/* 9. Deducted Amount */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Deducted Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={deductedAmount}
                  onChange={(e) => setDeductedAmount(e.target.value)}
                  placeholder="e.g. 200"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] transition-all"
                />
                {errors.deductedAmount && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.deductedAmount}</p>
                )}
              </div>

              {/* 10. Expected Return */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Expected Return (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={expectedReturn}
                  onChange={(e) => setExpectedReturn(e.target.value)}
                  placeholder="e.g. 10,500"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] transition-all"
                />
                {errors.expectedReturn && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.expectedReturn}</p>
                )}
              </div>

              {/* 11. Interest Rate (AUTO-CALCULATED) */}
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
            </div>

            {/* 12, 13, 14: Duration, Start Date, End Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* 12. Repayment Duration */}
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

              {/* 13. Start Date */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={startDateIso}
                  onChange={(e) => setStartDateIso(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] transition-all cursor-pointer"
                />
                <p className="text-[11px] text-[#64748b] mt-1 font-medium">
                  Selected: <span className="text-[#1e293b] font-semibold">{formattedStartDate}</span>
                </p>
                {errors.startDate && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.startDate}</p>
                )}
              </div>

              {/* 14. End Date (AUTO-CALCULATED) */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  End Date
                </label>
                <div className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-[#1e293b] font-semibold flex items-center select-none">
                  {calculatedEndDate || <span className="text-slate-400 font-normal">Auto-calculated</span>}
                </div>
                <p className="text-[11px] text-[#64748b] mt-1">
                  Inclusive count ({repaymentDuration})
                </p>
              </div>
            </div>

            {/* 15. Existing Loan Checkbox */}
            <div className="flex items-center pt-2">
              <input
                id="existing-loan-checkbox"
                type="checkbox"
                checked={isExistingLoan}
                onChange={(e) => setIsExistingLoan(e.target.checked)}
                className="w-4 h-4 rounded text-[#4f46e5] border-slate-300 focus:ring-[#4f46e5] accent-[#4f46e5] cursor-pointer"
              />
              <label
                htmlFor="existing-loan-checkbox"
                className="ml-2.5 text-xs sm:text-sm font-medium text-[#475569] cursor-pointer select-none"
              >
                This is an existing loan (manage past payments after saving)
              </label>
            </div>
          </div>

          {/* Highlighted Bottom Summary: Net Amount Given */}
          <div className="p-4 rounded-xl bg-[#f5f6ff] border border-[#e0e7ff] flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-[#64748b]">
              Summary Calculation:
            </span>
            <span className="text-sm sm:text-base font-bold text-[#4f46e5]">
              Net Amount Given: ₹{calculatedNetAmountGiven.toLocaleString('en-IN')}
            </span>
          </div>

          {/* Bottom Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.99] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-11 px-6 rounded-xl bg-[#4f46e5] text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all"
            >
              Add Borrower
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
