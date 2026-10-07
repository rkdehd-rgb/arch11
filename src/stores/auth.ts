import { create } from 'zustand';
import type { CloudSession } from '@tencent-ai/workbuddy-cloud-sdk';

export interface AuthUserView {
  id: string;
  name: string;
  /** 脱敏后的展示标签：优先昵称，其次手机号尾号，最后 uid 片段 */
  label: string;
}

interface AuthState {
  /** 是否已完成首次会话探测（未完成时不渲染登录态 UI，避免首屏闪烁） */
  ready: boolean;
  session: CloudSession | null;
  user: AuthUserView | null;
  /** 微信回调处理中的错误（若有） */
  callbackError: string | null;
  setReady: (ready: boolean) => void;
  setSession: (session: CloudSession | null) => void;
  setCallbackError: (message: string | null) => void;
}

/** 手机号脱敏：138****0000 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('86') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length !== 11) return phone;
  return `${local.slice(0, 3)}****${local.slice(7)}`;
}

function toView(session: CloudSession | null): AuthUserView | null {
  if (!session) return null;
  const { user } = session;
  if (user.name) return { id: user.id, name: user.name, label: user.name };
  if (user.phone) {
    const label = maskPhone(user.phone);
    return { id: user.id, name: label, label };
  }
  if (user.email) return { id: user.id, name: user.email, label: user.email };
  return { id: user.id, name: '已登录用户', label: `用户 ${user.id.slice(0, 6)}` };
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  session: null,
  user: null,
  callbackError: null,
  setReady: (ready) => set({ ready }),
  setSession: (session) => set({ session, user: toView(session) }),
  setCallbackError: (callbackError) => set({ callbackError }),
}));
