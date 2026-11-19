import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { ErrorBoundary, ErrorFallback, FALLBACK_BACK_LABEL, FALLBACK_TEXT } from '../app/ErrorBoundary';
import { buildQuestion } from '../core/engine/questions';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../core/settings';

/** 要素の木から onClick を持つ button を探す */
function findButton(node: ReactNode): ReactElement<{ onClick: () => void; children?: ReactNode }> | null {
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<{ onClick?: () => void; children?: ReactNode; type?: string }>;
  if (el.type === 'button') return el as never;
  const kids = el.props.children;
  for (const k of Array.isArray(kids) ? kids : [kids]) {
    const f = findButton(k);
    if (f) return f;
  }
  return null;
}

describe('ErrorBoundary（Issue #25）', () => {
  it('例外を受けると failed になり、通常時は子をそのまま出す', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const ok = new ErrorBoundary({ onBack: () => {}, children: 'child' });
    expect(ok.render()).toBe('child');
  });

  it('例外時は中立な文言と「もどる」だけを出し、押すとホームへ戻る遷移が呼ばれる', () => {
    const onBack = vi.fn();
    const b = new ErrorBoundary({ onBack });
    b.state = ErrorBoundary.getDerivedStateFromError();
    const out = b.render();
    const html = renderToStaticMarkup(out as ReactElement);
    expect(html).toContain(FALLBACK_TEXT);
    expect(html).toContain(FALLBACK_BACK_LABEL);
    for (const bad of ['ざんねん', 'エラー', 'だめ', 'まちがい', '!']) expect(html).not.toContain(bad);
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    // 押すと onBack
    const btn = findButton(ErrorFallback({ onBack }));
    expect(btn).not.toBeNull();
    btn!.props.onClick();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('「もどる」は共通の大きいボタン（btn-main、styles.css で min-height 56px）で、赤い装飾を持たない', () => {
    expect(renderToStaticMarkup(<ErrorFallback onBack={() => {}} />)).toContain('btn-main');
  });

  it('fallback を渡すと既定の表示のかわりにそれを出す（別ルート内側用）', () => {
    const b = new ErrorBoundary({ onBack: () => {}, fallback: null });
    b.state = { failed: true };
    expect(b.render()).toBeNull();
  });

  it('onError に例外が渡される', () => {
    const onError = vi.fn();
    const b = new ErrorBoundary({ onBack: () => {}, onError });
    const e = new Error('boom');
    b.componentDidCatch(e);
    expect(onError).toHaveBeenCalledWith(e);
  });
});

describe('例外直前の記録', () => {
  beforeAll(() => {
    const target = new EventTarget();
    Object.assign(target, { hidden: false });
    Object.assign(globalThis, { document: target, window: target });
  });

  it('完了済みの試行は保存済みで、描画例外でアンマウント（中断）されても残る', async () => {
    const { SessionEngine } = await import('../core/engine/SessionEngine');
    const saved: { trials: { result?: { outcome: string } }[] }[] = [];
    const store = { saveSession: (s: never) => saved.push(s), flush: async () => {} };
    const engine = new SessionEngine(store as never, () => DEFAULT_SETTINGS, () => DEFAULT_LEARNING);
    const q = buildQuestion('carry_over', [8, 5], 'mode_c_tenframe', 'construct', DEFAULT_SETTINGS, DEFAULT_LEARNING);
    const h1 = engine.startTrial('mode_c_tenframe', q, () => {});
    h1.context.complete({ outcome: 'completed', assistanceLevel: 'independent', correctWithoutHint: true, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 });
    const h2 = engine.startTrial('mode_c_tenframe', q, () => {});
    // 例外 → PlayScreen のアンマウントで cleanup が走る
    h2.close('abandoned');
    const last = saved[saved.length - 1];
    expect(last.trials.map((t) => t.result?.outcome)).toEqual(['completed', 'abandoned']);
  });
});
