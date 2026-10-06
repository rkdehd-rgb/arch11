import { useEffect, useRef, useState } from 'react';
import {
  searchWikiImages,
  type WikiImage,
} from '../services/wikiImageSearch';
import {
  searchGooood,
  fetchGoooodImageBlob,
  type GoooodImage,
} from '../services/goooodSearch';
import { compressImage, StorageQuotaError } from '../services/imageCompress';
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

type SourceKind = 'gooood' | 'wiki';
type SearchStatus = 'idle' | 'loading' | 'succeeded' | 'empty' | 'error';

interface Candidate {
  id: string;
  source: SourceKind;
  thumb: string;
  /** gooood 原图地址（经 /api/case-image 代理获取） */
  fullUrl: string;
  title: string;
  subtitle: string;
  meta: string;
  pageUrl?: string;
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取为 base64 失败'));
    reader.readAsDataURL(blob);
  });
}

/** gooood 候选：同源代理取 blob → 压缩 data URI */
async function downloadGooood(item: GoooodImage): Promise<string> {
  const blob = await fetchGoooodImageBlob(item.image);
  try {
    const { dataUrl } = await compressImage(blob);
    return dataUrl;
  } catch {
    return await blobToDataUri(blob);
  }
}

/** wiki 候选：直连下载 → 压缩 data URI */
async function downloadWiki(img: WikiImage): Promise<string> {
  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  try {
    const { dataUrl } = await compressImage(blob);
    return dataUrl;
  } catch {
    return await blobToDataUri(blob);
  }
}

/**
 * 自动找图候选弹层：
 * 默认源 gooood（谷德设计网，经后端代理）；失败或无结果自动回退 Wikimedia；
 * 网格多选（受剩余余量约束）；gooood 支持分页加载更多；
 * 确认时下载 → base64 后回调，绝不以 URL 提交参考图。
 */
