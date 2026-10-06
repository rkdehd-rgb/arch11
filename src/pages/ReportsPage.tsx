import { useNavigate } from 'react-router-dom';
import { useReportStore } from '../stores/report';
import { strategyMap } from '../data/strategies';

function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const reports = useReportStore((s) => s.reports);
  const removeReport = useReportStore((s) => s.removeReport);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[900px] px-8 py-10">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          History
        </div>
        <h1 className="mb-8 text-[22px] font-semibold text-ink">历史推理报告</h1>

        {reports.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-16 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c9bfb4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <p className="mt-4 text-[14px] text-ink-2">还没有推理报告</p>
            <p className="mt-1 text-[12.5px] text-ink-3">填写任务书并完成一次推理后，报告会保存在这里。</p>
            <button type="button" className="btn btn-primary mt-6" onClick={() => navigate('/')}>
              去输入任务书
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="group flex items-center justify-between rounded-lg border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/report/${report.id}`)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="truncate text-[14.5px] font-semibold text-ink">
                      {report.task.projectName || '未命名项目'}
                    </span>
                    {report.degraded && (
                      <span className="rounded bg-line px-1.5 py-0.5 text-[10px] text-ink-3">
                        本地兜底
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-3">
                    <span className="font-mono">{formatTime(report.createdAt)}</span>
                    <span>·</span>
                    <span>{report.model}</span>
                    <span>·</span>
                    <span className="truncate">
                      {report.result.strategies
                        .slice(0, 3)
                        .map((s) => strategyMap.get(s.strategyId)?.name ?? s.strategyId)
                        .join(' / ')}
                    </span>
                  </div>
                </button>
                <div className="ml-4 flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded px-2.5 py-1.5 text-[12px] text-ink-3 opacity-0 transition-opacity hover:bg-line hover:text-ink group-hover:opacity-100"
                    onClick={() => navigate(`/synergy?report=${report.id}`)}
                  >
                    协同图
                  </button>
                  <button
                    type="button"
                    className="rounded px-2.5 py-1.5 text-[12px] text-ink-3 opacity-0 transition-opacity hover:bg-line hover:text-accent group-hover:opacity-100"
                    onClick={() => removeReport(report.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
