import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';

const FLOW_STEPS = [
  { path: '/', label: '任务书', step: '01' },
  { path: '/synergy', label: '策略协同', step: '02' },
  { path: '/report', label: '推理报告', step: '03' },
  { path: '/board', label: '创作画板', step: '04' },
];

function isPathActive(current: string, target: string): boolean {
  if (target === '/') return current === '/';
  return current.startsWith(target);
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isConfigured = useSettingsStore((s) => s.isConfigured());

  // 画板页保留顶栏品牌与设置，但隐藏居中步骤导航
  const isStudio = location.pathname.startsWith('/board');

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-ink text-[11px] font-semibold text-white">
            A
          </span>
          <span className="text-[14px] font-semibold tracking-tight text-ink">
            ArchReason
          </span>
          <span className="hidden text-[11px] font-normal text-ink-3 sm:inline">
            建筑推理引擎
          </span>
        </button>

        {!isStudio && (
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {FLOW_STEPS.map((step, index) => {
              const active = isPathActive(location.pathname, step.path);
              return (
                <div key={step.path} className="flex items-center">
                  <NavLink
                    to={step.path}
                    className={`step-dot rounded px-2 py-1 ${active ? 'active' : ''}`}
                  >
                    <span className="num">{step.step}</span>
                    <span>{step.label}</span>
                  </NavLink>
                  {index < FLOW_STEPS.length - 1 && (
                    <span className="mx-1 h-px w-4 bg-line" />
                  )}
                </div>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {!isConfigured && (
            <NavLink
              to="/settings"
              className="flex items-center gap-1.5 text-[12px] text-accent"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              未配置模型
            </NavLink>
          )}
          <NavLink
            to="/settings"
            className="flex h-8 w-8 items-center justify-center rounded text-ink-3 transition-colors hover:bg-line hover:text-ink"
            title="设置"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </NavLink>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
