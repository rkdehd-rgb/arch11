import { cloud, describeCloudError, unwrap } from './cloud';
import { startCloudSync, stopCloudSync } from './cloudSync';
import { useAuthStore } from '../stores/auth';

/**
 * 登录态引导。
 *
 * 必须在任何路由守卫之前**无条件**执行：微信网页授权回落到站点根地址，
 * `?code=...&state=...` 需要在这里被消费掉。`code` 是一次性的，若被守卫打断
 * 就等于用户授权成功却登录失败。
 */
let bootstrapped = false;

export async function bootstrapAuth(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  // 1) 先消费微信回调（没有 code 时返回 null，是普通访问，不是错误）
  try {
    const result = await cloud.auth.handleWechatWebCallback();
    if (result.error) {
      useAuthStore.getState().setCallbackError(describeCloudError(result.error));
    } else if (result.data) {
      // 成功后立刻清掉地址栏里的 code/state，避免刷新时重放已消费的 code
      window.history.replaceState(null, '', window.location.pathname);
      useAuthStore.getState().setSession(result.data);
    }
  } catch (err) {
    useAuthStore.getState().setCallbackError(describeCloudError(err));
  }

  // 2) 订阅登录态变化：登录即启动云同步，登出即停止（本地数据保留）
  cloud.auth.onAuthStateChange((event, session) => {
    useAuthStore.getState().setSession(session);
    if (event === 'SIGNED_IN' && session) {
      void startCloudSync();
    } else if (event === 'SIGNED_OUT') {
      stopCloudSync();
    }
  });

  // 3) 读取已有会话（会顺带续期临近过期的 token）
  try {
    const session = unwrap(await cloud.auth.getSession());
    useAuthStore.getState().setSession(session);
    if (session) void startCloudSync();
  } catch {
    useAuthStore.getState().setSession(null);
  } finally {
    useAuthStore.getState().setReady(true);
  }
}
