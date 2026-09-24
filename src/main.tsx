import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import './index.css';

// Ensure Supabase backend client is loaded and verified in browser bundle
if (isSupabaseConfigured && supabase) {
  // Supabase initialized in background; ready for Phase 2 authentication
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
