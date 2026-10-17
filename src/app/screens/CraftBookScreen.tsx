// §8.5 クラフト図鑑: 作ったものだけを見せる。正答率・速さ・ヒント・ミスは表示しない。
// 収集のプレッシャーにならないよう、まだ作っていない空きページは出さない。

import type { AccessibilitySettings, CraftEntry } from '../../core/types';
import { numberColor } from '../../core/colors';
import { PlateIcon } from '../../modes/shared/Plate';

export function CraftBookScreen({ entries, s, onBack }: { entries: CraftEntry[]; s: Readonly<AccessibilitySettings>; onBack: () => void }) {
  const byValue = new Map<number, CraftEntry[]>();
  for (const e of entries) byValue.set(e.value, [...(byValue.get(e.value) ?? []), e]);
  const pages = [...byValue.entries()].sort((a, b) => a[0] - b[0]);
  const c = (n: number) => numberColor(n, s.colorScheme);
  return (
    <div className="screen">
      <header className="screen-header">
        <button type="button" className="btn-icon" onClick={onBack} aria-label="もどる">
          ←
        </button>
        <h2>つくった もの</h2>
      </header>
      {pages.length === 0 ? (
        <p className="muted center-text">くっつけて つくった ものが ここに のこるよ</p>
      ) : (
        <div className="book">
          {pages.map(([value, list]) => (
            <section key={value} className="book-page">
              <div className="book-made">
                <PlateIcon n={value} color={c(Math.min(value, 10))} cell={16} />
              </div>
              <ul className="book-combos">
                {list
                  .slice()
                  .sort((x, y) => new Date(x.firstMadeAt).getTime() - new Date(y.firstMadeAt).getTime())
                  .map((e) => (
                    <li key={e.parts.join('+')}>
                      {e.parts.map((p, i) => (
                        <span key={i} className="book-part">
                          {i > 0 && <span className="book-to">と</span>}
                          <PlateIcon n={p} color={c(p)} cell={11} />
                        </span>
                      ))}
                    </li>
                  ))}
              </ul>
              <div className="book-value">{value}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
