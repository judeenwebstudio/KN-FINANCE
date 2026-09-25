import React from 'react';
import { useApp } from '../context/AppContext';

export const SuccessScreen: React.FC = () => {
  const { manager, navigateTo } = useApp();

  return (
    <div className="flex flex-col min-h-screen justify-between items-center px-4 sm:px-6 py-8 sm:py-12 w-full">
      <div className="flex-1 flex flex-col justify-center items-center w-full my-auto py-4">
        {/* Main Card */}
        <div className="w-full max-w-[550px] bg-white rounded-2xl p-6 sm:p-10 md:p-12 shadow-[0_4px_25px_rgba(0,0,0,0.04)] border border-slate-100 text-center">
          {/* Heading */}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1e293b] mb-4">
            KN FINANCE
          </h1>

          {/* Success Title */}
          <h2 className="text-lg sm:text-xl font-bold text-[#1e293b] mb-2">
            Registration Successful!
          </h2>

          {/* Subtext */}
          <p className="text-xs sm:text-sm text-[#64748b] mb-6 font-medium">
            Your Company Code is:
          </p>

          {/* Dashed Border Box with Company Code */}
          <div className="mx-auto w-full py-5 px-6 rounded-xl border-2 border-dashed border-[#4f46e5]/40 bg-[#f5f6ff] mb-8 flex items-center justify-center">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-widest text-[#4f46e5]">
              {manager?.companyCode || 'SFS806'}
            </span>
          </div>

          {/* Continue to Login Button */}
          <button
            onClick={() => navigateTo('login')}
            className="w-full h-12 rounded-xl bg-[#4f46e5] text-white font-medium text-sm sm:text-base shadow-sm hover:bg-[#4338ca] active:scale-[0.99] transition-all flex items-center justify-center mb-6"
          >
            Continue to Login
          </button>
        </div>
      </div>
    </div>
  );
};
