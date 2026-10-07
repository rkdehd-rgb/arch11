import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cloud, describeCloudError } from '../services/cloud';
import { startCloudSync, syncNow } from '../services/cloudSync';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';

interface PendingChallenge {
  phone: string;
  verificationId: string;
  isExistingUser: boolean;
}

const RESEND_SECONDS = 60;

export default function LoginPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const syncStatus = useSyncStore((s) => s.status);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const syncMessage = useSyncStore((s) => s.message);

  // 发码结果是「一次性」的，必须存在事件之外
  const challengeRef = useRef<PendingChallenge | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const canSend = !sending && countdown === 0 && /^1\d{10}$/.test(phone);

  async function handleManualSync(): Promise<void> {
    setAccountBusy(true);
    setError(null);
    try {
      await syncNow();
    } catch (err) {
      setError(describeCloudError(err));
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    setAccountBusy(true);
    setError(null);
    try {
      const result = await cloud.auth.signOut();
      if (result.error) throw new Error(describeCloudError(result.error));
      useAuthStore.getState().setSession(null);
    } catch (err) {
      setError(describeCloudError(err));
    } finally {
      setAccountBusy(false);
    }
  }

  // ---- 已登录：展示账号与同步状态 ----
  if (session) {
    const statusText =
      syncStatus === 'syncing'
        ? '正在同步…'
        : syncStatus === 'error'
          ? `同步失败：${syncMessage ?? '未知错误'}`
          : syncStatus === 'synced'
            ? '云端已同步'
            : '本地已保留';
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[420px] px-8 py-16">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            Account
          </div>
          <h1 className="text-[22px] font-semibold text-ink">云端同步已开启</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            推理报告、自定义策略与案例图都会自动保存到云端，换设备或清理浏览器缓存都不会丢失。
          </p>

          <div className="card mt-6 p-5">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-ink-3">当前账号</span>
              <span className="text-[13px] font-medium text-ink">
                {user?.label ?? '已登录'}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[12.5px] text-ink-3">同步状态</span>
              <span className="text-[13px] text-ink">{statusText}</span>
            </div>
            {lastSyncedAt && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12.5px] text-ink-3">上次同步</span>
                <span className="font-mono text-[12px] text-ink-2">
                  {new Date(lastSyncedAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-[12px] text-accent">
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn btn-primary flex-1 justify-center"
                onClick={() => void handleManualSync()}
                disabled={accountBusy}
              >
                立即同步
              </button>
              <button
                type="button"
                className="btn btn-secondary flex-1 justify-center"
                onClick={() => void handleSignOut()}
                disabled={accountBusy}
              >
                退出登录
              </button>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost mt-4 w-full justify-center text-[12.5px]"
            onClick={() => navigate('/')}
          >
            返回任务书
          </button>
        </div>
      </div>
    );
  }

  async function handleSendCode(): Promise<void> {
    if (!/^1\d{10}$/.test(phone)) {
      setPhoneError('请输入正确的 11 位手机号');
      return;
    }
    setPhoneError('');
    setError(null);
    setNotice(null);
    setSending(true);
    try {
      const result = await cloud.auth.sendOtp({ phone });
      if (result.error) {
        setError(describeCloudError(result.error));
        return;
      }
      challengeRef.current = {
        phone,
        verificationId: result.data.verificationId,
        isExistingUser: result.data.isExistingUser,
      };
      setCountdown(RESEND_SECONDS);
      setNotice('验证码已发送，请查看短信');
    } catch (err) {
      setError(describeCloudError(err));
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const pending = challengeRef.current;
    if (!pending || pending.phone !== phone) {
      setError('请先获取当前手机号的验证码');
      return;
    }
    if (!code.trim()) {
      setError('请输入短信验证码');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await cloud.auth.verifyOtp({
        phone: pending.phone,
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: code.trim(),
      });
      if (result.error) {
        setError(describeCloudError(result.error));
        return;
      }
      challengeRef.current = null;
      useAuthStore.getState().setSession(result.data);
      void startCloudSync();
      navigate('/', { replace: true });
    } catch (err) {
      setError(describeCloudError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWechatLogin(): Promise<void> {
    setError(null);
    setWechatLoading(true);
    try {
      const result = await cloud.auth.signInWithOAuth({
        provider: 'wechat',
        // 必须是站点根地址：静态托管下子路径会 404，code 会丢在服务端之前
        redirectTo: window.location.origin,
      });
      if (result.error) {
        setError(describeCloudError(result.error));
        return;
      }
      window.location.assign(result.data.url);
    } catch (err) {
      setError(describeCloudError(err));
    } finally {
      setWechatLoading(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[420px] px-8 py-16">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          Cloud Sync
        </div>
        <h1 className="text-[22px] font-semibold text-ink">登录以云端同步</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          登录后，推理报告、自定义策略与案例图会保存到云端，
          换设备或清理浏览器缓存都不会丢失。
          <br />
          未登录时应用照常可用，数据只保存在本机。
        </p>

        <form className="card mt-6 p-5" onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="phone">
            手机号
          </label>
          <input
            id="phone"
            className="input mt-1.5 w-full"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="11 位手机号"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
              setPhoneError('');
            }}
          />
          {phoneError && <p className="mt-1.5 text-[12px] text-accent">{phoneError}</p>}

          <div className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <label className="field-label" htmlFor="code">
                短信验证码
              </label>
              <input
                id="code"
                className="input mt-1.5 w-full"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 位验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary h-[38px] shrink-0 px-3.5 text-[12.5px]"
              onClick={() => void handleSendCode()}
              disabled={!canSend}
            >
              {countdown > 0 ? `${countdown}s 后重发` : sending ? '发送中…' : '获取验证码'}
            </button>
          </div>

          {notice && <p className="mt-3 text-[12px] text-ink-2">{notice}</p>}
          {error && (
            <div className="mt-3 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-[12px] text-accent">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg mt-5 w-full justify-center"
            disabled={submitting}
          >
            {submitting ? '登录中…' : '登录 / 注册'}
          </button>
          <p className="mt-2.5 text-center text-[11.5px] text-ink-3">
            首次使用该手机号将自动创建账号
          </p>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-ink-3">或</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            className="btn btn-secondary w-full justify-center"
            onClick={() => void handleWechatLogin()}
            disabled={wechatLoading}
          >
            {wechatLoading ? '正在跳转微信…' : '微信登录'}
          </button>
        </form>

        {syncStatus === 'error' && (
          <p className="mt-3 text-[12px] text-accent">
            登录成功，但云端同步暂时失败；稍后可在右上角手动重试。
          </p>
        )}

        <button
          type="button"
          className="btn btn-ghost mt-4 w-full justify-center text-[12.5px]"
          onClick={() => navigate('/')}
        >
          先不登录，仅在本机使用
        </button>
      </div>
    </div>
  );
}
