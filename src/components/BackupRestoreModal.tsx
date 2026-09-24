import React, { useState, useRef } from 'react';
import {
  Database,
  X,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  createBackupPayload,
  downloadBackupFile,
  validateBackupFile,
  performSafeRestore,
} from '../utils/backupUtils';
import type { KNFinanceBackup } from '../types';
import { formatActivityDateTime } from '../utils/activityUtils';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    manager,
    company,
    agents,
    borrowers,
    payments,
    activityLogs,
    addActivity,
    settings,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<KNFinanceBackup | null>(
    null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // 1. Handle Backup Download
  const handleBackupDownload = () => {
    try {
      const { backup, filename, backupActivity } = createBackupPayload({
        manager,
        company,
        agents,
        borrowers,
        payments,
        activityLogs,
        settings,
      });

      // Update in-memory activity logs immediately so the event is recorded
      addActivity({
        action: backupActivity.action,
        performedByUserId: backupActivity.performedByUserId,
        performedByRole: backupActivity.performedByRole,
        message: backupActivity.message,
      });

      // Trigger browser download
      downloadBackupFile(backup, filename);
      showToast('Backup downloaded successfully.');
    } catch {
      showToast('Failed to create backup file.');
    }
  };

  // 2. Handle File Selection and Validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setValidationError(null);
    setRestoreError(null);

    if (!file) {
      setSelectedFile(null);
      setSelectedBackup(null);
      return;
    }

    setSelectedFile({ name: file.name, size: file.size });

    if (!file.name.toLowerCase().endsWith('.json')) {
      setValidationError('This is not a valid KN FINANCE backup file.');
      setSelectedBackup(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') {
        setValidationError('This is not a valid KN FINANCE backup file.');
        setSelectedBackup(null);
        return;
      }

      const result = validateBackupFile(content);
      if (!result.isValid || !result.backup) {
        setValidationError(
          result.error || 'This is not a valid KN FINANCE backup file.'
        );
        setSelectedBackup(null);
      } else {
        setSelectedBackup(result.backup);
      }
    };

    reader.onerror = () => {
      setValidationError('Unable to read selected file.');
      setSelectedBackup(null);
    };

    reader.readAsText(file);
  };

  // 3. Trigger Confirm Dialog
  const handleOpenRestoreConfirm = () => {
    if (!selectedBackup) return;
    setIsConfirmOpen(true);
  };

  // 4. Perform Restore
  const handleConfirmRestore = () => {
    if (!selectedBackup) return;

    const result = performSafeRestore(selectedBackup);
    if (!result.success) {
      setIsConfirmOpen(false);
      setRestoreError(
        result.error ||
          'Unable to restore backup. Your current data has been preserved.'
      );
      return;
    }

    // Save success flag to sessionStorage for display after page reload
    sessionStorage.setItem('kn_finance_restore_success', 'true');
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-50 text-[#4f46e5] flex items-center justify-center shrink-0">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b]">
                Backup & Restore
              </h2>
              <p className="text-xs text-[#64748b] mt-0.5">
                Download and restore your KN FINANCE business data
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

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm text-emerald-800 font-medium animate-in slide-in-from-top-2 duration-150">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Global Restore Error */}
        {restoreError && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm text-rose-800 font-medium">
            <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <span>{restoreError}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* SECTION 1: BACKUP DATA */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 sm:p-6 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#1e293b] flex items-center gap-2">
                  <Download size={19} className="text-[#4f46e5]" />
                  Backup Data
                </h3>
                <p className="text-xs sm:text-sm text-[#64748b] mt-1.5 max-w-lg leading-relaxed">
                  Download a backup file containing your KN FINANCE data. Keep this file in a safe place.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#64748b] mt-2.5 font-medium">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  <span>Your backup is created locally on this device.</span>
                </div>
              </div>

              <div className="shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={handleBackupDownload}
                  className="px-5 py-2.5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-[0.98]"
                >
                  <Download size={16} />
                  <span>Backup Data</span>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 2: RESTORE DATA */}
          <div className="bg-amber-50/40 border border-amber-200/80 rounded-2xl p-5 sm:p-6 transition-all">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100/80 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-base sm:text-lg font-bold text-[#1e293b]">
                  Restore Data
                </h3>
                <p className="text-xs sm:text-sm text-amber-900/90 font-medium mt-1 leading-relaxed">
                  Restoring from a backup file will overwrite all current KN FINANCE data. This action cannot be undone.
                </p>
              </div>
            </div>

            {/* File Controls */}
            <div className="mt-5 pt-4 border-t border-amber-200/60 flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1e293b] text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-sm transition-all"
              >
                <Upload size={16} className="text-[#4f46e5]" />
                <span>Choose Backup File</span>
              </button>

              <button
                type="button"
                disabled={!selectedBackup}
                onClick={handleOpenRestoreConfirm}
                className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all ${
                  selectedBackup
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm cursor-pointer active:scale-[0.98]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Restore</span>
              </button>
            </div>

            {/* Validated Backup Preview Card */}
            {selectedBackup && selectedFile && (
              <div className="mt-4 p-4 bg-white/90 border border-emerald-200 rounded-xl shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <FileCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-[#1e293b] break-all">
                        {selectedFile.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#64748b] mt-1 font-medium">
                        <span>Created: {formatActivityDateTime(selectedBackup.createdAt, settings.dateFormat)}</span>
                        <span>•</span>
                        <span>Version: {selectedBackup.backupVersion}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#1e293b] text-[10px] font-semibold">
                          {selectedBackup.data.borrowers.length} Borrowers
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#1e293b] text-[10px] font-semibold">
                          {selectedBackup.data.payments.length} Payments
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#1e293b] text-[10px] font-semibold">
                          {selectedBackup.data.agents.length} Agents
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#1e293b] text-[10px] font-semibold">
                          {selectedBackup.data.activityLogs.length} Activities
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 shrink-0">
                    Ready to Restore
                  </span>
                </div>
              </div>
            )}

            {/* Validation Error Message */}
            {validationError && (
              <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs sm:text-sm text-rose-700 font-medium">
                <AlertCircle size={17} className="shrink-0 text-rose-600" />
                <span>{validationError}</span>
              </div>
            )}
          </div>
        </div>

        {/* SECOND CONFIRMATION DIALOG */}
        {isConfirmOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-100">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 animate-in zoom-in-95 duration-100">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
                <AlertTriangle size={24} />
              </div>

              <h3 className="text-lg font-bold text-[#1e293b]">
                Restore Backup?
              </h3>

              <p className="text-xs sm:text-sm text-[#64748b] mt-2 leading-relaxed">
                This will replace your current KN FINANCE data with the selected backup. This action cannot be undone.
              </p>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsConfirmOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[#64748b] hover:text-[#1e293b] hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all active:scale-[0.98]"
                >
                  Restore Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
