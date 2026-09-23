import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LoginScreen: React.FC = () => {
  const { manager, login, navigateTo } = useApp();

  const [identifier, setIdentifier] = useState(manager?.mobile || manager?.email || '');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Please enter your Mobile Number or Email');
      return;
    }

    if (!pin) {
      setError('Please enter your 4-digit PIN');
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }

    const result = login(identifier.trim(), pin.trim());
    if (!result.success) {
      setError(result.error || 'Invalid credentials');
    }
  };

  return (
    <div className="flex flex-col min-h-screen justify-between items-center px-4 sm:px-6 py-8 sm:py-12 w-full">
      <div className="flex-1 flex flex-col justify-center items-center w-full my-auto py-4">
        {/* Main Card */}
        <div className="w-full max-w-[550px] bg-white rounded-2xl p-6 sm:p-10 md:p-12 shadow-[0_4px_25px_rgba(0,0,0,0.04)] border border-slate-100">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1e293b]">
              KN FINANCE
            </h1>
            <p className="text-sm sm:text-base font-medium text-[#64748b] mt-1.5">
              Manager Login
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Mobile / Email */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
                Mobile Number or Email
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter mobile or email"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
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
            </div>

            {/* Keep me logged in */}
            <div className="flex items-center pt-1 pb-1">
              <input
                id="login-keep-logged-in"
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
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
              className="w-full h-12 rounded-xl bg-[#4f46e5] text-white font-medium text-sm sm:text-base shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center justify-center mt-2"
            >
              Login
            </button>
          </form>

          {/* Links */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => navigateTo('register')}
              className="text-xs sm:text-sm font-semibold text-[#4f46e5] hover:underline"
            >
              Don't have an account? Create Account
            </button>
          </div>

          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => navigateTo('welcome')}
              className="text-xs text-[#64748b] hover:text-[#1e293b]"
            >
              Back to Welcome
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
