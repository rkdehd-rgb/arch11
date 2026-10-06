import { useEffect, useRef, useState } from 'react';
import {
  searchWikiImages,
  downloadWikiSelection,
  type WikiImage,
} from '../services/wikiImageSearch';
import { StorageQuotaError } from '../services/imageCompress';
import SafeImage from './SafeImage';

interface ImageSearchPickerProps {
  /** 初始搜索词（案例项目名 / 策略名） */
  initialKeyword: string;
  /** 还可选择的数量（上限约束） */
  remaining: number;
  /** 确认挑选：传入已转 base64 的图片（同选择顺序） */
  onConfirm: (dataUris: string[]) => void | Promise<void>;
  /** 关闭弹层 */
  onClose: () => void;
}

type SearchStatus = 'idle' | 'loading' | 'succeeded' | 'empty' | 'error';

/**
 * 自动找图候选弹层：
 * 顶部搜索框可改词重搜；网格多选（受剩余余量约束）；
 * 确认时客户端下载原图 → base64 后回调，绝不以 URL 提交。
 */
export default function ImageSearchPicker({
  initialKeyword,
  remaining,
  onConfirm,
  onClose,
}: ImageSearchPickerProps) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [results, setResults] = useState<WikiImage[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const searchSeqRef = useRef(0);

  async function runSearch(term: string): Promise<void> {
    const seq = ++searchSeqRef.current;
    setStatus('loading');
    setErrorMsg('');
    try {
      const images = await searchWikiImages(term);
      if (seq !== searchSeqRef.current) return; // 已有更新的搜索
      setResults(images);
      setSelected([]);
      setStatus(images.length === 0 ? 'empty' : 'succeeded');
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      setResults([]);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : '搜索失败');
    }
  }

  // 首次打开自动搜索
  useEffect(() => {
    if (initialKeyword.trim()) void runSearch(initialKeyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc 关闭
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleSelect(img: WikiImage): void {
    setSelected((prev) => {
      if (prev.includes(img.id)) return prev.filter((id) => id !== img.id);
      if (prev.length >= remaining) return prev; // 达到上限
      return [...prev, img.id];
    });
  }

  async function handleConfirm(): Promise<void> {
    const chosen = selected
      .map((id) => results.find((r) => r.id === id))
      .filter((x): x is WikiImage => Boolean(x));
    if (chosen.length === 0) return;

    setConfirming(true);
    setDownloadProgress({ done: 0, total: chosen.length });
    try {
      const { images, failed } = await downloadWikiSelection(chosen, (done, total) =>
        setDownloadProgress({ done, total }),
      );
      if (failed.length > 0) {
        setErrorMsg(`${failed.length} 张图片无法下载，已导入其余 ${images.length} 张。`);
      }
      if (images.length > 0) {
        await onConfirm(images);
        onClose();
      }
    } catch (err) {
      if (err instanceof StorageQuotaError) setErrorMsg(err.message);
      else if (err instanceof Error) setErrorMsg(err.message);
      else setErrorMsg('图片处理失败');
    } finally {
      setConfirming(false);
      setDownloadProgress(null);
    }
  }

  function handleSearchSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!keyword.trim()) return;
    void runSearch(keyword);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[84vh] w-[760px] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl fade-in">
        {/* 头部：搜索框 */}
        <div className="border-b border-line px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-ink">自动找图</h3>
            <button
              type="button"
              title="关闭"
              className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-line hover:text-ink"
              onClick={onClose}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              className="input flex-1"
              value={keyword}
              placeholder="输入关键词，如 Tate Modern"
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary shrink-0">
              搜索
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-3">
            <span>来源：Wikimedia Commons</span>
            <span>
              已选 <span className="font-mono text-accent">{selected.length}</span> / 可添加 {remaining}
            </span>
          </div>
        </div>

        {/* 候选网格 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {status === 'loading' && (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-ink-3">
              <span className="spinner !h-6 !w-6 !border-ink-3/40 !border-t-accent" />
              <span className="text-[12.5px]">正在搜索候选图片…</span>
            </div>
          )}

          {status === 'empty' && (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
              <span className="text-[13px] text-ink-2">未找到相关图片，换个关键词试试</span>
              <span className="text-[11.5px] text-ink-3">也可以使用「上传」添加本地图片。</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
              <span className="text-[13px] text-[#8a2f2f]">搜索失败：{errorMsg}</span>
              <button
                type="button"
                className="mt-1 text-[11.5px] text-accent hover:underline"
                onClick={() => void runSearch(keyword)}
              >
                重新尝试
              </button>
            </div>
          )}

          {status === 'succeeded' && (
            <div className="grid grid-cols-4 gap-3">
              {results.map((img) => {
                const isSelected = selected.includes(img.id);
                const disabled = !isSelected && selected.length >= remaining;
                return (
                  <button
                    key={img.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleSelect(img)}
                    title={img.title}
                    className={`group relative overflow-hidden rounded-md border text-left transition-all ${
                      isSelected
                        ? 'border-accent ring-1 ring-accent'
                        : 'border-line hover:border-line-strong'
                    } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <div className="relative aspect-[4/3] w-full bg-line">
                      <SafeImage
                        src={img.thumbUrl}
                        alt={img.title}
                        className="h-full w-full object-cover"
                      />
                      {isSelected && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="px-1.5 py-1">
                      <div className="truncate text-[10px] text-ink-2">{img.title.replace(/^File:/, '')}</div>
                      <div className="font-mono text-[9px] text-ink-3">
                        {img.width}×{img.height}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {errorMsg && status !== 'error' && (
            <p className="mt-3 text-[11.5px] text-[#8a2f2f]">{errorMsg}</p>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          {confirming && downloadProgress && (
            <span className="mr-auto flex items-center gap-2 text-[11.5px] text-ink-3">
              <span className="spinner !h-4 !w-4 !border-ink-3/40 !border-t-accent" />
              下载并转码 {downloadProgress.done}/{downloadProgress.total}
            </span>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={confirming}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={selected.length === 0 || confirming}
          >
            添加所选（{selected.length}）
          </button>
        </div>
      </div>
    </div>
  );
}
