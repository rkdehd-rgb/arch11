import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReportStore } from '../stores/report';
import { useBoardStore } from '../stores/board';
import { strategyMap } from '../data/strategies';
import { getCasesByStrategy } from '../data/cases';
import SafeImage from '../components/SafeImage';
import {
  imageGenerationService,
  STYLE_OPTIONS,
  type GeneratedImage,
} from '../services/imageGeneration';
import type { BoardItem, InferenceReport } from '../types';

type GenPhase = 'idle' | 'running';

const GEN_STEPS = [
  { title: '任务解析', desc: '提取任务书关键词与场地条件' },
  { title: '语义扩写', desc: '将策略与风格扩写为视觉语义' },
  { title: '概念草图', desc: '生成体块组合与虚实关系' },
  { title: '细化渲染', desc: '补充材质、光影与环境配景' },
];

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

function buildPrompt(
  strategyName: string,
  styleName: string,
  report: InferenceReport,
): string {
  const keywords = [
    report.task.buildingType,
    report.task.location,
    ...report.task.demands,
  ]
    .filter(Boolean)
    .slice(0, 5)
    .join('、');
  return `以「${strategyName}」为核心策略，采用${styleName}的建筑语言，为位于${report.task.location || '项目场地'}的${report.task.buildingType || '建筑'}（${keywords}）生成概念方案示意图：突出体块组合与虚实关系，呼应场地环境与核心诉求，画面呈现专业建筑草图气质，构图克制、层次清晰。`;
}

