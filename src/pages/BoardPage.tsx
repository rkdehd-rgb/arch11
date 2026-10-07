import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReportStore } from '../stores/report';
import { useBoardStore } from '../stores/board';
import { useSettingsStore } from '../stores/settings';
import { MAX_CASE_IMAGES } from '../stores/caseOverride';
import { strategyMap } from '../data/strategies';
import SafeImage from '../components/SafeImage';
import { resolveCases, resolveCaseMeta } from '../services/strategyPool';
import { compressImage, StorageQuotaError } from '../services/imageCompress';
import {
  prepareReferenceImages,
  isImageUploadError,
} from '../services/referenceImage';
import ImageSearchPicker from '../components/ImageSearchPicker';
import {
  imageGenerationService,
  STYLE_OPTIONS,
  getStyle,
  type GeneratedImage,
} from '../services/imageGeneration';
import {
  MODEL_CATALOG,
  PIXEL_PRESETS,
  DEFAULT_MODEL_ID,
  GPT_BASE_DEFAULT_SIZE,
  getModelSpec,
  submitAsyncGenerate,
  pollAsyncResult,
  generateSync,
  editImage,
  GrsaiError,
} from '../services/grsai';
import type { BoardItem, GrsaiMode, GrsaiNode, InferenceReport } from '../types';

type GenPhase = 'idle' | 'running';

const GEN_STEPS = [
  { title: '任务解析', desc: '提取任务书关键词与场地条件' },
  { title: '语义扩写', desc: '将策略与风格扩写为视觉语义' },
  { title: '概念草图', desc: '生成体块组合与虚实关系' },
  { title: '细化渲染', desc: '补充材质、光影与环境配景' },
];

const GEN_MODE_TABS: { id: GrsaiMode; label: string; hint: string }[] = [
  { id: 'async', label: 'AI 生成', hint: '统一异步接口，真实进度' },
  { id: 'sync', label: '快速生图', hint: 'OpenAI 同步，备用通道' },
  { id: 'edit', label: '图片编辑', hint: '针对画板选中的一张图' },
];

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

