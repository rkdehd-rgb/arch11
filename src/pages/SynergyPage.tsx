import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useReportStore } from '../stores/report';
import { resolveStrategy, getGroupName } from '../services/strategyPool';
import type { Strategy } from '../data/strategies';

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const GROUP_COLORS: Record<string, string> = {
  green: '#5f8a63',
  space: '#7d8ca3',
  context: '#b08a5f',
  mixed: '#8a6d8f',
  efficiency: '#6e8b9e',
  urban: '#b07a6e',
};

interface HoverInfo {
  visible: boolean;
  x: number;
  y: number;
  strategy: Strategy | null;
  score: number | null;
}

function scoreColor(score: number): string {
  if (score >= 90) return '#9c4a2f';
  if (score >= 80) return '#b56a45';
  if (score >= 70) return '#cf9466';
  return '#dcb998';
}

export default function SynergyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reportId = params.get('report');
  const reports = useReportStore((s) => s.reports);
  const report = useMemo(
    () => reports.find((r) => r.id === reportId) ?? reports[reports.length - 1],
    [reports, reportId],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo>({
    visible: false,
    x: 0,
    y: 0,
    strategy: null,
    score: null,
  });

  useEffect(() => {
    if (!containerRef.current || !report) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const scoreMap = new Map(
      report.result.strategies.map((s) => [s.strategyId, s.matchScore]),
    );

    const nodes = report.result.strategies.map((match) => {
      const strategy = resolveStrategy(match);
      const isSuggested = match.source === 'suggested';
      return {
        id: match.strategyId,
        name: `${strategy?.name ?? match.strategyId}\n${match.matchScore}%`,
        symbolSize: 34 + (match.matchScore - 70) * 0.9,
        value: match.matchScore,
        category: strategy?.group ?? '',
        itemStyle: {
          color: scoreColor(match.matchScore),
          borderColor: isSuggested ? '#9c4a2f' : '#ffffff',
          borderWidth: isSuggested ? 2.5 : 2,
          borderType: isSuggested ? ('dashed' as const) : ('solid' as const),
          shadowBlur: 10,
          shadowColor: 'rgba(41,37,34,0.16)',
        },
        label: {
          show: true,
          fontSize: 11,
          lineHeight: 14,
          color: '#292522',
          fontWeight: 500,
        },
      };
    });

    const edgeSet = new Set<string>();
    const links = report.edges
      .filter((edge) => {
        const key = [edge.source, edge.target].sort().join('::');
        if (edgeSet.has(key)) return false;
        edgeSet.add(key);
        return scoreMap.has(edge.source) && scoreMap.has(edge.target);
      })
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        value: edge.label ?? '',
        lineStyle: {
          color: '#c9bfb4',
          width: edge.strength === 'preset' ? 2 : 1.4,
          curveness: 0.12,
        },
        label: {
          show: Boolean(edge.label),
          formatter: edge.label ?? '',
          fontSize: 10,
          color: '#7c766d',
          backgroundColor: 'rgba(250,249,246,0.85)',
          padding: [2, 5],
          borderRadius: 3,
        },
      }));

    chart.setOption({
      tooltip: { show: false },
      animationDuration: 700,
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          data: nodes,
          links,
          categories: Object.keys(GROUP_COLORS).map((group) => ({
            name: group,
          })),
          force: {
            repulsion: 520,
            edgeLength: [110, 170],
            gravity: 0.12,
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 3 },
          },
          edgeSymbol: ['none', 'none'],
        },
      ],
    });

    type NodeEvent = {
      dataType?: string;
      data?: { id?: string };
      event?: { event?: MouseEvent & { offsetX: number; offsetY: number } };
    };
    chart.on('mouseover', (rawEvent: unknown) => {
      const event = rawEvent as NodeEvent;
      if (event.dataType !== 'node' || !event.data?.id) return;
      const id = event.data.id;
      const match = report.result.strategies.find((s) => s.strategyId === id);
      const strategy = match ? resolveStrategy(match) ?? null : null;
      const score = scoreMap.get(id) ?? null;
      const mouse = event.event?.event;
      if (strategy && mouse) {
        setHover({ visible: true, x: mouse.offsetX + 16, y: mouse.offsetY + 12, strategy, score });
      }
    });
    chart.on('mouseout', () => {
      setHover((prev) => ({ ...prev, visible: false }));
    });
    chart.on('click', (rawEvent: unknown) => {
      const event = rawEvent as NodeEvent;
      if (event.dataType === 'node' && event.data?.id) {
        setSelectedId(event.data.id);
      }
    });

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, [report]);

  const selectedMatch = selectedId
    ? report?.result.strategies.find((s) => s.strategyId === selectedId)
    : undefined;
  const selectedStrategy = selectedMatch
    ? resolveStrategy(selectedMatch)
    : null;
  const selectedScore =
    selectedId && report
      ? report.result.strategies.find((s) => s.strategyId === selectedId)?.matchScore ?? null
      : null;

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-[14px] text-ink-2">暂无推理报告，请先提交任务书。</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 页头 */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-8 py-4">
        <div>
          <div className="mb-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            Step 02 / Strategy Synergy
          </div>
          <h1 className="text-[17px] font-semibold text-ink">
            设计策略协同图
            <span className="ml-2 text-[13px] font-normal text-ink-3">
              {report.task.projectName || '未命名项目'}
            </span>
          </h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate(`/report/${report.id}`)}
        >
          查看推理报告
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="h-full w-full" />

        {/* hover 浮层 */}
        {hover.visible && hover.strategy && (
          <div
            className="pointer-events-none absolute z-30 w-[260px] rounded-lg border border-line bg-surface p-3.5 shadow-float"
            style={{ left: hover.x, top: hover.y }}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-semibold text-ink">
                {hover.strategy.name}
              </span>
              {hover.score !== null && (
                <span className="font-mono text-[13px] font-semibold text-accent">
                  {hover.score}%
                </span>
              )}
            </div>
            <div className="mb-2 font-mono text-[10.5px] text-ink-3">
              {hover.strategy.nameEn} · {getGroupName(hover.strategy.group)}
            </div>
            <p className="text-[12px] leading-relaxed text-ink-2">
              {hover.strategy.concept}
            </p>
          </div>
        )}

        {/* 图例：匹配度色带 */}
        <div className="absolute bottom-5 left-5 rounded-lg border border-line bg-surface/95 px-4 py-3 shadow-sm">
          <div className="mb-2 text-[11px] font-semibold text-ink-2">匹配度</div>
          <div className="h-2 w-[180px] rounded-full bg-gradient-to-r from-[#dcb998] via-[#b56a45] to-[#9c4a2f]" />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
            <span>70</span>
            <span>80</span>
            <span>90+</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(GROUP_COLORS).map(([group, color]) => (
              <span key={group} className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {getGroupName(group)}
              </span>
            ))}
          </div>
          {report.result.suggestedStrategies &&
            report.result.suggestedStrategies.length > 0 && (
              <div className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2 text-[10.5px] text-accent">
                <span className="h-0 w-3.5 border-t-2 border-dashed border-accent" />
                虚线节点 = 库外新策略
              </div>
            )}
        </div>

        {/* 操作提示 */}
        <div className="absolute right-5 top-5 rounded-md border border-line bg-surface/90 px-3 py-2 text-[11px] text-ink-3">
          滚轮缩放 · 拖拽平移 · 拖拽节点重排 · 点击节点查看详情
        </div>

        {/* 节点详情抽屉 */}
        {selectedStrategy && (
          <div className="absolute right-5 top-16 z-20 w-[320px] rounded-lg border border-line bg-surface p-5 shadow-float fade-in">
            <div className="mb-1 flex items-start justify-between">
              <h3 className="text-[15px] font-semibold text-ink">
                {selectedStrategy.name}
              </h3>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-line hover:text-ink"
                onClick={() => setSelectedId(null)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="mb-3 font-mono text-[11px] text-ink-3">
              {selectedStrategy.nameEn}
            </div>
            {selectedScore !== null && (
              <div className="mb-4">
                <div className="mb-1 flex justify-between text-[11px] text-ink-2">
                  <span>匹配度</span>
                  <span className="font-mono font-semibold text-accent">{selectedScore}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${selectedScore}%` }} />
                </div>
              </div>
            )}
            <p className="mb-4 text-[12.5px] leading-relaxed text-ink-2">
              {selectedStrategy.concept}
            </p>
            <div className="mb-3">
              <div className="mb-1.5 text-[11px] font-semibold text-ink-2">适用场景</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedStrategy.scenarios.map((s) => (
                  <span key={s} className="chip chip-static">{s}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-ink-2">协同策略</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedStrategy.synergies.map((id) => {
                  const partner = report?.result.strategies.find(
                    (s) => s.strategyId === id,
                  );
                  return (
                    <span key={id} className="chip chip-static">
                      {partner ? resolveStrategy(partner)?.name ?? id : id}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
