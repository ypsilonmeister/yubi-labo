// 実装拡張（v2.2）: ワンタップ・オートスナップ。
// タップした手札（DOM 要素）の写しを、置き先（data-drop）の中心へ飛ばしてから置く。
// 動きを減らす設定・速さ「すぐ」では ms = 0 で、飛ばさずにすぐ置く。

export interface Snap {
  /** 置き先の data-drop */
  to: string;
  /** 飛ばす時間（ミリ秒）。0 なら飛ばさない */
  ms: number;
  /** 演出を Animator で包む（入力不可の時間を反応時間から除くため）。取り消されたら false */
  run: (fly: () => Promise<void>) => Promise<boolean>;
}

export function findDrop(from: Element, to: string): Element | null {
  const root = from.closest('.mode') ?? document;
  return root.querySelector(`[data-drop="${to}"]`);
}

/** 要素の写しを置き先へ飛ばす。終わったら写しを消す */
export function flyTo(sources: Element[], target: Element | null, ms: number): Promise<void> {
  if (!target || ms <= 0 || !sources.length || typeof document === 'undefined') return Promise.resolve();
  const t = target.getBoundingClientRect();
  const tx = t.left + t.width / 2;
  const ty = t.top + t.height / 2;
  const layer = document.createElement('div');
  layer.className = 'snap-layer';
  document.body.appendChild(layer);
  const anims = sources.map((src, i) => {
    const r = src.getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.classList.add('snap-ghost');
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    layer.appendChild(ghost);
    const dx = tx - (r.left + r.width / 2) + ((i % 2) - 0.5) * Math.min(24, t.width / 6) * (sources.length > 1 ? 1 : 0);
    const dy = ty - (r.top + r.height / 2);
    if (typeof ghost.animate !== 'function') return Promise.resolve();
    return ghost
      .animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 30}px) scale(0.95)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.2 },
        ],
        { duration: ms, delay: i * Math.min(40, ms / 10), easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' },
      )
      .finished.then(
        () => undefined,
        () => undefined,
      );
  });
  return Promise.all(anims).then(() => layer.remove());
}
