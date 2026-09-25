import React, { useState } from 'react';
import {
  Building2,
  Users,
  ClipboardList,
  Database,
  Settings,
  KeyRound,
  Info,
  HelpCircle,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MyCompanyModal } from './MyCompanyModal';
import { ManageUsersModal } from './ManageUsersModal';
import { ActivityLogModal } from './ActivityLogModal';
import { BackupRestoreModal } from './BackupRestoreModal';
import { SettingsModal } from './SettingsModal';
import { ChangePinModal } from './ChangePinModal';
import { AboutModal } from './AboutModal';
import { HelpModal } from './HelpModal';

export const ProfileScreen: React.FC = () => {
  const { manager, currentUser, currentRole, logout, navigateTo } = useApp();
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isManageUsersOpen, setIsManageUsersOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isBackupRestoreOpen, setIsBackupRestoreOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Role-based Menu Items (Both Manager and Agent can Change PIN)
  const menuItems = currentRole === 'agent'
    ? [
        { label: 'Activity Log', icon: ClipboardList },
        { label: 'Settings', icon: Settings },
        { label: 'Change PIN', icon: KeyRound },
        { label: 'About', icon: Info },
        { label: 'Help', icon: HelpCircle },
        { label: 'Logout', icon: LogOut, isRed: true },
      ]
    : [
        { label: 'My Company', icon: Building2 },
        { label: 'Manage Users', icon: Users },
        { label: 'Activity Log', icon: ClipboardList },
        { label: 'Backup & Restore', icon: Database },
        { label: 'Settings', icon: Settings },
        { label: 'Change PIN', icon: KeyRound },
        { label: 'About', icon: Info },
        { label: 'Help', icon: HelpCircle },
        { label: 'Logout', icon: LogOut, isRed: true },
      ];

  const handleItemClick = (label: string) => {
    if (label === 'Logout') {
      logout();
    } else if (label === 'My Company') {
      setIsCompanyModalOpen(true);
    } else if (label === 'Manage Users') {
      setIsManageUsersOpen(true);
    } else if (label === 'Activity Log') {
      setIsActivityLogOpen(true);
    } else if (label === 'Backup & Restore') {
      setIsBackupRestoreOpen(true);
    } else if (label === 'Settings') {
      setIsSettingsOpen(true);
    } else if (label === 'Change PIN') {
      setIsChangePinOpen(true);
    } else if (label === 'About') {
      setIsAboutOpen(true);
    } else if (label === 'Help') {
      setIsHelpOpen(true);
    }
  };

  // User Display Name resolution
  const userDisplayName = (() => {
    if (currentUser?.fullName) {
      return currentUser.fullName.trim();
    }
    const name = manager?.fullName?.trim();
    if (!name || name === 'Manager User') {
      return currentRole === 'agent' ? 'Agent' : 'Manager';
    }
    return name;
  })();

  const companyCodeDisplay = currentUser?.companyCode || manager?.companyCode || 'KNF01';

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7fb] w-full">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
          <button
            onClick={() => navigateTo('dashboard')}
            className="text-xl sm:text-2xl font-bold tracking-tight text-[#1e293b] hover:text-[#4f46e5] transition-colors"
          >
            KN FINANCE
          </button>
          <button
            onClick={() => navigateTo('dashboard')}
            className="text-xs sm:text-sm font-semibold text-[#4f46e5] bg-indigo-50 px-3.5 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            Dashboard
          </button>
        </div>
      </header>

      {/* Main Profile / Settings Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Profile Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#1e293b]">
              {userDisplayName}
            </h2>
            <p className="text-xs sm:text-sm font-medium text-[#64748b] mt-1 capitalize">
              {currentRole} | Code: <span className="font-bold text-[#1e293b]">{companyCodeDisplay}</span>
            </p>
          </div>

          {/* Hello announcement banner */}
          <div className="px-4 py-2.5 rounded-xl bg-[#f5f6ff] border border-[#e0e7ff] text-xs sm:text-sm font-semibold text-[#4f46e5] flex items-center gap-2 self-start sm:self-auto shadow-sm">
            <span>🔔</span>
            <span className="capitalize">Hello from {currentRole}!</span>
          </div>
        </div>

        {/* Menu Items Container */}
        <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden divide-y divide-slate-100">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleItemClick(item.label)}
                className={`w-full px-6 py-4 flex items-center justify-between transition-colors text-left ${
                  item.isRed
                    ? 'hover:bg-red-50/50 text-[#ef4444]'
                    : 'hover:bg-slate-50/80 text-[#1e293b]'
                }`}
              >
                <div className="flex items-center gap-4">
                  <Icon
                    size={20}
                    className={item.isRed ? 'text-[#ef4444]' : 'text-[#64748b]'}
                  />
                  <span
                    className={`text-sm sm:text-base ${
                      item.isRed ? 'font-semibold text-[#ef4444]' : 'font-medium text-[#1e293b]'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
                {!item.isRed && (
                  <ChevronRight size={18} className="text-slate-300" />
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom Made in India text */}
        <div className="pt-4 pb-8 text-center text-xs sm:text-sm font-medium text-[#64748b]">
          Made with ❤️ in India 🇮🇳
        </div>
      </main>

      {/* My Company Modal */}
      <MyCompanyModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
      />

      {/* Manage Users Modal */}
      <ManageUsersModal
        isOpen={isManageUsersOpen}
        onClose={() => setIsManageUsersOpen(false)}
      />

      {/* Activity Log Modal */}
      <ActivityLogModal
        isOpen={isActivityLogOpen}
        onClose={() => setIsActivityLogOpen(false)}
      />

      {/* Backup & Restore Modal */}
      <BackupRestoreModal
        isOpen={isBackupRestoreOpen}
        onClose={() => setIsBackupRestoreOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Change PIN Modal */}
      <ChangePinModal
        isOpen={isChangePinOpen}
        onClose={() => setIsChangePinOpen(false)}
      />

      {/* About Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
};
