import type { Language } from '../types';

export const translations = {
  en: {
    settingsTitle: 'Settings',
    settingsSubtitle: 'Configure application preferences and behavior',
    preferencesSection: 'Preferences',
    language: 'Language',
    languageDesc: 'Choose interface display language',
    dateFormat: 'Date Format',
    dateFormatDesc: 'Choose how dates are displayed across reports and lists',
    paymentsSection: 'Payments & Collections',
    paymentSound: 'Payment Sound Alert',
    paymentSoundDesc: 'Play a subtle chime sound when a payment is collected',
    paymentBanner: 'Payment Banner Alert',
    paymentBannerDesc: 'Show a success banner toast after collecting a payment',
    confirmPayment: 'Confirm Before Payment',
    confirmPaymentDesc: 'Show a confirmation dialog before saving any payment',
    defaultsSection: 'Defaults & Security',
    defaultFinanceType: 'Default Finance Type',
    defaultFinanceTypeDesc: 'Initial finance type selected when creating a borrower',
    keepLoggedIn: 'Keep Me Logged In',
    keepLoggedInDesc: 'Remember login session on this browser',
    resetSettings: 'Reset to Default Settings',
    resetConfirmTitle: 'Reset Settings?',
    resetConfirmMsg:
      'This will restore KN FINANCE settings to their default values. Borrowers, payments, agents and company data will not be deleted.',
    cancel: 'Cancel',
    save: 'Save Changes',
    resetButton: 'Reset Settings',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    settingsSavedToast: 'Settings updated successfully.',
    settingsResetToast: 'Settings reset to default.',
  },
  ta: {
    settingsTitle: 'அமைப்புகள் (Settings)',
    settingsSubtitle: 'பயன்பாட்டு விருப்பத்தேர்வுகளை கட்டமைக்கவும்',
    preferencesSection: 'விருப்பத்தேர்வுகள் (Preferences)',
    language: 'மொழி (Language)',
    languageDesc: 'காட்சி மொழியைத் தேர்ந்தெடுக்கவும்',
    dateFormat: 'தேதி வடிவம் (Date Format)',
    dateFormatDesc: 'அறிக்கைகள் மற்றும் பட்டியல்களில் தேதி காட்டப்படும் வடிவம்',
    paymentsSection: 'பணம் செலுத்துதல் & வசூல் (Payments)',
    paymentSound: 'வசூல் ஒலி எச்சரிக்கை (Payment Sound Alert)',
    paymentSoundDesc: 'பணம் வசூலிக்கும்போது மென்மையான ஒலி எழுப்பவும்',
    paymentBanner: 'வசூல் அறிவிப்பு பதாகை (Payment Banner Alert)',
    paymentBannerDesc: 'பணம் வசூலித்த பிறகு வெற்றி அறிவிப்பைக் காட்டவும்',
    confirmPayment: 'பணம் செலுத்தும் முன் உறுதிப்படுத்தவும் (Confirm Before Payment)',
    confirmPaymentDesc: 'பணத்தைச் சேமிக்கும் முன் உறுதிப்படுத்தல் உரையாடலைக் காட்டவும்',
    defaultsSection: 'இயல்புநிலை & பாதுகாப்பு (Defaults & Security)',
    defaultFinanceType: 'இயல்புநிலை நிதி வகை (Default Finance Type)',
    defaultFinanceTypeDesc: 'கடன் வாங்குபவரைச் சேர்க்கும்போது தொடக்க நிதி வகை',
    keepLoggedIn: 'உள்நுழைந்திருக்கவும் (Keep Me Logged In)',
    keepLoggedInDesc: 'இந்த உலாவியில் உள்நுழைவு அமர்வை நினைவில் கொள்ளவும்',
    resetSettings: 'இயல்புநிலைக்கு மீட்டமை (Reset to Default Settings)',
    resetConfirmTitle: 'அமைப்புகளை மீட்டமைக்கவா?',
    resetConfirmMsg:
      'இது அமைப்புகளை அவற்றின் இயல்புநிலை மதிப்புகளுக்கு மீட்டமைக்கும். கடன் வாங்குபவர்கள், பணம் செலுத்துதல், முகவர்கள் மற்றும் நிறுவனத்தின் தரவு நீக்கப்படாது.',
    cancel: 'ரத்து செய் (Cancel)',
    save: 'சேமி (Save)',
    resetButton: 'அமைப்புகளை மீட்டமை',
    daily: 'தினசரி (Daily)',
    weekly: 'வாராந்திர (Weekly)',
    monthly: 'மாதாந்திர (Monthly)',
    settingsSavedToast: 'அமைப்புகள் வெற்றிகரமாக புதுப்பிக்கப்பட்டன.',
    settingsResetToast: 'அமைப்புகள் இயல்புநிலைக்கு மீட்டமைக்கப்பட்டன.',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function t(key: TranslationKey, lang: Language = 'en'): string {
  const dict = translations[lang] || translations.en;
  return dict[key] || translations.en[key] || key;
}
