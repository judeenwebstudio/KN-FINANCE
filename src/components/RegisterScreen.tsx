import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const RegisterScreen: React.FC = () => {
  const { navigateTo, registerManager } = useApp();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);

  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full Name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email Address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Enter a valid email address';
    }

    const cleanMobile = mobile.replace(/\D/g, '');
    if (!cleanMobile) {
      newErrors.mobile = 'Mobile Number is required';
    } else if (cleanMobile.length !== 10) {
      newErrors.mobile = 'Mobile Number must be 10 digits';
    }

    if (!pin) {
      newErrors.pin = '4-Digit PIN is required';
    } else if (!/^\d{4}$/.test(pin)) {
      newErrors.pin = 'PIN must be exactly 4 digits';
    }

    if (!confirmPin) {
      newErrors.confirmPin = 'Please confirm your PIN';
    } else if (pin !== confirmPin) {
      newErrors.confirmPin = 'PINs do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    registerManager({
      fullName: fullName.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      pin: pin.trim(),
      keepLoggedIn,
    });
  };

  return (
    <div className="flex flex-col min-h-screen justify-between items-center px-4 sm:px-6 py-8 sm:py-12 w-full">
      <div className="flex-1 flex flex-col justify-center items-center w-full my-auto py-4">
        {/* Main Desktop Card: 600px - 700px width with comfortable internal padding */}
        <div className="w-full max-w-[650px] bg-white rounded-2xl p-6 sm:p-10 md:p-12 shadow-[0_4px_25px_rgba(0,0,0,0.04)] border border-slate-100">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1e293b]">
              KN FINANCE
            </h1>
            <p className="text-sm sm:text-base font-medium text-[#64748b] mt-1.5">
              Create Manager Account
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
            {/* 1. Full Name */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter full name"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
              />
              {errors.fullName && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.fullName}</p>
              )}
            </div>

            {/* 2. Email Address */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.email}</p>
              )}
            </div>

            {/* 3. Mobile Number */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                Mobile Number
              </label>
              <input
                type="tel"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile number"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
              />
              {errors.mobile && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.mobile}</p>
              )}
            </div>

            {/* 4. 4-Digit PIN */}
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
                  className="w-full h-12 pl-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPin ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {errors.pin && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.pin}</p>
              )}
            </div>

            {/* 5. Confirm PIN */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                Confirm PIN
              </label>
              <div className="relative">
                <input
                  type={showConfirmPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Re-enter 4-digit PIN"
                  className="w-full h-12 pl-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showConfirmPin ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {errors.confirmPin && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.confirmPin}</p>
              )}
            </div>

            {/* Keep me logged in */}
            <div className="flex items-center pt-1 pb-1">
              <input
                id="keep-logged-in"
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                className="w-4 h-4 rounded text-[#4f46e5] border-slate-300 focus:ring-[#4f46e5] accent-[#4f46e5] cursor-pointer"
              />
              <label
                htmlFor="keep-logged-in"
                className="ml-2.5 text-xs sm:text-sm font-medium text-[#475569] cursor-pointer select-none"
              >
                Keep me logged in
              </label>
            </div>

            {/* Register Button */}
            <button
              type="submit"
              className="w-full h-12 rounded-xl bg-[#4f46e5] text-white font-medium text-sm sm:text-base shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center justify-center mt-2"
            >
              Register
            </button>
          </form>

          {/* Continue with Google */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                if (!email) setEmail('manager@knfinance.com');
                if (!mobile) setMobile('9876543210');
                if (!pin) {
                  setPin('1234');
                  setConfirmPin('1234');
                }
              }}
              className="w-full h-12 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-[#334155] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 shadow-none"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Back to Login */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => navigateTo('login')}
              className="text-xs sm:text-sm font-semibold text-[#4f46e5] hover:underline"
            >
              Back to Login
            </button>
          </div>

          {/* WhatsApp Support */}
          <div className="mt-5 text-center">
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs sm:text-sm text-[#64748b] hover:text-[#4f46e5] transition-colors"
            >
              Any problem? Contact us on <span className="font-semibold text-[#25D366]">WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Bottom Version */}
      <div className="text-center text-xs text-[#94a3b8] font-medium pt-4 pb-2">
        v1.8
      </div>
    </div>
  );
};
