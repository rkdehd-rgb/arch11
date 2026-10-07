// 谷德设计网（gooood.cn）案例搜索：请求同源 Express 代理，规避站点无 CORS 头的限制。

export interface GoooodImage {
  title: string;
  subtitle: string;
  thumb: string;
  image: string;
  pageUrl: string;
  year: string;
  category: string;
}

interface CaseSearchResponse {
  results?: GoooodImage[];
  hasMore?: boolean;
  error?: string;
}

export interface GoooodSearchPage {
  results: GoooodImage[];
  hasMore: boolean;
}

const REQUEST_TIMEOUT_MS = 20_000;

/** 通过 /api/case-image 同源代理获取图片并转为 Blob（参考图不以原始 URL 提交）。 */
export async function fetchGoooodImageBlob(imageUrl: string): Promise<Blob> {
  const proxied = `/api/case-image?url=${encodeURIComponent(imageUrl)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(proxied, { signal: controller.signal });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `图片代理失败 HTTP ${res.status}`);
    }
    return await res.blob();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchGooood(keyword: string, page = 1): Promise<GoooodSearchPage> {
  const url = `/api/case-search?q=${encodeURIComponent(keyword)}&page=${page}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = (await res.json().catch(() => null)) as CaseSearchResponse | null;
    if (!res.ok || !data) {
      throw new Error(data?.error ?? `谷德搜索失败 HTTP ${res.status}`);
    }
    return {
      results: Array.isArray(data.results) ? data.results : [],
      hasMore: Boolean(data.hasMore),
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface GoooodArticleImage {
  url: string;
  thumb: string;
}

/** 抓取某篇文章页的正文图片（而非搜索封面），用于「文章内图」选择 */
export async function fetchGoooodArticleImages(pageUrl: string): Promise<GoooodArticleImage[]> {
  const url = `/api/case-images?url=${encodeURIComponent(pageUrl)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = (await res.json().catch(() => null)) as { images?: GoooodArticleImage[]; error?: string } | null;
    if (!res.ok || !data) {
      throw new Error(data?.error ?? `文章图抓取失败 HTTP ${res.status}`);
    }
    return Array.isArray(data.images) ? data.images : [];
  } finally {
    clearTimeout(timer);
  }
}
