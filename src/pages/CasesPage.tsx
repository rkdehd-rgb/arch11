import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SafeImage from '../components/SafeImage';
import { getGroupName, getPooledStrategies, resolveCaseView } from '../services/strategyPool';
import { useCaseOverrideStore } from '../stores/caseOverride';
import { useSyncStore } from '../stores/sync';

interface StrategyCases {
  id: string;
  name: string;
  group: string;
  isUser: boolean;
  hasOverride: boolean;
  images: Array<{ image: string; fallback: string; name: string; custom: boolean }>;
}

const keyOf = (strategyId: string, index: number) => `${strategyId}#${index}`;

export default function CasesPage() {
  const navigate = useNavigate();
  const overrides = useCaseOverrideStore((s) => s.overrides);
  const setImages = useCaseOverrideStore((s) => s.setImages);
  const clearAllOverrides = useCaseOverrideStore((s) => s.clear);
  const syncStatus = useSyncStore((s) => s.status);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // overrides 作为依赖，保证覆盖层变化后视图与列表同步刷新
  const data = useMemo<StrategyCases[]>(() => {
    void overrides;
    return getPooledStrategies()
      .map((strategy) => ({
        id: strategy.id,
        name: strategy.name,
        group: getGroupName(strategy.group),
        isUser: strategy.source === 'user',
        hasOverride: Boolean(overrides[strategy.id]?.images?.length),
        images: resolveCaseView(strategy.id).map((view) => ({
          image: view.image,
          fallback: view.imageFallback,
          name: view.name,
          custom: view.custom,
        })),
      }))
      .filter((item) => item.images.length > 0);
  }, [overrides]);

  const overriddenCount = useMemo(
    () => Object.keys(overrides).filter((k) => (overrides[k]?.images?.length ?? 0) > 0).length,
    [overrides],
  );

  function toggleSelect(strategyId: string, index: number): void {
    const key = keyOf(strategyId, index);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** 把选中项按策略分组后一次性写回覆盖层 */
  function deleteSelected(): void {
    if (selected.size === 0) return;
    const byStrategy = new Map<string, Set<number>>();
    for (const key of selected) {
      const [strategyId, idx] = key.split('#');
      const index = Number(idx);
      if (!strategyId || Number.isNaN(index)) continue;
      const bucket = byStrategy.get(strategyId) ?? new Set<number>();
      bucket.add(index);
      byStrategy.set(strategyId, bucket);
    }
    let removed = 0;
    let fellBack = false;
    for (const [strategyId, indices] of byStrategy) {
      const current = resolveCaseView(strategyId).map((v) => v.image);
      const kept = current.filter((_, i) => !indices.has(i));
      if (kept.length === 0) fellBack = true; // 删空后覆盖层被移除，回退内置图
      removed += current.length - kept.length;
      setImages(strategyId, kept);
    }
    setSelected(new Set());
    setMessage(
      removed > 0
        ? `已删除 ${removed} 张案例图${fellBack ? '（某策略图片删空后已回退内置）' : ''}`
        : '没有可删除的图片',
    );
  }

  function moveImage(strategyId: string, index: number, delta: number): void {
    const current = resolveCaseView(strategyId).map((v) => v.image);
    const target = index + delta;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(strategyId, next);
    setMessage('已调整顺序');
  }

  function resetStrategy(strategyId: string, name: string): void {
    setImages(strategyId, []);
    setSelected(new Set());
    setMessage(`「${name}」已恢复内置案例图`);
  }

  function handleClearAll(): void {
    clearAllOverrides();
    setSelected(new Set());
    setConfirmClearAll(false);
    setMessage('已清空全部自定义案例图，所有策略恢复内置');
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1080px] px-8 py-10">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Case Library
        </div>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold text-ink">案例图库管理</h1>
            <p className="mt-1.5 text-[12.5px] text-ink-2">
              共 {data.length} 个策略含案例图，其中 {overriddenCount} 个已被自定义修改。
              {syncStatus === 'synced'
                ? '修改会自动同步到云端。'
                : syncStatus === 'disabled'
                  ? '未登录：修改仅保存在本机。'
                  : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
                setMessage(null);
              }}
            >
              {selectMode ? '退出多选' : '多选'}
            </button>
            {selectMode && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={deleteSelected}
                disabled={selected.size === 0}
              >
                删除选中（{selected.size}）
              </button>
            )}
            {overriddenCount > 0 &&
              (confirmClearAll ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={handleClearAll}>
                    确认清空全部
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmClearAll(false)}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmClearAll(true)}
                >
                  清空全部自定义图
                </button>
              ))}
          </div>
        </div>

        {confirmClearAll && (
          <div className="mb-5 rounded-md border border-accent/40 bg-accent-soft px-4 py-3 text-[12.5px] text-accent">
            将移除全部 {overriddenCount} 个策略的自定义案例图，并恢复为内置图库。此操作不可撤销。
          </div>
        )}
        {message && (
          <div className="mb-5 rounded-md border border-line bg-surface-raised px-4 py-2.5 text-[12.5px] text-ink-2 fade-in">
            {message}
          </div>
        )}

        {data.length === 0 ? (
          <div className="card flex flex-col items-center px-6 py-16 text-center">
            <p className="text-[14px] text-ink-2">还没有案例图</p>
            <p className="mt-1 text-[12.5px] text-ink-3">
              完成一次推理后，报告的参考案例会出现在这里。
            </p>
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => navigate('/')}
            >
              去输入任务书
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {data.map((item) => (
              <section key={item.id} className="card p-5">
                <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="truncate text-[14.5px] font-semibold text-ink">
                      {item.name}
                    </span>
                    <span className="chip shrink-0">{item.group}</span>
                    {item.isUser && <span className="chip shrink-0">自定义策略</span>}
                    {item.hasOverride && (
                      <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                        已自定义
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {item.images.length} 张
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.hasOverride && (
                      <button
                        type="button"
                        className="btn btn-ghost text-[12px]"
                        onClick={() => resetStrategy(item.id, item.name)}
                      >
                        恢复内置
                      </button>
                    )}
                    <span className="font-mono text-[11px] text-ink-3">{item.id}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {item.images.map((img, index) => {
                    const key = keyOf(item.id, index);
                    const isSelected = selected.has(key);
                    return (
                      <div
                        key={key}
                        className={`group relative overflow-hidden rounded-md border ${
                          isSelected ? 'border-accent ring-2 ring-accent/40' : 'border-line'
                        }`}
                      >
                        <div className="aspect-[4/3] w-full bg-surface-raised">
                          <SafeImage
                            src={img.image}
                            alt={`${img.name} 案例图 ${index + 1}`}
                            className="h-full w-full object-cover"
                            fallbackSrc={img.fallback}
                          />
                        </div>

                        {selectMode ? (
                          <button
                            type="button"
                            aria-label={isSelected ? '取消选择' : '选择'}
                            className={`absolute inset-0 flex items-start justify-end p-2 ${
                              isSelected ? 'bg-accent/15' : 'hover:bg-ink/5'
                            }`}
                            onClick={() => toggleSelect(item.id, index)}
                          >
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] font-semibold ${
                                isSelected
                                  ? 'border-accent bg-accent text-white'
                                  : 'border-white bg-black/25 text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </button>
                        ) : (
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/45 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="truncate text-[10.5px] text-white">
                              {img.custom ? '自定义图' : '内置图'}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                aria-label="左移"
                                className="rounded px-1.5 text-[11px] text-white hover:bg-white/20 disabled:opacity-30"
                                disabled={index === 0}
                                onClick={() => moveImage(item.id, index, -1)}
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                aria-label="右移"
                                className="rounded px-1.5 text-[11px] text-white hover:bg-white/20 disabled:opacity-30"
                                disabled={index === item.images.length - 1}
                                onClick={() => moveImage(item.id, index, 1)}
                              >
                                →
                              </button>
                              <button
                                type="button"
                                aria-label="删除此图"
                                className="rounded px-1.5 text-[11px] text-white hover:bg-white/20"
                                onClick={() => {
                                  setImages(item.id, resolveCaseView(item.id).map((v) => v.image).filter((_, i) => i !== index));
                                  setMessage('已删除 1 张案例图');
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
