import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../stores/settings';
import { testConnection } from '../services/llm';

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
            </div>
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
