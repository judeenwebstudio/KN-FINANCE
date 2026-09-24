import React, { useState } from 'react';
import {
  X,
  Settings,
  Languages,
  Calendar,
  Volume2,
  BellRing,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { t } from '../utils/i18n';
import { playPaymentSuccessSound } from '../utils/soundUtils';
import type { Language, AppDateFormat, Timeframe } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetSettings } = useApp();

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentLang = settings.language;

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 3000);
  };

  const handleLanguageChange = (lang: Language) => {
    updateSettings({ language: lang });
    showToast(t('settingsSavedToast', lang));
  };

  const handleDateFormatChange = (dateFormat: AppDateFormat) => {
    updateSettings({ dateFormat });
    showToast(t('settingsSavedToast', currentLang));
  };

  const handleTogglePaymentSound = (val: boolean) => {
    updateSettings({ paymentSoundAlert: val });
    if (val) {
      playPaymentSuccessSound();
    }
  };

  const handleTogglePaymentBanner = (val: boolean) => {
    updateSettings({ paymentBannerAlert: val });
  };

  const handleToggleConfirmPayment = (val: boolean) => {
    updateSettings({ confirmBeforePayment: val });
  };

  const handleDefaultFinanceType = (defaultFinanceType: Timeframe) => {
    updateSettings({ defaultFinanceType });
    showToast(t('settingsSavedToast', currentLang));
  };

  const handleToggleKeepLoggedIn = (val: boolean) => {
    updateSettings({ keepLoggedIn: val });
  };

  const handleConfirmReset = () => {
    resetSettings();
    setIsResetConfirmOpen(false);
    showToast(t('settingsResetToast', 'en'));
  };

  return (
    <>
      {/* Primary Settings Modal Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#4f46e5]">
                <Settings size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1e293b]">
                  {t('settingsTitle', currentLang)}
                </h2>
                <p className="text-xs text-[#64748b] mt-0.5">
                  {t('settingsSubtitle', currentLang)}
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

          {/* Success Toast */}
          {successToast && (
            <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs sm:text-sm font-semibold shadow-sm animate-in fade-in duration-200">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{successToast}</span>
            </div>
          )}

          {/* Body Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-sm">
            {/* 1. Preferences Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-2">
                <Languages size={15} className="text-[#4f46e5]" />
                <span>{t('preferencesSection', currentLang)}</span>
              </h3>

              <div className="bg-white rounded-xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-sm">
                {/* Language Row */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <h4 className="font-semibold text-[#1e293b]">
                      {t('language', currentLang)}
                    </h4>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      {t('languageDesc', currentLang)}
                    </p>
                  </div>
                  <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200/70 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('en')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        currentLang === 'en'
                          ? 'bg-white text-[#4f46e5] shadow-sm'
                          : 'text-[#64748b] hover:text-[#1e293b]'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('ta')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        currentLang === 'ta'
                          ? 'bg-white text-[#4f46e5] shadow-sm'
                          : 'text-[#64748b] hover:text-[#1e293b]'
                      }`}
                    >
                      தமிழ் (Tamil)
                    </button>
                  </div>
                </div>

                {/* Date Format Row */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={15} className="text-slate-400" />
                      <h4 className="font-semibold text-[#1e293b]">
                        {t('dateFormat', currentLang)}
                      </h4>
                    </div>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      {t('dateFormatDesc', currentLang)}
                    </p>
                  </div>

                  <div className="self-start sm:self-auto">
                    <select
                      value={settings.dateFormat}
                      onChange={(e) => handleDateFormatChange(e.target.value as AppDateFormat)}
                      className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-[#1e293b] focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all cursor-pointer shadow-sm"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (24/09/2026)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (09/24/2026)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (2026-09-24)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Payments & Collections Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-2">
                <Volume2 size={15} className="text-[#4f46e5]" />
                <span>{t('paymentsSection', currentLang)}</span>
              </h3>

              <div className="bg-white rounded-xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-sm">
                {/* Payment Sound Alert */}
                <div className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                      <Volume2 size={15} className="text-slate-400" />
                      <h4 className="font-semibold text-[#1e293b]">
                        {t('paymentSound', currentLang)}
                      </h4>
                    </div>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      {t('paymentSoundDesc', currentLang)}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.paymentSoundAlert}
                    onClick={() => handleTogglePaymentSound(!settings.paymentSoundAlert)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:ring-offset-2 ${
                      settings.paymentSoundAlert ? 'bg-[#4f46e5]' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.paymentSoundAlert ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Payment Banner Alert */}
                <div className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                      <BellRing size={15} className="text-slate-400" />
                      <h4 className="font-semibold text-[#1e293b]">
                        {t('paymentBanner', currentLang)}
                      </h4>
                    </div>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      {t('paymentBannerDesc', currentLang)}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.paymentBannerAlert}
                    onClick={() => handleTogglePaymentBanner(!settings.paymentBannerAlert)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:ring-offset-2 ${
                      settings.paymentBannerAlert ? 'bg-[#4f46e5]' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.paymentBannerAlert ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Confirm Before Payment */}
                <div className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="pr-4">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={15} className="text-slate-400" />
                      <h4 className="font-semibold text-[#1e293b]">
                        {t('confirmPayment', currentLang)}
                      </h4>
                    </div>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      {t('confirmPaymentDesc', currentLang)}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.confirmBeforePayment}
                    onClick={() => handleToggleConfirmPayment(!settings.confirmBeforePayment)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:ring-offset-2 ${
                      settings.confirmBeforePayment ? 'bg-[#4f46e5]' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.confirmBeforePayment ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Defaults & Security Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-2">
                <Clock size={15} className="text-[#4f46e5]" />
                <span>{t('defaultsSection', currentLang)}</span>
              </h3>

              <div className="bg-white rounded-xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden shadow-sm">
                {/* Default Finance Type */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <h4 className="font-semibold text-[#1e293b]">
                      {t('defaultFinanceType', currentLang)}
                    </h4>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      {t('defaultFinanceTypeDesc', currentLang)}
                    </p>
                  </div>

                  <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200/70 self-start sm:self-auto">
                    {(['Daily', 'Weekly', 'Monthly'] as Timeframe[]).map((type) => {
                      const active = settings.defaultFinanceType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleDefaultFinanceType(type)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            active
                              ? 'bg-white text-[#4f46e5] shadow-sm'
                              : 'text-[#64748b] hover:text-[#1e293b]'
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Keep Me Logged In */}
                <div className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="pr-4">
                    <h4 className="font-semibold text-[#1e293b]">
                      {t('keepLoggedIn', currentLang)}
                    </h4>
                    <p className="text-xs text-[#64748b] mt-0.5">
                      {t('keepLoggedInDesc', currentLang)}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.keepLoggedIn}
                    onClick={() => handleToggleKeepLoggedIn(!settings.keepLoggedIn)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:ring-offset-2 ${
                      settings.keepLoggedIn ? 'bg-[#4f46e5]' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.keepLoggedIn ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* 4. Reset Settings Zone */}
            <div className="pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-[#1e293b]">
                    {t('resetSettings', currentLang)}
                  </h4>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    Restore application preferences to factory defaults.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(true)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-red-600 hover:border-red-200 text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
                >
                  <RotateCcw size={15} />
                  <span>{t('resetButton', currentLang)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Settings Confirmation Dialog */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#1e293b]">
                  {t('resetConfirmTitle', currentLang)}
                </h4>
                <p className="text-xs text-[#64748b]">
                  Action cannot be undone
                </p>
              </div>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed">
              {t('resetConfirmMsg', currentLang)}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                {t('cancel', currentLang)}
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs sm:text-sm font-semibold shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all"
              >
                {t('resetButton', currentLang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