function buildPrompt(
  strategyName: string,
  modelLabel: string,
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
  return `以「${strategyName}」为核心策略，采用 ${modelLabel} 的视觉表现，为位于${report.task.location || '项目场地'}的${report.task.buildingType || '建筑'}（${keywords}）生成概念方案示意图：突出体块组合与虚实关系，呼应场地环境与核心诉求，画面呈现专业建筑草图气质，构图克制、层次清晰。`;
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

  const llmConfig = useSettingsStore((s) => s.config);
  const grsaiNode: GrsaiNode = llmConfig.grsaiNode ?? 'global';
  const grsaiKey = llmConfig.apiKey;
  const grsaiReady = Boolean(grsaiKey.trim());

  const [genMode, setGenMode] = useState<GrsaiMode>('async');
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  // 各模型参数
  const [aspectRatio, setAspectRatio] = useState<string>('auto');
  const [imageSize, setImageSize] = useState<string>('1K');
  const [gptRatio, setGptRatio] = useState<string>('1:1');
  const [pixelSize, setPixelSize] = useState<string>('1024x1024');
  const [quality, setQuality] = useState<string>('auto');
  const [transparent, setTransparent] = useState(false);
  const [maskUrl, setMaskUrl] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // 演示用概念风格（仅影响本地 SVG 兜底；真实接口忽略此参数）
  const [genStyle, setGenStyle] = useState<string>(STYLE_OPTIONS[0].id);
  const styleTouched = useRef(false);
  useEffect(() => {
    if (styleTouched.current) return;
    let h = 0;
    for (let i = 0; i < genStrategy.length; i += 1) h = (h * 31 + genStrategy.charCodeAt(i)) >>> 0;
    setGenStyle(STYLE_OPTIONS[h % STYLE_OPTIONS.length].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genStrategy]);
  // 异步模式参考图（多图）；默认自动带入当前策略案例
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [autoRefStrategy, setAutoRefStrategy] = useState<string>('');

  const [prompt, setPrompt] = useState<string>('');
  const [promptEdited, setPromptEdited] = useState(false);
  const [genPhase, setGenPhase] = useState<GenPhase>('idle');
  const [genStep, setGenStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  // 参考图预处理（提交前下载转 base64）进度
  const [preprocess, setPreprocess] = useState<{ done: number; total: number } | null>(null);
  // 画板图片异步预转换失败的 item id 集合（显示红标）
  const [failedPreconvert, setFailedPreconvert] = useState<string[]>([]);
  // 画板「自动找图」弹层
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const cancelRef = useRef(false);

  // 卸载时取消进行中的生成轮询，避免对未挂载组件 setState 引发告警
  useEffect(() => () => {
    cancelRef.current = true;
  }, []);

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panningRef = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const modelSpec = getModelSpec(modelId);

  // 画板当前选中项（图片编辑模式使用，仅允许一张）
  const selectedItem = items.find((it) => it.id === selectedId) ?? null;

  // 切换模型：归一化参数到合法区间
  function handleModelChange(nextId: string): void {
    const spec = getModelSpec(nextId);
    setModelId(nextId);
    setGenError(null);
    if (spec.paramStyle === 'banana' || spec.paramStyle === 'banana2') {
      if (!spec.ratios?.includes(aspectRatio)) setAspectRatio(spec.ratios?.[0] ?? 'auto');
      if (!spec.sizes?.includes(imageSize)) setImageSize('1K');
    } else if (spec.paramStyle === 'gpt-base') {
      setQuality('auto');
    } else {
      setQuality(spec.qualities?.[0] ?? 'medium');
      setTransparent(false);
    }
  }

  function handleModeChange(mode: GrsaiMode): void {
    if (mode === 'edit' && !selectedItem) return;
    setGenMode(mode);
    setGenError(null);
    // 图片编辑仅支持 gpt-image 系列：进入时若当前模型不属于该系列则自动切换
    if (mode === 'edit' && getModelSpec(modelId).family !== 'gpt-image') {
      handleModelChange('gpt-image-2');
    }
  }

  // 异步参考图：策略变化时自动带入该策略案例图（用户未手动改过时）
  useEffect(() => {
    if (genStrategy !== autoRefStrategy) {
      const refs = resolveCaseMeta(genStrategy)
        .map((c) => c.image)
        .slice(0, 3);
      setReferenceImages(refs);
      setAutoRefStrategy(genStrategy);
    }
  }, [genStrategy, autoRefStrategy]);

  function addReferenceFromGallery(src: string): void {
    setReferenceImages((prev) => (prev.includes(src) ? prev : [...prev, src]));
  }
  function removeReference(src: string): void {
    setReferenceImages((prev) => prev.filter((x) => x !== src));
  }

  // 同步策略选择到提示词
  useEffect(() => {
    if (!report || promptEdited) return;
    const strategyName = strategyMap.get(genStrategy)?.name ?? '';
    const modelLabel = getModelSpec(modelId).label;
    setPrompt(buildPrompt(strategyName, modelLabel, report));
  }, [genStrategy, modelId, report, promptEdited]);

  // 若 report 变化且未水合，自动贴入第一策略参考图
  useEffect(() => {
    if (!report) return;
    const firstId = report.result.strategies[0]?.strategyId;
    if (!firstId) return;
    const key = `${report.id}::${firstId}`;
    const store = useBoardStore.getState();
    if (store.hydratedWithReport !== key && store.items.length === 0) {
      const refs = resolveCaseMeta(firstId).slice(0, 4);
      addItems(
        refs.map((ref, i) => ({
          kind: 'reference' as const,
          x: 140 + (i % 2) * 300 + (i % 2 ? 26 : 0),
          y: 110 + Math.floor(i / 2) * 250 - (i % 2 ? 16 : 0),
          width: 264,
          src: ref.image,
          title: ref.name ?? '参考案例',
          note: ref.highlight ?? '',
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
    () => (leftStrategy ? resolveCases(leftStrategy) : []),
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

  /** 画板找图默认词：当前左栏策略名 + 建筑案例 */
  function boardSearchKeyword(): string {
    const strategyName = strategyMap.get(leftStrategy)?.name ?? '';
    return strategyName ? `${strategyName} 建筑案例` : 'architecture building';
  }

  /** 画板找图确认：图片已为 base64，错落贴入画板，并加入生成参考图 */
  function handleBoardPickerConfirm(dataUris: string[]): void {
    dataUris.forEach((src, i) => {
      addItem({
        kind: 'reference',
        x: 250 + i * 40 + Math.random() * 50,
        y: 190 + i * 30 + Math.random() * 40,
        width: 240,
        src,
        title: '网络参考图',
        note: '自动找图结果（本地 base64）',
        meta: { strategyId: leftStrategy },
      });
      addReferenceFromGallery(src);
    });
    setBoardNotice(`已贴入 ${dataUris.length} 张参考图，可直接参与生成。`);
  }

  /**
   * 处理一张图片：
   * - 画板已选中图片 → 原位替换 src（位置、尺寸、便签保留）
   * - 未选中 → 新增一张灵感图
   */
  async function ingestImage(file: File): Promise<void> {
    try {
      const { dataUrl } = await compressImage(file);
      const targetId = useBoardStore.getState().selectedId;
      if (targetId) {
        updateItem(targetId, { src: dataUrl });
        setBoardNotice(`已原位替换图片，位置与尺寸保持不变`);
      } else {
        addItem({
          kind: 'inspiration',
          x: 240 + Math.random() * 100,
          y: 180 + Math.random() * 80,
          width: 280,
          src: dataUrl,
          title: file.name || '灵感图',
        });
      }
    } catch (err) {
      if (err instanceof StorageQuotaError) setBoardNotice(err.message);
      else if (err instanceof Error) setBoardNotice(err.message);
    }
  }

  function handleUploadClick(): void {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files && files[0]) void ingestImage(files[0]);
    event.target.value = '';
  }

  /** 点击工具条「替换此图」：先确保该图处于选中态，再打开文件选择 */
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  function handleReplaceClick(): void {
    if (selectedId) replaceFileInputRef.current?.click();
  }
  function handleReplaceFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void ingestImage(file);
  }

  // 全局粘贴图片：选中图 → 替换；未选中 → 新增
  useEffect(() => {
    function onPaste(event: ClipboardEvent): void {
      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) void ingestImage(file);
          event.preventDefault();
          break;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // boardNotice 自动消失
  useEffect(() => {
    if (!boardNotice) return;
    const t = window.setTimeout(() => setBoardNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [boardNotice]);

  // ---------------- 画板图片异步预转换（后台下载转 base64） ----------------

  /** 后台预转换一张画板图片：远程 URL → data URI，成功后替换 src */
  async function preconvertItem(item: BoardItem): Promise<void> {
    if (/^data:/i.test(item.src.trim())) return;
    try {
      const { images, failed } = await prepareReferenceImages([item.src]);
      if (images[0]) {
        useBoardStore.getState().updateItem(item.id, { src: images[0] });
        setFailedPreconvert((prev) => prev.filter((id) => id !== item.id));
      } else if (failed[0]) {
        setFailedPreconvert((prev) =>
          prev.includes(item.id) ? prev : [...prev, item.id],
        );
      }
    } catch {
      setFailedPreconvert((prev) =>
        prev.includes(item.id) ? prev : [...prev, item.id],
      );
    }
  }

  // 案例图 / 灵感图贴入画板后，后台异步预转换（生成图通常本身即 data URI，跳过）
  useEffect(() => {
    const pending = items.filter(
      (item) =>
        item.kind !== 'generated' &&
        !/^data:/i.test(item.src.trim()) &&
        !failedPreconvert.includes(item.id),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const item of pending) {
        if (cancelled) break;
        await preconvertItem(item);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // ---------------- 生成概念图 ----------------

  /** gpt-base 型号的合法 size 映射（OpenAI 格式：比例 → 像素尺寸） */
  const GPT_BASE_SIZE_MAP: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '21:9': '1536x1024',
  };

  /** 计算 gpt-base 型号的 size：比例字符串或像素值 */
  function resolveGptBaseSize(): string {
    if (gptRatio.includes('x')) return gptRatio;
    return GPT_BASE_SIZE_MAP[gptRatio] ?? GPT_BASE_DEFAULT_SIZE;
  }

  async function handleGenerate(): Promise<void> {
    if (!report || !prompt.trim()) return;
    if (genMode === 'edit' && !selectedItem) {
      setGenError('请先在画板上选中一张要编辑的图片');
      return;
    }

    const startedAt = Date.now();
    setGenPhase('running');
    setGenStep(0);
    setProgress(0);
    setGenError(null);
    cancelRef.current = false;

    // 未配置 Key：直接走演示兜底
    if (!grsaiReady) {
      await runDemoFallback(startedAt, true);
      return;
    }

    // ---- 参考图预处理：浏览器端下载转 base64，避免服务端拉图失败 ----
    let submitImages = referenceImages;
    let fallbackImages: string[] = [];
    if (genMode !== 'edit' && referenceImages.length > 0) {
      setPreprocess({ done: 0, total: referenceImages.length });
      const prepared = await prepareReferenceImages(referenceImages, {
        onProgress: (done, total) => setPreprocess({ done, total }),
      });
      setPreprocess(null);
      submitImages = prepared.images;
      fallbackImages = prepared.originals;
      if (prepared.failed.length > 0) {
        const names = prepared.failed.map((f) => `图${f.index}`).join('、');
        setBoardNotice(
          `${prepared.failed.length}/${referenceImages.length} 张参考图无法加载，已剔除：${names}`,
        );
      }
    }

    // edit 模式：预处理选中图（单张）
    let editSubmitSrc = selectedItem?.src ?? '';
    const editFallbackSrc = selectedItem?.src ?? '';
    if (genMode === 'edit' && selectedItem) {
      setPreprocess({ done: 0, total: 1 });
      const prepared = await prepareReferenceImages([selectedItem.src], {
        onProgress: (done, total) => setPreprocess({ done, total }),
      });
      setPreprocess(null);
      if (prepared.images[0]) {
        editSubmitSrc = prepared.images[0];
      } else {
        const r = prepared.failed[0]?.reason ?? '无法加载';
        setGenError(`待编辑图片无法读取（${r}），请替换为本地图片后重试。`);
        setGenPhase('idle');
        return;
      }
    }

    /** 按当前模式提交一次；dataUri=true 传预处理 base64，false 传原 URL */
    async function submitOnce(dataUri: boolean): Promise<string> {
      const images = dataUri ? submitImages : fallbackImages;
      if (genMode === 'async') {
        const taskId = await submitAsyncGenerate(grsaiNode, grsaiKey, {
          prompt,
          model: modelId,
          aspectRatio: aspectRatio === 'auto' ? '1:1' : aspectRatio,
          imageSize,
          images,
          quality: modelSpec.family === 'gpt-image' ? quality : undefined,
          background: transparent ? 'transparent' : undefined,
          mask: maskUrl || undefined,
        });
        setProgress(2);
        return await pollAsyncResult(grsaiNode, grsaiKey, taskId, {
          onProgress: (p) => setProgress(p),
          shouldCancel: () => cancelRef.current,
        });
      }
      if (genMode === 'sync') {
        const size = modelSpec.paramStyle === 'gpt-vip'
          ? pixelSize
          : modelSpec.paramStyle === 'gpt-base'
            ? resolveGptBaseSize()
            : (() => {
                // nano-banana 在同步接口下映射为像素
                const preset = PIXEL_PRESETS.find((p) => p.ratio === aspectRatio);
                return preset?.values[0] ?? GPT_BASE_DEFAULT_SIZE;
              })();
        return await generateSync(grsaiNode, grsaiKey, {
          prompt,
          model: modelId,
          size,
          image: images,
          quality: modelSpec.family === 'gpt-image' ? quality : undefined,
          background: transparent ? 'transparent' : undefined,
        });
      }
      return await editImage(grsaiNode, grsaiKey, {
        prompt,
        model: modelId,
        image: dataUri ? editSubmitSrc : editFallbackSrc,
        quality: modelSpec.family === 'gpt-image' ? quality : undefined,
        background: transparent ? 'transparent' : undefined,
        mask: maskUrl || undefined,
      });
    }

    try {
      let imageUrl = '';
      try {
        imageUrl = await submitOnce(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // data URI 被拒 / 参考图相关错误：改用原 URL 再试一次
        const canFallback = genMode === 'edit'
          ? Boolean(editFallbackSrc) && editFallbackSrc !== editSubmitSrc
          : fallbackImages.some((x, i) => x !== submitImages[i]);
        if (isImageUploadError(msg) && canFallback) {
          setBoardNotice('base64 参考图被拒，已改用原图地址重试一次。');
          imageUrl = await submitOnce(false);
        } else {
          throw err;
        }
      }

      if (cancelRef.current) return;
      addGeneratedItem(imageUrl, modelSpec.label, genMode, startedAt, false);
      setGenPhase('idle');
    } catch (err) {
      if (err instanceof GrsaiError && err.message === '已取消生成') {
        setGenPhase('idle');
        return;
      }
      // 真实接口失败：自动降级为程序化 SVG 演示
      const reason = err instanceof Error ? err.message : String(err);
      setGenError(`真实接口失败（${reason}），已自动切换为演示生成。`);
      await runDemoFallback(startedAt, false, reason);
    }
  }

  /** 程序化 SVG 演示兜底（未配置 Key 或真实接口失败时） */
  async function runDemoFallback(startedAt: number, noKey: boolean, reason?: string): Promise<void> {
    const stepTimers = GEN_STEPS.map((_, i) =>
      setTimeout(() => setGenStep(i), i * 680),
    );
    const strategyName = strategyMap.get(genStrategy)?.name ?? '';
    let generated: GeneratedImage;
    try {
      generated = await imageGenerationService.generate(prompt, genStyle, {
        strategyId: genStrategy,
        strategyName,
        timestamp: startedAt,
      });
    } finally {
      stepTimers.forEach(clearTimeout);
    }
    const animationMs = GEN_STEPS.length * 680 + 300;
    const waitMs = Math.max(0, animationMs - (Date.now() - startedAt));
    await new Promise((r) => setTimeout(r, waitMs));

    const styleName = getStyle(genStyle).name;
    const label = noKey ? `${styleName}·演示` : `${styleName}·降级`;
    addGeneratedItem(generated.src, label, 'degraded', startedAt, true);
    if (reason) setGenError(`接口失败：${reason}；已用程序化 SVG 兜底。`);
    setGenPhase('idle');
  }

  function addGeneratedItem(
    src: string,
    label: string,
    mode: GrsaiMode | 'degraded',
    startedAt: number,
    degraded: boolean,
  ): void {
    addItem({
      kind: 'generated',
      x: 360 + Math.random() * 60,
      y: 150 + Math.random() * 40,
      width: 380,
      src,
      title: `概念方案图 · ${label}`,
      meta: {
        strategyId: genStrategy,
        style: label,
        prompt,
        timestamp: startedAt,
        grsaiModel: modelId,
        grsaiMode: mode,
      },
    });
    void degraded;
  }

  function handleCancel(): void {
    cancelRef.current = true;
    setGenPhase('idle');
    setGenError(null);
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center text-[14px] text-ink-2">
        请先完成一次推理，再进入工作台。
      </div>
    );
  }

  const generatedItems = items.filter((item) => item.kind === 'generated');

  const boardPicker = boardPickerOpen ? (
    <ImageSearchPicker
      initialKeyword={boardSearchKeyword()}
      remaining={MAX_CASE_IMAGES}
      onConfirm={handleBoardPickerConfirm}
      onClose={() => setBoardPickerOpen(false)}
    />
  ) : null;

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBoardPickerOpen(true)}
                title="无图时自动联网搜索候选图"
                className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10.5px] text-accent transition-colors hover:bg-accent-soft"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                自动找图
              </button>
              <span className="font-mono text-[10.5px] text-ink-3">{leftCases.length}</span>
            </div>
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
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-line">
                  <SafeImage
                    src={ref.image}
                    alt={ref.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                  <span
                    role="button"
                    tabIndex={0}
                    title="加入生成参考图"
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-[rgba(20,23,28,0.72)] text-white opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      addReferenceFromGallery(ref.image);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        addReferenceFromGallery(ref.image);
                      }
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </span>
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
            <input
              ref={replaceFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleReplaceFileChange}
            />
            <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-3">
              也可直接 Ctrl/⌘ + V 粘贴剪贴板图片
            </p>
            <p className="mt-1.5 rounded bg-surface-raised px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-3">
              规则：画板中选中一张图片时，上传 / 粘贴将原位替换该图（位置尺寸不变）；未选中时新增贴图。
            </p>
          </div>
        </div>
      </aside>

      {/* 中间画板 */}
      <main className="relative flex-1 overflow-hidden bg-blueprint">
        {boardNotice && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-md border border-white/15 bg-[#23272f]/95 px-4 py-2 text-[12px] text-white/90 shadow-xl">
            {boardNotice}
          </div>
        )}
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

                  {/* 预转换失败红标：此图无法作为参考图 */}
                  {failedPreconvert.includes(item.id) && (
                    <span
                      title="此图无法作为参考图，建议替换为本地图片"
                      className="absolute -left-1.5 -top-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-[#C0392B] text-[12px] font-bold text-white shadow-md ring-2 ring-blueprint"
                    >
                      !
                    </span>
                  )}

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
                          onClick={handleReplaceClick}
                        >
                          替换此图
                        </button>
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
                {preprocess && (
                  <div className="flex items-start gap-3">
                    <span className="spinner !h-5 !w-5 !border-white/30 !border-t-accent" />
                    <div>
                      <div className="text-[13px] font-medium text-white/85">
                        参考图预处理
                      </div>
                      <div className="font-mono text-[11px] text-white/40">
                        下载并转码 {preprocess.done}/{preprocess.total}
                      </div>
                    </div>
                  </div>
                )}
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
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
            Grsai
            <span className="font-mono">
              {grsaiNode === 'global' ? 'grsaiapi.com' : 'grsai.dakka.com.cn'}
            </span>
            · {grsaiReady ? '真实接口' : '演示模式'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* 生成模式三选一 */}
          <span className="field-label">生成模式</span>
          <div className="grid grid-cols-3 gap-1.5">
            {GEN_MODE_TABS.map((tab) => {
              const disabled = tab.id === 'edit' && !selectedItem;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={disabled}
                  title={tab.hint}
                  className={`rounded-md border px-1 py-2 text-[11.5px] transition-all ${
                    genMode === tab.id
                      ? 'border-accent bg-accent-soft text-accent-dark'
                      : 'border-line text-ink-2 hover:border-line-strong'
                  } ${disabled ? 'cursor-not-allowed opacity-40 hover:border-line' : ''}`}
                  onClick={() => handleModeChange(tab.id)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          {genMode === 'edit' && (
            <p className="mt-1.5 text-[11px] text-ink-3">
              {selectedItem
                ? `编辑对象：${selectedItem.title}`
                : '请先在画板上点选一张图片'}
            </p>
          )}
          {genMode === 'sync' && (
            <p className="mt-1.5 text-[11px] text-ink-3">同步等待，无进度百分比。</p>
          )}

          {/* 策略选择（edit 模式不强制） */}
          <div className="mt-5">
            <label className="field-label" htmlFor="genStrategy">策略选择</label>
            <select
              id="genStrategy"
              className="input"
              value={genStrategy}
              onChange={(e) => setGenStrategy(e.target.value)}
            >
              {report.result.strategies.map((match, i) => (
                <option key={match.strategyId} value={match.strategyId}>
                  {i + 1}. {strategyMap.get(match.strategyId)?.name ?? match.strategyId}（{match.matchScore}%）
                </option>
              ))}
            </select>
          </div>

          {/* 模型分组下拉 */}
          <div className="mt-5">
            <label className="field-label" htmlFor="modelSelect">
              模型选择（{genMode === 'edit' ? 'gpt-image 5' : '16'}）
            </label>
            <select
              id="modelSelect"
              className="input font-mono text-[12.5px]"
              value={modelId}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {genMode !== 'edit' && (
                <optgroup label="nano-banana 系列（/v1/api/generate）">
                  {MODEL_CATALOG.filter((m) => m.family === 'nano-banana')
                    .map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                </optgroup>
              )}
              <optgroup label="gpt-image 系列（images/generations · edits）">
                {MODEL_CATALOG.filter((m) => m.family === 'gpt-image')
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
              </optgroup>
            </select>
            {genMode === 'edit' && (
              <p className="mt-1 text-[10.5px] text-ink-3">
                图片编辑接口仅支持 gpt-image 系列，单图指令式编辑。
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {modelSpec.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-2"
                >
                  {cap}
                </span>
              ))}
              <span className="rounded px-1.5 py-0.5 text-[9.5px] text-ink-3">
                后缀含义以实际效果为准
              </span>
            </div>
          </div>

          {/* 概念风格（演示兜底用） */}
          <div className="mt-5">
            <label className="field-label" htmlFor="genStyle">概念风格（演示图）</label>
            <select
              id="genStyle"
              className="input"
              value={genStyle}
              onChange={(e) => {
                styleTouched.current = true;
                setGenStyle(e.target.value);
              }}
            >
              {STYLE_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[10.5px] text-ink-3">
              风格仅作用于「未配置 Key / 真实接口失败」时的本地 SVG 演示图。
            </p>
          </div>

          {/* -------- 动态参数区：nano-banana -------- */}
          {(modelSpec.paramStyle === 'banana' || modelSpec.paramStyle === 'banana2') && (
            <div className="mt-5 space-y-4">
              <div>
                <span className="field-label">画面比例</span>
                <div className="flex flex-wrap gap-1.5">
                  {modelSpec.ratios?.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`h-7 rounded-md border px-2 font-mono text-[11px] transition-all ${
                        aspectRatio === r
                          ? 'border-accent bg-accent-soft text-accent-dark'
                          : 'border-line text-ink-2 hover:border-line-strong'
                      }`}
                      onClick={() => setAspectRatio(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="field-label">分辨率</span>
                <div className="flex gap-1.5">
                  {modelSpec.sizes?.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`h-7 flex-1 rounded-md border font-mono text-[11px] transition-all ${
                        imageSize === s
                          ? 'border-accent bg-accent-soft text-accent-dark'
                          : 'border-line text-ink-2 hover:border-line-strong'
                      }`}
                      onClick={() => setImageSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* -------- 动态参数区：gpt-base -------- */}
          {modelSpec.paramStyle === 'gpt-base' && (
            <div className="mt-5 space-y-4">
              <div>
                <span className="field-label">比例或像素</span>
                <div className="flex flex-wrap gap-1.5">
                  {modelSpec.ratios?.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`h-7 rounded-md border px-2 font-mono text-[11px] transition-all ${
                        gptRatio === r
                          ? 'border-accent bg-accent-soft text-accent-dark'
                          : 'border-line text-ink-2 hover:border-line-strong'
                      }`}
                      onClick={() => setGptRatio(r)}
                    >
                      {r}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`h-7 rounded-md border px-2 font-mono text-[11px] transition-all ${
                      gptRatio === GPT_BASE_DEFAULT_SIZE
                        ? 'border-accent bg-accent-soft text-accent-dark'
                        : 'border-line text-ink-2 hover:border-line-strong'
                    }`}
                    onClick={() => setGptRatio(GPT_BASE_DEFAULT_SIZE)}
                  >
                    {GPT_BASE_DEFAULT_SIZE}
                  </button>
                </div>
              </div>
              <div>
                <span className="field-label">质量</span>
                <div className="flex gap-1.5">
                  {modelSpec.qualities?.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={`h-7 flex-1 rounded-md border font-mono text-[11px] ${
                        quality === q
                          ? 'border-accent bg-accent-soft text-accent-dark'
                          : 'border-line text-ink-2 hover:border-line-strong'
                      }`}
                      onClick={() => setQuality(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* -------- 动态参数区：vip/flare/sunburst -------- */}
          {modelSpec.paramStyle === 'gpt-vip' && (
            <div className="mt-5 space-y-4">
              <div>
                <span className="field-label">像素预设（比例 × 分辨率）</span>
                <div className="space-y-2">
                  {PIXEL_PRESETS.map((preset) => (
                    <div key={preset.ratio}>
                      <div className="mb-1 font-mono text-[10px] text-ink-3">{preset.ratio}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {preset.values.map((v) => (
                          <button
                            key={v}
                            type="button"
                            className={`h-7 rounded-md border px-2 font-mono text-[10.5px] transition-all ${
                              pixelSize === v
                                ? 'border-accent bg-accent-soft text-accent-dark'
                                : 'border-line text-ink-2 hover:border-line-strong'
                            }`}
                            onClick={() => setPixelSize(v)}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <span className="field-label">质量档位</span>
                <div className="flex flex-wrap gap-1.5">
                  {modelSpec.qualities?.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={`h-7 rounded-md border px-2.5 font-mono text-[11px] transition-all ${
                        quality === q
                          ? 'border-accent bg-accent-soft text-accent-dark'
                          : 'border-line text-ink-2 hover:border-line-strong'
                      }`}
                      onClick={() => setQuality(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {modelSpec.transparent && (
                <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-[12px] text-ink-2">
                  <span>透明背景</span>
                  <input
                    type="checkbox"
                    className="accent-[var(--color-accent)]"
                    checked={transparent}
                    onChange={(e) => setTransparent(e.target.checked)}
                  />
                </label>
              )}

              {modelSpec.mask && (
                <div>
                  <button
                    type="button"
                    className="text-[11.5px] text-ink-3 hover:text-accent"
                    onClick={() => setShowAdvanced((v) => !v)}
                  >
                    {showAdvanced ? '▾' : '▸'} 高级选项（mask）
                  </button>
                  {showAdvanced && (
                    <input
                      className="input mt-2 font-mono text-[11.5px]"
                      placeholder="mask 图片 URL（可选）"
                      value={maskUrl}
                      onChange={(e) => setMaskUrl(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* -------- 参考图（async 多图 / sync 多图 / edit 单图） -------- */}
          {genMode !== 'edit' && (
            <div className="mt-5">
              <span className="field-label">
                参考图（多图，{referenceImages.length}）
              </span>
              {referenceImages.length === 0 ? (
                <p className="rounded-md border border-dashed border-line-strong px-3 py-3 text-[11px] text-ink-3">
                  暂无参考图；将图库图片悬停后点「+」加入。
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {referenceImages.map((src) => (
                    <div key={src} className="group relative h-14 w-[52px] overflow-hidden rounded border border-line">
                      <SafeImage src={src} alt="ref" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        title="移除"
                        className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-accent text-white opacity-0 group-hover:opacity-100"
                        onClick={() => removeReference(src)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 提示词 */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-2">提示词</span>
              <button
                type="button"
                className="text-[11px] text-ink-3 hover:text-accent"
                onClick={() => {
                  setPromptEdited(false);
                  const strategyName = strategyMap.get(genStrategy)?.name ?? '';
                  setPrompt(buildPrompt(strategyName, getModelSpec(modelId).label, report));
                }}
              >
                重新拼装
              </button>
            </div>
            <textarea
              className="input min-h-[150px] resize-y text-[12.5px] leading-[1.7]"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setPromptEdited(true);
              }}
            />
          </div>

          {genError && (
            <div className="mt-4 rounded-md border border-accent/40 bg-accent-soft px-3 py-2.5 text-[11.5px] leading-relaxed text-accent-dark fade-in">
              {genError}
            </div>
          )}
          {!grsaiReady && (
            <p className="mt-4 text-[11.5px] text-ink-3">
              未配置 API Key，将使用程序化 SVG 演示生成；前往「设置」配置 Grsai 可启用真实生图。
            </p>
          )}
        </div>

        <div className="border-t border-line px-5 py-4">
          {genPhase === 'running' ? (
            <button type="button" className="btn btn-secondary w-full" onClick={handleCancel}>
              取消生成
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={!prompt.trim() || (genMode === 'edit' && !selectedItem)}
              onClick={handleGenerate}
            >
              {genMode === 'edit' ? '编辑图片' : '生成概念方案图'}
            </button>
          )}
          {/* 异步真实进度条 */}
          {genPhase === 'running' && genMode === 'async' && (
            <div className="mt-3">
              <div className="h-1 w-full overflow-hidden rounded bg-line">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 text-right font-mono text-[10.5px] text-ink-3">{progress}%</div>
            </div>
          )}
          {genPhase === 'running' && genMode === 'sync' && (
            <div className="mt-3 flex items-center justify-center gap-2 text-[11.5px] text-ink-3">
              <span className="spinner !h-3.5 !w-3.5 !border-ink-3/40 !border-t-accent" />
              同步生成中…
            </div>
          )}
        </div>
      </aside>

      {boardPicker}
    </div>
  );
}
