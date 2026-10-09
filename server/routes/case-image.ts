// ABOUTME: 案例参考图多源代理
// ABOUTME: 按域名白名单转发，并对有防盗链的源站注入 Referer；拒绝非图片响应

import { Router, type Request, type Response } from 'express';

export const caseImageRouter = Router();

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000;
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 允许代理的图源白名单。
 * 有方等站点对图片做了防盗链（无 Referer 返回 403），因此按源站注入 Referer。
 */
const IMAGE_SOURCES: Record<string, { referer?: string; label: string }> = {
  'oss.gooood.cn': { label: 'gooood' },
  'image.archiposition.com': { referer: 'https://www.archiposition.com/', label: '有方' },
  'www.archcollege.com': { referer: 'https://www.archcollege.com/', label: '建筑学院' },
  'images.divisare.com': { referer: 'https://divisare.com/', label: 'divisare' },
  'images.adsttc.com': { referer: 'https://www.archdaily.cn/', label: 'ArchDaily' },
  'static.dezeen.com': { referer: 'https://www.dezeen.com/', label: 'dezeen' },
};

const MAGIC: number[][] = [
  [0xff, 0xd8, 0xff],
  [0x89, 0x50, 0x4e, 0x47],
  [0x47, 0x49, 0x46, 0x38],
];

function isImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  for (const sig of MAGIC) if (sig.every((b, i) => buf[i] === b)) return true;
  return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
}

interface CachedImage {
  expiresAt: number;
  body: Buffer;
  contentType: string;
}

const imageCache = new Map<string, CachedImage>();

async function fetchUpstream(
  target: string,
  referer: string | undefined,
  signal: AbortSignal,
): Promise<{ body: Buffer; contentType: string } | null> {
  const headers: Record<string, string> = {
    'User-Agent': DESKTOP_UA,
    Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
  };
  if (referer) headers.Referer = referer;
  const res = await fetch(target, { headers, signal });
  if (!res.ok) return null;
  const body = Buffer.from(await res.arrayBuffer());
  if (!isImageBuffer(body)) return null;
  return { body, contentType: res.headers.get('content-type') ?? 'image/jpeg' };
}

caseImageRouter.get('/case-image', async (req: Request, res: Response) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: '非法图片地址' });
    return;
  }
  if (parsed.protocol !== 'https:') {
    res.status(403).json({ error: '仅允许代理 https 图片' });
    return;
  }
  const source = IMAGE_SOURCES[parsed.hostname];
  if (!source) {
    res.status(403).json({ error: `不在允许代理的图源白名单内：${parsed.hostname}` });
    return;
  }

  const key = parsed.toString();
  const cached = imageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL_MS / 1000}`);
    res.send(cached.body);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // 先带 Referer；失败再裸请求（不同 CDN 的防盗链策略不一致）
    let result = await fetchUpstream(key, source.referer, controller.signal).catch(() => null);
    if (!result && source.referer) {
      result = await fetchUpstream(key, undefined, controller.signal).catch(() => null);
    }
    if (!result) {
      res.status(502).json({ error: `${source.label} 图片获取失败，或返回内容不是图片` });
      return;
    }
    imageCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, ...result });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL_MS / 1000}`);
    res.send(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    res.status(502).json({ error: `图片代理失败：${message}` });
  } finally {
    clearTimeout(timer);
  }
});
