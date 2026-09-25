import React, { useState, useEffect } from 'react';
import { KeyRound, X, Eye, EyeOff, Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { changeUserPin } from '../lib/authService';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({ isOpen, onClose }) => {
  const { isCloudAuth, manager, updateManager, addActivity, currentUser } = useApp();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState<number | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setShowCurrentPin(false);
      setShowNewPin(false);
      setShowConfirmPin(false);
      setError(null);
      setSuccessMessage(null);
      setIsLoading(false);
      setLockoutRemaining(null);
    }
  }, [isOpen]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining === null || lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  if (!isOpen) return null;

  const handleNumericInput = (val: string, setter: (v: string) => void) => {
    // Only allow numeric digits up to 4 characters
    const clean = val.replace(/\D/g, '').slice(0, 4);
    setter(clean);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanCurrent = currentPin.trim();
    const cleanNew = newPin.trim();
    const cleanConfirm = confirmPin.trim();

    // 1. Client-side Format Validations
    if (!cleanCurrent) {
      setError('Current PIN is required.');
      return;
    }
    if (cleanCurrent.length !== 4) {
      setError('Current PIN must be exactly 4 numeric digits.');
      return;
    }

    if (!cleanNew) {
      setError('New PIN is required.');
      return;
    }
    if (cleanNew.length !== 4) {
      setError('New PIN must be exactly 4 numeric digits.');
      return;
    }

    if (cleanConfirm.length !== 4) {
      setError('Please confirm your new 4-digit PIN.');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setError('Confirm PIN does not match the new PIN.');
      return;
    }

    if (cleanCurrent === cleanNew) {
      setError('New PIN must be different from current PIN.');
      return;
    }

    setIsLoading(true);

    try {
      if (isCloudAuth) {
        // Cloud Authentication: Change PIN via serverless/RPC bcrypt flow
        const result = await changeUserPin({
          currentPin: cleanCurrent,
          newPin: cleanNew,
        });

        if (result.success) {
          setSuccessMessage(result.message || 'PIN changed successfully.');
          setCurrentPin('');
          setNewPin('');
          setConfirmPin('');
          setTimeout(() => {
            onClose();
          }, 1500);
        } else {
          setError(result.error || 'Failed to change PIN.');
          if (result.isLocked && result.lockoutSeconds) {
            setLockoutRemaining(result.lockoutSeconds);
          }
        }
      } else {
        // Local/Demo Mode Fallback
        if (manager?.pin && manager.pin !== cleanCurrent) {
          setError('Current PIN is incorrect.');
          setIsLoading(false);
          return;
        }

        updateManager({ pin: cleanNew });
        addActivity({
          action: 'pin_changed',
          performedByUserId: null,
          performedByRole: currentUser?.role || 'manager',
          message: 'PIN changed successfully.',
        });

        setSuccessMessage('PIN changed successfully.');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 text-[#4f46e5]">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1e293b]">Change PIN</h2>
              <p className="text-xs text-slate-500 font-medium">
                Update your 4-digit security PIN
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2.5 text-sm text-red-700">
              <AlertCircle size={18} className="shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1 text-xs sm:text-sm font-medium">
                {error}
                {lockoutRemaining !== null && lockoutRemaining > 0 && (
                  <span className="block mt-1 font-semibold text-red-800">
                    Remaining lockout: {lockoutRemaining} seconds
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-2.5 text-sm text-emerald-700">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
              <span className="text-xs sm:text-sm font-medium">{successMessage}</span>
            </div>
          )}

          {/* Current PIN */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              Current PIN <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={16} />
              </div>
              <input
                type={showCurrentPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={currentPin}
                onChange={(e) => handleNumericInput(e.target.value, setCurrentPin)}
                placeholder="••••"
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 tracking-widest placeholder:tracking-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition-all disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPin(!showCurrentPin)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showCurrentPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New PIN */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              New 4-Digit PIN <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound size={16} />
              </div>
              <input
                type={showNewPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={newPin}
                onChange={(e) => handleNumericInput(e.target.value, setNewPin)}
                placeholder="••••"
                disabled={isLoading}
                autoComplete="new-password"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 tracking-widest placeholder:tracking-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition-all disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowNewPin(!showNewPin)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showNewPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Must be exactly 4 numeric digits and different from current PIN
            </p>
          </div>

          {/* Confirm New PIN */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              Confirm New PIN <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound size={16} />
              </div>
              <input
                type={showConfirmPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => handleNumericInput(e.target.value, setConfirmPin)}
                placeholder="••••"
                disabled={isLoading}
                autoComplete="new-password"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 tracking-widest placeholder:tracking-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5] transition-all disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPin(!showConfirmPin)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                tabIndex={-1}
              >
                {showConfirmPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !currentPin || !newPin || !confirmPin}
              className="px-5 py-2.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              <span>{isLoading ? 'Changing PIN...' : 'Change PIN'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
