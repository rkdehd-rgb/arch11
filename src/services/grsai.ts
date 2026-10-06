import type { GrsaiMode, GrsaiNode } from '../types';

/* ============================================================
 * Grsai 生图服务 —— 真实接口层
 *
 * 接口全景：
 *  1. POST /v1/api/generate      统一异步生成（16 模型，多参考图）
 *  2. GET  /v1/api/result?id=     异步结果轮询（progress 0-100）
 *  3. POST /v1/images/generations OpenAI 格式同步生图
 *  4. POST /v1/images/edits       OpenAI 格式图片编辑（multipart，单图）
 *
 * 节点：
 *  global -> https://grsaiapi.com
 *  cn     -> https://grsai.dakka.com.cn
 * 三个接口共用同一 Authorization: Bearer <API Key>
 * ============================================================ */

export const GRSAI_NODES: Record<GrsaiNode, string> = {
  global: 'https://grsaiapi.com',
  cn: 'https://grsai.dakka.com.cn',
};

export type GrsaiFamily = 'nano-banana' | 'gpt-image';
export type ParamStyle = 'banana' | 'banana2' | 'gpt-base' | 'gpt-vip';

export interface ModelSpec {
  id: string;
  label: string;
  family: GrsaiFamily;
  /** 参数区渲染风格 */
  paramStyle: ParamStyle;
  /** 能力标签（后缀含义基于命名推断，以实际效果为准） */
  capabilities: string[];
  /** nano-banana 系列可用比例（gpt 系列比例由像素网格派生） */
  ratios?: string[];
  /** nano-banana 分辨率档位 */
  sizes?: string[];
  /** gpt-image 质量档 */
  qualities?: string[];
  /** 是否支持透明背景 */
  transparent?: boolean;
  /** 是否支持 mask */
  mask?: boolean;
}

/** nano-banana 非 2 系列的比例集合 */
const BANANA_RATIOS = [
  'auto', '1:1', '16:9', '9:16', '4:3', '3:4',
  '3:2', '2:3', '5:4', '4:5', '21:9',
];

/** nano-banana-2 系列新增超宽比例 */
const BANANA2_RATIOS = [...BANANA_RATIOS, '1:4', '4:1', '1:8', '8:1'];

/* ---------------- 像素预设网格（vip/flare/sunburst） ----------------
 * 每档均满足：两边为 16 的倍数、最大边 ≤3840、长宽比 ≤3:1 */

export interface PixelPreset {
  ratio: string;
  values: string[];
}

export const PIXEL_PRESETS: PixelPreset[] = [
  { ratio: '1:1', values: ['1024x1024', '2048x2048', '2880x2880'] },
  { ratio: '16:9', values: ['1280x720', '2048x1152', '3840x2160'] },
  { ratio: '9:16', values: ['720x1280', '1152x2048', '2160x3840'] },
  { ratio: '4:3', values: ['1152x864', '2304x1728', '3264x2448'] },
  { ratio: '3:4', values: ['864x1152', '1728x2304', '2448x3264'] },
  { ratio: '3:2', values: ['1152x768', '2304x1536', '3456x2304'] },
  { ratio: '2:3', values: ['768x1152', '1536x2304', '2304x3456'] },
  { ratio: '21:9', values: ['1456x624', '2912x1248', '3840x1648'] },
];

/** gpt-image-2 / 2.5 可用的比例字符串 */
const GPT_RATIO_STRINGS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];

/* ----------------------------- 模型目录 ----------------------------- */

