import React, { useState } from 'react';
import {
  Users,
  X,
  Plus,
  Pencil,
  Eye,
  EyeOff,
  UserX,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { AgentUser } from '../types';

interface ManageUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManageUsersModal: React.FC<ManageUsersModalProps> = ({ isOpen, onClose }) => {
  const { manager, agents, updateManager, addAgent, updateAgent, toggleAgentStatus } = useApp();

  // Sub-modal states
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentUser | null>(null);
  const [isEditManagerOpen, setIsEditManagerOpen] = useState(false);
  const [deactivatingAgent, setDeactivatingAgent] = useState<AgentUser | null>(null);

  // Add Agent Form State
  const [addFullName, setAddFullName] = useState('');
  const [addMobile, setAddMobile] = useState('');
  const [addPin, setAddPin] = useState('');
  const [addConfirmPin, setAddConfirmPin] = useState('');
  const [showAddPin, setShowAddPin] = useState(false);
  const [showAddConfirmPin, setShowAddConfirmPin] = useState(false);
  const [addErrors, setAddErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Edit Agent Form State
  const [editAgentName, setEditAgentName] = useState('');
  const [editAgentMobile, setEditAgentMobile] = useState('');
  const [isChangeAgentPin, setIsChangeAgentPin] = useState(false);
  const [newAgentPin, setNewAgentPin] = useState('');
  const [confirmNewAgentPin, setConfirmNewAgentPin] = useState('');
  const [showNewAgentPin, setShowNewAgentPin] = useState(false);
  const [showConfirmNewAgentPin, setShowConfirmNewAgentPin] = useState(false);
  const [editAgentErrors, setEditAgentErrors] = useState<{ [key: string]: string }>({});
  const [isSubmittingEditAgent, setIsSubmittingEditAgent] = useState(false);

  // Edit Manager Form State
  const [editManagerName, setEditManagerName] = useState('');
  const [editManagerMobile, setEditManagerMobile] = useState('');
  const [isChangeManagerPin, setIsChangeManagerPin] = useState(false);
  const [newManagerPin, setNewManagerPin] = useState('');
  const [confirmNewManagerPin, setConfirmNewManagerPin] = useState('');
  const [showNewManagerPin, setShowNewManagerPin] = useState(false);
  const [showConfirmNewManagerPin, setShowConfirmNewManagerPin] = useState(false);
  const [editManagerErrors, setEditManagerErrors] = useState<{ [key: string]: string }>({});

  if (!isOpen) return null;

  // Open Edit Manager
  const handleOpenEditManager = () => {
    setEditManagerName(manager?.fullName && manager.fullName !== 'Manager User' ? manager.fullName : '');
    setEditManagerMobile(manager?.mobile || '');
    setIsChangeManagerPin(false);
    setNewManagerPin('');
    setConfirmNewManagerPin('');
    setEditManagerErrors({});
    setIsEditManagerOpen(true);
  };

  // Open Edit Agent
  const handleOpenEditAgent = (agent: AgentUser) => {
    setEditingAgent(agent);
    setEditAgentName(agent.fullName);
    setEditAgentMobile(agent.mobile);
    setIsChangeAgentPin(false);
    setNewAgentPin('');
    setConfirmNewAgentPin('');
    setEditAgentErrors({});
  };

  // Submit Add Agent
  const handleSaveAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { [key: string]: string } = {};

    if (!addFullName.trim()) {
      errs.fullName = 'Agent Full Name is required';
    }

    const cleanMobile = addMobile.replace(/\D/g, '');
    if (!cleanMobile) {
      errs.mobile = 'Mobile Number is required';
    } else if (cleanMobile.length !== 10) {
      errs.mobile = 'Mobile Number must be exactly 10 digits';
    }

    if (!addPin) {
      errs.pin = '4-Digit PIN is required';
    } else if (!/^\d{4}$/.test(addPin)) {
      errs.pin = 'PIN must be exactly 4 numeric digits';
    }

    if (!addConfirmPin) {
      errs.confirmPin = 'Please confirm PIN';
    } else if (addPin !== addConfirmPin) {
      errs.confirmPin = 'PINs do not match';
    }

    if (Object.keys(errs).length > 0) {
      setAddErrors(errs);
      return;
    }

    setIsSubmittingAdd(true);
    const result = await addAgent({
      fullName: addFullName.trim(),
      mobile: cleanMobile,
      pin: addPin.trim(),
    });
    setIsSubmittingAdd(false);

    if (!result.success) {
      setAddErrors({ general: result.error || 'Failed to add agent' });
      return;
    }

    // Reset and close
    setAddFullName('');
    setAddMobile('');
    setAddPin('');
    setAddConfirmPin('');
    setAddErrors({});
    setIsAddAgentOpen(false);
  };

  // Submit Edit Agent
  const handleSaveEditAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent) return;
    const errs: { [key: string]: string } = {};

    if (!editAgentName.trim()) {
      errs.fullName = 'Agent Full Name is required';
    }

    const cleanMobile = editAgentMobile.replace(/\D/g, '');
    if (!cleanMobile) {
      errs.mobile = 'Mobile Number is required';
    } else if (cleanMobile.length !== 10) {
      errs.mobile = 'Mobile Number must be exactly 10 digits';
    }

    if (isChangeAgentPin) {
      if (!newAgentPin) {
        errs.pin = 'New 4-Digit PIN is required';
      } else if (!/^\d{4}$/.test(newAgentPin)) {
        errs.pin = 'PIN must be exactly 4 numeric digits';
      }

      if (!confirmNewAgentPin) {
        errs.confirmPin = 'Please confirm new PIN';
      } else if (newAgentPin !== confirmNewAgentPin) {
        errs.confirmPin = 'PINs do not match';
      }
    }

    if (Object.keys(errs).length > 0) {
      setEditAgentErrors(errs);
      return;
    }

    setIsSubmittingEditAgent(true);
    const result = await updateAgent(editingAgent.id, {
      fullName: editAgentName.trim(),
      mobile: cleanMobile,
      pin: isChangeAgentPin ? newAgentPin.trim() : undefined,
    });
    setIsSubmittingEditAgent(false);

    if (!result.success) {
      setEditAgentErrors({ general: result.error || 'Failed to update agent' });
      return;
    }

    setEditingAgent(null);
  };

  // Submit Edit Manager
  const handleSaveEditManager = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { [key: string]: string } = {};

    if (!editManagerName.trim()) {
      errs.fullName = 'Full Name is required';
    }

    const cleanMobile = editManagerMobile.replace(/\D/g, '');
    if (!cleanMobile) {
      errs.mobile = 'Mobile Number is required';
    } else if (cleanMobile.length !== 10) {
      errs.mobile = 'Mobile Number must be exactly 10 digits';
    }

    // Check duplicate with agents
    const conflict = agents.find((a) => a.mobile === cleanMobile);
    if (conflict) {
      errs.mobile = 'Mobile number belongs to an existing agent';
    }

    if (isChangeManagerPin) {
      if (!newManagerPin) {
        errs.pin = 'New 4-Digit PIN is required';
      } else if (!/^\d{4}$/.test(newManagerPin)) {
        errs.pin = 'PIN must be exactly 4 numeric digits';
      }

      if (!confirmNewManagerPin) {
        errs.confirmPin = 'Please confirm new PIN';
      } else if (newManagerPin !== confirmNewManagerPin) {
        errs.confirmPin = 'PINs do not match';
      }
    }

    if (Object.keys(errs).length > 0) {
      setEditManagerErrors(errs);
      return;
    }

    updateManager({
      fullName: editManagerName.trim(),
      mobile: cleanMobile,
      pin: isChangeManagerPin ? newManagerPin.trim() : undefined,
    });

    setIsEditManagerOpen(false);
  };

  const managerDisplayName =
    manager?.fullName && manager.fullName !== 'Manager User' ? manager.fullName : 'Manager';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[850px] w-full max-h-[92vh] flex flex-col border border-slate-100 overflow-hidden text-[#1e293b]">
        {/* MODAL HEADER */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center shrink-0">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b]">
                Manage Users
              </h2>
              <p className="text-xs sm:text-sm font-medium text-[#64748b]">
                View and configure managers & agents
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#64748b] hover:text-[#1e293b] flex items-center justify-center transition-colors border border-slate-200/80"
          >
            <X size={18} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
          {/* ACTION BAR: Section Title + Add New Agent */}
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm sm:text-base font-bold text-[#1e293b] uppercase tracking-wide">
              Existing Users
            </h3>
            <button
              type="button"
              onClick={() => {
                setAddFullName('');
                setAddMobile('');
                setAddPin('');
                setAddConfirmPin('');
                setAddErrors({});
                setIsAddAgentOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.99]"
            >
              <Plus size={16} />
              <span>Add New Agent</span>
            </button>
          </div>

          {/* USER LIST CONTAINER */}
          <div className="space-y-3">
            {/* USER 1: REGISTERED MANAGER (ALWAYS FIRST) */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-200/80 bg-white hover:border-[#c7d2fe] shadow-sm transition-all flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center text-sm border border-emerald-200/60 shrink-0">
                  {managerDisplayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm sm:text-base font-bold text-[#1e293b]">
                      {managerDisplayName}
                    </span>
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                      Manager
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#64748b] font-medium mt-0.5">
                    Phone: <span className="font-semibold text-[#1e293b]">{manager?.mobile || '-'}</span>
                  </p>
                </div>
              </div>

              {/* Manager Actions: Edit icon only (NO delete, NO PIN display) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenEditManager}
                  title="Edit Manager Details"
                  className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-indigo-50 text-[#64748b] hover:text-[#4f46e5] flex items-center justify-center transition-colors border border-slate-200/80"
                >
                  <Pencil size={15} />
                </button>
              </div>
            </div>

            {/* USER 2+: AGENTS */}
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`p-4 sm:p-5 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                  agent.status === 'active'
                    ? 'border-slate-200/80 bg-white hover:border-[#c7d2fe] shadow-sm'
                    : 'border-slate-200 bg-slate-50/60 opacity-80'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-full font-bold flex items-center justify-center text-sm shrink-0 border ${
                      agent.status === 'active'
                        ? 'bg-[#eef2ff] text-[#4f46e5] border-[#c7d2fe]/60'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {agent.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-bold text-[#1e293b]">
                        {agent.fullName}
                      </span>
                      {agent.status === 'active' ? (
                        <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-[#eef2ff] text-[#4f46e5] border border-[#c7d2fe]/80">
                          Agent
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-[#64748b] font-medium mt-0.5">
                      Phone: <span className="font-semibold text-[#1e293b]">{agent.mobile}</span>
                    </p>
                  </div>
                </div>

                {/* Agent Actions: Edit & Deactivate/Reactivate */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditAgent(agent)}
                    title="Edit Agent Details"
                    className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-indigo-50 text-[#64748b] hover:text-[#4f46e5] flex items-center justify-center transition-colors border border-slate-200/80"
                  >
                    <Pencil size={15} />
                  </button>

                  {agent.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => setDeactivatingAgent(agent)}
                      title="Deactivate Agent"
                      className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-rose-50 text-[#64748b] hover:text-rose-600 flex items-center justify-center transition-colors border border-slate-200/80"
                    >
                      <UserX size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleAgentStatus(agent.id)}
                      title="Reactivate Agent"
                      className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-emerald-50 text-[#64748b] hover:text-emerald-600 flex items-center justify-center transition-colors border border-slate-200/80"
                    >
                      <UserCheck size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Empty State for Agents */}
            {agents.length === 0 && (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                <p className="text-xs sm:text-sm text-[#64748b] font-medium">
                  No agents added yet. Click <span className="font-semibold text-[#4f46e5]">+ Add New Agent</span> to assign loans and collect payments.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SUB-MODAL 1: ADD NEW AGENT */}
      {/* ======================================================== */}
      {isAddAgentOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[500px] w-full border border-slate-100 overflow-hidden text-[#1e293b]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                Add New Agent
              </h3>
              <button
                type="button"
                onClick={() => setIsAddAgentOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSaveAddAgent} className="p-6 space-y-4">
              {addErrors.general && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-600 font-semibold">
                  {addErrors.general}
                </div>
              )}

              {/* 1. Agent Full Name * */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Agent Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={addFullName}
                  onChange={(e) => {
                    setAddFullName(e.target.value);
                    if (addErrors.fullName) setAddErrors((p) => ({ ...p, fullName: '' }));
                  }}
                  placeholder="Enter agent's full name"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                {addErrors.fullName && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{addErrors.fullName}</p>
                )}
              </div>

              {/* 2. Mobile Number * */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={addMobile}
                  onChange={(e) => {
                    setAddMobile(e.target.value.replace(/\D/g, ''));
                    if (addErrors.mobile) setAddErrors((p) => ({ ...p, mobile: '' }));
                  }}
                  placeholder="10-digit mobile number"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                {addErrors.mobile && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{addErrors.mobile}</p>
                )}
              </div>

              {/* 3. 4-Digit PIN * */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  4-Digit PIN <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAddPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    value={addPin}
                    onChange={(e) => {
                      setAddPin(e.target.value.replace(/\D/g, ''));
                      if (addErrors.pin) setAddErrors((p) => ({ ...p, pin: '' }));
                    }}
                    placeholder="Enter 4-digit PIN"
                    className="w-full h-11 pl-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPin(!showAddPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showAddPin ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {addErrors.pin && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{addErrors.pin}</p>
                )}
              </div>

              {/* 4. Confirm PIN * */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Confirm PIN <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAddConfirmPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    value={addConfirmPin}
                    onChange={(e) => {
                      setAddConfirmPin(e.target.value.replace(/\D/g, ''));
                      if (addErrors.confirmPin) setAddErrors((p) => ({ ...p, confirmPin: '' }));
                    }}
                    placeholder="Re-enter 4-digit PIN"
                    className="w-full h-11 pl-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddConfirmPin(!showAddConfirmPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showAddConfirmPin ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {addErrors.confirmPin && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{addErrors.confirmPin}</p>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddAgentOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-[#64748b] hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="px-5 py-2 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.99]"
                >
                  Save Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-MODAL 2: EDIT AGENT */}
      {/* ======================================================== */}
      {editingAgent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[500px] w-full border border-slate-100 overflow-hidden text-[#1e293b]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                Edit Agent
              </h3>
              <button
                type="button"
                onClick={() => setEditingAgent(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSaveEditAgent} className="p-6 space-y-4">
              {editAgentErrors.general && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-600 font-semibold">
                  {editAgentErrors.general}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Agent Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editAgentName}
                  onChange={(e) => setEditAgentName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                {editAgentErrors.fullName && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{editAgentErrors.fullName}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={editAgentMobile}
                  onChange={(e) => setEditAgentMobile(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                {editAgentErrors.mobile && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{editAgentErrors.mobile}</p>
                )}
              </div>

              {/* Change PIN Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs sm:text-sm font-semibold text-[#4f46e5]">
                  <input
                    type="checkbox"
                    checked={isChangeAgentPin}
                    onChange={(e) => {
                      setIsChangeAgentPin(e.target.checked);
                      setNewAgentPin('');
                      setConfirmNewAgentPin('');
                    }}
                    className="w-4 h-4 rounded text-[#4f46e5] border-slate-300 focus:ring-[#4f46e5] accent-[#4f46e5]"
                  />
                  <span>Change 4-Digit PIN</span>
                </label>
              </div>

              {/* Change PIN Fields */}
              {isChangeAgentPin && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                      New 4-Digit PIN <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewAgentPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={4}
                        value={newAgentPin}
                        onChange={(e) => setNewAgentPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter new 4-digit PIN"
                        className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#4f46e5]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewAgentPin(!showNewAgentPin)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewAgentPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {editAgentErrors.pin && (
                      <p className="text-xs text-rose-500 mt-1 font-medium">{editAgentErrors.pin}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                      Confirm New PIN <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmNewAgentPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={4}
                        value={confirmNewAgentPin}
                        onChange={(e) => setConfirmNewAgentPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="Re-enter new 4-digit PIN"
                        className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#4f46e5]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewAgentPin(!showConfirmNewAgentPin)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmNewAgentPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {editAgentErrors.confirmPin && (
                      <p className="text-xs text-rose-500 mt-1 font-medium">{editAgentErrors.confirmPin}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingAgent(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-[#64748b] hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditAgent}
                  className="px-5 py-2 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.99]"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-MODAL 3: EDIT MANAGER */}
      {/* ======================================================== */}
      {isEditManagerOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[500px] w-full border border-slate-100 overflow-hidden text-[#1e293b]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                Edit Manager Details
              </h3>
              <button
                type="button"
                onClick={() => setIsEditManagerOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSaveEditManager} className="p-6 space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Manager Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editManagerName}
                  onChange={(e) => setEditManagerName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                {editManagerErrors.fullName && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{editManagerErrors.fullName}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={editManagerMobile}
                  onChange={(e) => setEditManagerMobile(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                {editManagerErrors.mobile && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{editManagerErrors.mobile}</p>
                )}
              </div>

              {/* Change PIN Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs sm:text-sm font-semibold text-[#4f46e5]">
                  <input
                    type="checkbox"
                    checked={isChangeManagerPin}
                    onChange={(e) => {
                      setIsChangeManagerPin(e.target.checked);
                      setNewManagerPin('');
                      setConfirmNewManagerPin('');
                    }}
                    className="w-4 h-4 rounded text-[#4f46e5] border-slate-300 focus:ring-[#4f46e5] accent-[#4f46e5]"
                  />
                  <span>Change 4-Digit Login PIN</span>
                </label>
              </div>

              {/* Change PIN Fields */}
              {isChangeManagerPin && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                      New 4-Digit PIN <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewManagerPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={4}
                        value={newManagerPin}
                        onChange={(e) => setNewManagerPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter new 4-digit PIN"
                        className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#4f46e5]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewManagerPin(!showNewManagerPin)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewManagerPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {editManagerErrors.pin && (
                      <p className="text-xs text-rose-500 mt-1 font-medium">{editManagerErrors.pin}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1e293b] mb-1">
                      Confirm New PIN <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmNewManagerPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={4}
                        value={confirmNewManagerPin}
                        onChange={(e) => setConfirmNewManagerPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="Re-enter new 4-digit PIN"
                        className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#4f46e5]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewManagerPin(!showConfirmNewManagerPin)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmNewManagerPin ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {editManagerErrors.confirmPin && (
                      <p className="text-xs text-rose-500 mt-1 font-medium">{editManagerErrors.confirmPin}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditManagerOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-[#64748b] hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.99]"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-MODAL 4: CONFIRM DEACTIVATE AGENT */}
      {/* ======================================================== */}
      {deactivatingAgent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[460px] w-full border border-slate-100 p-6 text-[#1e293b]">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>

            <h3 className="text-lg font-bold text-center text-[#1e293b] mb-2">
              Deactivate Agent?
            </h3>
            <p className="text-xs sm:text-sm text-center text-[#64748b] mb-6">
              Are you sure you want to deactivate <span className="font-bold text-[#1e293b]">{deactivatingAgent.fullName}</span>? Deactivated agents cannot be assigned to new loans, but historical payment and collection records will be safely preserved.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeactivatingAgent(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-[#64748b] hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleAgentStatus(deactivatingAgent.id);
                  setDeactivatingAgent(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.99]"
              >
                Confirm Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
