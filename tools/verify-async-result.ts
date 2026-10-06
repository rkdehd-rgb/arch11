/**
 * 验证：
 * 1. extractResultUrl 能读出 Grsai 标准 results[0].url
 * 2. pollAsyncResult 对该响应立即返回 URL，而不是继续 pending 到超时
 * 运行：pnpm tsx tools/verify-async-result.ts
 */
import { extractResultUrl, pollAsyncResult } from '../src/services/grsai';

const REAL_RESPONSE = {
  id: '16-9da53eb6-2a56-4281-9a96-e973939febc0',
  status: 'succeeded',
  results: [
    { url: 'https://file4.aitohumanize.com/file/edc2160e988944d58a09ff952b2eb59b.png' },
  ],
  progress: 100,
};

const EXPECTED = 'https://file4.aitohumanize.com/file/edc2160e988944d58a09ff952b2eb59b.png';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

// 1) 直接解析
const parsed = extractResultUrl(REAL_RESPONSE as never);
assert(parsed === EXPECTED, `extractResultUrl 返回 results[0].url（实际：${parsed}）`);

// 2) 轮询：mock fetch，返回真实成功响应，pollAsyncResult 应立即成功
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = (async () => {
  calls += 1;
  return new Response(JSON.stringify(REAL_RESPONSE), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

pollAsyncResult(
  'global',
  'test-key',
  REAL_RESPONSE.id,
  { intervalMs: 2000, timeoutMs: 600_000 },
)
  .then((url) => {
    globalThis.fetch = originalFetch;
    assert(url === EXPECTED, `pollAsyncResult 立即返回 URL（实际：${url}）`);
    assert(calls === 1, `仅请求一次即成功（实际请求 ${calls} 次，未空转）`);
    console.log('\n全部验证通过');
  })
  .catch((err: unknown) => {
    globalThis.fetch = originalFetch;
    console.error('✗ pollAsyncResult 异常：', err);
    process.exit(1);
  });
