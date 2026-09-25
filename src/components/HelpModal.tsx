import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  X,
  ChevronDown,
  ChevronUp,
  UserPlus,
  CreditCard,
  Calendar,
  Clock,
  Users,
  KeyRound,
  Database,
  HelpCircle as FaqIcon,
  Search,
  MessageCircle,
  ShieldAlert,
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  content: React.ReactNode;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'getting-started': true,
    'collect-payment': false,
    'due-overdue': false,
    'finance-schedules': false,
    'agents': false,
    'change-pin': false,
    'backup-restore': false,
    'faqs': false,
  });

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

  // Reset search when opening
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const sections: HelpSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      badge: 'Manager Action',
      icon: UserPlus,
      content: (
        <div className="space-y-2 text-xs sm:text-sm text-[#475569] leading-relaxed">
          <p>
            Managers can register borrowers and create new loans easily from the Dashboard or Borrowers view:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 font-medium text-[#1e293b]">
            <li>
              Click <span className="font-bold text-[#4f46e5]">+ Add Borrower</span> on the top navigation.
            </li>
            <li>
              Enter borrower contact information (Full Name, Phone Number, Line/Area).
            </li>
            <li>
              Configure the Finance parameters: Principal Amount, Interest Rate, Repayment Duration, and Collection Frequency (Daily, Weekly, or Monthly).
            </li>
            <li>
              Save to generate the canonical repayment schedule and add the loan to the system.
            </li>
          </ol>
        </div>
      ),
    },
    {
      id: 'collect-payment',
      title: 'Collect Payment',
      icon: CreditCard,
      content: (
        <div className="space-y-2 text-xs sm:text-sm text-[#475569] leading-relaxed">
          <p>
            Collections and installment payments are recorded quickly from the borrower profile:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 font-medium text-[#1e293b]">
            <li>
              Open <span className="font-bold text-[#4f46e5]">Borrower Details</span> and click <span className="font-bold text-[#4f46e5]">Collect Payment</span>.
            </li>
            <li>
              Enter the collected installment amount, payment date, and collection method (Cash, GPay, PhonePe, Paytm, or Bank Transfer).
            </li>
            <li>
              Submitting the payment immediately updates the borrower ledger, settles due installments using the FIFO waterfall rule, and adjusts cash in hand.
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'due-overdue',
      title: 'Due & Overdue Queue',
      icon: Clock,
      content: (
        <div className="space-y-2 text-xs sm:text-sm text-[#475569] leading-relaxed">
          <p>
            The main Dashboard table operates as a dynamic <span className="font-bold text-[#1e293b]">Collection Work Queue</span>:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 font-medium text-[#1e293b]">
            <li>
              <span className="font-semibold text-[#1e293b]">Actionable Visibility:</span> Borrowers appear in the Active table only when they have an installment due today or overdue.
            </li>
            <li>
              <span className="font-semibold text-[#1e293b]">Automatic Queue Clearance:</span> When currently due installments are satisfied, the borrower disappears from the queue until their next scheduled due date.
            </li>
            <li>
              <span className="font-semibold text-[#1e293b]">Earliest Due Date:</span> The table displays the earliest unpaid actionable due date rather than the overall loan end date.
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'finance-schedules',
      title: 'Finance Schedules',
      icon: Calendar,
      content: (
        <div className="space-y-2 text-xs sm:text-sm text-[#475569] leading-relaxed">
          <p>
            KN FINANCE supports 3 canonical repayment frequency schedules:
          </p>
          <div className="space-y-2 pt-1">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="font-bold text-[#1e293b]">Daily:</span> Installments are collected every calendar day from loan start through completion.
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="font-bold text-[#1e293b]">Weekly:</span> Installments fall due on the chosen weekday (e.g. Every Monday).
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="font-bold text-[#1e293b]">Monthly:</span> Installments occur on the selected monthly collection day (1–31) with automatic month-end capping (e.g. 31st adjusts to 28/29 Feb, 30 Apr).
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'agents',
      title: 'Agent Management & Roles',
      badge: 'Manager / Agent',
      icon: Users,
      content: (
        <div className="space-y-2 text-xs sm:text-sm text-[#475569] leading-relaxed">
          <p>
            Role-based access ensures operational security and tenant isolation:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 font-medium text-[#1e293b]">
            <li>
              <span className="font-semibold text-[#1e293b]">Managers:</span> Can create and manage Agent accounts, configure company lines, and perform global company reporting.
            </li>
            <li>
              <span className="font-semibold text-[#1e293b]">Agents:</span> Can view and collect payments only for borrowers assigned to them or their assigned lines.
            </li>
            <li>
              <span className="font-semibold text-[#1e293b]">Manager Only Areas:</span> Manage Users, Company Settings, and Backup & Restore are restricted to Managers.
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'change-pin',
      title: 'Change PIN',
      icon: KeyRound,
      content: (
        <div className="space-y-2 text-xs sm:text-sm text-[#475569] leading-relaxed">
          <p>
            Both Managers and Agents can securely update their 4-digit authentication PIN at any time:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 font-medium text-[#1e293b]">
            <li>Navigate to <span className="font-bold text-[#4f46e5]">Profile → Change PIN</span>.</li>
            <li>Enter your <span className="font-semibold text-[#1e293b]">Current PIN</span>.</li>
            <li>Enter your <span className="font-semibold text-[#1e293b]">New 4-Digit PIN</span> and re-enter in <span className="font-semibold text-[#1e293b]">Confirm New PIN</span>.</li>
            <li>Click <span className="font-bold text-[#4f46e5]">Change PIN</span> to save.</li>
          </ol>
          <p className="text-[11px] text-[#64748b] italic pt-1">
            * PINs are cryptographically hashed on the server with blowfish bcrypt and are never logged or displayed.
          </p>
        </div>
      ),
    },
    {
      id: 'backup-restore',
      title: 'Backup & Restore',
      badge: 'Manager Only',
      icon: Database,
      content: (
        <div className="space-y-2 text-xs sm:text-sm text-[#475569] leading-relaxed">
          <p>
            Managers can safeguard financial records using the Backup & Restore module:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 font-medium text-[#1e293b]">
            <li>
              <span className="font-semibold text-[#1e293b]">Download Backup:</span> Exports an encrypted, verified snapshot of company borrowers, repayment schedules, and ledger entries.
            </li>
            <li>
              <span className="font-semibold text-[#1e293b]">Restore Backup:</span> Allows authorized Managers to restore verified backup archives in case of device migration.
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'faqs',
      title: 'Frequently Asked Questions',
      icon: FaqIcon,
      content: (
        <div className="space-y-3 pt-1">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
            <h5 className="font-bold text-[#1e293b] text-xs sm:text-sm">
              Why is a borrower not showing on the Dashboard table?
            </h5>
            <p className="text-xs text-[#475569] leading-relaxed">
              The Active Dashboard view acts as a work queue showing only borrowers who have an actionable installment due today or overdue. If a borrower has paid all installments due through today, they are hidden until their next due date.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
            <h5 className="font-bold text-[#1e293b] text-xs sm:text-sm">
              Why does a borrower reappear on the Dashboard later?
            </h5>
            <p className="text-xs text-[#475569] leading-relaxed">
              Borrowers automatically reappear whenever their next scheduled installment date arrives (e.g. tomorrow for Daily, next week on the designated weekday for Weekly, or next month for Monthly).
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
            <h5 className="font-bold text-[#1e293b] text-xs sm:text-sm">
              Can an Agent see all company borrowers?
            </h5>
            <p className="text-xs text-[#475569] leading-relaxed">
              No. Agent access is strictly restricted to borrowers assigned to them or within their assigned collection lines.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
            <h5 className="font-bold text-[#1e293b] text-xs sm:text-sm">
              Can I change my PIN?
            </h5>
            <p className="text-xs text-[#475569] leading-relaxed">
              Yes. Both Managers and Agents can update their security PIN from Profile → Change PIN at any time.
            </p>
          </div>
        </div>
      ),
    },
  ];

  const filteredSections = sections.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.badge?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-[#4f46e5] border border-indigo-100/80">
              <HelpCircle size={20} />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-lg font-bold text-[#1e293b]">
                Help & User Guide
              </h2>
              <p className="text-xs text-[#64748b] font-medium">
                Guides, workflow instructions & answers to common questions
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

        {/* Search Input Bar */}
        <div className="p-4 sm:px-6 bg-white border-b border-slate-100">
          <div className="relative">
            <Search size={16} className="absolute inset-y-0 left-3.5 my-auto text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help topics, features, FAQs..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-[#1e293b] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition-all"
            />
          </div>
        </div>

        {/* Scrollable Accordion Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
          {filteredSections.length === 0 ? (
            <div className="text-center py-8 text-slate-400 space-y-2">
              <p className="text-sm font-semibold text-slate-600">No help topics found</p>
              <p className="text-xs">Try searching for a different keyword or browse the topics below.</p>
            </div>
          ) : (
            filteredSections.map((section) => {
              const Icon = section.icon;
              const isExpanded = !!expandedSections[section.id];
              return (
                <div
                  key={section.id}
                  className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-sm transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-50/70 text-[#4f46e5]">
                        <Icon size={16} />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-[#1e293b]">
                        {section.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {section.badge && (
                        <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {section.badge}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-white animate-in fade-in duration-150">
                      {section.content}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Contact Support Section */}
          <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-100/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[#4f46e5] text-white shrink-0 mt-0.5 sm:mt-0 shadow-sm">
                <MessageCircle size={18} />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-[#1e293b]">
                  Contact Support
                </h4>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Need assistance with your finance operations or setup? Contact your system administrator.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm self-end sm:self-auto">
              <ShieldAlert size={14} className="text-[#4f46e5]" />
              <span>Admin Managed</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-[#64748b]">
          <p>KN FINANCE Help Center</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-[#1e293b] font-semibold rounded-xl shadow-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