export default function BoardPage() {
  const [params] = useSearchParams();
  const reportId = params.get('report') ?? '';
  const initialStrategy = params.get('strategy') ?? '';

  const reports = useReportStore((s) => s.reports);
  const report = useMemo(
    () => reports.find((r) => r.id === reportId) ?? reports[reports.length - 1],
    [reports, reportId],
  );

  const items = useBoardStore((s) => s.items);
  const selectedId = useBoardStore((s) => s.selectedId);
  const addItem = useBoardStore((s) => s.addItem);
  const addItems = useBoardStore((s) => s.addItems);
  const updateItem = useBoardStore((s) => s.updateItem);
  const removeItem = useBoardStore((s) => s.removeItem);
  const select = useBoardStore((s) => s.select);
  const bringToFront = useBoardStore((s) => s.bringToFront);
  const clearBoard = useBoardStore((s) => s.clearBoard);

  const [leftStrategy, setLeftStrategy] = useState<string>(
    initialStrategy || report?.result.strategies[0]?.strategyId || '',
  );
  const [genStrategy, setGenStrategy] = useState<string>(
    initialStrategy || report?.result.strategies[0]?.strategyId || '',
  );
  const [styleId, setStyleId] = useState<string>(STYLE_OPTIONS[0].id);
  const [prompt, setPrompt] = useState<string>('');
  const [promptEdited, setPromptEdited] = useState(false);
  const [genPhase, setGenPhase] = useState<GenPhase>('idle');
  const [genStep, setGenStep] = useState(0);

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panningRef = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 同步策略选择到提示词
  useEffect(() => {
    if (!report || promptEdited) return;
    const strategyName = strategyMap.get(genStrategy)?.name ?? '';
    const styleName = STYLE_OPTIONS.find((s) => s.id === styleId)?.name ?? '';
    setPrompt(buildPrompt(strategyName, styleName, report));
  }, [genStrategy, styleId, report, promptEdited]);

  // 若 report 变化且未水合，自动贴入第一策略参考图
  useEffect(() => {
    if (!report) return;
    const firstId = report.result.strategies[0]?.strategyId;
    if (!firstId) return;
    const key = `${report.id}::${firstId}`;
    const store = useBoardStore.getState();
    if (store.hydratedWithReport !== key && store.items.length === 0) {
      const refs = getCasesByStrategy(firstId).slice(0, 4);
      addItems(
        refs.map((ref, i) => ({
          kind: 'reference' as const,
          x: 140 + (i % 2) * 300 + (i % 2 ? 26 : 0),
          y: 110 + Math.floor(i / 2) * 250 - (i % 2 ? 16 : 0),
          width: 264,
          src: ref.image,
          title: ref.name,
          note: ref.highlight,
          meta: { strategyId: firstId, timestamp: report.createdAt },
        })),
      );
      store.markHydrated(key);
    }
    if (!leftStrategy) setLeftStrategy(firstId);
    if (!genStrategy) setGenStrategy(firstId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const leftCases = useMemo(
    () => (leftStrategy ? getCasesByStrategy(leftStrategy) : []),
    [leftStrategy],
  );

  // ---------------- 画布交互 ----------------

  function toWorldCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    };
  }

  function handleStageMouseDown(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget && (event.target as HTMLElement).dataset.stageBg !== '1') {
      return;
    }
    select(null);
    panningRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      vx: viewport.x,
      vy: viewport.y,
    };
  }

  useEffect(() => {
    function onMouseMove(event: MouseEvent): void {
      if (panningRef.current) {
        const p = panningRef.current;
        setViewport((prev) => ({
          ...prev,
          x: p.vx + (event.clientX - p.startX),
          y: p.vy + (event.clientY - p.startY),
        }));
      } else if (draggingRef.current) {
        const d = draggingRef.current;
        const world = toWorldCoordinates(event.clientX, event.clientY);
        updateItem(d.id, {
          x: d.ox + (world.x - d.startX),
          y: d.oy + (world.y - d.startY),
        });
      }
    }
    function onMouseUp(): void {
      panningRef.current = null;
      draggingRef.current = null;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.scale, updateItem]);

  function handleItemMouseDown(event: React.MouseEvent, item: BoardItem): void {
    event.stopPropagation();
    select(item.id);
    bringToFront(item.id);
    const world = toWorldCoordinates(event.clientX, event.clientY);
    draggingRef.current = {
      id: item.id,
      startX: world.x,
      startY: world.y,
      ox: item.x,
      oy: item.y,
    };
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const delta = -event.deltaY * 0.0012;
    const nextScale = Math.min(2.4, Math.max(0.3, viewport.scale * (1 + delta)));
    // 以鼠标为锚点缩放
    const worldX = (mouseX - viewport.x) / viewport.scale;
    const worldY = (mouseY - viewport.y) / viewport.scale;
    setViewport({
      scale: nextScale,
      x: mouseX - worldX * nextScale,
      y: mouseY - worldY * nextScale,
    });
  }

  // ---------------- 贴图 / 上传 / 粘贴 ----------------

  function addCaseToBoard(src: string, title: string, note: string): void {
    const world = { x: 260, y: 200 };
    addItem({
      kind: 'reference',
      x: world.x + Math.random() * 80,
      y: world.y + Math.random() * 60,
      width: 240,
      src,
      title,
      note,
      meta: { strategyId: leftStrategy },
    });
  }

  function readFileToBoard(file: File, kind: 'inspiration'): void {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      addItem({
        kind,
        x: 240 + Math.random() * 100,
        y: 180 + Math.random() * 80,
        width: 280,
        src,
        title: file.name || '灵感图',
      });
    };
    reader.readAsDataURL(file);
  }

  function handleUploadClick(): void {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files && files[0]) readFileToBoard(files[0], 'inspiration');
    event.target.value = '';
  }

  // 全局粘贴图片
  useEffect(() => {
    function onPaste(event: ClipboardEvent): void {
      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) readFileToBoard(file, 'inspiration');
          event.preventDefault();
          break;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- 生成概念图 ----------------

  async function handleGenerate(): Promise<void> {
    if (!report || !prompt.trim()) return;
    const startedAt = Date.now();
    setGenPhase('running');
    setGenStep(0);

    const stepTimers = GEN_STEPS.map((_, i) =>
      setTimeout(() => setGenStep(i), i * 680),
    );

    const strategyName = strategyMap.get(genStrategy)?.name ?? '';
    let generated: GeneratedImage;
    try {
      generated = await imageGenerationService.generate(prompt, styleId, {
        strategyId: genStrategy,
        strategyName,
        timestamp: startedAt,
      });
    } finally {
      stepTimers.forEach(clearTimeout);
    }

    // 保证分步动画完整播放
    const animationMs = GEN_STEPS.length * 680 + 300;
    const waitMs = Math.max(0, animationMs - (Date.now() - startedAt));
    await new Promise((r) => setTimeout(r, waitMs));

    addItem({
      kind: 'generated',
      x: 360 + Math.random() * 60,
      y: 150 + Math.random() * 40,
      width: 380,
      src: generated.src,
      title: `概念方案图 · ${generated.styleName}`,
      meta: {
        strategyId: genStrategy,
        style: generated.styleName,
        prompt,
        timestamp: startedAt,
      },
    });

    setGenPhase('idle');
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center text-[14px] text-ink-2">
        请先完成一次推理，再进入工作台。
      </div>
    );
  }

  const generatedItems = items.filter((item) => item.kind === 'generated');

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左侧面板 */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
            Step 04-05 / Studio
          </div>
          <div className="mt-1 text-[14.5px] font-semibold text-ink">参考案例库</div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="field-label" htmlFor="leftStrategy">策略选择</label>
          <select
            id="leftStrategy"
            className="input"
            value={leftStrategy}
            onChange={(e) => setLeftStrategy(e.target.value)}
          >
            {report.result.strategies.map((match, i) => (
              <option key={match.strategyId} value={match.strategyId}>
                {i + 1}. {strategyMap.get(match.strategyId)?.name ?? match.strategyId}（{match.matchScore}%）
              </option>
            ))}
          </select>

          <div className="mt-5 mb-3 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink-2">案例图库</span>
            <span className="font-mono text-[10.5px] text-ink-3">{leftCases.length}</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {leftCases.map((ref) => (
              <button
                key={ref.id}
                type="button"
                className="group overflow-hidden rounded-md border border-line text-left transition-colors hover:border-accent"
                onClick={() => addCaseToBoard(ref.image, ref.name, ref.highlight)}
                title={`点击贴入画板：${ref.name}`}
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-line">
                  <SafeImage
                    src={ref.image}
                    alt={ref.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                </div>
                <div className="truncate px-2 py-1.5 text-[11px] text-ink-2">{ref.name}</div>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <button type="button" className="btn btn-secondary w-full" onClick={handleUploadClick}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              上传灵感图
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-3">
              也可直接 Ctrl/⌘ + V 粘贴剪贴板图片
            </p>
          </div>
        </div>
      </aside>

      {/* 中间画板 */}
      <main className="relative flex-1 overflow-hidden bg-blueprint">
        <div
          ref={stageRef}
          data-stage-bg="1"
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.13) 1px, transparent 1px)',
            backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
          onMouseDown={handleStageMouseDown}
          onWheel={handleWheel}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: '0 0',
            }}
          >
            {items.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <div
                  key={item.id}
                  className={`absolute select-none ${isSelected ? 'z-20' : 'z-10'}`}
                  style={{ left: item.x, top: item.y, width: item.width }}
                  onMouseDown={(e) => handleItemMouseDown(e, item)}
                >
                  <div
                    className={`overflow-hidden rounded-sm bg-white shadow-lg transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-accent ring-offset-2 ring-offset-blueprint'
                        : 'ring-1 ring-black/20'
                    }`}
                  >
                    <SafeImage
                      src={item.src}
                      alt={item.title}
                      className="block aspect-[4/3] w-full object-cover"
                    />
                  </div>

                  {/* 标题 + 类型徽标 */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase ${
                        item.kind === 'generated'
                          ? 'bg-accent text-white'
                          : item.kind === 'inspiration'
                            ? 'bg-white/80 text-ink'
                            : 'bg-white/50 text-white/80'
                      }`}
                    >
                      {item.kind === 'generated' ? 'AI' : item.kind === 'inspiration' ? '灵感' : '参考'}
                    </span>
                    <span className="truncate text-[11px] text-white/70">{item.title}</span>
                  </div>

                  {/* 便签 */}
                  {isSelected && (
                    <div className="mt-1.5" onMouseDown={(e) => e.stopPropagation()}>
                      <textarea
                        className="w-full rounded border border-white/20 bg-[#2b2f38] px-2 py-1 text-[11px] leading-relaxed text-white/85 outline-none focus:border-accent"
                        rows={2}
                        placeholder="添加便签，标注灵感点…"
                        value={item.note ?? ''}
                        onChange={(e) => updateItem(item.id, { note: e.target.value })}
                      />
                      <div className="mt-1 flex justify-end gap-2">
                        {item.meta?.style && (
                          <span className="mr-auto font-mono text-[9.5px] text-white/45">
                            {item.meta.style}
                          </span>
                        )}
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[10.5px] text-white/50 hover:bg-white/10 hover:text-white"
                          onClick={() => bringToFront(item.id)}
                        >
                          置顶
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-[10.5px] text-white/50 hover:bg-accent hover:text-white"
                          onClick={() => removeItem(item.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 生成图参数标签 */}
                  {item.kind === 'generated' && item.meta?.timestamp && !isSelected && (
                    <div className="font-mono text-[9.5px] text-white/40">
                      {new Date(item.meta.timestamp).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 画布工具条 */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border border-white/10 bg-[#23272f]/95 px-2 py-1.5 text-white/70 shadow-lg">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10"
            onClick={() => setViewport((v) => ({ ...v, scale: Math.max(0.3, v.scale - 0.15) }))}
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-[11px]">
            {Math.round(viewport.scale * 100)}%
          </span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10"
            onClick={() => setViewport((v) => ({ ...v, scale: Math.min(2.4, v.scale + 0.15) }))}
          >
            +
          </button>
          <span className="mx-1 h-4 w-px bg-white/15" />
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] hover:bg-white/10"
            onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
          >
            复位
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] hover:bg-white/10"
            onClick={clearBoard}
          >
            清空画板
          </button>
        </div>

        {/* 生成历史 */}
        {generatedItems.length > 0 && (
          <div className="absolute right-4 top-4 w-[230px] rounded-md border border-white/10 bg-[#23272f]/95 p-3">
            <div className="mb-2 text-[11.5px] font-semibold text-white/80">
              生成历史（{generatedItems.length}）
            </div>
            <div className="space-y-2">
              {generatedItems.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded text-left hover:bg-white/5"
                  onClick={() => select(g.id)}
                >
                  <SafeImage src={g.src} alt={g.title} className="h-9 w-12 rounded object-cover" />
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-white/75">{g.title}</div>
                    <div className="font-mono text-[9.5px] text-white/40">
                      {g.meta?.timestamp
                        ? new Date(g.meta.timestamp).toLocaleTimeString('zh-CN', { hour12: false })
                        : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 生成进度遮罩 */}
        {genPhase === 'running' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
            <div className="w-[400px] rounded-lg border border-white/10 bg-[#23272f] p-7 fade-in">
              <div className="mb-6 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">
                Generating Concept
              </div>
              <div className="space-y-4">
                {GEN_STEPS.map((step, i) => {
                  const state = i < genStep ? 'done' : i === genStep ? 'active' : 'idle';
                  return (
                    <div key={step.title} className="flex items-start gap-3">
                      {state === 'done' ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-white">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      ) : state === 'active' ? (
                        <span className="spinner !h-5 !w-5 !border-white/30 !border-t-accent" />
                      ) : (
                        <span className="h-5 w-5 rounded border border-white/20" />
                      )}
                      <div>
                        <div className={`text-[13px] font-medium ${state === 'idle' ? 'text-white/35' : 'text-white/85'}`}>
                          {step.title}
                        </div>
                        <div className="text-[11px] text-white/40">{step.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 右侧生成控制面板 */}
      <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <div className="text-[14.5px] font-semibold text-ink">生成控制面板</div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">演示版：程序化 SVG 概念示意图</div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <label className="field-label" htmlFor="genStrategy">策略选择（单选）</label>
          <select
            id="genStrategy"
            className="input"
            value={genStrategy}
            onChange={(e) => setGenStrategy(e.target.value)}
          >
            {report.result.strategies.map((match, i) => (
              <option key={match.strategyId} value={match.strategyId}>
                {i + 1}. {strategyMap.get(match.strategyId)?.name ?? match.strategyId}
              </option>
            ))}
          </select>

          <div className="mt-5">
            <span className="field-label">风格选择</span>
            <div className="grid grid-cols-4 gap-2">
              {STYLE_OPTIONS.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`flex flex-col items-center gap-1.5 rounded-md border px-1 py-2 transition-all ${
                    styleId === style.id
                      ? 'border-accent bg-accent-soft'
                      : 'border-line hover:border-line-strong'
                  }`}
                  onClick={() => setStyleId(style.id)}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded"
                    style={{ backgroundColor: style.palette.secondary }}
                  >
                    <span
                      className="block h-4 w-4"
                      style={{
                        backgroundColor: style.palette.accent,
                        clipPath:
                          style.id === 'parametric'
                            ? 'polygon(50% 0,100% 100%,0 100%)'
                            : style.id === 'folded-plate'
                              ? 'polygon(0 100%,50% 0,100% 100%)'
                              : 'inset(2px)',
                      }}
                    />
                  </span>
                  <span className={`text-[10px] leading-tight ${styleId === style.id ? 'text-accent-dark' : 'text-ink-2'}`}>
                    {style.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-2">提示词</span>
              <button
                type="button"
                className="text-[11px] text-ink-3 hover:text-accent"
                onClick={() => {
                  setPromptEdited(false);
                  const strategyName = strategyMap.get(genStrategy)?.name ?? '';
                  const styleName = STYLE_OPTIONS.find((s) => s.id === styleId)?.name ?? '';
                  setPrompt(buildPrompt(strategyName, styleName, report));
                }}
              >
                重新拼装
              </button>
            </div>
            <textarea
              className="input min-h-[168px] resize-y text-[12.5px] leading-[1.7]"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPromptEdited(true);
              }}
            />
          </div>
        </div>

        <div className="border-t border-line px-5 py-4">
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={genPhase === 'running' || !prompt.trim()}
            onClick={handleGenerate}
          >
            {genPhase === 'running' ? (
              <>
                <span className="spinner !border-white/40 !border-t-white" />
                生成中…
              </>
            ) : (
              '生成概念方案图'
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
