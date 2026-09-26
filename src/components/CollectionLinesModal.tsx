import React, { useState } from 'react';
import {
  MapPin,
  X,
  Plus,
  Pencil,
  Check,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { CompanyCollectionLine } from '../types';

interface CollectionLinesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CollectionLinesModal: React.FC<CollectionLinesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentRole, collectionLines, addCollectionLine, updateCollectionLine, toggleCollectionLineStatus } = useApp();

  const [newLineName, setNewLineName] = useState('');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineName, setEditingLineName] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Manager-only guard
  if (currentRole !== 'manager') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 text-center shadow-2xl border border-slate-100">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Access Denied</h3>
          <p className="text-sm text-slate-500 mb-6">
            Only the Company Manager can manage collection lines.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setSuccessMsg(null);
    } else {
      setSuccessMsg(msg);
      setErrorMsg(null);
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = newLineName.trim();

    if (!trimmed) {
      showNotification('Line name cannot be blank.', true);
      return;
    }

    setIsSubmitting(true);
    const result = await addCollectionLine(trimmed);
    setIsSubmitting(false);

    if (result.success) {
      setNewLineName('');
      showNotification(`Collection line "${trimmed}" added successfully.`);
    } else {
      showNotification(result.error || 'Failed to add collection line.', true);
    }
  };

  const handleStartEditing = (line: CompanyCollectionLine) => {
    setErrorMsg(null);
    setEditingLineId(line.id);
    setEditingLineName(line.name);
  };

  const handleCancelEditing = () => {
    setEditingLineId(null);
    setEditingLineName('');
    setErrorMsg(null);
  };

  const handleSaveRename = async (lineId: string) => {
    setErrorMsg(null);
    const trimmed = editingLineName.trim();

    if (!trimmed) {
      showNotification('Line name cannot be blank.', true);
      return;
    }

    setIsSubmitting(true);
    const result = await updateCollectionLine(lineId, trimmed);
    setIsSubmitting(false);

    if (result.success) {
      setEditingLineId(null);
      setEditingLineName('');
      showNotification(`Collection line renamed to "${trimmed}".`);
    } else {
      showNotification(result.error || 'Failed to rename collection line.', true);
    }
  };

  const handleToggleStatus = async (line: CompanyCollectionLine) => {
    setErrorMsg(null);
    setIsSubmitting(true);
    const result = await toggleCollectionLineStatus(line.id);
    setIsSubmitting(false);

    if (result.success) {
      const nextStatus = line.status === 'active' ? 'deactivated' : 'activated';
      showNotification(`Collection line "${line.name}" was ${nextStatus}.`);
    } else {
      showNotification(result.error || 'Failed to change line status.', true);
    }
  };

  const activeCount = collectionLines.filter((l) => l.status === 'active').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
              <MapPin size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Collection Lines
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100/80 text-indigo-700">
                  {collectionLines.length} Total ({activeCount} Active)
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Manage lines for borrower assignments and collections
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs sm:text-sm font-medium flex items-center gap-2.5 animate-in fade-in duration-150">
              <AlertCircle size={16} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs sm:text-sm font-medium flex items-center gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Add New Line Form */}
          <form onSubmit={handleAddLine} className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
              Add New Collection Line
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLineName}
                onChange={(e) => {
                  setNewLineName(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Enter line name (e.g. KK Nagar)"
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium transition-all"
                disabled={isSubmitting}
              />
              <button
                type="submit"
                disabled={isSubmitting || !newLineName.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-sm shadow-indigo-600/20 active:scale-[0.98]"
              >
                <Plus size={16} />
                <span>Add Line</span>
              </button>
            </div>
          </form>

          {/* Lines List */}
          <div className="space-y-2.5 pt-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
              Current Collection Lines ({collectionLines.length})
            </label>

            {collectionLines.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
                No collection lines configured. Add a line above to get started.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {collectionLines.map((line) => {
                  const isEditing = editingLineId === line.id;
                  const isActive = line.status === 'active';

                  return (
                    <div
                      key={line.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
                          : 'bg-slate-50/70 border-slate-200/60 opacity-80'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingLineName}
                            onChange={(e) => setEditingLineName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(line.id);
                              if (e.key === 'Escape') handleCancelEditing();
                            }}
                            autoFocus
                            className="flex-1 px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(line.id)}
                            disabled={isSubmitting || !editingLineName.trim()}
                            title="Save Rename"
                            className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditing}
                            disabled={isSubmitting}
                            title="Cancel"
                            className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                isActive ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-slate-800 block truncate">
                                {line.name}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                                  isActive
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Rename Button */}
                            <button
                              type="button"
                              onClick={() => handleStartEditing(line)}
                              disabled={isSubmitting}
                              title="Rename Line"
                              className="p-2 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-xl transition-colors"
                            >
                              <Pencil size={14} />
                            </button>

                            {/* Toggle Active/Inactive Button */}
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(line)}
                              disabled={isSubmitting}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors ${
                                isActive
                                  ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Helper / Note */}
          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100/80 text-[12px] text-amber-800 leading-relaxed">
            <span className="font-bold">Note:</span> Inactive lines will not be selectable when creating new borrowers. Any existing borrower with an inactive line will continue to preserve their line name.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl transition-all active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
