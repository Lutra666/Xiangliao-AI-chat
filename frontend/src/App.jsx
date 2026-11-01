import { useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import MemoryPage from './pages/MemoryPage';
import ErrorBoundary from './components/ErrorBoundary';
import TitleBar from './components/TitleBar';
import { Spinner } from './components/ui';
import { initServerUrl } from './utils/api';

// 组件库预览页仅开发环境打包，生产构建时被 tree-shake 剔除
const DevPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevPage'))
  : null;

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function DefaultRedirect() {
  const token = localStorage.getItem('token');
  return <Navigate to={token ? "/chat" : "/login"} replace />;
}

function AppContent() {
  return (
    <HashRouter>
      <Routes>
        {import.meta.env.DEV && DevPage && (
          <Route path="/dev" element={
            <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>}>
              <DevPage />
            </Suspense>
          } />
        )}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="/memory" element={<PrivateRoute><MemoryPage /></PrivateRoute>} />
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  useEffect(() => { initServerUrl(); }, []);

  const isElectron = !!window.electronAPI;

  return (
    <ErrorBoundary>
      {isElectron ? (
        <div className="flex flex-col h-screen overflow-hidden">
          <TitleBar />
          <div className="flex-1 overflow-hidden">
            <AppContent />
          </div>
        </div>
      ) : (
        <AppContent />
      )}
    </ErrorBoundary>
  );
}
