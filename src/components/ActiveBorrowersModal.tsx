import React, { useRef } from 'react';
import { Image as ImageIcon, Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Borrower } from '../types';
import { resolveAgentName } from '../utils/agentUtils';

interface ActiveBorrowersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ActiveBorrowersModal: React.FC<ActiveBorrowersModalProps> = ({ isOpen, onClose }) => {
  const { borrowers, timeframe, company, agents, getBorrowerPaidAmount, getBorrowerLastPaymentDate } = useApp();
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Filter active borrowers for the currently selected Finance Type
  const activeBorrowers = borrowers.filter(
    (b) => (b.financeType || 'Daily') === timeframe && b.status === 'active'
  );

  const borrowerCount = activeBorrowers.length;
  const countLabel = `${borrowerCount} ${borrowerCount === 1 ? 'borrower' : 'borrowers'}`;

  // Helper row calculations using shared payment helpers
  const getBorrowerRowData = (b: Borrower) => {
    const totalLoan = b.expectedReturn || b.loanAmount || 0;
    const paid = getBorrowerPaidAmount(b.id);
    const pending = Math.max(0, totalLoan - paid);
    const lastPayment = getBorrowerLastPaymentDate(b.id);
    const agentName = resolveAgentName(b, agents);

    return {
      name: b.borrowerName || b.name,
      agentName,
      totalLoan,
      paid,
      pending,
      lastPayment,
    };
  };

  const rows = activeBorrowers.map(getBorrowerRowData);
  const totalPending = rows.reduce((acc, curr) => acc + curr.pending, 0);

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Image Export Handler (HTML5 Canvas)
  const handleExportImage = () => {
    const canvas = document.createElement('canvas');
    const width = 1000;
    const rowHeight = 44;
    const headerHeight = 160;
    const tableHeaderHeight = 44;
    const footerHeight = 70;
    const contentRows = Math.max(rows.length, 1);
    const height = headerHeight + tableHeaderHeight + contentRows * rowHeight + footerHeight;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Brand & Title
    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(company?.companyName || 'KN FINANCE', 40, 48);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Active Borrowers', 40, 88);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(`${timeframe} Finance • ${countLabel}`, 40, 114);

    // Table Header Background
    let currentY = headerHeight;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(40, currentY, width - 80, tableHeaderHeight);

    // Table Header Borders
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, currentY, width - 80, tableHeaderHeight);

    // Table Columns Coordinates
    const colX = [60, 310, 490, 670, 830];
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('NAME', colX[0], currentY + 27);
    ctx.fillText('TOTAL LOAN', colX[1], currentY + 27);
    ctx.fillText('PAID', colX[2], currentY + 27);
    ctx.fillText('PENDING', colX[3], currentY + 27);
    ctx.fillText('LAST PAYMENT', colX[4], currentY + 27);

    currentY += tableHeaderHeight;

    // Rows
    if (rows.length === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(40, currentY, width - 80, rowHeight);
      ctx.strokeRect(40, currentY, width - 80, rowHeight);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('No active borrowers found.', colX[0], currentY + 28);
      currentY += rowHeight;
    } else {
      rows.forEach((r, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fafafa';
        ctx.fillRect(40, currentY, width - 80, rowHeight);
        ctx.strokeRect(40, currentY, width - 80, rowHeight);

        ctx.fillStyle = '#1e293b';
        ctx.font = '600 13px system-ui, sans-serif';
        ctx.fillText(r.name, colX[0], currentY + 27);

        ctx.font = '500 13px system-ui, sans-serif';
        ctx.fillText(`₹${r.totalLoan.toLocaleString('en-IN')}`, colX[1], currentY + 27);
        ctx.fillText(`₹${r.paid.toLocaleString('en-IN')}`, colX[2], currentY + 27);

        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(`₹${r.pending.toLocaleString('en-IN')}`, colX[3], currentY + 27);

        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px system-ui, sans-serif';
        ctx.fillText(r.lastPayment, colX[4], currentY + 27);

        currentY += rowHeight;
      });
    }

    // Total Pending Footer
    currentY += 24;
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px system-ui, sans-serif';
    const totalText = `Total Pending: ₹${totalPending.toLocaleString('en-IN')}`;
    const textWidth = ctx.measureText(totalText).width;
    ctx.fillText(totalText, width - 40 - textWidth, currentY + 16);

    // Trigger Download
    const link = document.createElement('a');
    link.download = `KN_FINANCE_Active_Borrowers_${timeframe}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Modal Container: 900px - 1050px width on desktop, max-h 85-90vh */}
      <div
        id="active-borrowers-printable"
        ref={printAreaRef}
        className="w-full max-w-[1000px] max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-[#1e293b]">
                Active Borrowers
              </h2>
              <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wide rounded bg-[#eef2ff] text-[#4f46e5]">
                {timeframe}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#64748b] mt-0.5">
              {countLabel}
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
            Active Borrowers Report • {timeframe} Finance • {countLabel}
          </p>
        </div>

        {/* Modal Body / Table Area */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6">
          <div className="min-w-[620px] sm:min-w-full rounded-xl border border-slate-200/80 overflow-hidden bg-white shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] sm:text-xs font-bold text-[#475569] tracking-wider uppercase">
                  <th className="py-3 px-4 sm:px-5">NAME</th>
                  <th className="py-3 px-4 sm:px-5">TOTAL LOAN</th>
                  <th className="py-3 px-4 sm:px-5">PAID</th>
                  <th className="py-3 px-4 sm:px-5">PENDING</th>
                  <th className="py-3 px-4 sm:px-5">LAST PAYMENT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {rows.length === 0 ? (
                  /* Empty State: Keep headers visible, show exact empty text */
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 px-4 text-center text-[#64748b] font-medium"
                    >
                      No active borrowers found.
                    </td>
                  </tr>
                ) : (
                  /* Populated rows */
                  rows.map((r, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3.5 px-4 sm:px-5 font-semibold text-[#1e293b]">
                        <div>{r.name}</div>
                        {r.agentName && (
                          <div className="text-[11px] font-normal text-[#64748b]">
                            Agent: {r.agentName}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-[#334155] font-medium">
                        ₹{r.totalLoan.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-[#334155] font-medium">
                        ₹{r.paid.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 font-bold text-[#4f46e5]">
                        ₹{r.pending.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-4 sm:px-5 text-[#64748b] font-medium">
                        {r.lastPayment}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer: Total Pending at bottom-right */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between sm:justify-end">
          <div className="text-right">
            <span className="text-sm sm:text-base font-bold text-[#1e293b]">
              Total Pending:{' '}
              <span className="text-[#4f46e5]">
                ₹{totalPending.toLocaleString('en-IN')}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
