import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Phone, Upload, Trash2, Plus, AlertCircle, FileText, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { validateBorrowerDocumentFile, uploadBorrowerDocument, formatFileSize } from '../utils/documentStorage';
import { calculateBorrowerEndDate, parseCustomDate } from '../utils/loanCalculations';
import { COLLECTION_METHODS } from '../types';
import type { Timeframe, Borrower, NewBorrowerInput, CollectionMethod } from '../types';

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
  Monthly: ['1 Month', '2 Months', '3 Months', '6 Months', '9 Months', '12 Months', '24 Months'],
};

// Helper to get today in YYYY-MM-DD for <input type="date">
function getTodayIsoDate(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const AddBorrowerModal: React.FC<AddBorrowerModalProps> = ({
  isOpen,
  onClose,
  initialBorrower,
  onUpdate,
}) => {
  const { addBorrower, timeframe, borrowers, agents, settings, collectionLines, currentUser, currentRole, isCloudAuth } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active collection lines for borrower assignment
  const activeLines = useMemo(
    () => collectionLines.filter((l) => l.status === 'active'),
    [collectionLines]
  );

  // Determine initial default finance type from settings or timeframe
  const defaultType = settings?.defaultFinanceType || timeframe || 'Daily';

  // Form Fields
  const [bookNo, setBookNo] = useState<string>('');
  const [borrowerName, setBorrowerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [alternatePhoneNumber, setAlternatePhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [financeType, setFinanceType] = useState<Timeframe>(defaultType);
  const [weeklyCollectionDay, setWeeklyCollectionDay] = useState<number>(1); // 1 = Monday ... 7 = Sunday
  const [monthlyCollectionDay, setMonthlyCollectionDay] = useState<number>(1); // 1 .. 31
  const [collectionLine, setCollectionLine] = useState<string>('');
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>('Hand Cash');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agentCommission, setAgentCommission] = useState('0');
  const [parcelTokenMode, setParcelTokenMode] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [deductedAmount, setDeductedAmount] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [repaymentDuration, setRepaymentDuration] = useState('50 Days');
  const [startDateIso, setStartDateIso] = useState(getTodayIsoDate());
  const [isExistingLoan, setIsExistingLoan] = useState(false);

  // Documents state (Optional multi-document upload)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [docUploadStatus, setDocUploadStatus] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Used Book Numbers in current company (excluding the initialBorrower being edited, if any)
  const usedBookNos = useMemo(() => {
    const set = new Set<number>();
    for (const b of borrowers) {
      if (b.bookNo !== null && b.bookNo !== undefined) {
        if (initialBorrower && b.id === initialBorrower.id) continue;
        set.add(b.bookNo);
      }
    }
    return set;
  }, [borrowers, initialBorrower]);

  // Active agents available for assignment
  const activeAgents = useMemo(() => agents.filter((a) => a.status === 'active'), [agents]);

  // Check if initialBorrower is assigned to an agent that was deactivated later
  const inactiveAssignedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    const found = agents.find((a) => a.id === selectedAgentId);
    return found && found.status === 'inactive' ? found : null;
  }, [selectedAgentId, agents]);

  // Check if initialBorrower has a collection line that was deactivated later
  const inactiveAssignedLine = useMemo(() => {
    const lineName = initialBorrower?.collectionLine;
    if (!lineName) return null;
    const isPresentInActive = activeLines.some((l) => l.name === lineName);
    return !isPresentInActive ? lineName : null;
  }, [initialBorrower, activeLines]);

  // Reset or sync when opened
  useEffect(() => {
    if (isOpen) {
      if (initialBorrower) {
        setBookNo(initialBorrower.bookNo !== null && initialBorrower.bookNo !== undefined ? String(initialBorrower.bookNo) : '');
        setBorrowerName(initialBorrower.borrowerName || initialBorrower.name || '');
        setPhoneNumber(initialBorrower.phoneNumber || initialBorrower.phone || '');
        setAlternatePhoneNumber(initialBorrower.alternatePhoneNumber || '');
        setAddress(initialBorrower.address || '');
        setFinanceType(initialBorrower.financeType || 'Daily');
        const parsedStart = parseCustomDate(initialBorrower.startDate);
        const startDay1to7 = parsedStart ? (parsedStart.getDay() === 0 ? 7 : parsedStart.getDay()) : 1;
        setWeeklyCollectionDay(initialBorrower.weeklyCollectionDay || startDay1to7);
        setMonthlyCollectionDay(initialBorrower.monthlyCollectionDay || (parsedStart ? parsedStart.getDate() : 1));
        setCollectionLine(initialBorrower.collectionLine || activeLines[0]?.name || '');
        setCollectionMethod((initialBorrower.collectionMethod as CollectionMethod) || 'Hand Cash');
        const targetAgentId = currentRole === 'agent' && currentUser?.companyUserId
          ? currentUser.companyUserId
          : (initialBorrower.agentId || '');
        setSelectedAgentId(targetAgentId);
        setAgentCommission(
          initialBorrower.agentCommission !== undefined
            ? initialBorrower.agentCommission.toString()
            : (targetAgentId ? '500' : '0')
        );
        setParcelTokenMode(Boolean(initialBorrower.parcelTokenMode));
        setLoanAmount((initialBorrower.loanAmount || initialBorrower.amount || '').toString());
        setDeductedAmount((initialBorrower.deductedAmount || '0').toString());
        setExpectedReturn((initialBorrower.expectedReturn || '').toString());
        setRepaymentDuration(initialBorrower.repaymentDuration || '50 Days');
        setIsExistingLoan(Boolean(initialBorrower.isExistingLoan));
      } else {
        const initialType = settings?.defaultFinanceType || timeframe || 'Daily';
        const todayIso = getTodayIsoDate();
        const todayD = new Date();
        const todayDay1to7 = todayD.getDay() === 0 ? 7 : todayD.getDay();
        setBookNo('');
        setBorrowerName('');
        setPhoneNumber('');
        setAlternatePhoneNumber('');
        setAddress('');
        setFinanceType(initialType);
        setWeeklyCollectionDay(todayDay1to7);
        setMonthlyCollectionDay(todayD.getDate());
        setCollectionLine(activeLines[0]?.name || '');
        setCollectionMethod('Hand Cash');
        const initialDurations = DURATION_OPTIONS[initialType];
        setRepaymentDuration(initialDurations[1] || initialDurations[0]);
        setStartDateIso(todayIso);
        const targetAgentId = currentRole === 'agent' && currentUser?.companyUserId
          ? currentUser.companyUserId
          : '';
        setSelectedAgentId(targetAgentId);
        setAgentCommission('0');
        setLoanAmount('');
        setDeductedAmount('');
        setExpectedReturn('');
        setParcelTokenMode(false);
        setIsExistingLoan(false);
      }
      setSelectedFiles([]);
      setUploadingDocs(false);
      setDocUploadStatus(null);
      setFileError(null);
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
    if (newType === 'Weekly' && !initialBorrower) {
      const parsed = parseCustomDate(startDateIso);
      if (parsed) {
        const jsDay = parsed.getDay();
        setWeeklyCollectionDay(jsDay === 0 ? 7 : jsDay);
      }
    }
  };

  // When agent selection changes, auto-set default commission
  const handleAgentChange = (newAgentId: string) => {
    setSelectedAgentId(newAgentId);
    if (newAgentId) {
      // If setting an agent and current commission is 0 or empty, default to 500
      if (!agentCommission || parseFloat(agentCommission) === 0) {
        setAgentCommission('500');
      }
    } else {
      // If agent is removed, reset commission to 0
      setAgentCommission('0');
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

  // Net Amount Given calculation: Loan Amount - Deducted Amount - Agent Commission
  const calculatedNetAmountGiven = useMemo(() => {
    const loan = parseFloat(loanAmount) || 0;
    const deducted = parseFloat(deductedAmount) || 0;
    const commission = parseFloat(agentCommission) || 0;
    const net = Math.max(0, loan - deducted - commission);
    return net;
  }, [loanAmount, deductedAmount, agentCommission]);

  // End Date calculation
  const calculatedEndDate = useMemo(() => {
    return calculateBorrowerEndDate(
      startDateIso,
      financeType,
      repaymentDuration,
      financeType === 'Weekly' ? weeklyCollectionDay : null,
      financeType === 'Monthly' ? monthlyCollectionDay : null
    );
  }, [startDateIso, financeType, repaymentDuration, weeklyCollectionDay, monthlyCollectionDay]);

  // Formatted start date for display
  const formattedStartDate = useMemo(() => {
    if (!startDateIso) return '';
    const [y, m, d] = startDateIso.split('-');
    return `${d}/${m}/${y}`;
  }, [startDateIso]);

  if (!isOpen) return null;

  const validate = () => {
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

    const deductedVal = parseFloat(deductedAmount || '0');
    if (!isNaN(loanVal) && !isNaN(deductedVal) && deductedVal > loanVal) {
      newErrors.deductedAmount = 'Deducted amount cannot exceed loan amount';
    } else if (deductedVal < 0) {
      newErrors.deductedAmount = 'Deducted amount cannot be negative';
    }

    const commissionVal = parseFloat(agentCommission || '0');
    if (isNaN(commissionVal) || commissionVal < 0) {
      newErrors.agentCommission = 'Agent Commission cannot be negative';
    } else if (!isNaN(loanVal) && !isNaN(deductedVal) && (deductedVal + commissionVal > loanVal)) {
      newErrors.agentCommission = 'Total deductions (Deducted Amount + Commission) cannot exceed Loan Amount';
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
      newErrors.collectionLine = 'No collection lines available. Please create a Collection Line first in Profile → Collection Lines.';
    } else if (!collectionLine || !collectionLine.trim()) {
      newErrors.collectionLine = 'Please select a valid Line';
    } else {
      const validLineNames = [
        ...activeLines.map((l) => l.name),
        ...(inactiveAssignedLine ? [inactiveAssignedLine] : []),
      ];
      if (!validLineNames.includes(collectionLine)) {
        newErrors.collectionLine = 'Please select a valid Line';
      }
    }

    if (!collectionMethod || !COLLECTION_METHODS.includes(collectionMethod)) {
      newErrors.collectionMethod = 'Please select a valid Collection Method';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle document file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((file) => {
      const validation = validateBorrowerDocumentFile(file);
      if (!validation.isValid) {
        errors.push(validation.error || `Invalid file "${file.name}"`);
      } else {
        // Prevent exact duplicates by name and size
        const isDuplicate =
          selectedFiles.some((f) => f.name === file.name && f.size === file.size) ||
          newFiles.some((f) => f.name === file.name && f.size === file.size);

        if (!isDuplicate) {
          newFiles.push(file);
        }
      }
    });

    if (errors.length > 0) {
      setFileError(errors[0]);
    }

    if (newFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }

    // Reset native input value so selecting the same file again works
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const numBookNo = parseInt(bookNo, 10);
    const loanVal = parseFloat(loanAmount);
    const deductedVal = parseFloat(deductedAmount || '0');
    const commissionVal = parseFloat(agentCommission || '0');
    const expReturnVal = parseFloat(expectedReturn);
    const interestVal = parseFloat(calculatedInterestRate?.replace('%', '') || '0');

    const targetAgentId = currentRole === 'agent' && currentUser?.companyUserId
      ? currentUser.companyUserId
      : (selectedAgentId ? selectedAgentId : null);

    const payload: NewBorrowerInput = {
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
      agentId: targetAgentId,
      agentCommission: commissionVal,
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
        setErrors((prev) => ({ ...prev, general: res.error || 'Failed to save borrower to cloud' }));
        return;
      }

      // Safe secondary upload for selected documents if any
      if (res?.borrowerId && selectedFiles.length > 0 && isCloudAuth && currentUser && supabase) {
        setUploadingDocs(true);
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setDocUploadStatus(`Uploading document ${i + 1} of ${selectedFiles.length}...`);
          const uploadRes = await uploadBorrowerDocument({
            supabase,
            companyId: currentUser.companyId,
            borrowerId: res.borrowerId,
            file,
            userId: currentUser.companyUserId,
          });
          if (!uploadRes.success) {
            console.error(`Failed to upload document "${file.name}":`, uploadRes.error);
          }
        }
        setUploadingDocs(false);
        setDocUploadStatus(null);
      }
    }

    // Reset and close
    setBookNo('');
    setBorrowerName('');
    setPhoneNumber('');
    setAlternatePhoneNumber('');
    setAddress('');
    setSelectedAgentId('');
    setAgentCommission('0');
    setLoanAmount('');
    setDeductedAmount('');
    setExpectedReturn('');
    setSelectedFiles([]);
    setUploadingDocs(false);
    setDocUploadStatus(null);
    setFileError(null);
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
          {/* Server / General Error Alert */}
          {errors.general && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs sm:text-sm font-medium animate-in fade-in">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{errors.general}</span>
            </div>
          )}

          {/* Section 1: Basic Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
              Borrower Details
            </h3>

            {/* Row 1: Book No, Borrower Name, Phone Number, Alternate Phone (4 Columns on Desktop) */}
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

            {/* Finance Type, Dynamic Schedule, Assign to Agent, Agent Commission, Parcel Token Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
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

              {/* Dynamic Collection Day (Weekly) */}
              {financeType === 'Weekly' && (
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                    Collection Day <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={weeklyCollectionDay}
                    onChange={(e) => setWeeklyCollectionDay(parseInt(e.target.value, 10))}
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
                    onChange={(e) => setMonthlyCollectionDay(parseInt(e.target.value, 10))}
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

              {/* Assign to Agent */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Assign to Agent
                </label>
                {currentRole === 'agent' ? (
                  <div className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-[#1e293b] font-medium flex items-center justify-between select-none">
                    <span className="truncate">{currentUser?.fullName || 'Assigned to You'}</span>
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

              {/* Agent Commission */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Agent Commission (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={agentCommission}
                  onChange={(e) => setAgentCommission(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] transition-all"
                />
                {errors.agentCommission && (
                  <p className="text-xs text-red-500 mt-1 font-medium">{errors.agentCommission}</p>
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
                  onChange={(e) => {
                    const newIso = e.target.value;
                    setStartDateIso(newIso);
                    if (!initialBorrower && newIso) {
                      const parsed = parseCustomDate(newIso);
                      if (parsed) {
                        const jsDay = parsed.getDay();
                        setWeeklyCollectionDay(jsDay === 0 ? 7 : jsDay);
                        setMonthlyCollectionDay(parsed.getDate());
                      }
                    }
                  }}
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

          {/* Section 3: Documents (Optional) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#4f46e5]">
                  Documents (Optional)
                </h3>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Upload borrower documents if available (PDF, JPG, PNG — Max 10MB per file)
                </p>
              </div>
            </div>

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Error message for invalid file */}
            {fileError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{fileError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFileError(null)}
                  className="text-red-400 hover:text-red-700 ml-1"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Selected Documents List */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${file.size}-${idx}`}
                    className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm text-[#1e293b] hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-[#4f46e5] flex items-center justify-center shrink-0">
                        {file.type === 'application/pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-slate-800 truncate">{file.name}</p>
                        <p className="text-[11px] text-slate-400">{formatFileSize(file.size)}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="px-2.5 py-1 text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all flex items-center gap-1 shrink-0"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons: Upload Document OR + Add Another Document */}
            {selectedFiles.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto h-10 px-4 rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/50 hover:bg-indigo-50 text-[#4f46e5] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                <Upload size={16} />
                <span>Upload Document</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3.5 rounded-xl border border-slate-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/40 text-[#4f46e5] text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.99]"
              >
                <Plus size={15} />
                <span>+ Add Another Document</span>
              </button>
            )}

            {/* Upload progress during submission */}
            {uploadingDocs && (
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center gap-2.5 text-xs text-[#4f46e5] font-semibold animate-pulse">
                <Upload size={15} className="animate-spin" />
                <span>{docUploadStatus || 'Uploading borrower documents...'}</span>
              </div>
            )}
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
