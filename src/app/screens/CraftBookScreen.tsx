// §8.5 クラフト図鑑: 作ったものだけを見せる。正答率・速さ・ヒント・ミスは表示しない。
// 収集のプレッシャーにならないよう、まだ作っていない空きページは出さない。
// v2.3: 同じ数のページに、合わせた（sum）だけでなく、長方形・素数の石・釣り合い・倍々・分数・れっしゃの発見も並ぶ。

import type { ReactNode } from 'react';
import type { AccessibilitySettings, CraftEntry } from '../../core/types';
import { numberColor, OUTLINE, TILE } from '../../core/colors';
import { PlateIcon } from '../../modes/shared/Plate';
import { ShapeGlyph } from '../../modes/geoboard/ShapeGlyph';

type S = Readonly<AccessibilitySettings>;

function Grid({ rows, cols, prime }: { rows: number; cols: number; prime?: boolean }) {
  const c = Math.max(4, Math.min(10, 64 / Math.max(rows, cols)));
  return (
    <svg width={cols * c + 4} height={rows * c + 4} viewBox={`-2 -2 ${cols * c + 4} ${rows * c + 4}`} aria-hidden>
      {Array.from({ length: rows * cols }, (_, i) => (
        <rect key={i} x={(i % cols) * c} y={Math.floor(i / cols) * c} width={c - 1} height={c - 1} rx={1} fill={prime ? TILE.prime : TILE.fill} stroke={prime ? TILE.primeStroke : TILE.stroke} strokeWidth={0.8} />
      ))}
      <rect x={-1} y={-1} width={cols * c + 1} height={rows * c + 1} fill="none" stroke={prime ? TILE.primeStroke : TILE.glow} strokeWidth={1.5} rx={2} />
    </svg>
  );
}

function MiniRods({ parts, s }: { parts: number[]; s: S }) {
  const u = 5;
  const w = parts.reduce((a, b) => a + b, 0) * u;
  let x = 0;
  return (
    <svg width={w + 4} height={14} viewBox={`-2 -2 ${w + 4} 14`} aria-hidden>
      {parts.map((p, i) => {
        const el = <rect key={i} x={x} y={0} width={p * u} height={10} rx={2} fill={numberColor(p, s.colorScheme)} stroke={OUTLINE} strokeWidth={1} />;
        x += p * u;
        return el;
      })}
    </svg>
  );
}

function Pie({ parts }: { parts: number }) {
  const r = 14;
  return (
    <svg width={34} height={34} viewBox="-17 -17 34 34" aria-hidden>
      <circle r={r} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1.5} />
      {Array.from({ length: parts }, (_, i) => {
        const a = (i / parts) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} x1={0} y1={0} x2={Math.cos(a) * r} y2={Math.sin(a) * r} stroke={OUTLINE} strokeWidth={1.2} />;
      })}
    </svg>
  );
}

function Dots({ n }: { n: number }) {
  const per = Math.min(5, n);
  const rows = Math.ceil(n / per);
  return (
    <svg width={per * 8 + 2} height={rows * 8 + 2} viewBox={`-1 -1 ${per * 8 + 2} ${rows * 8 + 2}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={(i % per) * 8 + 4} cy={Math.floor(i / per) * 8 + 4} r={3} fill={TILE.fill} stroke={OUTLINE} strokeWidth={0.8} />
      ))}
    </svg>
  );
}

/** 1つの発見の絵 */
function Discovery({ e, s }: { e: CraftEntry; s: S }) {
  const c = (n: number) => numberColor(n, s.colorScheme);
  switch (e.kind ?? 'sum') {
    case 'product':
      return <Grid rows={e.parts[0]} cols={e.parts[1]} />;
    case 'prime':
      return (
        <span className="book-prime">
          <Grid rows={1} cols={e.parts[0]} prime />
          <span aria-hidden>✦</span>
        </span>
      );
    case 'balance': {
      const sep = e.parts.indexOf(0);
      return (
        <span className="book-balance">
          <MiniRods parts={e.parts.slice(0, sep)} s={s} />
          <span className="book-to" aria-hidden>
            ⚖
          </span>
          <MiniRods parts={e.parts.slice(sep + 1)} s={s} />
        </span>
      );
    }
    case 'power':
      return (
        <span className="book-balance">
          <Dots n={e.parts[0]} />
          <span className="book-to" aria-hidden>
            {'›'.repeat(Math.min(12, e.parts[1]))}
          </span>
        </span>
      );
    case 'fraction':
      return <Pie parts={e.parts[0]} />;
    case 'shape':
      return <ShapeGlyph code={e.parts[0]} />;
    case 'period':
      return (
        <span className="book-trains">
          <MiniRods parts={Array(Math.min(30, e.value / e.parts[0])).fill(e.parts[0])} s={s} />
          <MiniRods parts={Array(Math.min(30, e.value / e.parts[1])).fill(e.parts[1])} s={s} />
        </span>
      );
    default:
      return (
        <>
          {e.parts.map((p, i) => (
            <span key={i} className="book-part">
              {i > 0 && <span className="book-to">と</span>}
              <PlateIcon n={p} color={c(p)} cell={11} />
            </span>
          ))}
        </>
      );
  }
}

/** ページの見出しの絵。20 までは偶奇プレート、それより大きい数は 1000・100・10・1 のブロック */
function PageIcon({ value, s }: { value: number; s: S }): ReactNode {
  if (value <= 20) return <PlateIcon n={value} color={numberColor(Math.min(value, 10), s.colorScheme)} cell={16} />;
  const digits = String(Math.min(value, 99999)).split('').map(Number).reverse(); // 1, 10, 100, ...
  const out: ReactNode[] = [];
  let x = 0;
  for (let place = digits.length - 1; place >= 0; place--) {
    const n = digits[place];
    const size = 6 + place * 5;
    for (let i = 0; i < n; i++) out.push(<rect key={`${place}-${i}`} x={x + (i % 3) * (size + 2)} y={Math.floor(i / 3) * (size + 2)} width={size} height={size} rx={2} fill={TILE.fill} stroke={OUTLINE} strokeWidth={1} />);
    if (n) x += Math.min(3, n) * (size + 2) + 6;
  }
  return (
    <svg width={x + 4} height={64} viewBox={`-2 -2 ${x + 4} 64`} aria-hidden>
      {out}
    </svg>
  );
}

export function CraftBookScreen({ entries, s, onBack }: { entries: CraftEntry[]; s: S; onBack: () => void }) {
  const byValue = new Map<number, CraftEntry[]>();
  for (const e of entries) byValue.set(e.value, [...(byValue.get(e.value) ?? []), e]);
  const pages = [...byValue.entries()].sort((a, b) => a[0] - b[0]);
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
            <section key={value} className={`book-page${list.some((e) => e.kind === 'prime') ? ' is-prime' : ''}`}>
              <div className="book-made">
                <PageIcon value={value} s={s} />
              </div>
              <ul className="book-combos">
                {list
                  .slice()
                  .sort((x, y) => new Date(x.firstMadeAt).getTime() - new Date(y.firstMadeAt).getTime())
                  .map((e) => (
                    <li key={`${e.kind ?? 'sum'}:${e.parts.join('+')}`}>
                      <Discovery e={e} s={s} />
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
