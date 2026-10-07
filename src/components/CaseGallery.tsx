import { useRef, useState } from 'react';
import type { CaseMeta } from '../services/strategyPool';
import { resolveCaseView, getStrategyById, resolveCases } from '../services/strategyPool';
import { useCaseOverrideStore, MAX_CASE_IMAGES } from '../stores/caseOverride';
import { compressImage, StorageQuotaError } from '../services/imageCompress';
import SafeImage from './SafeImage';
import ImageSearchPicker from './ImageSearchPicker';

interface CaseGalleryProps {
  strategyId: string;
  /** 基础案例（内置 / 用户策略 / 库外建议）；不传则按 strategyId 解析 */
  baseCases?: CaseMeta[];
}

/**
 * 可编辑案例图库：替换 / 删除 / 添加（上限 8），空态可加。
 * 所有改动写入 localStorage 覆盖层，不修改内置库。
 */
export default function CaseGallery({ strategyId, baseCases }: CaseGalleryProps) {
  const overrides = useCaseOverrideStore((s) => s.overrides);
  const addImage = useCaseOverrideStore((s) => s.addImage);
  const addImages = useCaseOverrideStore((s) => s.addImages);
  const replaceImage = useCaseOverrideStore((s) => s.replaceImage);
  const removeImage = useCaseOverrideStore((s) => s.removeImage);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<{ action: 'add' | 'replace'; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 自动找图弹层
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 找图模式：add=追加，replace=替换某位置（仅取首张） */
  const [pickerMode, setPickerMode] = useState<{ action: 'add' | 'replace'; index: number }>({
    action: 'add',
    index: -1,
  });

  // 使用覆盖层数据渲染（订阅 overrides 触发更新）
  const views = resolveCaseView(strategyId, baseCases);
  const overrideImages = overrides[strategyId]?.images;
  const count = overrideImages ? overrideImages.length : views.length;
  const canAdd = count < MAX_CASE_IMAGES;

  async function pick(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    const ctx = mode;
    setMode(null);
    if (!file || !ctx) return;
    setError(null);
    ensureSeeded();
    try {
      const { dataUrl } = await compressImage(file);
      if (ctx.action === 'add') addImage(strategyId, dataUrl);
      else replaceImage(strategyId, ctx.index, dataUrl);
    } catch (err) {
      if (err instanceof StorageQuotaError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError('图片处理失败');
    }
  }

  function openAdd(): void {
    if (!canAdd) return;
    setMode({ action: 'add', index: -1 });
    hiddenInputRef.current?.click();
  }
  function openReplace(index: number): void {
    setMode({ action: 'replace', index });
    hiddenInputRef.current?.click();
  }
  /**
   * 首次编辑内置案例前，先把内置图列表灌入覆盖层，使「删除/替换/追加」能逐张生效。
   * 否则覆盖层为空时 removeImage/replaceImage 是 no-op，内置图看似「删不掉」。
   */
  function ensureSeeded(): void {
    const store = useCaseOverrideStore.getState();
    if (store.overrides[strategyId]) return;
    const base = baseCases ?? resolveCases(strategyId);
    store.setImages(strategyId, base.map((b) => b.image).filter(Boolean));
  }

  function doDelete(index: number): void {
    ensureSeeded();
    removeImage(strategyId, index);
  }

  /** 找图默认搜索词：首个案例项目名 → 策略名 + 建筑案例 */
  function defaultKeyword(): string {
    const firstName = baseCases?.[0]?.name || views[0]?.name;
    if (firstName && firstName !== '自定义参考案例') return firstName;
    const strategyName = getStrategyById(strategyId)?.name ?? '';
    return strategyName ? `${strategyName} 建筑案例` : 'architecture building';
  }

  function openSearchAdd(): void {
    if (!canAdd) return;
    setPickerMode({ action: 'add', index: -1 });
    setError(null);
    setPickerOpen(true);
  }
  function openSearchReplace(index: number): void {
    setPickerMode({ action: 'replace', index });
    setError(null);
    setPickerOpen(true);
  }

  /** 挑选确认：已转 base64；add 批量追加，replace 替换该位置（取首张） */
  function handlePickerConfirm(dataUris: string[]): void {
    ensureSeeded();
    if (pickerMode.action === 'replace') {
      if (dataUris[0]) replaceImage(strategyId, pickerMode.index, dataUris[0]);
    } else {
      addImages(strategyId, dataUris);
    }
  }

  return (
    <div>
      <input ref={hiddenInputRef} type="file" accept="image/*" className="hidden" onChange={pick} />

      {views.length === 0 ? (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-line-strong">
          <span className="text-[12px] text-ink-3">暂无案例图</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openSearchAdd}
              className="flex items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-[11.5px] text-accent transition-colors hover:bg-accent-soft"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              自动找图
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-[11.5px] text-ink-2 transition-colors hover:bg-line"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              本地上传
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {views.map((view, i) => (
            <div
              key={`${strategyId}-case-${i}`}
              className="group relative overflow-hidden rounded-md border border-line bg-surface"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-line">
                <SafeImage
                  src={view.image}
                  alt={`${view.name}，${view.location}`}
                  className="h-full w-full object-cover"
                  fallbackSrc={view.imageFallback}
                  fallbackSrc2={view.imageFallback2}
                />
                {/* hover 工具条 */}
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <button
                    type="button"
                    title="自动找图替换"
                    onClick={() => openSearchReplace(i)}
                    className="flex h-6 w-6 items-center justify-center rounded bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-accent"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="上传图片替换"
                    onClick={() => openReplace(i)}
                    className="flex h-6 w-6 items-center justify-center rounded bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-accent"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 2v6h-6" />
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                      <path d="M3 22v-6h6" />
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="删除此图"
                    onClick={() => doDelete(i)}
                    className="flex h-6 w-6 items-center justify-center rounded bg-black/65 text-white backdrop-blur-sm transition-colors hover:bg-[#8a2f2f]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
                {view.custom && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[9.5px] font-medium text-white">
                    新增
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{view.name}</span>
                  {view.year && (
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{view.year}</span>
                  )}
                </div>
                {(view.location || view.architect) && (
                  <div className="mt-0.5 text-[11.5px] text-ink-3">
                    {[view.location, view.architect].filter(Boolean).join(' · ')}
                  </div>
                )}
                {view.highlight && (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{view.highlight}</p>
                )}
              </div>
            </div>
          ))}

          {/* 添加占位卡片 */}
          {canAdd && (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 self-start rounded-md border border-dashed border-line-strong">
              <button
                type="button"
                onClick={openSearchAdd}
                title="自动找图"
                className="flex items-center gap-1.5 text-[11.5px] text-accent transition-colors hover:text-accent-dark"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                自动找图
              </button>
              <button
                type="button"
                onClick={openAdd}
                title="本地上传"
                className="flex items-center gap-1.5 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                本地上传
              </button>
              <span className="font-mono text-[10px] text-ink-3">{count}/{MAX_CASE_IMAGES}</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11.5px] text-[#8a2f2f]">{error}</p>
      )}

      {pickerOpen && (
        <ImageSearchPicker
          initialKeyword={defaultKeyword()}
          remaining={pickerMode.action === 'replace'
            ? MAX_CASE_IMAGES
            : MAX_CASE_IMAGES - count}
          onConfirm={handlePickerConfirm}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
