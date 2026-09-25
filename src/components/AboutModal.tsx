import React, { useEffect } from 'react';
import { Info, X, CheckCircle2, Shield } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const keyFeatures = [
    'Borrower Management',
    'Daily / Weekly / Monthly Finance',
    'Due & Collection Tracking',
    'Payment History',
    'Agent Management',
    'Cash Flow Management',
    'Activity Logs',
    'Backup & Restore',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-[#4f46e5] border border-indigo-100/80">
              <Info size={20} />
            </div>
            <div>
              <h2 id="about-modal-title" className="text-lg font-bold text-[#1e293b]">
                About
              </h2>
              <p className="text-xs text-[#64748b] font-medium">
                Application overview & system information
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Main Title & Tagline Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] border border-slate-200/80 text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#4f46e5] text-white font-black text-xl shadow-md shadow-indigo-200 mb-1">
              KN
            </div>
            <h3 className="text-xl font-extrabold text-[#1e293b] tracking-tight">
              KN FINANCE
            </h3>
            <p className="text-xs font-semibold text-[#4f46e5] uppercase tracking-wider">
              Finance Management System
            </p>
            <p className="text-xs sm:text-sm text-[#475569] leading-relaxed pt-2 max-w-md mx-auto">
              KN FINANCE helps finance managers and agents manage borrowers, loans, collections, due schedules, payments and daily cash operations in one place.
            </p>
          </div>

          {/* Key Features Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-1.5">
              <Shield size={14} className="text-[#4f46e5]" />
              <span>Key Features</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {keyFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-slate-200/70 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors shadow-sm"
                >
                  <CheckCircle2 size={16} className="text-[#4f46e5] shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-[#1e293b]">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Version Info Badge */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
            <span className="text-xs font-semibold text-[#64748b]">System Version</span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-[#4f46e5] text-xs font-bold">
              Version 1.0.0
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#64748b]">
          <p>© 2026 KN FINANCE. All rights reserved.</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-[#1e293b] font-semibold rounded-xl shadow-sm transition-colors self-end sm:self-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
