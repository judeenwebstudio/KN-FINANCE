import React from 'react';
import { useApp } from '../context/AppContext';

export const WelcomeScreen: React.FC = () => {
  const { navigateTo } = useApp();

  return (
    <div className="flex flex-col min-h-screen justify-between items-center px-4 sm:px-6 py-8 sm:py-12 w-full">
      {/* Centered Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto my-auto py-8">
        {/* Uploaded KN Finance Logo */}
        <div className="w-64 sm:w-80 max-w-[85%] flex items-center justify-center mb-6">
          <img
            src="/kn-finance-logo-transparent.png"
            alt="KN FINANCE"
            className="w-full h-auto object-contain max-h-32"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/kn-finance-logo.png';
            }}
          />
        </div>

        {/* KN FINANCE Title */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1e293b] mb-8 text-center">
          KN FINANCE
        </h1>

        {/* Action Buttons */}
        <div className="w-full max-w-xs sm:max-w-sm space-y-3.5">
          <button
            onClick={() => navigateTo('register')}
            className="w-full h-12 rounded-xl bg-[#4f46e5] text-white font-medium text-base shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center justify-center"
          >
            Create Account
          </button>

          <button
            onClick={() => navigateTo('login')}
            className="w-full h-12 rounded-xl border border-[#4f46e5] text-[#4f46e5] bg-white font-medium text-base hover:bg-indigo-50/50 active:scale-[0.99] transition-all flex items-center justify-center"
          >
            Login
          </button>
        </div>

        {/* WhatsApp support link */}
        <div className="mt-8 text-center">
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

      {/* Bottom Version */}
      <div className="text-center text-xs text-[#94a3b8] font-medium pt-4 pb-2">
        v1.8
      </div>
    </div>
  );
};
