import React from 'react';
import { useApp } from './context/AppContext';
import { WelcomeScreen } from './components/WelcomeScreen';
import { RegisterScreen } from './components/RegisterScreen';
import { SuccessScreen } from './components/SuccessScreen';
import { LoginScreen } from './components/LoginScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { ProfileScreen } from './components/ProfileScreen';

export const AppContent: React.FC = () => {
  const { screen } = useApp();

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
