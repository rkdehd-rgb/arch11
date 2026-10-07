import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import { CLOUD_PUBLIC_CONFIG } from './cloudConfig';

/**
 * 全局唯一的云服务客户端。四个模块（auth / database / storage / llm）共用同一实例：
 * 登录一次之后，database 与 storage 的请求会自动带上当前身份，无需手动搬 token。
 */
export const cloud = createWorkBuddyCloud({
  endpoint: CLOUD_PUBLIC_CONFIG.endpoint,
  oauthRelayBaseUrl: CLOUD_PUBLIC_CONFIG.oauthRelayBaseUrl,
  publishableKey: CLOUD_PUBLIC_CONFIG.publishableKey,
});

/** 把 `{ data, error }` 信封转成「失败即抛」的形式，让调用点保持线性。 */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    const message =
      typeof result.error === 'object' && result.error && 'message' in result.error
        ? String((result.error as { message: unknown }).message)
        : String(result.error);
    throw new Error(message);
  }
  return result.data;
}

/** 统一的可读错误信息（不打印任何凭证）。 */
export function describeCloudError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '未知错误';
}