export default function ImageSearchPicker({
  initialKeyword,
  remaining,
  onConfirm,
  onClose,
}: ImageSearchPickerProps) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [source, setSource] = useState<SourceKind>('gooood');
  const [results, setResults] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const searchSeqRef = useRef(0);

  function mapGooood(items: GoooodImage[]): Candidate[] {
    return items.map((it) => ({
      id: `gooood::${it.image}`,
      source: 'gooood',
      thumb: it.thumb,
      fullUrl: it.image,
      title: it.title,
      subtitle: it.subtitle,
      meta: [it.year, it.category].filter(Boolean).join(' · '),
      pageUrl: it.pageUrl,
    }));
  }

  function mapWiki(images: WikiImage[]): Candidate[] {
    return images.map((img) => ({
      id: `wiki::${img.id}`,
      source: 'wiki',
      thumb: img.thumbUrl,
      fullUrl: img.url,
      title: img.title.replace(/^File:/, ''),
      subtitle: '',
      meta: `${img.width}×${img.height}`,
    }));
  }

  async function loadWiki(term: string, seq: number): Promise<void> {
    const images = await searchWikiImages(term);
    if (seq !== searchSeqRef.current) return;
    setSource('wiki');
    setHasMore(false);
    setResults(mapWiki(images));
    setSelected([]);
    setStatus(images.length === 0 ? 'empty' : 'succeeded');
  }

  /** 搜索：默认 gooood；其失败或 0 结果时回退 Wikimedia。 */
  async function runSearch(term: string): Promise<void> {
    const seq = ++searchSeqRef.current;
    setStatus('loading');
    setErrorMsg('');
    setNotice('');
    setResults([]);
    setHasMore(false);
    setPage(1);
    try {
      const pageData = await searchGooood(term, 1);
      if (seq !== searchSeqRef.current) return;
      if (pageData.results.length === 0) {
        setNotice('谷德无结果，已切换 Wikimedia');
        await loadWiki(term, seq);
        return;
      }
      setSource('gooood');
      setResults(mapGooood(pageData.results));
      setHasMore(pageData.hasMore);
      setSelected([]);
      setStatus('succeeded');
    } catch {
      if (seq !== searchSeqRef.current) return;
      setNotice('谷德暂不可用，已切换 Wikimedia');
      try {
        await loadWiki(term, seq);
      } catch (err) {
        if (seq !== searchSeqRef.current) return;
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : '搜索失败');
      }
    }
  }

  async function handleLoadMore(): Promise<void> {
    if (source !== 'gooood' || !hasMore || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const pageData = await searchGooood(keyword, nextPage);
      setPage(nextPage);
      setHasMore(pageData.hasMore);
      setResults((prev) => [...prev, ...mapGooood(pageData.results)]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '加载更多失败');
    } finally {
      setLoadingMore(false);
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

  function toggleSelect(cand: Candidate): void {
    setSelected((prev) => {
      if (prev.includes(cand.id)) return prev.filter((id) => id !== cand.id);
      if (prev.length >= remaining) return prev;
      return [...prev, cand.id];
    });
  }

  async function handleConfirm(): Promise<void> {
    const chosen = selected
      .map((id) => results.find((r) => r.id === id))
      .filter((x): x is Candidate => Boolean(x));
    if (chosen.length === 0) return;

    setConfirming(true);
    setDownloadProgress({ done: 0, total: chosen.length });
    const dataUris: string[] = [];
    const failedTitles: string[] = [];
    try {
      for (const cand of chosen) {
        try {
          let dataUri: string;
          if (cand.source === 'gooood') {
            const goooodItem: GoooodImage = {
              title: cand.title,
              subtitle: cand.subtitle,
              thumb: cand.thumb,
              image: cand.fullUrl,
              pageUrl: cand.pageUrl ?? '',
              year: cand.meta,
              category: '',
            };
            dataUri = await downloadGooood(goooodItem);
          } else {
            const wikiItem: WikiImage = {
              id: cand.id.replace(/^wiki::/, ''),
              thumbUrl: cand.thumb,
              url: cand.fullUrl,
              title: cand.title,
              width: 0,
              height: 0,
              mime: 'image/jpeg',
            };
            dataUri = await downloadWiki(wikiItem);
          }
          dataUris.push(dataUri);
        } catch {
          failedTitles.push(cand.title || '未命名图片');
        }
        setDownloadProgress({ done: dataUris.length + failedTitles.length, total: chosen.length });
      }

      if (failedTitles.length > 0) {
        setErrorMsg(`${failedTitles.length} 张图片无法下载，已导入其余 ${dataUris.length} 张。`);
      }
      if (dataUris.length > 0) {
        await onConfirm(dataUris);
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
              placeholder="输入项目名或关键词，如 博物馆、Tate Modern"
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary shrink-0">
              搜索
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-3">
            <span>
              来源：
              {source === 'gooood' ? 'gooood.cn（谷德设计网）' : 'Wikimedia Commons'}
            </span>
            <span>
              已选 <span className="font-mono text-accent">{selected.length}</span> / 可添加 {remaining}
            </span>
          </div>
          {notice && <p className="mt-1 text-[11.5px] text-accent">{notice}</p>}
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
            <div className="grid grid-cols-3 gap-3">
              {results.map((cand) => {
                const isSelected = selected.includes(cand.id);
                const disabled = !isSelected && selected.length >= remaining;
                return (
                  <div
                    key={cand.id}
                    className={`group relative overflow-hidden rounded-md border text-left transition-all ${
                      isSelected
                        ? 'border-accent ring-1 ring-accent'
                        : 'border-line hover:border-line-strong'
                    } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleSelect(cand)}
                      title={cand.title}
                      className="block w-full"
                    >
                      <div className="relative aspect-[4/3] w-full bg-line">
                        <SafeImage
                          src={cand.thumb}
                          alt={cand.title}
                          className="h-full w-full object-cover"
                        />
                        {cand.source === 'gooood' && (
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-px text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                            来源：gooood.cn
                          </span>
                        )}
                        {isSelected && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="px-2 py-1.5">
                      <div className="truncate text-[11px] text-ink">{cand.title}</div>
                      {cand.subtitle && (
                        <div className="truncate text-[10px] text-ink-3">{cand.subtitle}</div>
                      )}
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="font-mono text-[9px] text-ink-3">{cand.meta}</span>
                        {cand.pageUrl && (
                          <a
                            href={cand.pageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9.5px] text-accent hover:underline"
                          >
                            查看来源
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {status === 'succeeded' && hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
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
