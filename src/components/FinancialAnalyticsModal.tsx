import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  IndianRupee,
  ArrowDownLeft,
  Activity,
  Users,
  ChevronDown,
  RotateCw,
  Printer,
  X,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  PieChart,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Timeframe } from '../types';
import {
  calculateFinancialAnalytics,
  type FinancialAnalyticsData,
} from '../utils/loanCalculations';

interface FinancialAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FinancialAnalyticsModal: React.FC<FinancialAnalyticsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { borrowers, payments, timeframe: dashboardTimeframe, company } = useApp();

  // Period dropdown can be selected independently inside modal
  const [period, setPeriod] = useState<Timeframe>(dashboardTimeframe);
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with dashboard timeframe when modal opens
  useEffect(() => {
    if (isOpen) {
      setPeriod(dashboardTimeframe);
      setIsPeriodDropdownOpen(false);
    }
  }, [isOpen, dashboardTimeframe]);

  // Click outside listener for period dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsPeriodDropdownOpen(false);
      }
    };
    if (isPeriodDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPeriodDropdownOpen]);

  // Calculate analytics data from single source of truth
  const analyticsData: FinancialAnalyticsData = useMemo(() => {
    return calculateFinancialAnalytics(borrowers, payments, period, new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowers, payments, period, refreshKey]);

  if (!isOpen) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 450);
  };

  const handlePrint = () => {
    window.print();
  };

  // SVG Chart Dimensions & Helpers
  const points = analyticsData.cashflowPoints;
  const maxAmount = Math.max(
    ...points.map((p) => Math.max(p.inAmount, p.outAmount)),
    1000 // minimum scale baseline
  );

  const svgWidth = 800;
  const svgHeight = 220;
  const paddingX = 45;
  const paddingY = 30;
  const graphWidth = svgWidth - paddingX * 2;
  const graphHeight = svgHeight - paddingY * 2;

  const getX = (index: number) => {
    if (points.length <= 1) return paddingX + graphWidth / 2;
    return paddingX + (index / (points.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    if (maxAmount <= 0) return svgHeight - paddingY;
    const ratio = Math.min(1, Math.max(0, val / maxAmount));
    return svgHeight - paddingY - ratio * graphHeight;
  };

  // Construct SVG paths
  const inPathD = points.reduce((acc, p, i) => {
    const x = getX(i);
    const y = getY(p.inAmount);
    return `${acc} ${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }, '');

  const inAreaD = points.length > 0
    ? `${inPathD} L ${getX(points.length - 1)} ${svgHeight - paddingY} L ${getX(0)} ${svgHeight - paddingY} Z`
    : '';

  const outPathD = points.reduce((acc, p, i) => {
    const x = getX(i);
    const y = getY(p.outAmount);
    return `${acc} ${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }, '');

  const outAreaD = points.length > 0
    ? `${outPathD} L ${getX(points.length - 1)} ${svgHeight - paddingY} L ${getX(0)} ${svgHeight - paddingY} Z`
    : '';

  // Y-axis ticks
  const yTicks = [0, 0.33, 0.66, 1].map((pct) => {
    const val = Math.round(maxAmount * pct);
    const y = svgHeight - paddingY - pct * graphHeight;
    return { val, y };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="financial-analytics-printable"
        className="bg-white rounded-2xl shadow-2xl max-w-[1150px] w-full max-h-[90vh] flex flex-col border border-slate-100 overflow-hidden text-[#1e293b]"
      >
        {/* MODAL HEADER */}
        <div className="px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-white shrink-0">
          {/* Top-Left: Title and Dynamic Date Range */}
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b]">
                Financial Analytics
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-[#eef2ff] text-[#4f46e5] border border-[#c7d2fe]/60">
                {period}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#64748b] mt-0.5">
              {analyticsData.dateRange.displayRange}
            </p>
          </div>

          {/* Top-Right Controls in Exact Order: [Period Dropdown] [Refresh] [Print] [X] */}
          <div className="flex items-center gap-2 sm:gap-2.5 no-print">
            {/* 1. Period Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#1e293b] bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                aria-label="Select Period"
              >
                <span>{period}</span>
                <ChevronDown size={14} className="text-[#64748b]" />
              </button>

              {isPeriodDropdownOpen && (
                <div className="absolute right-0 mt-2 w-32 bg-white rounded-xl shadow-[0_4px_25px_rgba(0,0,0,0.12)] border border-slate-100 py-1.5 z-50 overflow-hidden">
                  {(['Daily', 'Weekly', 'Monthly'] as Timeframe[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setPeriod(opt);
                        setIsPeriodDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-between ${
                        period === opt
                          ? 'bg-[#eef2ff] text-[#4f46e5]'
                          : 'text-[#1e293b] hover:bg-slate-50'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Refresh Financial Analytics"
              title="Refresh Analytics"
              className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-indigo-50 text-[#64748b] hover:text-[#4f46e5] flex items-center justify-center transition-colors border border-slate-200/80"
            >
              <RotateCw size={16} className={isRefreshing ? 'animate-spin text-[#4f46e5]' : ''} />
            </button>

            {/* 3. Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print Financial Analytics Report"
              title="Print Report"
              className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-indigo-50 text-[#64748b] hover:text-[#4f46e5] flex items-center justify-center transition-colors border border-slate-200/80"
            >
              <Printer size={16} />
            </button>

            {/* 4. Close (X) Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Financial Analytics"
              title="Close"
              className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-rose-50 text-[#64748b] hover:text-rose-600 flex items-center justify-center transition-colors border border-slate-200/80"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* PRINT ONLY BRANDING HEADER */}
        <div className="hidden print:block px-6 pt-4 pb-2 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-[#0f172a] tracking-tight">{company?.companyName || 'KN FINANCE'}</h1>
              <p className="text-xs text-[#64748b]">Empowering your future • Financial Analytics Report</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-[#4f46e5] bg-[#eef2ff] px-2 py-0.5 rounded border border-[#c7d2fe]">
                {period}
              </span>
              <p className="text-xs font-semibold text-[#1e293b] mt-1">{analyticsData.dateRange.displayRange}</p>
            </div>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 space-y-6">
          {/* SECTION 1: TOP 4 FINANCIAL SUMMARY CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Total Loaned */}
            <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#64748b]">Total Loaned</span>
                <div className="w-8 h-8 rounded-full bg-[#f3f0ff] flex items-center justify-center text-[#4f46e5] shrink-0">
                  <IndianRupee size={16} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-[#1e293b]">
                ₹{analyticsData.totalLoaned.toLocaleString('en-IN')}
              </div>
            </div>

            {/* Card 2: Total Collected */}
            <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#64748b]">Total Collected</span>
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                  <ArrowDownLeft size={16} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-[#1e293b]">
                ₹{analyticsData.totalCollected.toLocaleString('en-IN')}
              </div>
            </div>

            {/* Card 3: Net Cash Flow */}
            <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#64748b]">Net Cash Flow</span>
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  <Activity size={16} />
                </div>
              </div>
              <div
                className={`text-xl sm:text-2xl font-bold ${
                  analyticsData.netCashFlow > 0
                    ? 'text-emerald-600'
                    : analyticsData.netCashFlow < 0
                    ? 'text-rose-600'
                    : 'text-[#1e293b]'
                }`}
              >
                {analyticsData.netCashFlow >= 0
                  ? `₹${analyticsData.netCashFlow.toLocaleString('en-IN')}`
                  : `-₹${Math.abs(analyticsData.netCashFlow).toLocaleString('en-IN')}`}
              </div>
            </div>

            {/* Card 4: Active Loans */}
            <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#64748b]">Active Loans</span>
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-[#7c3aed] shrink-0">
                  <Users size={16} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-[#1e293b]">
                {analyticsData.activeLoans}
              </div>
            </div>
          </div>

          {/* SECTION 2: BUSINESS PERFORMANCE */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs sm:text-sm font-bold tracking-wider text-[#475569] uppercase">
                BUSINESS PERFORMANCE
              </h3>
              {/* ROI Indicator */}
              <div
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                  analyticsData.roiPercentage > 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                    : analyticsData.roiPercentage < 0
                    ? 'bg-rose-50 text-rose-700 border border-rose-200/70'
                    : 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/50'
                }`}
              >
                <span>{analyticsData.roiPercentage < 0 ? '▼' : '▲'}</span>
                <span>{Math.abs(analyticsData.roiPercentage).toFixed(1)}% ROI</span>
              </div>
            </div>

            {/* 3-Column x 2-Row Metric Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {/* Invested */}
              <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
                <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                  Invested
                </div>
                <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-1">
                  ₹{analyticsData.invested.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Returned */}
              <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
                <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                  Returned
                </div>
                <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-1">
                  ₹{analyticsData.returned.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Profit */}
              <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
                <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                  Profit
                </div>
                <div
                  className={`text-base sm:text-lg font-bold mt-1 ${
                    analyticsData.profit > 0
                      ? 'text-emerald-600'
                      : analyticsData.profit < 0
                      ? 'text-rose-600'
                      : 'text-[#1e293b]'
                  }`}
                >
                  {analyticsData.profit >= 0
                    ? `₹${analyticsData.profit.toLocaleString('en-IN')}`
                    : `-₹${Math.abs(analyticsData.profit).toLocaleString('en-IN')}`}
                </div>
              </div>

              {/* Daily Est. */}
              <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
                <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                  Daily Est.
                </div>
                <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-1">
                  ₹{analyticsData.dailyEst.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Monthly */}
              <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
                <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                  Monthly
                </div>
                <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-1">
                  ₹{analyticsData.monthlyEst.toLocaleString('en-IN')}
                </div>
              </div>

              {/* ROI % */}
              <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
                <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                  ROI %
                </div>
                <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-1">
                  {analyticsData.roiPercentage.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: CASHFLOW TREND (RESPONSIVE SVG LINE CHART) */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h3 className="text-xs sm:text-sm font-bold tracking-wider text-[#475569] uppercase">
                CASHFLOW TREND ({analyticsData.cashflowPoints.length} {analyticsData.cashflowPoints.length === 1 ? 'DAY' : 'DAYS'})
              </h3>
              {/* Legend: ■ In  ■ Out */}
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
                  <span className="text-[#475569]">In (Collected)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
                  <span className="text-[#475569]">Out (Disbursed)</span>
                </div>
              </div>
            </div>

            {/* SVG Chart Container */}
            <div className="w-full overflow-x-auto">
              <div className="min-w-[600px] w-full">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-52 select-none"
                >
                  <defs>
                    <linearGradient id="inGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="outGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines & Y-axis labels */}
                  {yTicks.map((tick, i) => (
                    <g key={i}>
                      <line
                        x1={paddingX}
                        y1={tick.y}
                        x2={svgWidth - paddingX}
                        y2={tick.y}
                        stroke="#e2e8f0"
                        strokeDasharray={i === 0 ? 'none' : '3 3'}
                        strokeWidth="1"
                      />
                      <text
                        x={paddingX - 8}
                        y={tick.y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="#94a3b8"
                        fontWeight="600"
                      >
                        ₹{tick.val >= 1000 ? `${(tick.val / 1000).toFixed(0)}k` : tick.val}
                      </text>
                    </g>
                  ))}

                  {/* Fill Areas */}
                  {inAreaD && <path d={inAreaD} fill="url(#inGradient)" />}
                  {outAreaD && <path d={outAreaD} fill="url(#outGradient)" />}

                  {/* Out Line (Disbursed) */}
                  {outPathD && (
                    <path
                      d={outPathD}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* In Line (Collected) */}
                  {inPathD && (
                    <path
                      d={inPathD}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Data Points */}
                  {points.map((p, i) => {
                    const x = getX(i);
                    const yIn = getY(p.inAmount);
                    const yOut = getY(p.outAmount);
                    return (
                      <g key={i}>
                        {p.inAmount > 0 && (
                          <circle
                            cx={x}
                            cy={yIn}
                            r="4"
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                        )}
                        {p.outAmount > 0 && (
                          <circle
                            cx={x}
                            cy={yOut}
                            r="4"
                            fill="#f43f5e"
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* X-axis tick labels */}
                  {points.map((p, i) => {
                    // Show select ticks to avoid clutter if many points
                    const step = points.length > 15 ? Math.ceil(points.length / 10) : 1;
                    if (i % step !== 0 && i !== points.length - 1) return null;
                    const x = getX(i);
                    return (
                      <text
                        key={i}
                        x={x}
                        y={svgHeight - 8}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#64748b"
                        fontWeight="600"
                      >
                        {p.label}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          {/* SECTION 4: LOAN HEALTH & COLLECTION (2-COLUMN GRID ON DESKTOP) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* LOAN HEALTH */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs sm:text-sm font-bold tracking-wider text-[#475569] uppercase flex items-center gap-1.5">
                    <ShieldAlert size={16} className="text-[#4f46e5]" />
                    LOAN HEALTH
                  </h3>
                  <span className="text-xs font-bold text-[#64748b]">
                    {analyticsData.healthRiskPercentage}% Risk
                  </span>
                </div>

                {/* 4 Metric items */}
                <div className="grid grid-cols-4 gap-2 text-center mb-4">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">Active</div>
                    <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-0.5">
                      {analyticsData.healthActive}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">Closed</div>
                    <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-0.5">
                      {analyticsData.healthClosed}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">Overdue</div>
                    <div
                      className={`text-base sm:text-lg font-bold mt-0.5 ${
                        analyticsData.healthOverdue > 0 ? 'text-rose-600' : 'text-[#1e293b]'
                      }`}
                    >
                      {analyticsData.healthOverdue}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">Risk</div>
                    <div
                      className={`text-base sm:text-lg font-bold mt-0.5 ${
                        analyticsData.healthRiskPercentage > 0 ? 'text-rose-600' : 'text-[#1e293b]'
                      }`}
                    >
                      {analyticsData.healthRiskPercentage}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-[#64748b] mb-1 font-medium">
                  <span>Portfolio Distribution</span>
                  <span>
                    {analyticsData.healthActive} Active • {analyticsData.healthOverdue} Overdue
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  {analyticsData.healthActive > 0 ? (
                    <>
                      <div
                        style={{
                          width: `${Math.max(
                            0,
                            ((analyticsData.healthActive - analyticsData.healthOverdue) /
                              analyticsData.healthActive) *
                              100
                          )}%`,
                        }}
                        className="bg-[#4f46e5] h-full"
                        title="Healthy Active Loans"
                      />
                      <div
                        style={{
                          width: `${(analyticsData.healthOverdue / analyticsData.healthActive) * 100}%`,
                        }}
                        className="bg-rose-500 h-full"
                        title="Overdue Loans"
                      />
                    </>
                  ) : (
                    <div className="w-full bg-slate-200 h-full" />
                  )}
                </div>
              </div>
            </div>

            {/* COLLECTION */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs sm:text-sm font-bold tracking-wider text-[#475569] uppercase flex items-center gap-1.5">
                    <PieChart size={16} className="text-emerald-600" />
                    COLLECTION
                  </h3>
                  <span className="text-xs font-bold text-emerald-600">
                    {analyticsData.collectionEfficiency}% Efficiency
                  </span>
                </div>

                {/* 4 Metric items */}
                <div className="grid grid-cols-4 gap-2 text-center mb-4">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">Efficiency</div>
                    <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-0.5">
                      {analyticsData.collectionEfficiency}%
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">Recovery</div>
                    <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-0.5">
                      {analyticsData.collectionRecovery}%
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">On-Time</div>
                    <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-0.5">
                      {analyticsData.collectionOnTimePercentage}%
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-[11px] font-semibold text-[#64748b]">Avg Delay</div>
                    <div className="text-base sm:text-lg font-bold text-[#1e293b] mt-0.5">
                      {analyticsData.avgDelayDays}d
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress Bar for Efficiency */}
              <div>
                <div className="flex items-center justify-between text-[11px] text-[#64748b] mb-1 font-medium">
                  <span>Collection Efficiency</span>
                  <span>{analyticsData.collectionEfficiency}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, analyticsData.collectionEfficiency)}%` }}
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: SMART INSIGHTS */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-sm">
            <h3 className="text-xs sm:text-sm font-bold tracking-wider text-[#475569] uppercase mb-3.5 flex items-center gap-1.5">
              <TrendingUp size={16} className="text-[#4f46e5]" />
              SMART INSIGHTS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {analyticsData.smartInsights.map((insight, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="w-5 h-5 rounded-full bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold">•</span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-[#334155]">{insight}</p>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 6: BUSINESS HEALTH SUMMARY CARD */}
          <div
            className={`rounded-xl p-4 sm:p-5 border transition-all ${
              analyticsData.businessHealth.status === 'Healthy'
                ? 'bg-emerald-50/70 border-emerald-200/80'
                : analyticsData.businessHealth.status === 'Attention Needed'
                ? 'bg-amber-50/70 border-amber-200/80'
                : 'bg-rose-50/70 border-rose-200/80'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    analyticsData.businessHealth.status === 'Healthy'
                      ? 'bg-emerald-100 text-emerald-700'
                      : analyticsData.businessHealth.status === 'Attention Needed'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {analyticsData.businessHealth.status === 'Healthy' ? (
                    <CheckCircle2 size={22} />
                  ) : analyticsData.businessHealth.status === 'Attention Needed' ? (
                    <AlertTriangle size={22} />
                  ) : (
                    <AlertOctagon size={22} />
                  )}
                </div>
                <div>
                  <h4
                    className={`text-base font-bold ${
                      analyticsData.businessHealth.status === 'Healthy'
                        ? 'text-emerald-900'
                        : analyticsData.businessHealth.status === 'Attention Needed'
                        ? 'text-amber-900'
                        : 'text-rose-900'
                    }`}
                  >
                    {analyticsData.businessHealth.title}
                  </h4>
                  <p
                    className={`text-xs sm:text-sm mt-0.5 ${
                      analyticsData.businessHealth.status === 'Healthy'
                        ? 'text-emerald-700'
                        : analyticsData.businessHealth.status === 'Attention Needed'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {analyticsData.businessHealth.description}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="shrink-0">
                <span
                  className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                    analyticsData.businessHealth.status === 'Healthy'
                      ? 'bg-emerald-200 text-emerald-900'
                      : analyticsData.businessHealth.status === 'Attention Needed'
                      ? 'bg-amber-200 text-amber-900'
                      : 'bg-rose-200 text-rose-900'
                  }`}
                >
                  {analyticsData.businessHealth.status}
                </span>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-200/50 italic">
              * Finance-management operational indicator only. Not financial or investment advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
