import React, { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { initNativeBridge, setScreenBackHandler } from './lib/nativeBridge';
import { WelcomeScreen } from './components/WelcomeScreen';
import { RegisterScreen } from './components/RegisterScreen';
import { SuccessScreen } from './components/SuccessScreen';
import { LoginScreen } from './components/LoginScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { ProfileScreen } from './components/ProfileScreen';

export const AppContent: React.FC = () => {
  const { screen, navigateTo } = useApp();

  // Initialize native Capacitor integrations on app launch (NO-OP on web)
  useEffect(() => {
    initNativeBridge();
  }, []);

  // Configure screen-level Android hardware back button handler
  useEffect(() => {
    setScreenBackHandler(() => {
      if (screen === 'profile') {
        navigateTo('dashboard');
        return true;
      }
      if (screen === 'register' || screen === 'success' || screen === 'login') {
        navigateTo('welcome');
        return true;
      }
      return false; // Already at root Dashboard or Welcome
    });

    return () => {
      setScreenBackHandler(null);
    };
  }, [screen, navigateTo]);

  return (
    <div className="min-h-screen bg-[#f6f7fb] flex flex-col w-full text-[#1e293b]">
      {screen === 'welcome' && <WelcomeScreen />}
      {screen === 'register' && <RegisterScreen />}
      {screen === 'success' && <SuccessScreen />}
      {screen === 'login' && <LoginScreen />}
      {screen === 'dashboard' && <DashboardScreen />}
      {screen === 'profile' && <ProfileScreen />}
    </div>
  );
};

export default function App() {
  return <AppContent />;
}
