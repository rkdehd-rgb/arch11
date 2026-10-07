import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';

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

/** 右上角云同步状态：未登录时引导登录，登录后展示同步态与账号入口 */
function CloudStatus() {
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const status = useSyncStore((s) => s.status);
  const message = useSyncStore((s) => s.message);

  if (!ready) return null;

  if (!user) {
    return (
      <NavLink
        to="/login"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-line hover:text-ink"
        title="登录后可将报告与案例图同步到云端"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        未登录 · 仅本机
      </NavLink>
    );
  }

  const label =
    status === 'syncing'
      ? '同步中…'
      : status === 'error'
        ? '同步失败'
        : status === 'synced'
          ? '已同步'
          : '本地已保留';
  const dotClass =
    status === 'syncing'
      ? 'bg-ink-3'
      : status === 'error'
        ? 'bg-accent'
        : status === 'synced'
          ? 'bg-[#5d7a52]'
          : 'bg-line-strong';

  return (
    <NavLink
      to="/login"
      className="flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-line hover:text-ink"
      title={message ?? `${user.label} · ${label}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className="max-w-[92px] truncate">{user.label}</span>
      <span className="text-ink-3">· {label}</span>
    </NavLink>
  );
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

        <div className="flex items-center gap-2">
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
            to="/case-library"
            className={({ isActive }) =>
              `rounded px-2 py-1 text-[12.5px] transition-colors ${
                isActive ? 'bg-line text-ink' : 'text-ink-2 hover:bg-line hover:text-ink'
              }`
            }
          >
            案例图库
          </NavLink>

          <CloudStatus />

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
