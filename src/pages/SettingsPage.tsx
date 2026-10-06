import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';
import { testConnection } from '../services/llm';
import { GRSAI_NODES } from '../services/grsai';
import type { GrsaiNode } from '../types';

type TestStatus = 'idle' | 'testing' | 'success' | 'fail';

const PRESET_PROVIDERS = [
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    label: '火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
  },
  {
    label: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
];

/** Grsai 预设：一个 Key 同时跑通推理与生图 */
function applyGrsaiPreset(node: GrsaiNode, update: ReturnType<typeof useSettingsStore.getState>['update']): void {
  update({
    grsaiNode: node,
    baseUrl: `${GRSAI_NODES[node]}/v1`,
    model: 'gemini-3.1-pro',
  });
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const config = useSettingsStore((s) => s.config);
  const update = useSettingsStore((s) => s.update);

  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<TestStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const canTest = Boolean(
    config.baseUrl.trim() && config.apiKey.trim() && config.model.trim(),
  );

  async function handleTest(): Promise<void> {
    if (!canTest) return;
    setStatus('testing');
    setMessage(null);
    try {
      await testConnection(config);
      setStatus('success');
      setMessage('连接成功：模型已正确响应。');
    } catch (err) {
      setStatus('fail');
      setMessage(
        `连接失败：${err instanceof Error ? err.message : String(err)}。请检查 Base URL、API Key 与模型名称。`,
      );
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-8 py-10">
        <div className="mb-8">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            Settings / Model
          </div>
          <h1 className="text-[22px] font-semibold leading-tight text-ink">
            模型配置
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            配置 OpenAI 兼容接口，ArchReason 将直接从浏览器发起请求（配置仅保存在本地浏览器，不会上传）。
          </p>
        </div>

        <div className="card p-7">
          {/* 预设服务商 */}
          <div className="mb-6">
            <span className="field-label">快速填入服务商</span>
            <div className="flex flex-wrap gap-2">
              {PRESET_PROVIDERS.map((provider) => (
                <button
                  key={provider.label}
                  type="button"
                  className="chip"
                  onClick={() =>
                    update({
                      baseUrl: provider.baseUrl,
                      model: provider.model,
                    })
                  }
                >
                  {provider.label}
                </button>
              ))}
              <button
                type="button"
                className="chip chip-accent"
                onClick={() => applyGrsaiPreset(config.grsaiNode ?? 'global', update)}
                title="一键填入 Grsai：推理与生图共用同一 API Key"
              >
                Grsai
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-ink-3">
              Grsai 预设：Base URL 随下方接入节点切换，模型示例 gemini-3.1-pro，与生图共用同一 API Key。
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="field-label" htmlFor="baseUrl">Base URL</label>
              <input
                id="baseUrl"
                className="input font-mono text-[13px]"
                value={config.baseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(e) => update({ baseUrl: e.target.value })}
              />
              <p className="mt-1.5 text-[11.5px] text-ink-3">
                OpenAI 兼容接口地址，通常以 /v1 结尾；程序将自动拼接 /chat/completions。
              </p>
            </div>

            <div>
              <label className="field-label" htmlFor="apiKey">API Key</label>
              <div className="relative">
                <input
                  id="apiKey"
                  className="input pr-12 font-mono text-[13px]"
                  type={showKey ? 'text' : 'password'}
                  value={config.apiKey}
                  placeholder="sk-..."
                  onChange={(e) => update({ apiKey: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-7 w-8 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:text-ink"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? '隐藏' : '显示'}
                >
                  {showKey ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="model">模型名称</label>
              <input
                id="model"
                className="input font-mono text-[13px]"
                value={config.model}
                placeholder="例如：gpt-4o-mini / deepseek-chat"
                onChange={(e) => update({ model: e.target.value })}
              />
            </div>
          </div>

        {/* Grsai 生图配置 */}
        <div className="card mt-6 p-7">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Grsai 生图接口</h2>
          </div>
          <p className="mb-5 text-[12.5px] text-ink-2">
            全部生图接口（统一异步生成 / OpenAI 同步生图 / 图片编辑）与 16 个模型共用上方 API Key
            （Authorization Bearer）。切换节点将同时影响全部生图接口。
          </p>

          <span className="field-label">接入节点</span>
          <div className="flex gap-2">
            <button
              type="button"
              className={`chip justify-between gap-3 ${(config.grsaiNode ?? 'global') === 'global' ? 'chip-selected' : ''}`}
              onClick={() => update({ grsaiNode: 'global' })}
            >
              <span>全球节点</span>
              <span className="font-mono text-[10.5px] text-ink-3">grsaiapi.com</span>
            </button>
            <button
              type="button"
              className={`chip justify-between gap-3 ${config.grsaiNode === 'cn' ? 'chip-selected' : ''}`}
              onClick={() => update({ grsaiNode: 'cn' })}
            >
              <span>国内节点</span>
              <span className="font-mono text-[10.5px] text-ink-3">grsai.dakka.com.cn</span>
            </button>
          </div>

          <div className="mt-5 rounded-md border border-line bg-paper px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-ink-2">API Key（与 LLM 共用）</span>
              <span className={`font-mono text-[11px] ${config.apiKey.trim() ? 'text-[#5d7a52]' : 'text-accent'}`}>
                {config.apiKey.trim() ? '已配置' : '未配置'}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              在上方 LLM 配置区填写 API Key 即可，一个 Key 跑通「推理 + 生图」全流程。
            </p>
          </div>

          <p className="mt-4 text-[11.5px] text-ink-3">
            若浏览器直连遇到 CORS 拦截或接口异常，画板会自动降级为程序化 SVG 演示生成，流程不中断。
          </p>
        </div>

          {message && (
            <div
              className={`mt-6 flex items-start gap-2.5 rounded-md border px-4 py-3 text-[12.5px] fade-in ${
                status === 'success'
                  ? 'border-[#7fa075] bg-[#eef4ea] text-[#3f5c38]'
                  : 'border-accent/40 bg-accent-soft text-accent-dark'
              }`}
            >
              {status === 'success' ? (
                <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              <span>{message}</span>
            </div>
          )}

          <div className="mt-7 flex items-center justify-between border-t border-line pt-6">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!canTest || status === 'testing'}
              onClick={handleTest}
            >
              {status === 'testing' ? (
                <>
                  <span className="spinner" />
                  测试中…
                </>
              ) : (
                '测试连接'
              )}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canTest}
              onClick={() => navigate('/')}
            >
              保存并返回
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
