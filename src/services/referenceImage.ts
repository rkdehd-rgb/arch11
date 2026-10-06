/**
 * 参考图预处理：
 * 案例图使用 Wikimedia Special:FilePath 等重定向 URL，服务端（Grsai）拉取常失败。
 * 提交前在浏览器端（用户网络 + 浏览器 UA）下载并转成 base64 data URI 再提交。
 *
 * 策略：
 * - 已是 data: URI → 原样透传
 * - http(s)/blob URL → 下载（15s 超时）→ 压缩为 data URI
 * - 单张失败 → 记录到 failed，不拖垮整次生成
 */

import { compressImage } from './imageCompress';

export const REFERENCE_FETCH_TIMEOUT_MS = 15_000;

export interface FailedReference {
  /** 在原数组中的序号（1 起） */
  index: number;
  /** 原 URL 或 data URI */
  src: string;
  /** 失败原因 */
  reason: string;
}

export interface PrepareResult {
  /** 可提交的图片（data URI 为主） */
  images: string[];
  /** 原始 URL，与 images 同序（data URI 输入时即其自身） */
  originals: string[];
  /** 拉取失败被剔除的参考图 */
  failed: FailedReference[];
}

export interface PrepareHandlers {
  /** 预处理进度：已完成张数 / 总张数 */
  onProgress?: (done: number, total: number) => void;
}

function isDataUri(src: string): boolean {
  return /^data:/i.test(src.trim());
}

/** 带超时的 fetch，超时后中止请求 */
async function fetchWithTimeout(src: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(src, { signal: controller.signal });
    return res;
  } finally {
    window.clearTimeout(timer);
  }
}

/** 下载一张远程图片并压缩为 data URI；失败抛 Error */
async function downloadAsDataUri(src: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(src, REFERENCE_FETCH_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('下载超时（15 秒）');
    }
    throw new Error(err instanceof Error ? err.message : '下载失败（疑似 CORS 或网络问题）');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error('返回内容为空');

  try {
    const { dataUrl } = await compressImage(blob);
    return dataUrl;
  } catch {
    // 压缩失败：直接读原始字节为 data URI 兜底
    return await blobToDataUri(blob);
  }
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取为 base64 失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 预处理参考图列表：下载远程 URL → data URI。
 * 单张失败仅记录不中断。
 */
export async function prepareReferenceImages(
  sources: string[],
  handlers: PrepareHandlers = {},
): Promise<PrepareResult> {
  const images: string[] = [];
  const originals: string[] = [];
  const failed: FailedReference[] = [];

  let done = 0;
  handlers.onProgress?.(0, sources.length);

  for (let i = 0; i < sources.length; i += 1) {
    const src = sources[i];
    try {
      const dataUri = isDataUri(src) ? src : await downloadAsDataUri(src);
      images.push(dataUri);
      originals.push(src);
    } catch (err) {
      failed.push({
        index: i + 1,
        src,
        reason: err instanceof Error ? err.message : '无法加载',
      });
    }
    done += 1;
    handlers.onProgress?.(done, sources.length);
  }

  return { images, originals, failed };
}

/** 判断 Grsai 返回的错误是否与参考图上传相关 */
export function isImageUploadError(message: string): boolean {
  return /image upload failed|check the image|参考图|图片.*失败|无法.*图片/i.test(message);
}
