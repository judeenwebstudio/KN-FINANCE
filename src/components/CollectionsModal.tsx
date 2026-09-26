import React, { useState, useEffect } from 'react';
import { Calendar, ChevronDown, Image as ImageIcon, Printer, X } from 'lucide-react';
import { useApp, getTodayIsoDate } from '../context/AppContext';
import { resolveCollectorName } from '../utils/agentUtils';
import { formatAppDate } from '../utils/dateUtils';

interface CollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CollectionsModal: React.FC<CollectionsModalProps> = ({ isOpen, onClose }) => {
  const { payments, company, manager, agents, settings } = useApp();
  const [selectedDateIso, setSelectedDateIso] = useState<string>(getTodayIsoDate());

  // Default to today whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedDateIso(getTodayIsoDate());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter payments for the selected date
  const filteredPayments = payments.filter(
    (p) => p.paymentDate === selectedDateIso
  );

  const totalCollected = filteredPayments.reduce((acc, curr) => acc + curr.amount, 0);
  const formattedDisplay = formatAppDate(selectedDateIso, settings.dateFormat);

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // HTML5 Canvas Image Export
  const handleExportImage = () => {
    const canvas = document.createElement('canvas');
    const width = 900;
    const rowHeight = 44;
    const headerHeight = 160;
    const tableHeaderHeight = 44;
    const footerHeight = 70;
    const contentRows = Math.max(filteredPayments.length, 1);
    const height = headerHeight + tableHeaderHeight + contentRows * rowHeight + footerHeight;

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
    ctx.fillText('Collections', 40, 88);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(`Collections • ${formattedDisplay}`, 40, 114);

    // Table Header Background
    let currentY = headerHeight;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(40, currentY, width - 80, tableHeaderHeight);

    // Table Header Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, currentY, width - 80, tableHeaderHeight);

    // Column Headings
    const colX = [60, 400, 680];
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('BORROWER NAME', colX[0], currentY + 27);
    ctx.fillText('AMOUNT COLLECTED', colX[1], currentY + 27);
    ctx.fillText('COLLECTED BY', colX[2], currentY + 27);

    currentY += tableHeaderHeight;

    // Rows
    if (filteredPayments.length === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(40, currentY, width - 80, rowHeight);
      ctx.strokeRect(40, currentY, width - 80, rowHeight);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('No payments were collected on this date.', colX[0], currentY + 28);
      currentY += rowHeight;
    } else {
      filteredPayments.forEach((p, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fafafa';
        ctx.fillRect(40, currentY, width - 80, rowHeight);
        ctx.strokeRect(40, currentY, width - 80, rowHeight);

        ctx.fillStyle = '#1e293b';
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillText(p.borrowerName, colX[0], currentY + 27);

        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(`₹${p.amount.toLocaleString('en-IN')}`, colX[1], currentY + 27);

        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px system-ui, sans-serif';
        ctx.fillText(resolveCollectorName(p, manager, agents), colX[2], currentY + 27);

        currentY += rowHeight;
      });
    }

    // Total Collected Footer
    currentY += 24;
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px system-ui, sans-serif';
    const totalText = `Total Collected: ₹${totalCollected.toLocaleString('en-IN')}`;
    const textWidth = ctx.measureText(totalText).width;
    ctx.fillText(totalText, width - 40 - textWidth, currentY + 16);

    // Download
    const link = document.createElement('a');
    link.download = `KN_FINANCE_Collections_${selectedDateIso}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Modal Container: 850px - 1000px on desktop */}
      <div
        id="collections-printable"
        className="w-full max-w-[950px] max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-start justify-between bg-white z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-[#1e293b]">
                Collections
              </h2>
            </div>

            {/* Date Selector: [calendar icon] 23 Sept 2026 ▼ */}
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
            Collections Report • {formattedDisplay}
          </p>
        </div>

        {/* Modal Body / Table Area */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6">
          <div className="min-w-[500px] sm:min-w-full rounded-xl border border-slate-200/80 overflow-hidden bg-white shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] sm:text-xs font-bold text-[#475569] tracking-wider uppercase">
                  <th className="py-3 px-4 sm:px-5">BORROWER NAME</th>
                  <th className="py-3 px-4 sm:px-5">AMOUNT COLLECTED</th>
                  <th className="py-3 px-4 sm:px-5">COLLECTED BY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {filteredPayments.length === 0 ? (
                  /* Empty State: Keep table headings visible */
                  <tr>
                    <td
                      colSpan={3}
                      className="py-12 px-4 text-center text-[#64748b] font-medium"
                    >
                      No payments were collected on this date.
                    </td>
                  </tr>
                ) : (
                  /* Populated rows: One row per collection transaction */
                  filteredPayments.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3.5 px-4 sm:px-5 font-semibold text-[#1e293b]">
                        {p.borrowerName}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 font-bold text-[#4f46e5]">
                        ₹{p.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-[#64748b] font-medium">
                        {resolveCollectorName(p, manager, agents)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer: Total Collected at bottom-right */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between sm:justify-end">
          <div className="text-right">
            <span className="text-sm sm:text-base font-bold text-[#1e293b]">
              Total Collected:{' '}
              <span className="text-[#4f46e5]">
                ₹{totalCollected.toLocaleString('en-IN')}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
