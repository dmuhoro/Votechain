import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useNetworkStore } from './store/networkStore';
import { UNAUTHORIZED_EVENT } from './lib/api';
import OfflineBanner from './components/OfflineBanner';
import MobileBottomNav from './components/MobileBottomNav';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import ElectionsPage from './pages/ElectionsPage';
import BallotPage from './pages/BallotPage';
import ResultsPage from './pages/ResultsPage';
import ReceiptPage from './pages/ReceiptPage';
import AdminPage from './pages/AdminPage';

const AppRouter: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 401s (expired/revoked session) navigate via the router instead of a
    // hard window.location reload that would drop SPA state on a phone.
    const onUnauthorized = () => navigate('/login', { replace: true });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate]);

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/elections" element={<ElectionsPage />} />
        <Route path="/ballot/:electionId" element={<BallotPage />} />
        <Route path="/results/:electionId" element={<ResultsPage />} />
        <Route path="/receipt/:txHash" element={<ReceiptPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MobileBottomNav />
    </>
  );
};

const App: React.FC = () => {
  const { initialize } = useAuthStore();

  useEffect(() => {
    useNetworkStore.getState().init();
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
};

export default App;