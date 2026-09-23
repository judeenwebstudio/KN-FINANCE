import React, { useState, useEffect } from 'react';
import { X, Building2, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface MyCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyCompanyModal: React.FC<MyCompanyModalProps> = ({ isOpen, onClose }) => {
  const { manager, company, updateCompany } = useApp();

  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state whenever modal opens or company/manager changes
  useEffect(() => {
    if (isOpen) {
      if (company) {
        setCompanyName(company.companyName || '');
        setOwnerName(company.ownerName || manager?.fullName || '');
        setMobile(company.mobile || manager?.mobile || '');
        setEmail(company.email || manager?.email || '');
        setOfficeAddress(company.officeAddress || '');
      } else {
        // First time opening: prefill from registered manager details
        setCompanyName('');
        setOwnerName(manager?.fullName && manager.fullName !== 'Manager User' ? manager.fullName : '');
        setMobile(manager?.mobile || '');
        setEmail(manager?.email || '');
        setOfficeAddress('');
      }
      setErrors({});
      setSaveSuccess(false);
    }
  }, [isOpen, company, manager]);

  if (!isOpen) return null;

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!companyName.trim()) {
      newErrors.companyName = 'Company Name is required';
    }

    if (mobile.trim()) {
      const cleanMobile = mobile.replace(/\D/g, '');
      if (cleanMobile.length !== 10) {
        newErrors.mobile = 'Mobile Number must be a valid 10-digit number';
      }
    }

    if (email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        newErrors.email = 'Enter a valid email address';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    updateCompany({
      companyName: companyName.trim(),
      ownerName: ownerName.trim() || undefined,
      mobile: mobile.trim() || undefined,
      email: email.trim() || undefined,
      officeAddress: officeAddress.trim() || undefined,
    });

    setSaveSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[700px] w-full max-h-[92vh] flex flex-col border border-slate-100 overflow-hidden text-[#1e293b]">
        {/* HEADER */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1e293b]">
                My Company
              </h2>
              <p className="text-xs sm:text-sm font-medium text-[#64748b]">
                Used for branding in reports
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

        {/* FORM CONTENT (SCROLLABLE) */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-4 sm:space-y-5">
          {/* FIELD 1: Company Name * */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
              Company Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                if (errors.companyName) {
                  setErrors((prev) => ({ ...prev, companyName: '' }));
                }
              }}
              placeholder="e.g. KN Finance"
              className="w-full h-11 sm:h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
            />
            {errors.companyName && (
              <p className="text-xs text-rose-500 mt-1 font-medium">{errors.companyName}</p>
            )}
          </div>

          {/* FIELD 2: Owner / Financer Name */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
              Owner / Financer Name
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Enter owner or financer name"
              className="w-full h-11 sm:h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
            />
          </div>

          {/* FIELD 3: Mobile Number */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
              Mobile Number
            </label>
            <input
              type="tel"
              value={mobile}
              maxLength={10}
              onChange={(e) => {
                setMobile(e.target.value.replace(/\D/g, ''));
                if (errors.mobile) {
                  setErrors((prev) => ({ ...prev, mobile: '' }));
                }
              }}
              placeholder="10-digit mobile number"
              className="w-full h-11 sm:h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
            />
            {errors.mobile && (
              <p className="text-xs text-rose-500 mt-1 font-medium">{errors.mobile}</p>
            )}
          </div>

          {/* FIELD 4: Email Address */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: '' }));
                }
              }}
              placeholder="Enter email address"
              className="w-full h-11 sm:h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all"
            />
            {errors.email && (
              <p className="text-xs text-rose-500 mt-1 font-medium">{errors.email}</p>
            )}
          </div>

          {/* FIELD 5: Office Address (Optional) */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-[#1e293b] mb-1.5">
              Office Address (Optional)
            </label>
            <textarea
              rows={3}
              value={officeAddress}
              onChange={(e) => setOfficeAddress(e.target.value)}
              placeholder="Enter full office address"
              className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-sm text-[#1e293b] placeholder:text-slate-400 focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5] transition-all resize-none"
            />
          </div>

          {/* BOTTOM BUTTON */}
          <div className="pt-2 sm:pt-4">
            <button
              type="submit"
              disabled={saveSuccess}
              className={`w-full h-12 rounded-xl text-white font-semibold text-sm sm:text-base shadow-sm transition-all flex items-center justify-center gap-2 ${
                saveSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-600'
                  : 'bg-[#4f46e5] hover:bg-[#4338ca] active:scale-[0.99]'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check size={18} />
                  <span>Saved Successfully!</span>
                </>
              ) : (
                'Save Details'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
