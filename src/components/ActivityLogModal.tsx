import React, { useState, useMemo } from 'react';
import {
  ClipboardList,
  X,
  Search,
  LogIn,
  UserPlus,
  Pencil,
  IndianRupee,
  CheckCircle,
  UserCog,
  UserMinus,
  Building2,
  KeyRound,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ActivityAction, ActivityLogEntry } from '../types';
import { formatActivityDateTime, resolvePerformerName } from '../utils/activityUtils';

interface ActivityLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterCategory = 'All' | 'Payments' | 'Borrowers' | 'Users' | 'Account';

export const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ isOpen, onClose }) => {
  const { activityLogs, manager, agents } = useApp();
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Category mapping
  const matchesFilter = (action: ActivityAction, filter: FilterCategory): boolean => {
    switch (filter) {
      case 'Payments':
        return action === 'payment_collected';
      case 'Borrowers':
        return (
          action === 'borrower_created' ||
          action === 'borrower_updated' ||
          action === 'loan_closed'
        );
      case 'Users':
        return (
          action === 'agent_created' ||
          action === 'agent_updated' ||
          action === 'agent_deactivated'
        );
      case 'Account':
        return (
          action === 'login' ||
          action === 'manager_updated' ||
          action === 'company_updated' ||
          action === 'pin_changed'
        );
      case 'All':
      default:
        return true;
    }
  };

  // Filter & Search entries (newest first)
  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sorted = [...activityLogs].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );

    return sorted.filter((entry) => {
      if (!matchesFilter(entry.action, selectedFilter)) {
        return false;
      }
      if (!query) return true;

      const performer = resolvePerformerName(entry, manager, agents).toLowerCase();
      const message = entry.message.toLowerCase();
      const actionStr = entry.action.toLowerCase();

      return (
        message.includes(query) ||
        performer.includes(query) ||
        actionStr.includes(query)
      );
    });
  }, [activityLogs, selectedFilter, searchQuery, manager, agents]);

  if (!isOpen) return null;

  // Icon and badge styling per activity action
  const renderActionIcon = (action: ActivityAction) => {
    switch (action) {
      case 'login':
        return (
          <div className="w-9 h-9 rounded-full bg-indigo-50 text-[#4f46e5] flex items-center justify-center shrink-0">
            <LogIn size={18} />
          </div>
        );
      case 'borrower_created':
        return (
          <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <UserPlus size={18} />
          </div>
        );
      case 'borrower_updated':
        return (
          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Pencil size={17} />
          </div>
        );
      case 'payment_collected':
        return (
          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <IndianRupee size={18} />
          </div>
        );
      case 'loan_closed':
        return (
          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle size={18} />
          </div>
        );
      case 'agent_created':
        return (
          <div className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <UserPlus size={18} />
          </div>
        );
      case 'agent_updated':
        return (
          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <UserCog size={18} />
          </div>
        );
      case 'agent_deactivated':
        return (
          <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <UserMinus size={18} />
          </div>
        );
      case 'manager_updated':
        return (
          <div className="w-9 h-9 rounded-full bg-indigo-50 text-[#4f46e5] flex items-center justify-center shrink-0">
            <UserCog size={18} />
          </div>
        );
      case 'company_updated':
        return (
          <div className="w-9 h-9 rounded-full bg-indigo-50 text-[#4f46e5] flex items-center justify-center shrink-0">
            <Building2 size={18} />
          </div>
        );
      case 'pin_changed':
        return (
          <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <KeyRound size={18} />
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <ClipboardList size={18} />
          </div>
        );
    }
  };

  const filterTabs: { label: string; value: FilterCategory }[] = [
    { label: 'All Activities', value: 'All' },
    { label: 'Payments', value: 'Payments' },
    { label: 'Borrowers', value: 'Borrowers' },
    { label: 'Users', value: 'Users' },
    { label: 'Account', value: 'Account' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-50 text-[#4f46e5] flex items-center justify-center shrink-0">
              <ClipboardList size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b]">
                Activity Log
              </h2>
              <p className="text-xs text-[#64748b] mt-0.5">
                Audit history of account and finance actions
              </p>
            </div>
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

        {/* Filter and Search Bar */}
        <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSelectedFilter(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedFilter === tab.value
                    ? 'bg-[#4f46e5] text-white shadow-sm'
                    : 'text-[#64748b] hover:text-[#1e293b] hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[200px] sm:max-w-xs">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activity..."
              className="w-full h-8 sm:h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] transition-all"
            />
          </div>
        </div>

        {/* Modal Body / Log Entries List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activityLogs.length === 0 ? (
            /* Empty State: Zero activities in system */
            <div className="py-16 sm:py-20 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50/80 text-[#4f46e5] flex items-center justify-center mb-3">
                <ClipboardList size={28} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                No Activity Yet
              </h3>
              <p className="text-xs sm:text-sm text-[#64748b] max-w-sm mt-1">
                Your account and finance activities will appear here.
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            /* Empty State: No search/filter matches */
            <div className="py-12 text-center text-xs sm:text-sm text-[#64748b] font-medium">
              No matching activities found for the selected filter or search.
            </div>
          ) : (
            /* Populated Activity List */
            <div className="divide-y divide-slate-100">
              {filteredLogs.map((entry: ActivityLogEntry) => {
                const performerName = resolvePerformerName(entry, manager, agents);
                const dateTimeStr = formatActivityDateTime(entry.createdAt);

                return (
                  <div
                    key={entry.id}
                    className="py-3.5 sm:py-4 flex items-start gap-3.5 hover:bg-slate-50/60 px-3 rounded-xl transition-colors"
                  >
                    {renderActionIcon(entry.action)}

                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[#1e293b] leading-snug">
                        {entry.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-[#64748b] mt-1 font-medium">
                        <span>{dateTimeStr}</span>
                        <span>•</span>
                        <span>
                          Performed by:{' '}
                          <strong className="font-semibold text-[#1e293b]">
                            {performerName}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
