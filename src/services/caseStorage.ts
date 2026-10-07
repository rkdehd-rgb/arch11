import { cloud } from './cloud';

/**
 * 案例图云存储。
 *
 * 覆盖层里的图片有三种形态：
 * - `data:image/...` —— 未登录时本地压缩后的 dataURL；
 * - `http(s)://...`  —— gooood / wiki 等远程地址；
 * - `cloud:users/<uid>/cases/<name>` —— 已上传到云存储的对象路径。
 *
 * 云存储对象是私有的，只能通过**短时效签名 URL**访问，因此 `cloud:` 形态在渲染前
 * 需要换取签名 URL（带缓存，避免每次渲染都打接口）。
 */
const CLOUD_PREFIX = 'cloud:';
const SIGNED_URL_TTL_SECONDS = 3600;
/** 提前 5 分钟视为过期，避免边界上拿到刚失效的地址 */
const CACHE_SAFETY_MS = 5 * 60 * 1000;

export function isCloudImage(src: string): boolean {
  return typeof src === 'string' && src.startsWith(CLOUD_PREFIX);
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

/** 把 `cloud:` 路径换成可用的签名 URL；非云路径原样返回。失败返回 null（交由 SafeImage 走占位图）。 */
export async function resolveCloudImage(src: string): Promise<string | null> {
  if (!isCloudImage(src)) return src;
  const path = src.slice(CLOUD_PREFIX.length);
  const hit = urlCache.get(path);
  if (hit && hit.expiresAt - CACHE_SAFETY_MS > Date.now()) return hit.url;

  const running = inflight.get(path);
  if (running) return running;

  const task = (async (): Promise<string | null> => {
    try {
      const { data, error } = await cloud.storage.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      urlCache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(path);
    }
  })();

  inflight.set(path, task);
  return task;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/jpeg';
  if (header.includes(';base64')) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

function extensionOf(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * 把一张本地 dataURL 上传到当前用户的云存储目录，返回 `cloud:` 路径。
 * 调用前必须已登录（Storage 只对登录用户开放）。
 */
export async function uploadCaseImage(dataUrl: string, uid: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const mime = blob.type || 'image/jpeg';
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${extensionOf(mime)}`;
  const path = cloud.storage.userPath(uid, `cases/${name}`);
  const { data, error } = await cloud.storage.upload(path, blob, {
    contentType: mime,
    cacheControl: '3600',
    upsert: false,
  });
  if (error || !data) {
    throw new Error(error?.message ?? '案例图上传失败');
  }
  return `${CLOUD_PREFIX}${path}`;
}

/** 尽力把本地 dataURL 迁移到云存储；失败时保持原值，绝不丢图。 */
export async function migrateLocalImage(image: string, uid: string): Promise<string> {
  if (!image.startsWith('data:')) return image;
  try {
    return await uploadCaseImage(image, uid);
  } catch {
    return image;
  }
}
