import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';
import { useTaskStore } from '../stores/task';
import { useReportStore } from '../stores/report';
import { runInference, buildEdges, localFallback } from '../services/llm';
import type { InferenceReport, InferenceResult } from '../types';

const BUILDING_TYPES = [
  '住宅',
  '办公',
  '文化场馆',
  '教育',
  '商业综合体',
  '产业园',
  '酒店',
  '城市更新改造',
];

const CORE_DEMANDS = [
  '绿色低碳',
  '成本控制',
  '地标性',
  '在地文化',
  '快速周转',
  '复合业态',
  '全龄友好',
];

const REASONING_STEPS = [
  { key: 'parse', title: '解析任务书', desc: '提取项目规模、类型、场地与核心诉求' },
  { key: 'match', title: '匹配策略库', desc: '将任务条件与 32 条策略逐一比对' },
  { key: 'synergy', title: '计算策略协同', desc: '分析命中策略之间的增益组合关系' },
  { key: 'report', title: '生成推理报告', desc: '结构化输出匹配理由与落地思路' },
];

function formatTime(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { task, update, fillExample, reset, toggleDemand } = useTaskStore();
  const config = useSettingsStore((s) => s.config);
  const isConfigured = useSettingsStore((s) => s.isConfigured());
  const addReport = useReportStore((s) => s.addReport);
  const reports = useReportStore((s) => s.reports);

  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(task.content.trim() || task.projectName.trim());

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (!isConfigured) {
      navigate('/settings');
      return;
    }
    if (!canSubmit) {
      setError('请先填写项目名称或任务书正文。');
      return;
    }

    setRunning(true);
    setStepIndex(0);

    const startedAt = Date.now();

    // 分步推进动画
    const timers = REASONING_STEPS.map((_, i) =>
      setTimeout(() => setStepIndex(i), i * 620),
    );

    let result: InferenceResult;
    let degraded = false;
    try {
      result = await runInference(config, task);
    } catch (err) {
      timers.forEach(clearTimeout);
      // 真实调用失败时，提供本地兜底（明确标注降级），保证流程可继续
      result = localFallback(task);
      degraded = true;
      const reason = err instanceof Error ? err.message : String(err);
      setError(`LLM 调用失败，已切换为本地规则推理（结果仅供流程演示）：${reason}`);
    }

    // 等待分步动画播完（至少 4×620ms）
    const animationMs = REASONING_STEPS.length * 620 + 260;
    const waitMs = Math.max(0, animationMs - (Date.now() - startedAt));
    await new Promise((r) => setTimeout(r, waitMs));

    const now = Date.now();
    const report: InferenceReport = {
      id: `report-${now}`,
      createdAt: now,
      model: config.model || '本地规则',
      task: { ...task },
      result,
      edges: buildEdges(result),
      degraded,
    };
    addReport(report);
    setRunning(false);
    navigate(`/synergy?report=${report.id}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[920px] px-8 py-10">
        {/* 页头 */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              Step 01 / Brief
            </div>
            <h1 className="text-[22px] font-semibold leading-tight text-ink">
              输入设计任务书
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-2">
              填写结构化信息并粘贴完整任务书，ArchReason 将从 32 条策略中推理最匹配的方案方向。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn btn-secondary" onClick={fillExample}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              示例任务书
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              清空
            </button>
          </div>
        </div>

        {!isConfigured && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 fade-in">
            <div className="flex items-center gap-3 text-[13px] text-accent-dark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>尚未配置大模型，提交推理前请先完成模型配置。</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/settings')}
            >
              去配置
            </button>
          </div>
        )}

        {/* 结构化字段 */}
        <div className="card mb-6 p-6">
          <div className="mb-5 flex items-center gap-2">
            <span className="h-3.5 w-0.5 bg-accent" />
            <h2 className="text-[14px] font-semibold text-ink">项目基础信息</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <div>
              <label className="field-label" htmlFor="projectName">项目名称</label>
              <input
                id="projectName"
                className="input"
                value={task.projectName}
                placeholder="例如：云栖谷社区文化中心"
                onChange={(e) => update({ projectName: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="location">项目地点</label>
              <input
                id="location"
                className="input"
                value={task.location}
                placeholder="例如：浙江省杭州市西湖区"
                onChange={(e) => update({ location: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="siteArea">用地面积（㎡）</label>
              <input
                id="siteArea"
                className="input font-mono"
                value={task.siteArea}
                inputMode="decimal"
                placeholder="18600"
                onChange={(e) => update({ siteArea: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="grossArea">总建筑面积（㎡）</label>
              <input
                id="grossArea"
                className="input font-mono"
                value={task.grossArea}
                inputMode="decimal"
                placeholder="34500"
                onChange={(e) => update({ grossArea: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="far">容积率</label>
              <input
                id="far"
                className="input font-mono"
                value={task.far}
                inputMode="decimal"
                placeholder="1.85"
                onChange={(e) => update({ far: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="buildingType">建筑类型</label>
              <select
                id="buildingType"
                className="input"
                value={task.buildingType}
                onChange={(e) => update({ buildingType: e.target.value })}
              >
                <option value="" disabled>请选择建筑类型</option>
                {BUILDING_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5">
            <span className="field-label">核心诉求（可多选）</span>
            <div className="flex flex-wrap gap-2">
              {CORE_DEMANDS.map((demand) => (
                <button
                  key={demand}
                  type="button"
                  className={`chip ${task.demands.includes(demand) ? 'chip-active' : ''}`}
                  onClick={() => toggleDemand(demand)}
                >
                  {demand}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 任务书正文 */}
        <div className="card mb-6 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-0.5 bg-accent" />
              <h2 className="text-[14px] font-semibold text-ink">任务书正文</h2>
            </div>
            <span className="font-mono text-[11px] text-ink-3">
              {task.content.length} 字符
            </span>
          </div>
          <textarea
            className="input min-h-[280px] resize-y leading-[1.7]"
            value={task.content}
            placeholder="可直接粘贴完整设计任务书，包含项目背景、建设规模、功能配置、核心诉求与设计要求等……"
            onChange={(e) => update({ content: e.target.value })}
          />
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-[12.5px] leading-relaxed text-accent-dark fade-in">
            {error}
          </div>
        )}

        {/* 提交 */}
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-ink-3">
            {isConfigured
              ? `当前模型：${config.model} · ${formatTime(new Date())}`
              : '配置模型后即可开始推理'}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={running}
            onClick={handleSubmit}
          >
            {running ? (
              <>
                <span className="spinner" />
                推理进行中…
              </>
            ) : (
              <>
                一键提交推理
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </div>

        {/* 推理进行态：分步进度 */}
        {running && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-[2px]">
            <div className="card w-[440px] p-8 fade-in">
              <div className="mb-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                Reasoning
              </div>
              <div className="space-y-5">
                {REASONING_STEPS.map((step, i) => {
                  const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'idle';
                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {state === 'done' ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-ink text-white">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        ) : state === 'active' ? (
                          <span className="spinner !h-5 !w-5" />
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded border border-line" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className={`text-[13.5px] font-medium ${state === 'idle' ? 'text-ink-3' : 'text-ink'}`}>
                          {step.title}
                        </div>
                        <div className="text-[12px] text-ink-3">{step.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-7 progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${((stepIndex + 0.5) / REASONING_STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 历史报告快捷入口 */}
        {reports.length > 0 && !running && (
          <div className="mt-12 border-t border-line pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink-2">历史推理报告</h2>
              <button
                type="button"
                className="text-[12px] text-ink-3 hover:text-accent"
                onClick={() => navigate('/report')}
              >
                查看全部
              </button>
            </div>
            <div className="space-y-2">
              {reports.slice(0, 4).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-line bg-surface px-4 py-2.5 text-left transition-colors hover:border-line-strong"
                  onClick={() => navigate(`/report/${r.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-medium text-ink">
                      {r.task.projectName || '未命名项目'}
                    </span>
                    {r.degraded && (
                      <span className="rounded bg-line px-1.5 py-0.5 text-[10px] text-ink-3">
                        本地兜底
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-ink-3">
                    {formatTime(new Date(r.createdAt))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
