import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, Image as ImageIcon, Printer, X, CheckCircle2 } from 'lucide-react';
import { useApp, getTodayIsoDate, formatDisplayDate } from '../context/AppContext';

interface DueTodayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DueTodayModal: React.FC<DueTodayModalProps> = ({ isOpen, onClose }) => {
  const { timeframe, getDueBorrowersForDate, company } = useApp();
  const [selectedDateIso, setSelectedDateIso] = useState<string>(getTodayIsoDate());

  // Default to today whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedDateIso(getTodayIsoDate());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Retrieve dues for selected date and currently active Finance Type
  const dueItems = getDueBorrowersForDate(selectedDateIso, timeframe);
  const totalDue = dueItems.reduce((acc, curr) => acc + curr.pendingAmount, 0);
  const formattedDisplay = formatDisplayDate(selectedDateIso);

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // HTML5 Canvas Image Export
  const handleExportImage = () => {
    const canvas = document.createElement('canvas');
    const width = 1000;
    const rowHeight = 44;
    const headerHeight = 160;
    const tableHeaderHeight = 44;
    const footerHeight = 70;

    let height: number;
    if (dueItems.length === 0) {
      height = headerHeight + 160;
    } else {
      height = headerHeight + tableHeaderHeight + dueItems.length * rowHeight + footerHeight;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Header & Branding
    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(company?.companyName || 'KN FINANCE', 40, 48);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Due Today (All)', 40, 88);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(`${timeframe} Finance • ${formattedDisplay}`, 40, 114);

    let currentY = headerHeight;

    if (dueItems.length === 0) {
      // Empty state
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('All clear!', 40, currentY + 40);

      ctx.fillStyle = '#64748b';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('No payments due for this date.', 40, currentY + 70);
    } else {
      // Table Header Background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(40, currentY, width - 80, tableHeaderHeight);

      // Table Header Border
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, currentY, width - 80, tableHeaderHeight);

      // Column Headings
      const colX = [60, 260, 430, 570, 710, 850];
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('BORROWER NAME', colX[0], currentY + 27);
      ctx.fillText('PHONE NUMBER', colX[1], currentY + 27);
      ctx.fillText('DUE AMOUNT', colX[2], currentY + 27);
      ctx.fillText('PAID', colX[3], currentY + 27);
      ctx.fillText('PENDING', colX[4], currentY + 27);
      ctx.fillText('STATUS', colX[5], currentY + 27);

      currentY += tableHeaderHeight;

      dueItems.forEach((item, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fafafa';
        ctx.fillRect(40, currentY, width - 80, rowHeight);
        ctx.strokeRect(40, currentY, width - 80, rowHeight);

        ctx.fillStyle = '#1e293b';
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillText(item.borrower.borrowerName || item.borrower.name, colX[0], currentY + 27);

        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px system-ui, sans-serif';
        ctx.fillText(item.borrower.phoneNumber || item.borrower.phone, colX[1], currentY + 27);

        ctx.fillStyle = '#1e293b';
        ctx.fillText(`₹${item.dueAmount.toLocaleString('en-IN')}`, colX[2], currentY + 27);
        ctx.fillText(`₹${item.paidAmount.toLocaleString('en-IN')}`, colX[3], currentY + 27);

        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(`₹${item.pendingAmount.toLocaleString('en-IN')}`, colX[4], currentY + 27);

        ctx.fillStyle = item.status === 'Partial' ? '#d97706' : '#ef4444';
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillText(item.status, colX[5], currentY + 27);

        currentY += rowHeight;
      });

      // Total Due Footer
      currentY += 24;
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 16px system-ui, sans-serif';
      const totalText = `Total Due: ₹${totalDue.toLocaleString('en-IN')}`;
      const textWidth = ctx.measureText(totalText).width;
      ctx.fillText(totalText, width - 40 - textWidth, currentY + 16);
    }

    // Download
    const link = document.createElement('a');
    link.download = `KN_FINANCE_Due_Today_${timeframe}_${selectedDateIso}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Modal Container: ~950px on desktop, max-h 88vh */}
      <div
        id="due-today-printable"
        className="w-full max-w-[950px] max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-start justify-between bg-white z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-[#1e293b]">
                Due Today (All)
              </h2>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wide rounded bg-[#eef2ff] text-[#4f46e5]">
                {timeframe}
              </span>
            </div>

            {/* Date Selector: [Calendar Icon] 23 Sept 2026 ▼ */}
            <div className="relative inline-block mt-2 no-print">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs sm:text-sm font-semibold text-[#1e293b] cursor-pointer transition-colors shadow-sm">
                <Calendar size={15} className="text-[#4f46e5]" />
                <span>{formattedDisplay}</span>
                <ChevronDown size={14} className="text-[#64748b]" />
              </div>
              <input
                type="date"
                value={selectedDateIso}
                onChange={(e) => e.target.value && setSelectedDateIso(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="Select Date"
              />
            </div>

            {/* Printable Date text */}
            <p className="hidden print:block text-xs font-semibold text-[#64748b] mt-1">
              Date: {formattedDisplay}
            </p>
          </div>

          {/* Action Icons in exact order: 1. Image/Export, 2. Print, 3. X Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 no-print">
            {/* 1. Image/Export */}
            <button
              type="button"
              onClick={handleExportImage}
              title="Export as Image"
              className="p-2 text-slate-500 hover:text-[#4f46e5] hover:bg-indigo-50 rounded-xl transition-colors"
              aria-label="Export as Image"
            >
              <ImageIcon size={19} />
            </button>

            {/* 2. Print */}
            <button
              type="button"
              onClick={handlePrint}
              title="Print Report"
              className="p-2 text-slate-500 hover:text-[#4f46e5] hover:bg-indigo-50 rounded-xl transition-colors"
              aria-label="Print Report"
            >
              <Printer size={19} />
            </button>

            {/* 3. X Close */}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable-only Title Banner */}
        <div className="hidden print:block px-6 pt-4 pb-2 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-[#4f46e5]">{company?.companyName || 'KN FINANCE'}</h1>
          <p className="text-sm text-slate-600">
            Due Today (All) Report • {timeframe} Finance • {formattedDisplay}
          </p>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 flex flex-col justify-center">
          {dueItems.length === 0 ? (
            /* Empty State: exactly matching reference */
            <div className="text-center py-16 px-4 my-auto">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={26} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-[#1e293b] mb-1.5">
                All clear!
              </h3>
              <p className="text-xs sm:text-sm text-[#64748b]">
                No payments due for this date.
              </p>
            </div>
          ) : (
            /* Populated Table State */
            <div className="min-w-[650px] sm:min-w-full rounded-xl border border-slate-200/80 overflow-hidden bg-white shadow-sm my-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] sm:text-xs font-bold text-[#475569] tracking-wider uppercase">
                    <th className="py-3 px-4 sm:px-5">BORROWER NAME</th>
                    <th className="py-3 px-4 sm:px-5">PHONE NUMBER</th>
                    <th className="py-3 px-4 sm:px-5">DUE AMOUNT</th>
                    <th className="py-3 px-4 sm:px-5">PAID</th>
                    <th className="py-3 px-4 sm:px-5">PENDING</th>
                    <th className="py-3 px-4 sm:px-5">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {dueItems.map((item) => (
                    <tr
                      key={item.borrower.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3.5 px-4 sm:px-5 font-semibold text-[#1e293b]">
                        {item.borrower.borrowerName || item.borrower.name}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-[#64748b]">
                        {item.borrower.phoneNumber || item.borrower.phone}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-[#334155] font-medium">
                        ₹{item.dueAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-[#334155] font-medium">
                        ₹{item.paidAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 font-bold text-[#4f46e5]">
                        ₹{item.pendingAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            item.status === 'Partial'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              : 'bg-red-50 text-red-600 border border-red-200/60'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer: Total Due at bottom-right (shown when dues exist) */}
        {dueItems.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between sm:justify-end">
            <div className="text-right">
              <span className="text-sm sm:text-base font-bold text-[#1e293b]">
                Total Due:{' '}
                <span className="text-[#4f46e5]">
                  ₹{totalDue.toLocaleString('en-IN')}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
