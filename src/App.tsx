import { Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import SynergyPage from './pages/SynergyPage';
import ReportPage from './pages/ReportPage';
import ReportsPage from './pages/ReportsPage';
import BoardPage from './pages/BoardPage';
import LoginPage from './pages/LoginPage';
import CasesPage from './pages/CasesPage';

export default function App() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/synergy" element={<SynergyPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/report/:id" element={<ReportPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          {/* 路由名不能是 /cases：与 public/cases（本地案例图目录）冲突，会被静态服务 301 掉 */}
          <Route path="/case-library" element={<CasesPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
