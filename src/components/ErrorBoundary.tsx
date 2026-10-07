import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * 全局错误边界：捕获任意子组件渲染期异常，避免整页白屏。
 * 展示友好降级页，并提供「重试 / 刷新 / 返回首页」入口。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留在控制台便于排查
    // eslint-disable-next-line no-console
    console.error('[ArchReason] 页面异常：', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface px-6">
        <div className="w-full max-w-[520px] card p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a9472d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 className="text-[18px] font-semibold text-ink">页面出现异常</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            渲染过程中发生错误，已为你拦截以避免白屏。可先尝试重试，若仍异常请刷新页面。
          </p>
          {this.state.message && (
            <pre className="mt-4 max-h-[120px] overflow-auto rounded-md border border-line bg-paper px-3.5 py-2.5 text-left font-mono text-[11px] leading-relaxed text-ink-3">
              {this.state.message}
            </pre>
          )}
          <div className="mt-6 flex items-center justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={this.handleReset}>
              重试
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleReload}>
              刷新页面
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleHome}>
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }
}
