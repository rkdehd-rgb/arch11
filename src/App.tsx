import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import SynergyPage from './pages/SynergyPage';
import ReportPage from './pages/ReportPage';
import ReportsPage from './pages/ReportsPage';
import BoardPage from './pages/BoardPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/synergy" element={<SynergyPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/report/:id" element={<ReportPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
