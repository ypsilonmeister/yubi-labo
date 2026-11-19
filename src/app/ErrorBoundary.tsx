// 描画中の例外で画面が真っ白にならないようにする境界（Issue #25）。
// 文言は中立にする（赤・叱責・「ざんねん」を使わない）。「もどる」は 48px 以上のタップ対象。
// 記録は SessionEngine が逐次保存しているので、ここでは何も消さない。

import { Component, type ReactNode } from 'react';

export const FALLBACK_TEXT = 'ちょっと うまく ひらけませんでした';
export const FALLBACK_BACK_LABEL = 'もどる';

export function ErrorFallback({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen center" role="status">
      <p className="center-text">{FALLBACK_TEXT}</p>
      <button type="button" className="btn-main" onClick={onBack}>
        {FALLBACK_BACK_LABEL}
      </button>
    </div>
  );
}

interface Props {
  /** 「もどる」を押したときの遷移（ホームなど） */
  onBack: () => void;
  /** 例外を受けたときの通知（任意） */
  onError?: (error: Error) => void;
  /** 指定すると、既定の表示のかわりにこれを出す（別ルートの内側で使う） */
  fallback?: ReactNode;
  children?: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <ErrorFallback onBack={this.props.onBack} />;
  }
}

/** モードの描画は別の React ルートなので、そこで起きた例外はこのイベントで PlayScreen 側の境界へ渡す */
export const MODE_ERROR_EVENT = 'mode-render-error';
