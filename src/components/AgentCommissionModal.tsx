import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  BadgePercent,
  Search,
  User,
  Users,
  MapPin,
  FileText,
  Building2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { resolveAgentName } from '../utils/agentUtils';

interface AgentCommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBorrower?: (borrowerId: string) => void;
}

export const AgentCommissionModal: React.FC<AgentCommissionModalProps> = ({
  isOpen,
  onClose,
  onSelectBorrower,
}) => {
  const {
    borrowers,
    agents,
    currentRole,
    currentUser,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');

  // Reset filters whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setSelectedAgentId('all');
      setSearchQuery('');
    }
  }, [isOpen]);

  // Role Scoped Borrowers:
  // - Agent: ONLY borrowers assigned to authenticated Agent
  // - Manager: All borrowers in company assigned to an agent
  const scopedBorrowers = useMemo(() => {
    if (currentRole === 'agent') {
      const agentUserId = currentUser?.companyUserId;
      const agentName = currentUser?.fullName?.toLowerCase();
      return borrowers.filter((b) =>
        (agentUserId && b.agentId === agentUserId) ||
        (!b.agentId && b.assignedAgent && agentName && b.assignedAgent.toLowerCase() === agentName)
      );
    }

    // Manager scope: all borrowers in company with an assigned agent
    return borrowers.filter((b) =>
      Boolean(b.agentId || (b.assignedAgent && b.assignedAgent.trim() !== ''))
    );
  }, [borrowers, currentRole, currentUser]);

  // Available Agents for dropdown (Agents only see themselves; Managers see all company agents)
  const availableAgents = useMemo(() => {
    if (currentRole === 'agent') {
      const agentUserId = currentUser?.companyUserId;
      const agentName = currentUser?.fullName?.toLowerCase();
      return agents.filter(
        (a) =>
          (agentUserId
            ? a.id === agentUserId
            : Boolean(agentName && a.fullName.toLowerCase() === agentName))
      );
    }
    return agents;
  }, [agents, currentRole, currentUser]);

  // Match borrower by selected agent unique ID (not display name)
  const isBorrowerAssignedToAgent = (b: (typeof borrowers)[0], targetAgentId: string): boolean => {
    if (b.agentId) {
      return b.agentId === targetAgentId;
    }
    // Safe fallback for legacy borrower records without agentId:
    // Only resolve by name if there is an unambiguous single agent with that name,
    // preventing incorrect commission attribution when agent names are duplicated.
    if (b.assignedAgent && b.assignedAgent.trim()) {
      const trimmed = b.assignedAgent.trim().toLowerCase();
      const matchingAgents = agents.filter((a) => a.fullName.toLowerCase() === trimmed);
      if (matchingAgents.length === 1) {
        return matchingAgents[0].id === targetAgentId;
      }
    }
    return false;
  };

  // Filter commission records by selected agent
  const agentFilteredBorrowers = useMemo(() => {
    if (selectedAgentId === 'all') {
      return scopedBorrowers;
    }
    return scopedBorrowers.filter((b) => isBorrowerAssignedToAgent(b, selectedAgentId));
  }, [scopedBorrowers, selectedAgentId, agents]);

  // Total Agent Commission: Exact mathematical match to selected agent (or all agents)
  const totalCommission = useMemo(() => {
    return agentFilteredBorrowers.reduce((sum, b) => sum + (b.agentCommission || 0), 0);
  }, [agentFilteredBorrowers]);

  // Selected agent display name for single-agent bottom summary
  const selectedAgent = useMemo(() => {
    if (selectedAgentId === 'all') return null;
    return availableAgents.find((a) => a.id === selectedAgentId) || null;
  }, [availableAgents, selectedAgentId]);

  const selectedAgentName = selectedAgent ? selectedAgent.fullName : 'Selected Agent';

  // Per-agent totals for All Agents breakdown (uses unique agent IDs)
  // Depends ONLY on scopedBorrowers and availableAgents (not on search filter)
  const agentSummaries = useMemo(() => {
    return availableAgents.map((agent) => {
      const agentTotal = scopedBorrowers
        .filter((b) => isBorrowerAssignedToAgent(b, agent.id))
        .reduce((sum, b) => sum + (b.agentCommission || 0), 0);

      return {
        id: agent.id,
        name: agent.fullName,
        total: agentTotal,
      };
    });
  }, [availableAgents, scopedBorrowers, agents]);

  // Grand total across all scoped borrowers (matches top banner when 'all' is selected)
  const grandTotalCommission = useMemo(() => {
    return scopedBorrowers.reduce((sum, b) => sum + (b.agentCommission || 0), 0);
  }, [scopedBorrowers]);

  // Reconcile any unassigned or ambiguous legacy commission
  const sumAssignedCommission = useMemo(() => {
    return agentSummaries.reduce((sum, item) => sum + item.total, 0);
  }, [agentSummaries]);

  const unassignedCommission = Math.max(0, grandTotalCommission - sumAssignedCommission);

  // Non-zero commission records for borrower-wise list based on selected agent
  const commissionRecords = useMemo(() => {
    return agentFilteredBorrowers.filter((b) => (b.agentCommission || 0) > 0);
  }, [agentFilteredBorrowers]);

  // Search filter
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return commissionRecords;

    return commissionRecords.filter((b) => {
      const name = (b.borrowerName || b.name || '').toLowerCase();
      const phone = (b.phoneNumber || b.phone || '');
      const bookNo = b.bookNo !== null && b.bookNo !== undefined ? String(b.bookNo) : '';
      const line = (b.collectionLine || '').toLowerCase();
      const agent = (resolveAgentName(b, agents) || '').toLowerCase();

      return (
        name.includes(q) ||
        phone.includes(q) ||
        bookNo === q ||
        bookNo.includes(q) ||
        line.includes(q) ||
        agent.includes(q)
      );
    });
  }, [commissionRecords, searchQuery, agents]);

  if (!isOpen) return null;

  const handleRowClick = (borrowerId: string) => {
    if (onSelectBorrower) {
      onClose();
      onSelectBorrower(borrowerId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#4f46e5]">
              <BadgePercent size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Agent Commission Details
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {currentRole === 'manager'
                  ? 'Borrower-wise Agent Commission breakdown across company loans'
                  : 'Borrower-wise breakdown for your assigned loans'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Total Commission Summary Banner */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Total Agent Commission
              </span>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white mt-0.5 tracking-tight">
                ₹{totalCommission.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-indigo-200 text-xs font-semibold">
                {commissionRecords.length} {commissionRecords.length === 1 ? 'borrower' : 'borrowers'} with commission
              </span>
            </div>
          </div>
        </div>

        {/* Controls / Search Bar & Agent Filter */}
        <div className="px-5 sm:px-6 py-3 border-b border-slate-100 bg-slate-50/70 shrink-0 flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center flex-1">
            {/* Agent Dropdown Filter */}
            <div className="w-full sm:w-48 shrink-0">
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full h-9 px-3 text-xs sm:text-sm font-semibold text-slate-800 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all cursor-pointer shadow-sm"
                aria-label="Filter by Agent"
              >
                <option value="all">All Agents</option>
                {availableAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.fullName}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:max-w-xs">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search borrower, book no, line..."
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-500 self-end sm:self-center shrink-0">
            Showing {filteredRecords.length} of {commissionRecords.length} records
          </div>
        </div>

        {/* Modal Body / Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-[220px]">
          {filteredRecords.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <FileText size={24} />
              </div>
              <p className="text-sm font-bold text-slate-700">No agent commission records found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {searchQuery.trim()
                  ? 'No borrower matches your search query. Try adjusting your search keywords.'
                  : selectedAgentId !== 'all'
                  ? 'No commission records found for the selected agent.'
                  : 'Borrowers with assigned agent commission will automatically appear in this list.'}
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE (Hidden on Mobile) */}
              <div className="hidden sm:block overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4 text-center w-20">Book No</th>
                      <th className="py-3 px-4">Borrower</th>
                      <th className="py-3 px-4">Line</th>
                      <th className="py-3 px-4">Agent</th>
                      <th className="py-3 px-4 text-right">Loan Amount</th>
                      <th className="py-3 px-4 text-right">Agent Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {filteredRecords.map((b) => {
                      const agentName = resolveAgentName(b, agents) || '—';
                      const lineName = b.collectionLine?.trim() || '—';
                      const loanAmt = b.loanAmount || b.amount || 0;
                      const commAmt = b.agentCommission || 0;

                      return (
                        <tr
                          key={b.id}
                          onClick={() => handleRowClick(b.id)}
                          className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 px-4 text-center font-bold text-slate-700">
                            {b.bookNo !== null && b.bookNo !== undefined ? (
                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold group-hover:bg-indigo-100 group-hover:text-[#4f46e5] transition-colors">
                                #{b.bookNo}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 group-hover:text-[#4f46e5] transition-colors">
                              {b.borrowerName || b.name}
                            </div>
                            {(b.phoneNumber || b.phone) && (
                              <div className="text-[11px] text-slate-400 font-normal">
                                {b.phoneNumber || b.phone}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-medium">
                            <span className="inline-flex items-center gap-1 text-xs">
                              <MapPin size={12} className="text-slate-400 shrink-0" />
                              <span className="truncate max-w-[120px]">{lineName}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-medium">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <User size={13} className="text-slate-400 shrink-0" />
                              <span className="truncate max-w-[120px]">{agentName}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-800">
                            ₹{loanAmt.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-[#4f46e5]">
                            ₹{commAmt.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD LIST (Visible on Mobile only) */}
              <div className="sm:hidden space-y-3">
                {filteredRecords.map((b) => {
                  const agentName = resolveAgentName(b, agents) || '—';
                  const lineName = b.collectionLine?.trim() || '—';
                  const loanAmt = b.loanAmount || b.amount || 0;
                  const commAmt = b.agentCommission || 0;

                  return (
                    <div
                      key={b.id}
                      onClick={() => handleRowClick(b.id)}
                      className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm active:scale-[0.99] transition-all cursor-pointer hover:border-indigo-300"
                    >
                      {/* Top row: Book No & Borrower Name */}
                      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-sm truncate">
                            {b.borrowerName || b.name}
                          </div>
                          {(b.phoneNumber || b.phone) && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              {b.phoneNumber || b.phone}
                            </div>
                          )}
                        </div>
                        {b.bookNo !== null && b.bookNo !== undefined && (
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                            Book #{b.bookNo}
                          </span>
                        )}
                      </div>

                      {/* Middle row: Line & Agent info */}
                      <div className="grid grid-cols-2 gap-2 py-2.5 text-xs text-slate-600 border-b border-slate-100">
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{lineName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate justify-end">
                          <User size={13} className="text-slate-400 shrink-0" />
                          <span className="truncate">{agentName}</span>
                        </div>
                      </div>

                      {/* Bottom row: Loan Amount & Agent Commission */}
                      <div className="flex items-center justify-between pt-2.5">
                        <div>
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                            Loan Amount
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            ₹{loanAmt.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider block">
                            Commission
                          </span>
                          <span className="text-sm font-extrabold text-[#4f46e5]">
                            ₹{commAmt.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Agent Commission Total Summary Section */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                <Users size={14} className="text-indigo-600" />
                <span>Agent Commission Total Summary</span>
              </div>

              {selectedAgentId !== 'all' ? (
                /* Specific Agent Selected */
                <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-indigo-100 shadow-sm">
                  <span className="text-xs sm:text-sm font-bold text-slate-800">
                    {selectedAgentName} — Total Commission:
                  </span>
                  <span className="text-sm sm:text-base font-extrabold text-[#4f46e5]">
                    ₹{totalCommission.toLocaleString('en-IN')}
                  </span>
                </div>
              ) : (
                /* All Agents Selected */
                <div className="space-y-2">
                  <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
                    {agentSummaries.length === 0 ? (
                      <div className="px-3.5 py-3 text-xs text-slate-400 text-center">
                        No agents registered
                      </div>
                    ) : (
                      agentSummaries.map((agent) => (
                        <div
                          key={agent.id}
                          className="flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50/50 transition-colors"
                        >
                          <span className="truncate pr-2">
                            {agent.name} <span className="text-slate-400 font-normal">—</span>
                          </span>
                          <span className="font-bold text-slate-900 shrink-0">
                            ₹{agent.total.toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))
                    )}

                    {unassignedCommission > 0 && (
                      <div className="flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-amber-700 bg-amber-50/50">
                        <span className="truncate pr-2">
                          Other / Legacy Assigned <span className="text-amber-400 font-normal">—</span>
                        </span>
                        <span className="font-bold text-amber-800 shrink-0">
                          ₹{unassignedCommission.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Grand Total */}
                  <div className="flex items-center justify-between p-3.5 bg-indigo-50/80 rounded-xl border border-indigo-100 shadow-sm">
                    <span className="text-xs sm:text-sm font-bold text-indigo-950">
                      Grand Total <span className="text-indigo-400 font-normal">—</span>
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-[#4f46e5]">
                      ₹{grandTotalCommission.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {currentRole === 'manager' ? (
              <span className="flex items-center gap-1">
                <Building2 size={13} />
                <span>Company Scope</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Users size={13} />
                <span>Assigned Loans Scope</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
