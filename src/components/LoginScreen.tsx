import React, { useState } from 'react';
import { Eye, EyeOff, Lock, AlertCircle, Loader2, Cloud } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LoginScreen: React.FC = () => {
  const { manager, cloudLogin, navigateTo } = useApp();

  // Cloud Mode fields
  const [companyCode, setCompanyCode] = useState(
    manager?.companyCode || ''
  );
  const [mobile, setMobile] = useState(
    manager?.mobile ? manager.mobile.replace(/\D/g, '') : ''
  );
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);

  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Authoritative Cloud Login Handler (Zero Silent Fallback)
  const handleCloudLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError('');
    setIsLocked(false);

    const normCode = companyCode.trim().toUpperCase();
    const cleanMobile = mobile.replace(/\D/g, '');
    const cleanPin = pin.trim();

    // Validation
    if (!normCode) {
      setError('Please enter your Company Code');
      return;
    }

    if (!cleanMobile) {
      setError('Please enter your 10-digit Mobile Number');
      return;
    }

    if (cleanMobile.length !== 10) {
      setError('Mobile Number must be exactly 10 digits');
      return;
    }

    if (!cleanPin) {
      setError('Please enter your 4-digit PIN');
      return;
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }

    setIsSubmitting(true);

    try {
      // Authoritative Cloud authentication — strictly no silent local fallback
      const result = await cloudLogin(normCode, cleanMobile, cleanPin, keepLoggedIn);

      if (!result.success) {
        if (result.isLocked) {
          setIsLocked(true);
        }
        setError(result.error || 'Invalid company code, mobile number, or PIN.');
      }
    } catch {
      setError('Authentication service is unreachable. Please check your internet connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen justify-center items-center px-4 sm:px-6 py-8 sm:py-12 w-full bg-[#f8fafc]">
      <div className="flex flex-col justify-center items-center w-full max-w-[550px] mx-auto my-auto py-4">
        {/* Main Card */}
        <div className="w-full bg-white rounded-2xl p-6 sm:p-10 md:p-12 shadow-[0_4px_25px_rgba(0,0,0,0.04)] border border-slate-100">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1e293b]">
              KN FINANCE
            </h1>
            <p className="text-sm sm:text-base font-medium text-[#64748b] mt-1.5 flex items-center justify-center gap-1.5">
              <Cloud size={16} className="text-[#4f46e5]" />
              <span>Sign In to Your Company Account</span>
            </p>
          </div>

          {/* Error / Lockout Banner */}
          {error && (
            <div
              className={`mb-5 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs sm:text-sm font-medium ${
                isLocked
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-600'
              }`}
            >
              {isLocked ? (
                <Lock size={18} className="shrink-0 text-amber-600 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="shrink-0 text-red-500 mt-0.5" />
              )}
              <div>{error}</div>
            </div>
          )}

          {/* Form: Primary Cloud Sign In */}
          <form onSubmit={handleCloudLogin} className="space-y-4">
            {/* Company Code */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                Company Code
              </label>
              <input
                type="text"
                autoCapitalize="characters"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                placeholder="e.g. KNF01"
                disabled={isSubmitting}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] font-medium tracking-wide uppercase placeholder:normal-case placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all disabled:bg-slate-50"
              />
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                Mobile Number
              </label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 10-digit mobile number"
                disabled={isSubmitting}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all disabled:bg-slate-50"
              />
            </div>

            {/* 4-Digit PIN */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                4-Digit PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 4-digit PIN"
                  disabled={isSubmitting}
                  className="w-full h-12 pl-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] tracking-widest placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all disabled:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPin ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            {/* Keep me logged in */}
            <div className="flex items-center pt-1 pb-1">
              <input
                id="login-keep-logged-in"
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded text-[#4f46e5] border-slate-300 focus:ring-[#4f46e5] accent-[#4f46e5] cursor-pointer"
              />
              <label
                htmlFor="login-keep-logged-in"
                className="ml-2.5 text-xs sm:text-sm font-medium text-[#475569] cursor-pointer select-none"
              >
                Keep me logged in
              </label>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-xl bg-[#4f46e5] text-white font-medium text-sm sm:text-base shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                'Login'
              )}
            </button>
          </form>

          {/* Back to Welcome Link */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => navigateTo('welcome')}
              className="text-xs sm:text-sm text-[#64748b] hover:text-[#1e293b] font-medium transition-colors"
            >
              Back to Welcome
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
