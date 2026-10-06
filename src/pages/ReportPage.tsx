import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useReportStore } from '../stores/report';
import { useBoardStore } from '../stores/board';
import { strategyMap } from '../data/strategies';
import { getCasesByStrategy } from '../data/cases';
import SafeImage from '../components/SafeImage';
import type { InferenceReport } from '../types';

function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 将某条策略的参考案例自动贴入画板（错落布局） */
function autoPlaceReferences(report: InferenceReport, strategyId: string): void {
  const board = useBoardStore.getState();
  const refs = getCasesByStrategy(strategyId).slice(0, 4);
  const items = refs.map((ref, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return {
      kind: 'reference' as const,
      x: 120 + col * 300 + (i % 2) * 24,
      y: 120 + row * 250 - (i % 2) * 18,
      width: 268,
      src: ref.image,
      title: ref.name,
      note: ref.highlight,
      meta: {
        strategyId,
        timestamp: report.createdAt,
      },
    };
  });
  board.addItems(items);
  board.markHydrated(`${report.id}::${strategyId}`);
}

export default function ReportPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const reports = useReportStore((s) => s.reports);

  const report = useMemo(
    () => reports.find((r) => r.id === id) ?? reports[reports.length - 1],
    [reports, id],
  );

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-[14px] text-ink-2">暂无推理报告。</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            去输入任务书
          </button>
        </div>
      </div>
    );
  }

  function goCreate(strategyId?: string): void {
    if (!report) return;
    const firstId = strategyId ?? report.result.strategies[0]?.strategyId;
    if (!firstId) return;
    const key = `${report.id}::${firstId}`;
    if (useBoardStore.getState().hydratedWithReport !== key) {
      autoPlaceReferences(report, firstId);
    }
    navigate(`/board?report=${report.id}&strategy=${firstId}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[980px] px-8 py-10">
        {/* 页头 */}
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Step 03 / Reasoning Report
        </div>
        <div className="mb-6 flex items-start justify-between">
          <h1 className="text-[22px] font-semibold leading-tight text-ink">
            推理报告
            <span className="ml-2 text-[15px] font-normal text-ink-3">
              {report.task.projectName || '未命名项目'}
            </span>
          </h1>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/reports')}>
            历史报告
          </button>
        </div>

        {/* 报告头 */}
        <div className="card mb-8 p-6">
          <div className="grid grid-cols-[1fr_auto] gap-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-3.5 w-0.5 bg-accent" />
                <h2 className="text-[13px] font-semibold text-ink">任务书摘要</h2>
              </div>
              <p className="text-[13.5px] leading-[1.8] text-ink-2">
                {report.result.taskSummary}
              </p>
            </div>
            <div className="w-[210px] shrink-0 rounded-md bg-canvas px-4 py-3 text-[12px] text-white/75">
              <div className="mb-2 flex justify-between gap-3">
                <span className="text-white/50">推理时间</span>
                <span className="font-mono">{formatTime(report.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-white/50">使用模型</span>
                <span className="font-mono">{report.model}</span>
              </div>
              {report.degraded && (
                <div className="mt-2 rounded bg-white/10 px-2 py-1 text-[10.5px] text-white/70">
                  本地规则推理（LLM 不可用）
                </div>
              )}
            </div>
          </div>

          {report.result.synergyInsights.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-[12px] font-semibold text-ink-2">协同洞见</div>
              <ul className="space-y-1.5">
                {report.result.synergyInsights.slice(0, 4).map((insight, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 5 个策略卡片 */}
        <div className="space-y-5">
          {report.result.strategies.slice(0, 5).map((match, index) => {
            const strategy = strategyMap.get(match.strategyId);
            const refs = getCasesByStrategy(match.strategyId);
            if (!strategy) return null;
            return (
              <article key={match.strategyId} className="card overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-canvas font-mono text-[15px] font-semibold text-white">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3 className="text-[16px] font-semibold leading-tight text-ink">
                          {strategy.name}
                        </h3>
                        <div className="mt-1 font-mono text-[11px] text-ink-3">
                          {strategy.nameEn} · {strategy.group}
                        </div>
                      </div>
                    </div>
                    <div className="w-[200px] shrink-0">
                      <div className="mb-1 flex items-center justify-between text-[11.5px]">
                        <span className="text-ink-3">匹配度</span>
                        <span className="font-mono text-[15px] font-semibold text-accent">
                          {match.matchScore}
                        </span>
                      </div>
                      <div className="progress-track !h-1.5">
                        <div className="progress-fill" style={{ width: `${match.matchScore}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* 核心理念 */}
                  <div className="mt-4 grid grid-cols-2 gap-5">
                    <div>
                      <div className="mb-1.5 text-[11.5px] font-semibold text-ink-3">
                        策略核心理念
                      </div>
                      <p className="text-[13px] leading-[1.7] text-ink-2">
                        {strategy.concept}
                      </p>
                    </div>
                    <div>
                      <div className="mb-1.5 text-[11.5px] font-semibold text-ink-3">
                        本项目落地思路
                      </div>
                      <p className="text-[13px] leading-[1.7] text-ink-2">
                        {match.conceptRefined || strategy.scenarios[0]}
                      </p>
                    </div>
                  </div>

                  {/* 匹配逻辑 */}
                  <div className="mt-4 rounded-md bg-surface-raised px-4 py-3">
                    <div className="mb-1 flex items-center gap-2 text-[11.5px] font-semibold text-ink-3">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      匹配逻辑
                    </div>
                    <p className="text-[13px] leading-[1.7] text-ink-2">{match.matchReason}</p>
                  </div>
                </div>

                {/* 参考案例 */}
                <div className="border-t border-line bg-surface-raised px-6 py-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[12px] font-semibold text-ink-2">
                      参考案例
                      <span className="ml-2 font-normal text-ink-3">{refs.length} 个建成项目</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary !h-8 !px-3 !text-[12px]"
                      onClick={() => goCreate(match.strategyId)}
                    >
                      去 AI 创作
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {refs.slice(0, 2).map((ref) => (
                      <div key={ref.id} className="overflow-hidden rounded-md border border-line bg-surface">
                        <div className="aspect-[4/3] w-full overflow-hidden bg-line">
                          <SafeImage
                            src={ref.image}
                            alt={`${ref.name}，${ref.location}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="p-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-semibold text-ink">{ref.name}</span>
                            <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{ref.year}</span>
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-ink-3">
                            {ref.location} · {ref.architect}
                          </div>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
                            {ref.highlight}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* 底部主操作 */}
        <div className="mt-10 flex items-center justify-between rounded-lg border border-line bg-surface px-6 py-5">
          <div>
            <div className="text-[14px] font-semibold text-ink">进入 AI 概念创作</div>
            <p className="mt-1 text-[12.5px] text-ink-3">
              参考案例将自动贴入画板，可在画板中切换策略、选择风格并生成概念方案图。
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => goCreate()}>
            去 AI 创作
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
