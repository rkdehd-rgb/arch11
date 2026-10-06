/**
 * Wikimedia Commons 搜图服务：
 * 案例无图时联网搜索候选图，供用户挑选。
 * API 免费、浏览器直连（origin=* 走 CORS），与内置案例图源一致。
 */

import { prepareReferenceImages } from './referenceImage';

const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
export const WIKI_SEARCH_LIMIT = 12;
export const WIKI_FETCH_TIMEOUT_MS = 15_000;

/** 搜索到的候选图 */
export interface WikiImage {
  /** 页面唯一 id（去重 key） */
  id: string;
  /** 缩略图地址（网格展示） */
  thumbUrl: string;
  /** 原图地址（下载转 base64 用） */
  url: string;
  /** 标题（文件名） */
  title: string;
  width: number;
  height: number;
  mime: string;
}

interface RawPage {
  pageid?: number;
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    thumbwidth?: number;
    thumbheight?: number;
    width?: number;
    height?: number;
    mime?: string;
  }>;
}

interface RawResponse {
  query?: {
    pages?: Record<string, RawPage> | RawPage[];
  };
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 带超时的请求 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 搜索 Wikimedia Commons 图片。
 * @param keyword 搜索词（案例项目名 / 策略名等）
 */
export async function searchWikiImages(keyword: string): Promise<WikiImage[]> {
  const term = keyword.trim();
  if (!term) throw new Error('请输入搜索关键词');

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${term} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(WIKI_SEARCH_LIMIT),
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    iiurlwidth: '400',
  });

  let res: Response;
  try {
    res = await fetchWithTimeout(`${COMMONS_ENDPOINT}?${params.toString()}`, WIKI_FETCH_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('搜索超时，请稍后重试');
    }
    throw new Error(err instanceof Error ? err.message : '搜索请求失败（疑似网络问题）');
  }

  if (!res.ok) throw new Error(`搜索失败（HTTP ${res.status}）`);
  const json = (await res.json()) as RawResponse;

  const rawPages = json.query?.pages;
  const pages: RawPage[] = rawPages
    ? Array.isArray(rawPages)
      ? rawPages
      : Object.values(rawPages)
    : [];

  const results: WikiImage[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const mime = info.mime ?? '';
    if (!ALLOWED_MIME.has(mime)) continue;
    results.push({
      id: page.pageid != null ? String(page.pageid) : page.title ?? info.url,
      thumbUrl: info.thumburl ?? info.url,
      url: info.url,
      title: page.title ?? '',
      width: info.thumbwidth ?? info.width ?? 0,
      height: info.thumbheight ?? info.height ?? 0,
      mime,
    });
  }
  return results;
}

/**
 * 下载选中的候选原图并转为 base64 data URI（复用 referenceImage 管线：
 * 浏览器端下载 + 压缩最长边 1280 / jpeg 0.85）。
 * 返回与输入同序结果，失败项在 failed 中。
 */
export async function downloadWikiSelection(
  images: WikiImage[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ images: string[]; failed: number[] }> {
  const prepared = await prepareReferenceImages(
    images.map((img) => img.url),
    { onProgress },
  );
  // prepareReferenceImages 会剔除失败项；这里按原序对齐，标记失败的原始下标
  const failed: number[] = [];
  prepared.failed.forEach((f) => {
    failed.push(f.index - 1);
  });
  return { images: prepared.images, failed };
}
