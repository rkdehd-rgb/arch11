import { useRef, useState } from 'react';
import type { CaseMeta } from '../services/strategyPool';
import { resolveCaseView } from '../services/strategyPool';
import { useCaseOverrideStore, MAX_CASE_IMAGES } from '../stores/caseOverride';
import { compressImage, StorageQuotaError } from '../services/imageCompress';
import SafeImage from './SafeImage';

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
  const replaceImage = useCaseOverrideStore((s) => s.replaceImage);
  const removeImage = useCaseOverrideStore((s) => s.removeImage);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<{ action: 'add' | 'replace'; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  function doDelete(index: number): void {
    removeImage(strategyId, index);
  }

  return (
    <div>
      <input ref={hiddenInputRef} type="file" accept="image/*" className="hidden" onChange={pick} />

      {views.length === 0 ? (
        <button
          type="button"
          onClick={openAdd}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-[12px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          暂无案例图，点击添加
        </button>
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
                />
                {/* hover 工具条 */}
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <button
                    type="button"
                    title="替换此图"
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
            <button
              type="button"
              onClick={openAdd}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 self-start rounded-md border border-dashed border-line-strong text-[12px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              添加案例图
              <span className="text-[10.5px] text-ink-3">{count}/{MAX_CASE_IMAGES}</span>
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11.5px] text-[#8a2f2f]">{error}</p>
      )}
    </div>
  );
}
