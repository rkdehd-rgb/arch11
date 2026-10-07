/**
 * WorkBuddy 云服务公开配置。
 *
 * 这四个值来自 `workbuddy_cloud_service` 工具 activate 返回的 `publicConfig`，
 * 是唯一允许出现在前端产物里的云服务配置：
 * - `endpoint` 是本应用**已注册的发布域名**（服务端按 Origin 精确匹配），
 *   必须显式传入，不能省略、也不能从 `location` / 环境变量拼；
 * - `publishableKey` 只标识「哪个应用」、本身不携带权限，因此可以打进前端产物，
 *   但仍不得写入日志。
 *
 * 底层环境 id 与 provider 密钥只存在于服务端，永不返回。
 */
export const CLOUD_PUBLIC_CONFIG = {
  endpoint: 'https://arch-reason-engine.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_0JxkZtgJpdBBQ9so2ttSdv_u6Jq4U5rdHd9S2Uo3Gtp61KqUqKCXnm0',
} as const;