export const MODEL_CATALOG: ModelSpec[] = [
  /* -------- nano-banana 系列（11），接口：POST /v1/api/generate -------- */
  {
    id: 'nano-banana', label: 'nano-banana', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['均衡通用'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-fast', label: 'nano-banana-fast', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['速度快'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-pro', label: 'nano-banana-pro', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['质量优先'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-2', label: 'nano-banana-2', family: 'nano-banana',
    paramStyle: 'banana2', capabilities: ['新一代', '超宽比例'],
    ratios: BANANA2_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-2-fast', label: 'nano-banana-2-fast', family: 'nano-banana',
    paramStyle: 'banana2', capabilities: ['新一代', '速度快', '超宽比例'],
    ratios: BANANA2_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-2-pro', label: 'nano-banana-2-pro', family: 'nano-banana',
    paramStyle: 'banana2', capabilities: ['新一代', '质量优先', '超宽比例'],
    ratios: BANANA2_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-2k', label: 'nano-banana-2k', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['2K 高清'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-4k', label: 'nano-banana-4k', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['4K 最高清'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-cl', label: 'nano-banana-cl', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['构图控制'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-vt', label: 'nano-banana-vt', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['风格迁移'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },
  {
    id: 'nano-banana-outline', label: 'nano-banana-outline', family: 'nano-banana',
    paramStyle: 'banana', capabilities: ['轮廓/线稿'],
    ratios: BANANA_RATIOS, sizes: ['1K', '2K', '4K'],
  },

  /* -------- gpt-image 系列（5），接口：/v1/images/generations 与 /v1/images/edits -------- */
  {
    id: 'gpt-image-2', label: 'gpt-image-2', family: 'gpt-image',
    paramStyle: 'gpt-base', capabilities: ['比例或像素'],
    ratios: GPT_RATIO_STRINGS, qualities: ['auto'],
  },
  {
    id: 'gpt-image-2-vip', label: 'gpt-image-2-vip', family: 'gpt-image',
    paramStyle: 'gpt-vip', capabilities: ['专属通道', '透明背景'],
    qualities: ['medium'], transparent: true, mask: true,
  },
  {
    id: 'gpt-image-2.5', label: 'gpt-image-2.5', family: 'gpt-image',
    paramStyle: 'gpt-base', capabilities: ['新版', '比例或像素'],
    ratios: GPT_RATIO_STRINGS, qualities: ['auto'],
  },
  {
    id: 'gpt-image-2.5-flare', label: 'gpt-image-2.5-flare', family: 'gpt-image',
    paramStyle: 'gpt-vip', capabilities: ['新版', '三档质量', '透明背景'],
    qualities: ['low', 'medium', 'high'], transparent: true, mask: true,
  },
  {
    id: 'gpt-image-2.5-sunburst', label: 'gpt-image-2.5-sunburst', family: 'gpt-image',
    paramStyle: 'gpt-vip', capabilities: ['新版', '最高质量', '透明背景'],
    qualities: ['low', 'medium', 'high', 'xhigh', 'max'],
    transparent: true, mask: true,
  },
];

/** 默认模型：nano-banana（通用性最好） */
export const DEFAULT_MODEL_ID = 'nano-banana';

export const modelSpecMap: Map<string, ModelSpec> = new Map(
  MODEL_CATALOG.map((m) => [m.id, m]),
);

export function getModelSpec(id: string): ModelSpec {
  return modelSpecMap.get(id) ?? MODEL_CATALOG[0];
}

/** gpt-base 型号默认像素值 */
export const GPT_BASE_DEFAULT_SIZE = '1024x1024';

/* ============================ 请求参数类型 ============================ */

export interface AsyncGenerateParams {
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize?: string;
  images?: string[];
  quality?: string;
  background?: 'transparent' | 'opaque';
  mask?: string;
}

export interface SyncGenerateParams {
  prompt: string;
  model: string;
  size: string;
  image?: string[];
  quality?: string;
  background?: 'transparent' | 'opaque';
}

export interface EditParams {
  prompt: string;
  model: string;
  /** 必填，单张 URL/base64 */
  image: string;
  quality?: string;
  background?: 'transparent' | 'opaque';
  mask?: string;
}

/* ============================== 错误处理 ============================== */

export class GrsaiError extends Error {
  /** 是否疑似 CORS / 网络层失败（无响应体） */
  readonly corsLike: boolean;
  constructor(message: string, corsLike = false) {
    super(message);
    this.name = 'GrsaiError';
    this.corsLike = corsLike;
  }
}

function baseUrl(node: GrsaiNode): string {
  return GRSAI_NODES[node];
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
}

/** 判断异常是否为网络层（CORS/超时/DNS）失败 */
export function isCorsLikeError(err: unknown): boolean {
  if (err instanceof GrsaiError) return err.corsLike;
  return err instanceof TypeError;
}

/* ====================== 1. 统一异步生成 /v1/api/generate ====================== */

interface AsyncSubmitResponse {
  id?: string;
  taskId?: string;
  data?: { id?: string; taskId?: string };
  code?: number;
  message?: string;
  msg?: string;
}

export async function submitAsyncGenerate(
  node: GrsaiNode,
  apiKey: string,
  params: AsyncGenerateParams,
): Promise<string> {
  const spec = getModelSpec(params.model);
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    replyType: 'async',
  };
  if (params.images && params.images.length > 0) body.images = params.images;

  if (spec.family === 'nano-banana') {
    if (params.imageSize) body.imageSize = params.imageSize;
  } else {
    if (params.quality) body.quality = params.quality;
    if (params.background === 'transparent' && spec.transparent) {
      body.background = 'transparent';
    }
    if (params.mask && spec.mask) body.mask = params.mask;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl(node)}/v1/api/generate`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GrsaiError(
      err instanceof Error ? err.message : '异步生成请求未送达（疑似 CORS 或网络问题）',
      true,
    );
  }

  const json = (await res.json().catch(() => null)) as AsyncSubmitResponse | null;
  if (!res.ok) {
    throw new GrsaiError(
      (json?.message ?? json?.msg ?? `异步生成提交失败（HTTP ${res.status}）`),
      false,
    );
  }
  const taskId = json?.id ?? json?.taskId ?? json?.data?.id ?? json?.data?.taskId;
  if (!taskId) {
    // 个别网关可能在提交时即同步返回结果
    throw new GrsaiError('异步接口未返回任务 id');
  }
  return String(taskId);
}

/* ====================== 2. 异步结果轮询 /v1/api/result ====================== */

export interface AsyncResult {
  status: 'pending' | 'succeeded' | 'failed';
  progress: number;
  url?: string;
  message?: string;
}

interface ResultResponse {
  status?: string;
  state?: string;
  progress?: number;
  percent?: number;
  url?: string;
  output?: string | string[] | { url?: string }[];
  data?: { url?: string } | { url?: string }[];
  image?: string;
  images?: string[];
  message?: string;
  msg?: string;
}

export async function fetchAsyncResult(
  node: GrsaiNode,
  apiKey: string,
  taskId: string,
): Promise<AsyncResult> {
  let res: Response;
  try {
    res = await fetch(
      `${baseUrl(node)}/v1/api/result?id=${encodeURIComponent(taskId)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${apiKey.trim()}` } },
    );
  } catch (err) {
    throw new GrsaiError(
      err instanceof Error ? err.message : '结果查询失败（疑似网络问题）',
      true,
    );
  }

  const json = (await res.json().catch(() => null)) as ResultResponse | null;
  if (!res.ok || !json) {
    throw new GrsaiError(
      (json?.message ?? json?.msg ?? `结果查询失败（HTTP ${res.status}）`),
      false,
    );
  }

  const rawStatus = (json.status ?? json.state ?? '').toString().toLowerCase();
  const progress = typeof json.progress === 'number'
    ? json.progress
    : typeof json.percent === 'number'
      ? json.percent
      : 0;

  const url = extractResultUrl(json);
  if (url || rawStatus === 'succeeded' || rawStatus === 'success' || rawStatus === 'completed') {
    if (url) return { status: 'succeeded', progress: 100, url };
  }
  if (rawStatus === 'failed' || rawStatus === 'error') {
    return { status: 'failed', progress, message: json.message ?? json.msg ?? '生成失败' };
  }
  return { status: 'pending', progress };
}

function extractResultUrl(json: ResultResponse): string | undefined {
  if (json.url) return json.url;
  if (json.image) return json.image;
  if (json.images && json.images.length > 0) return json.images[0];
  if (typeof json.output === 'string') return json.output;
  if (Array.isArray(json.output) && json.output.length > 0) {
    const first = json.output[0];
    if (typeof first === 'string') return first;
    if (first.url) return first.url;
  }
  if (json.data) {
    if (Array.isArray(json.data) && json.data[0]?.url) return json.data[0].url;
    if (!Array.isArray(json.data) && json.data.url) return json.data.url;
  }
  return undefined;
}

export interface PollHandlers {
  onProgress?: (progress: number) => void;
  /** 返回 true 则中止轮询 */
  shouldCancel?: () => boolean;
  intervalMs?: number;
  timeoutMs?: number;
}

export async function pollAsyncResult(
  node: GrsaiNode,
  apiKey: string,
  taskId: string,
  handlers: PollHandlers = {},
): Promise<string> {
  const interval = handlers.intervalMs ?? 2000;
  const timeout = handlers.timeoutMs ?? 300_000;
  const startedAt = Date.now();
  let lastProgress = 0;

  for (;;) {
    if (handlers.shouldCancel?.()) {
      throw new GrsaiError('已取消生成');
    }
    if (Date.now() - startedAt > timeout) {
      throw new GrsaiError('生成超时，请稍后重试或改用「快速生图」');
    }

    const result = await fetchAsyncResult(node, apiKey, taskId);
    if (result.progress > lastProgress) {
      lastProgress = result.progress;
      handlers.onProgress?.(result.progress);
    }
    if (result.status === 'succeeded' && result.url) return result.url;
    if (result.status === 'failed') {
      throw new GrsaiError(result.message ?? '生成失败，可重试或改用「快速生图」');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/* ================== 3. OpenAI 同步生图 /v1/images/generations ================== */

export async function generateSync(
  node: GrsaiNode,
  apiKey: string,
  params: SyncGenerateParams,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
  };
  if (params.image && params.image.length > 0) body.image = params.image;
  if (params.quality) body.quality = params.quality;
  if (params.background === 'transparent') body.background = 'transparent';

  let res: Response;
  try {
    res = await fetch(`${baseUrl(node)}/v1/images/generations`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GrsaiError(
      err instanceof Error ? err.message : '快速生图请求未送达（疑似 CORS 或网络问题）',
      true,
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: { url?: string; b64_json?: string }[]; message?: string; error?: { message?: string } }
    | null;
  if (!res.ok) {
    throw new GrsaiError(
      json?.message ?? json?.error?.message ?? `快速生图失败（HTTP ${res.status}）`,
      false,
    );
  }
  const item = json?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new GrsaiError('快速生图响应缺少图片地址');
}

/* ====================== 4. 图片编辑 /v1/images/edits ====================== */

export async function editImage(
  node: GrsaiNode,
  apiKey: string,
  params: EditParams,
): Promise<string> {
  const form = new FormData();
  form.append('model', params.model);
  form.append('prompt', params.prompt);

  if (/^https?:\/\//i.test(params.image)) {
    // URL 参考图：先拉取再以文件形式提交（OpenAI edits 要求 multipart 文件）
    let blob: Blob;
    try {
      const imgRes = await fetch(params.image);
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      blob = await imgRes.blob();
    } catch (err) {
      throw new GrsaiError(
        `参考图读取失败：${err instanceof Error ? err.message : '未知错误'}`,
        true,
      );
    }
    form.append('image', blob, 'reference.png');
  } else {
    // base64 data URI：解码为 Blob
    const blob = dataUriToBlob(params.image);
    if (!blob) throw new GrsaiError('编辑参考图格式无效');
    form.append('image', blob, 'reference.png');
  }

  if (params.quality) form.append('quality', params.quality);
  if (params.background === 'transparent') form.append('background', 'transparent');
  if (params.mask) {
    if (/^https?:\/\//i.test(params.mask)) {
      const maskRes = await fetch(params.mask);
      if (maskRes.ok) form.append('mask', await maskRes.blob(), 'mask.png');
    } else {
      const maskBlob = dataUriToBlob(params.mask);
      if (maskBlob) form.append('mask', maskBlob, 'mask.png');
    }
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl(node)}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      body: form,
    });
  } catch (err) {
    throw new GrsaiError(
      err instanceof Error ? err.message : '图片编辑请求未送达（疑似 CORS 或网络问题）',
      true,
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { data?: { url?: string; b64_json?: string }[]; message?: string; error?: { message?: string } }
    | null;
  if (!res.ok) {
    throw new GrsaiError(
      json?.message ?? json?.error?.message ?? `图片编辑失败（HTTP ${res.status}）`,
      false,
    );
  }
  const item = json?.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new GrsaiError('图片编辑响应缺少图片地址');
}

function dataUriToBlob(uri: string): Blob | null {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(uri);
  if (!match) return null;
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/* ============================== 便捷汇总 ============================== */

/** 根据模式判断是否支持多张参考图（仅异步支持多图，编辑仅单图） */
export function supportsMultiReference(mode: GrsaiMode): boolean {
  return mode === 'async';
}

