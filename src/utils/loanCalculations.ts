import type { Borrower, PaymentRecord, Timeframe } from '../types';

// ==========================================
// DATE UTILITIES (Local Date Safe)
// ==========================================

export function getTodayIsoDate(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseCustomDate(dateStr: unknown): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) {
    const [d, m, y] = trimmed.split('/');
    const day = parseInt(d, 10);
    const monthIndex = parseInt(m, 10) - 1;
    const year = parseInt(y, 10);
    if (isNaN(day) || isNaN(monthIndex) || isNaN(year)) return null;
    const dt = new Date(year, monthIndex, day);
    return isNaN(dt.getTime()) ? null : dt;
  }
  if (trimmed.includes('-')) {
    const [y, m, d] = trimmed.split('-');
    const year = parseInt(y, 10);
    const monthIndex = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    if (isNaN(day) || isNaN(monthIndex) || isNaN(year)) return null;
    const dt = new Date(year, monthIndex, day);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDisplayDate(isoOrFormatted: string): string {
  if (!isoOrFormatted) return '';
  const d = parseCustomDate(isoOrFormatted);
  if (!d) return isoOrFormatted;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd} ${mmm} ${yyyy}`;
}

// ==========================================
// REPAYMENT SCHEDULE & INSTALLMENT TYPES
// ==========================================

export interface ScheduledInstallment {
  installmentIndex: number; // 1-based index
  dueDateIso: string;       // YYYY-MM-DD
  scheduledAmount: number;  // expected installment amount
}

export interface AllocatedInstallment extends ScheduledInstallment {
  paidAmount: number;
  pendingAmount: number;
  isFullyPaid: boolean;
  isOverdue: boolean;       // due date is strictly in the past and pendingAmount > 0
  paidDateIso?: string;     // payment date when it was settled (or latest partial)
  delayDays: number;        // days delayed if paid after due date (0 if on-time or unpaid)
  isOnTime: boolean;        // fully paid on or before dueDateIso
}

export const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export function formatOrdinalDay(day: number): string {
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

export function formatCollectionSchedule(borrower: Partial<Borrower>): string {
  const type = borrower.financeType || 'Daily';
  if (type === 'Daily') {
    return 'Daily';
  }
  if (type === 'Weekly') {
    if (borrower.weeklyCollectionDay && WEEKDAY_NAMES[borrower.weeklyCollectionDay]) {
      return `Every ${WEEKDAY_NAMES[borrower.weeklyCollectionDay]}`;
    }
    const startDate = parseCustomDate(borrower.startDate);
    if (startDate) {
      const jsDay = startDate.getDay();
      const day1to7 = jsDay === 0 ? 7 : jsDay;
      return `Every ${WEEKDAY_NAMES[day1to7] || 'Week'}`;
    }
    return 'Weekly';
  }
  if (type === 'Monthly') {
    if (borrower.monthlyCollectionDay) {
      return `${formatOrdinalDay(borrower.monthlyCollectionDay)} of every month`;
    }
    const startDate = parseCustomDate(borrower.startDate);
    if (startDate) {
      return `${formatOrdinalDay(startDate.getDate())} of every month`;
    }
    return 'Monthly';
  }
  return type;
}

/**
 * Generates all scheduled installments for a borrower from startDate to duration,
 * according to the Finance Type and explicit collection schedule.
 */
export function getBorrowerSchedule(borrower: Borrower): ScheduledInstallment[] {
  const startDate = parseCustomDate(borrower.startDate);
  if (!startDate) return [];

  const durationMatch = borrower.repaymentDuration?.match(/\d+/);
  const durationCount = durationMatch ? parseInt(durationMatch[0], 10) : 1;
  const totalReturn = borrower.expectedReturn || borrower.loanAmount || 0;
  const installmentAmount = durationCount > 0 ? Math.round(totalReturn / durationCount) : totalReturn;

  const installments: ScheduledInstallment[] = [];
  const type = borrower.financeType || 'Daily';

  if (type === 'Daily') {
    for (let i = 0; i < durationCount; i++) {
      const dueDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      installments.push({
        installmentIndex: i + 1,
        dueDateIso: toIsoDate(dueDate),
        scheduledAmount: installmentAmount,
      });
    }
  } else if (type === 'Weekly') {
    // 1=Monday ... 7=Sunday
    let firstDueDate: Date;
    if (borrower.weeklyCollectionDay && borrower.weeklyCollectionDay >= 1 && borrower.weeklyCollectionDay <= 7) {
      const jsDay = startDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const currentDay1to7 = jsDay === 0 ? 7 : jsDay;
      const daysToAdd = (borrower.weeklyCollectionDay - currentDay1to7 + 7) % 7;
      firstDueDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + daysToAdd);
    } else {
      // Legacy fallback: startDate is first installment
      firstDueDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    }

    for (let i = 0; i < durationCount; i++) {
      const dueDate = new Date(firstDueDate.getFullYear(), firstDueDate.getMonth(), firstDueDate.getDate() + i * 7);
      installments.push({
        installmentIndex: i + 1,
        dueDateIso: toIsoDate(dueDate),
        scheduledAmount: installmentAmount,
      });
    }
  } else if (type === 'Monthly') {
    // 1..31 with month-end capping
    const targetDay = borrower.monthlyCollectionDay && borrower.monthlyCollectionDay >= 1 && borrower.monthlyCollectionDay <= 31
      ? borrower.monthlyCollectionDay
      : startDate.getDate();

    const startYear = startDate.getFullYear();
    let startMonthIndex = startDate.getMonth();

    if (borrower.monthlyCollectionDay) {
      if (startDate.getDate() > targetDay) {
        startMonthIndex += 1;
      }
    }

    for (let i = 0; i < durationCount; i++) {
      const targetMonthIndex = startMonthIndex + i;
      const tempDate = new Date(startYear, targetMonthIndex, 1);
      const year = tempDate.getFullYear();
      const monthIndex = tempDate.getMonth();

      // Month-end rule: Last valid calendar day of that month
      const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
      const validDay = Math.min(targetDay, lastDayOfMonth);
      const dueDate = new Date(year, monthIndex, validDay);

      installments.push({
        installmentIndex: i + 1,
        dueDateIso: toIsoDate(dueDate),
        scheduledAmount: installmentAmount,
      });
    }
  }

  return installments;
}

/**
 * Calculates end date in DD/MM/YYYY matching the canonical schedule calculation.
 */
export function calculateBorrowerEndDate(
  startDateIso: string,
  financeType: Timeframe,
  durationStr: string,
  weeklyCollectionDay?: number | null,
  monthlyCollectionDay?: number | null
): string {
  if (!startDateIso || !durationStr) return '';
  const mockBorrower = {
    startDate: startDateIso,
    financeType,
    repaymentDuration: durationStr,
    weeklyCollectionDay,
    monthlyCollectionDay,
    loanAmount: 1000,
    expectedReturn: 1000,
  } as Borrower;

  const schedule = getBorrowerSchedule(mockBorrower);
  if (schedule.length === 0) return '';
  const lastInstallment = schedule[schedule.length - 1];
  const [y, m, d] = lastInstallment.dueDateIso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Checks if a borrower has a scheduled payment on a specific date.
 */
export function isPaymentDueOnDate(
  borrower: Borrower,
  targetDate: Date
): { isDue: boolean; scheduledAmount: number } {
  if (borrower.status !== 'active') {
    return { isDue: false, scheduledAmount: 0 };
  }

  const targetIso = toIsoDate(targetDate);
  const schedule = getBorrowerSchedule(borrower);
  const matched = schedule.find((inst) => inst.dueDateIso === targetIso);

  if (matched) {
    return { isDue: true, scheduledAmount: matched.scheduledAmount };
  }

  return { isDue: false, scheduledAmount: 0 };
}

/**
 * Allocates actual payments against scheduled installments in FIFO waterfall order.
 * Accurately determines on-time payments, delays, and overdue installments.
 */
export function getAllocatedSchedule(
  borrower: Borrower,
  allPayments: PaymentRecord[],
  asOfDateIso: string = getTodayIsoDate()
): AllocatedInstallment[] {
  const schedule = getBorrowerSchedule(borrower);
  const borrowerPayments = allPayments
    .filter((p) => p.borrowerId === borrower.id)
    .sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));

  // Clone installments for mutation during allocation
  const result: AllocatedInstallment[] = schedule.map((inst) => ({
    ...inst,
    paidAmount: 0,
    pendingAmount: inst.scheduledAmount,
    isFullyPaid: false,
    isOverdue: false,
    delayDays: 0,
    isOnTime: false,
  }));

  // Track remaining amounts from payments
  let currentInstIndex = 0;

  for (const p of borrowerPayments) {
    let unallocatedPayment = p.amount;

    while (unallocatedPayment > 0 && currentInstIndex < result.length) {
      const currentInst = result[currentInstIndex];
      const remainingNeeded = currentInst.pendingAmount;

      if (remainingNeeded <= 0) {
        currentInstIndex++;
        continue;
      }

      const allocated = Math.min(unallocatedPayment, remainingNeeded);
      currentInst.paidAmount += allocated;
      currentInst.pendingAmount -= allocated;
      unallocatedPayment -= allocated;

      if (currentInst.pendingAmount <= 0) {
        currentInst.isFullyPaid = true;
        currentInst.paidDateIso = p.paymentDate;

        // Check if on-time or delayed
        if (p.paymentDate <= currentInst.dueDateIso) {
          currentInst.isOnTime = true;
          currentInst.delayDays = 0;
        } else {
          currentInst.isOnTime = false;
          const dueD = parseIsoDate(currentInst.dueDateIso);
          const payD = parseIsoDate(p.paymentDate);
          const diffMs = payD.getTime() - dueD.getTime();
          currentInst.delayDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        }
        currentInstIndex++;
      }
    }
  }

  // Determine overdue status as of asOfDateIso
  for (const inst of result) {
    if (!inst.isFullyPaid && inst.dueDateIso < asOfDateIso) {
      inst.isOverdue = true;
    }
  }

  return result;
}

export function parseIsoDate(isoStr: string): Date {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ==========================================
// BORROWER METRICS (Shared Single Source of Truth)
// ==========================================

export interface BorrowerLoanSummary {
  borrower: Borrower;
  totalPaid: number;
  totalPending: number;
  expectedReturn: number;
  netAmountGiven: number;
  todayDue: number;
  overdueCount: number;
  overdueAmount: number;
  isOverdue: boolean;
  lastPaymentDate: string;
}

export function getBorrowerLoanSummary(
  borrower: Borrower,
  allPayments: PaymentRecord[],
  asOfDateIso: string = getTodayIsoDate()
): BorrowerLoanSummary {
  const allocated = getAllocatedSchedule(borrower, allPayments, asOfDateIso);
  const totalPaid = allPayments
    .filter((p) => p.borrowerId === borrower.id)
    .reduce((sum, p) => sum + p.amount, 0);

  const expReturn = borrower.expectedReturn || borrower.loanAmount || 0;
  const totalPending = borrower.status === 'closed' ? 0 : Math.max(0, expReturn - totalPaid);

  const overdueInsts = borrower.status === 'closed' ? [] : allocated.filter((inst) => inst.isOverdue);
  const overdueCount = overdueInsts.length;
  const overdueAmount = overdueInsts.reduce((sum, inst) => sum + inst.pendingAmount, 0);
  const isOverdue = borrower.status === 'active' && overdueCount > 0;

  const todayInst = borrower.status === 'closed' ? undefined : allocated.find((inst) => inst.dueDateIso === asOfDateIso);
  const todayDue = todayInst ? todayInst.pendingAmount : 0;

  const borrowerPayments = allPayments.filter((p) => p.borrowerId === borrower.id);
  let lastPaymentDate = '-';
  if (borrowerPayments.length > 0) {
    const sorted = [...borrowerPayments].sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
    const latest = sorted[0];
    if (latest && latest.paymentDate) {
      lastPaymentDate = formatDisplayDate(latest.paymentDate);
    }
  }

  return {
    borrower,
    totalPaid,
    totalPending,
    expectedReturn: expReturn,
    netAmountGiven: borrower.netAmountGiven ?? Math.max(0, (borrower.loanAmount || 0) - (borrower.deductedAmount || 0) - (borrower.agentCommission || 0)),
    todayDue,
    overdueCount,
    overdueAmount,
    isOverdue,
    lastPaymentDate,
  };
}

// ==========================================
// FINANCIAL ANALYTICS PERIOD DATA & CALCULATIONS
// ==========================================

export interface PeriodDateRange {
  startDateIso: string;
  endDateIso: string;
  displayRange: string;
  daysCount: number;
  days: string[]; // array of ISO date strings
}

export function calculatePeriodRange(period: Timeframe, refDate: Date = new Date()): PeriodDateRange {
  if (period === 'Daily') {
    const iso = toIsoDate(refDate);
    return {
      startDateIso: iso,
      endDateIso: iso,
      displayRange: formatDisplayDate(iso),
      daysCount: 1,
      days: [iso],
    };
  }

  if (period === 'Weekly') {
    // Current calendar week (Monday to Sunday)
    const current = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    const dayOfWeek = current.getDay(); // 0 is Sunday, 1 is Monday
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(current);
    monday.setDate(current.getDate() + distanceToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startIso = toIsoDate(monday);
    const endIso = toIsoDate(sunday);

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(toIsoDate(d));
    }

    return {
      startDateIso: startIso,
      endDateIso: endIso,
      displayRange: `${formatDisplayDate(startIso)} – ${formatDisplayDate(endIso)}`,
      daysCount: 7,
      days,
    };
  }

  // Monthly: 1st of month to last day of month
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0); // last day of month

  const startIso = toIsoDate(firstDay);
  const endIso = toIsoDate(lastDay);

  const days: string[] = [];
  const daysCount = lastDay.getDate();
  for (let i = 1; i <= daysCount; i++) {
    const d = new Date(year, month, i);
    days.push(toIsoDate(d));
  }

  return {
    startDateIso: startIso,
    endDateIso: endIso,
    displayRange: `${formatDisplayDate(startIso)} – ${formatDisplayDate(endIso)}`,
    daysCount,
    days,
  };
}

export interface CashflowPoint {
  dateIso: string;
  label: string;
  inAmount: number;   // payments received
  outAmount: number;  // net amount given disbursed
}

export interface FinancialAnalyticsData {
  period: Timeframe;
  dateRange: PeriodDateRange;
  // Top 4 cards
  totalLoaned: number;
  totalCollected: number;
  netCashFlow: number;
  activeLoans: number;
  // Business Performance
  invested: number;
  returned: number;
  profit: number;
  dailyEst: number;
  monthlyEst: number;
  roiPercentage: number;
  // Cashflow Trend
  cashflowPoints: CashflowPoint[];
  // Loan Health
  healthActive: number;
  healthClosed: number;
  healthOverdue: number;
  healthRiskPercentage: number;
  // Collection Metrics
  collectionEfficiency: number;
  collectionRecovery: number;
  collectionOnTimePercentage: number;
  avgDelayDays: number;
  // Smart Insights
  smartInsights: string[];
  // Business Health
  businessHealth: {
    status: 'Healthy' | 'Attention Needed' | 'At Risk';
    title: string;
    description: string;
  };
}

/**
 * Calculates complete Financial Analytics data for the specified timeframe and period.
 */
export function calculateFinancialAnalytics(
  borrowers: Borrower[],
  payments: PaymentRecord[],
  period: Timeframe,
  refDate: Date = new Date()
): FinancialAnalyticsData {
  const dateRange = calculatePeriodRange(period, refDate);
  const todayIso = getTodayIsoDate();

  // Filter borrowers matching this finance type
  const periodBorrowers = borrowers.filter(
    (b) => (b.financeType || 'Daily') === period
  );

  // Filter payments matching this finance type and within the date range
  const periodPayments = payments.filter(
    (p) =>
      p.financeType === period &&
      p.paymentDate >= dateRange.startDateIso &&
      p.paymentDate <= dateRange.endDateIso
  );

  // Loans disbursed/started in this period
  // (borrower startDate within range)
  const disbursedInPeriod = periodBorrowers.filter((b) => {
    const sDate = parseCustomDate(b.startDate);
    if (!sDate) return false;
    const sIso = toIsoDate(sDate);
    return sIso >= dateRange.startDateIso && sIso <= dateRange.endDateIso;
  });

  // Top Cards
  const totalLoaned = periodBorrowers.reduce((sum, b) => sum + (b.loanAmount || 0), 0);
  const totalCollected = periodPayments.reduce((sum, p) => sum + p.amount, 0);

  // Net Amount Given for loans disbursed in period
  const netAmountGivenInPeriod = disbursedInPeriod.reduce((sum, b) => {
    const net = b.netAmountGiven ?? Math.max(0, (b.loanAmount || 0) - (b.deductedAmount || 0) - (b.agentCommission || 0));
    return sum + net;
  }, 0);

  // All-time invested for this finance type
  const totalInvestedAllTime = periodBorrowers.reduce((sum, b) => {
    const net = b.netAmountGiven ?? Math.max(0, (b.loanAmount || 0) - (b.deductedAmount || 0) - (b.agentCommission || 0));
    return sum + net;
  }, 0);

  // If loans were disbursed in period, Net Cash Flow = Collected in period - Net Given in period.
  // Otherwise if none disbursed this period, it's totalCollected - 0.
  const netCashFlow = totalCollected - netAmountGivenInPeriod;

  const activeLoans = periodBorrowers.filter((b) => b.status === 'active').length;
  const closedLoans = periodBorrowers.filter((b) => b.status === 'closed').length;

  // Business Performance Metrics
  // Invested: Net Amount Given for loans included in analysis context
  const invested = disbursedInPeriod.length > 0 ? netAmountGivenInPeriod : totalInvestedAllTime;
  const returned = totalCollected;
  const profit = returned - invested;
  const roiPercentage = invested > 0 ? (profit / invested) * 100 : 0;

  // Daily Est & Monthly
  let dailyEst = 0;
  let monthlyEst = 0;

  if (period === 'Daily') {
    dailyEst = returned;
    monthlyEst = dailyEst * 30;
  } else if (period === 'Weekly') {
    // Average daily in week
    dailyEst = Math.round(returned / 7);
    monthlyEst = dailyEst * 30;
  } else {
    // Monthly
    dailyEst = Math.round(returned / dateRange.daysCount);
    monthlyEst = returned;
  }

  // Cashflow Trend (Date by Date)
  const cashflowPoints: CashflowPoint[] = dateRange.days.map((dayIso) => {
    const dayPayments = periodPayments
      .filter((p) => p.paymentDate === dayIso)
      .reduce((sum, p) => sum + p.amount, 0);

    const dayDisbursements = disbursedInPeriod
      .filter((b) => {
        const sDate = parseCustomDate(b.startDate);
        return sDate ? toIsoDate(sDate) === dayIso : false;
      })
      .reduce((sum, b) => {
        const net = b.netAmountGiven ?? Math.max(0, (b.loanAmount || 0) - (b.deductedAmount || 0) - (b.agentCommission || 0));
        return sum + net;
      }, 0);

    const d = parseIsoDate(dayIso);
    let label = '';
    if (period === 'Daily') {
      label = formatDisplayDate(dayIso);
    } else if (period === 'Weekly') {
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      label = weekdays[d.getDay()];
    } else {
      label = String(d.getDate());
    }

    return {
      dateIso: dayIso,
      label,
      inAmount: dayPayments,
      outAmount: dayDisbursements,
    };
  });

  // Loan Health & Overdue Calculation
  // We evaluate each active borrower using our shared schedule allocation
  let overdueLoansCount = 0;

  for (const b of periodBorrowers) {
    if (b.status === 'active') {
      const summary = getBorrowerLoanSummary(b, payments, todayIso);
      if (summary.isOverdue) {
        overdueLoansCount++;
      }
    }
  }

  const healthRiskPercentage = activeLoans > 0 ? Math.round((overdueLoansCount / activeLoans) * 100) : 0;

  // Collection Metrics
  // 1. Scheduled to be collected in this period
  let scheduledToCollectInPeriod = 0;
  for (const b of periodBorrowers) {
    const schedule = getBorrowerSchedule(b);
    for (const inst of schedule) {
      if (inst.dueDateIso >= dateRange.startDateIso && inst.dueDateIso <= dateRange.endDateIso) {
        scheduledToCollectInPeriod += inst.scheduledAmount;
      }
    }
  }

  const collectionEfficiency =
    scheduledToCollectInPeriod > 0
      ? Math.min(100, Math.round((totalCollected / scheduledToCollectInPeriod) * 100))
      : totalCollected > 0
      ? 100
      : 0;

  // Recovery = Total Collected all time for applicable loans / Total Expected Return
  const totalExpectedReturn = periodBorrowers.reduce(
    (sum, b) => sum + (b.expectedReturn || b.loanAmount || 0),
    0
  );
  const totalCollectedAllTime = payments
    .filter((p) => p.financeType === period)
    .reduce((sum, p) => sum + p.amount, 0);

  const collectionRecovery =
    totalExpectedReturn > 0
      ? Math.min(100, Math.round((totalCollectedAllTime / totalExpectedReturn) * 100))
      : 0;

  // On-Time & Delay Days using allocated installments
  let totalEvaluatedInstallments = 0;
  let onTimeInstallments = 0;
  let totalDelayDays = 0;
  let delayedInstallmentCount = 0;

  for (const b of periodBorrowers) {
    const allocated = getAllocatedSchedule(b, payments, todayIso);
    for (const inst of allocated) {
      if (inst.isFullyPaid) {
        totalEvaluatedInstallments++;
        if (inst.isOnTime) {
          onTimeInstallments++;
        } else if (inst.delayDays > 0) {
          delayedInstallmentCount++;
          totalDelayDays += inst.delayDays;
        }
      }
    }
  }

  const collectionOnTimePercentage =
    totalEvaluatedInstallments > 0
      ? Math.round((onTimeInstallments / totalEvaluatedInstallments) * 100)
      : 100;

  const avgDelayDays =
    delayedInstallmentCount > 0 ? Math.round(totalDelayDays / delayedInstallmentCount) : 0;

  // Smart Insights Generation
  const smartInsights: string[] = [];

  // Insight 1: Cashflow
  const periodLabel = period === 'Daily' ? 'today' : period === 'Weekly' ? 'this week' : 'this month';
  if (netCashFlow > 0) {
    smartInsights.push(`Positive cashflow ₹${netCashFlow.toLocaleString('en-IN')} ${periodLabel}`);
  } else if (netCashFlow < 0) {
    smartInsights.push(`Negative cashflow ₹${Math.abs(netCashFlow).toLocaleString('en-IN')} ${periodLabel}`);
  } else {
    smartInsights.push(`Neutral cashflow ₹0 ${periodLabel}`);
  }

  // Insight 2: Collection Efficiency
  if (collectionEfficiency >= 90) {
    smartInsights.push(`Excellent collection efficiency of ${collectionEfficiency}%`);
  } else if (collectionEfficiency > 0) {
    smartInsights.push(`Collection efficiency ${collectionEfficiency}% — follow up on scheduled installments`);
  } else if (scheduledToCollectInPeriod > 0) {
    smartInsights.push(`0% collection efficiency — repayments due ${periodLabel}`);
  } else {
    smartInsights.push(`No scheduled collections due ${periodLabel}`);
  }

  // Insight 3: Overdue
  if (overdueLoansCount > 0) {
    smartInsights.push(`${overdueLoansCount} active loan${overdueLoansCount > 1 ? 's' : ''} currently have overdue payments`);
  } else {
    smartInsights.push(`No overdue loans in this period — portfolio healthy`);
  }

  // Insight 4: Disbursals
  if (disbursedInPeriod.length > 0) {
    smartInsights.push(`${disbursedInPeriod.length} new loan${disbursedInPeriod.length > 1 ? 's' : ''} disbursed ${periodLabel}`);
  }

  // Trim insights to 2 - 4
  const finalInsights = smartInsights.slice(0, 4);

  // Business Health Summary
  let healthStatus: 'Healthy' | 'Attention Needed' | 'At Risk' = 'Healthy';
  let healthTitle = 'Superb Business Health!';
  let healthDescription = `Net cashflow +₹${Math.max(0, netCashFlow).toLocaleString('en-IN')} ${periodLabel}. Keep scaling!`;

  if (overdueLoansCount >= 3 || healthRiskPercentage > 40 || (netCashFlow < -50000 && activeLoans > 0)) {
    healthStatus = 'At Risk';
    healthTitle = 'Business Risk Detected';
    healthDescription = 'Negative cashflow and multiple overdue repayments require immediate management attention.';
  } else if (overdueLoansCount > 0 || healthRiskPercentage > 15 || collectionEfficiency < 60) {
    healthStatus = 'Attention Needed';
    healthTitle = 'Business Needs Attention';
    healthDescription = `Collection efficiency is ${collectionEfficiency}% with ${overdueLoansCount} overdue loan${overdueLoansCount > 1 ? 's' : ''}.`;
  }

  return {
    period,
    dateRange,
    totalLoaned,
    totalCollected,
    netCashFlow,
    activeLoans,
    invested,
    returned,
    profit,
    dailyEst,
    monthlyEst,
    roiPercentage,
    cashflowPoints,
    healthActive: activeLoans,
    healthClosed: closedLoans,
    healthOverdue: overdueLoansCount,
    healthRiskPercentage,
    collectionEfficiency,
    collectionRecovery,
    collectionOnTimePercentage,
    avgDelayDays,
    smartInsights: finalInsights,
    businessHealth: {
      status: healthStatus,
      title: healthTitle,
      description: healthDescription,
    },
  };
}
