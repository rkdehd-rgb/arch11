/**
 * 图片压缩工具：上传图经 canvas 压缩为 dataURL，
 * 控制最长边与质量，避免 localStorage 爆仓。
 */

export interface CompressOptions {
  /** 最长边上限，默认 1280 */
  maxEdge?: number;
  /** JPEG 质量 0-1，默认 0.85 */
  quality?: number;
  /** 期望的输出 MIME，默认 image/jpeg（带透明通道的 PNG 保留为 png） */
  forceType?: string;
}

export interface CompressResult {
  /** 压缩后的 dataURL */
  dataUrl: string;
  /** dataURL 近似字节数（base64 长度 * 3/4） */
  bytes: number;
  width: number;
  height: number;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片解析失败'));
    };
    img.src = url;
  });
}

/**
 * 压缩图片：等比缩放到最长边 maxEdge，输出 JPEG dataURL。
 * 若源为 PNG/GIF 且需要保留透明（forceType 未指定且检测到 alpha），保留 image/png。
 */
export async function compressImage(
  file: File | Blob,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const maxEdge = options.maxEdge ?? 1280;
  const quality = options.quality ?? 0.85;
  const img = await loadImage(file);

  let { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) {
    w = img.width;
    h = img.height;
  }
  const longest = Math.max(w, h);
  if (longest > maxEdge) {
    const scale = maxEdge / longest;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 canvas 上下文');
  ctx.drawImage(img, 0, 0, w, h);

  // 检测是否含透明像素（仅对可能带 alpha 的类型）
  let hasAlpha = false;
  const sourceMime = options.forceType ?? (file as File).type ?? '';
  if (!options.forceType && sourceMime !== 'image/jpeg') {
    try {
      const data = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          hasAlpha = true;
          break;
        }
      }
    } catch {
      hasAlpha = false;
    }
  }

  const mime = options.forceType ?? (hasAlpha ? 'image/png' : 'image/jpeg');
  const dataUrl = canvas.toDataURL(mime, quality);
  return {
    dataUrl,
    bytes: estimateDataUrlBytes(dataUrl),
    width: w,
    height: h,
  };
}

/** localStorage 剩余可用空间的粗略探测（通过写入试探，捕获配额异常） */
export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

/** 尝试写入，超配额时抛 StorageQuotaError */
export function safeSetPersistent(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      throw new StorageQuotaError('浏览器存储空间不足，请先删除部分案例图或导出备份后清理');
    }
    throw err;
  }
}
