// v2.16（§9.11）M の画面の見た目。状態を持たない（テストで「答えを見るまで出ない」ことを確かめられるようにする）。

import { descendingSequence, kukuAnchor, type KukuPair } from '../../core/math/kuku';
import { OUTLINE, SLOT_STROKE, TILE } from '../../core/colors';
import type { KukuForm, KukuJudge } from '../../core/types';

export interface KukuBoardProps {
  pair: KukuPair;
  form: KukuForm;
  judge: KukuJudge;
  /** 「こたえを みる」を押した */
  revealed: boolean;
  /** 「いえた／まだ」を押した（どちらを押したかは画面に出さない） */
  reported: boolean;
  hint: boolean;
  /** くだりの並びを見せる */
  sequence: boolean;
  onReveal: () => void;
  onReport: (said: boolean) => void;
  onToggleSequence: () => void;
  /** 読み上げが使えるときだけ */
  onSpeak?: () => void;
}

function Sequence({ pair: [dan, m], revealed }: { pair: KukuPair; revealed: boolean }) {
  return (
    <ol className="kuku-sequence" aria-label={`こたえの ならび（${dan}ずつ へる）`}>
      {descendingSequence(dan, m, revealed).map((slot, i) => (
        <li key={slot.multiplier}>
          {i > 0 && <span className="kuku-step">−{dan}</span>}
          <span className={`kuku-chip${slot.current ? ' now' : ''}`}>{slot.value ?? (slot.current ? '？' : '・')}</span>
        </li>
      ))}
    </ol>
  );
}

/** 手がかりの数の並びと、段の数を1れつにしたタイルの図。文章では説明しない */
function AnchorHint({ pair: [dan, m], revealed }: { pair: KukuPair; revealed: boolean }) {
  const a = kukuAnchor(dan, m);
  const from = a?.multiplier ?? m;
  const rows = Math.max(from, m);
  const cell = 18;
  const gap = 3;
  return (
    <div className="kuku-hint" aria-label="ヒント">
      <div className="kuku-hint-row">
        {a ? (
          <>
            <span className="kuku-anchor">
              {dan} × {a.multiplier} = <span className="kuku-chip">{a.value}</span>
            </span>
            {Array.from({ length: Math.abs(a.steps) }, (_, i) => (
              <span key={i} className="kuku-step big">
                {a.steps > 0 ? '+' : '−'}
                {dan}
              </span>
            ))}
            <span aria-hidden>→</span>
            <span className="kuku-chip now">{revealed ? dan * m : '？'}</span>
          </>
        ) : (
          <span className="kuku-anchor">{dan} × 1</span>
        )}
      </div>
      {/* 実線: いまの式の れつ。太い枠: たす れつ。点線: ひく れつ */}
      <svg className="kuku-array" viewBox={`-3 -3 ${dan * (cell + gap) + 3} ${rows * (cell + gap) + 3}`} width={dan * (cell + gap) + 3} height={rows * (cell + gap) + 3} aria-hidden>
        {Array.from({ length: rows }, (_, r) => {
          const kind = r >= m ? 'removed' : r >= from ? 'added' : 'base';
          return (
            <g key={r} data-row={kind}>
              {Array.from({ length: dan }, (_, c) => (
                <rect
                  key={c}
                  x={c * (cell + gap)}
                  y={r * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={3}
                  fill={kind === 'removed' ? 'none' : TILE.fill}
                  stroke={kind === 'removed' ? SLOT_STROKE : kind === 'added' ? OUTLINE : TILE.stroke}
                  strokeWidth={kind === 'added' ? 3 : 1.5}
                  strokeDasharray={kind === 'removed' ? '4 3' : undefined}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function KukuBoard(p: KukuBoardProps) {
  const [dan, m] = p.pair;
  return (
    <div className="kuku">
      <div className="mode-prompt">
        {p.reported ? 'きろく したよ' : p.revealed ? (p.judge === 'parent' ? 'きいていた おうちの ひとが おしてね' : 'こえに だして いえたかな？') : 'こえに だして こたえてから、こたえを みよう'}
      </div>
      {p.form === 'down' && (
        <div className="kuku-sequence-area">
          {p.sequence && <Sequence pair={p.pair} revealed={p.revealed} />}
          <button type="button" className="btn-soft small" onClick={p.onToggleSequence} aria-pressed={p.sequence}>
            {p.sequence ? 'ならびを かくす' : 'ならびを みる'}
          </button>
        </div>
      )}
      <div className="kuku-expression">
        <span>
          {dan} × {m}
        </span>
        {p.revealed && (
          <span className="kuku-answer" aria-live="polite">
            = {dan * m}
          </span>
        )}
      </div>
      {p.onSpeak && (
        <button type="button" className="btn-soft small" onClick={p.onSpeak}>
          🔊 しきを きく
        </button>
      )}
      {p.hint && <AnchorHint pair={p.pair} revealed={p.revealed} />}
      <div className="kuku-actions">
        {!p.revealed ? (
          <button type="button" className="btn-main big" onClick={p.onReveal}>
            こたえを みる
          </button>
        ) : (
          !p.reported && (
            // どちらも同じ見た目（まだ を よくないことに見せない §8.2）
            <>
              <button type="button" className="btn-soft kuku-report" onClick={() => p.onReport(true)}>
                いえた
              </button>
              <button type="button" className="btn-soft kuku-report" onClick={() => p.onReport(false)}>
                まだ
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}
