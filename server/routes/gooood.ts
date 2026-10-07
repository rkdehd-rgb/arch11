import { Router, type Request, type Response } from 'express';

export const goooodRouter = Router();

const GOOOOD_ORIGIN = 'https://www.gooood.cn';
const IMAGE_HOST = 'oss.gooood.cn';
const FETCH_TIMEOUT_MS = 15_000;
const SEARCH_CACHE_TTL_MS = 60_000;
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface GoooodCaseItem {
  title: string;
  subtitle: string;
  thumb: string;
  image: string;
  pageUrl: string;
  year: string;
  category: string;
}

interface CaseSearchPayload {
  results: GoooodCaseItem[];
  hasMore: boolean;
}

interface CacheEntry {
  expiresAt: number;
  payload: CaseSearchPayload;
}

const searchCache = new Map<string, CacheEntry>();

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ''));
}

/** 去掉 oss.gooood.cn 缩略图末尾的尺寸后缀，如 -472x303 / -700x449 */
function toOriginalImage(src: string): string {
  return src.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))$/i, '$1');
}

function parseSearchHtml(html: string): CaseSearchPayload {
  const cards = html.match(/<article class="result-card"[\s\S]*?<\/article>/g) ?? [];
  const results: GoooodCaseItem[] = [];

  for (const card of cards) {
    const imageLinkMatch = card.match(/<a\b(?=[^>]*class="result-image")[^>]*>/);
    const hrefMatch = imageLinkMatch?.[0].match(/href="([^"]+)"/);
    const href = hrefMatch?.[1] ?? '';
    const imgMatch = card.match(/<img[^>]*src="([^"]+)"/);
    const thumb = imgMatch?.[1] ?? '';
    const titleMatch = card.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    const subtitleMatch = card.match(/<p class="result-subtitle"[^>]*>([\s\S]*?)<\/p>/);
    const metaMatch = card.match(
      /<p class="card-meta"[^>]*>([\s\S]*?)<\/p>/,
    );
    const meta = metaMatch?.[1] ?? '';
    const spanMatch = meta.match(/<span[^>]*>([\s\S]*?)<\/span>/);
    const timeMatch = meta.match(/<time[^>]*>([\s\S]*?)<\/time>/);

    if (!thumb && !href) continue;
    const pageUrl = href.startsWith('http') ? href : `${GOOOOD_ORIGIN}${href}`;
    results.push({
      title: stripTags(titleMatch?.[1] ?? ''),
      subtitle: stripTags(subtitleMatch?.[1] ?? ''),
      thumb,
      image: toOriginalImage(thumb),
      pageUrl,
      year: stripTags(timeMatch?.[1] ?? ''),
      category: stripTags(spanMatch?.[1] ?? ''),
    });
  }

  const hasMore = /aria-label="下一页"/.test(html);
  return { results, hasMore };
}

async function fetchGoooodSearch(keyword: string, page: number): Promise<CaseSearchPayload> {
  const query = encodeURIComponent(keyword);
  const target = `${GOOOOD_ORIGIN}/search?q=${query}&page=${page}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`gooood 搜索响应异常: HTTP ${res.status}`);
    }
    const html = await res.text();
    return parseSearchHtml(html);
  } finally {
    clearTimeout(timer);
  }
}

goooodRouter.get('/case-search', async (req: Request, res: Response) => {
  const rawQ = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rawPage = Number.parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  if (!rawQ) {
    res.status(400).json({ error: '缺少搜索关键词 q' });
    return;
  }

  const cacheKey = `${rawQ}::${page}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.payload);
    return;
  }

  try {
    const payload = await fetchGoooodSearch(rawQ, page);
    searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, payload });
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    res.status(502).json({ error: `谷德搜索失败：${message}` });
  }
});

goooodRouter.get('/case-image', async (req: Request, res: Response) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: '非法图片地址' });
    return;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== IMAGE_HOST) {
    res.status(403).json({ error: '仅允许代理 oss.gooood.cn 的图片' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { 'User-Agent': DESKTOP_UA, Accept: 'image/*' },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `图片获取失败：HTTP ${upstream.status}` });
      return;
    }
    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', `public, max-age=${SEARCH_CACHE_TTL_MS / 1000}`);
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    res.status(502).json({ error: `图片代理失败：${message}` });
  } finally {
    clearTimeout(timer);
  }
});

interface ArticleImagePayload {
  images: { url: string; thumb: string }[];
}
const articleImageCache = new Map<string, { expiresAt: number; payload: ArticleImagePayload }>();

/** 从文章页 HTML 提取 oss.gooood.cn/uploads 下的图片（正文图），去重并还原原图地址 */
function parseArticleImages(html: string): { url: string; thumb: string }[] {
  const found = html.match(/oss\.gooood\.cn\/uploads\/[^\s"'`<>)]+/g) ?? [];
  const seen = new Set<string>();
  const out: { url: string; thumb: string }[] = [];
  for (const raw of found) {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    const original = toOriginalImage(url);
    if (seen.has(original)) continue;
    seen.add(original);
    out.push({ url: original, thumb: url });
    if (out.length >= 40) break;
  }
  return out;
}

/** 抓取单篇文章页，返回其正文图片列表（用于「文章内图」而非封面） */
goooodRouter.get('/case-images', async (req: Request, res: Response) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: '非法文章地址' });
    return;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  if (parsed.protocol !== 'https:' || host !== 'gooood.cn') {
    res.status(403).json({ error: '仅允许抓取 gooood.cn 的文章页' });
    return;
  }

  const cacheKey = `${parsed.pathname}${parsed.search}`;
  const cached = articleImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.payload);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(parsed.toString(), {
      headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `文章页获取失败：HTTP ${upstream.status}` });
      return;
    }
    const html = await upstream.text();
    const payload: ArticleImagePayload = { images: parseArticleImages(html) };
    articleImageCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      payload,
    });
    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    res.status(502).json({ error: `文章图抓取失败：${message}` });
  } finally {
    clearTimeout(timer);
  }
});
