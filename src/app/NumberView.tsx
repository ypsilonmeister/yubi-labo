// 任意の「数で見る」（§8.2, §7.5）。本人がボタンを押したときだけ出す。
// 答えは試行が終わるまで出さない。最終段階で、望めば学校の表記（さくらんぼ）との対応を見られる。

import { useState } from 'react';
import type { Question } from '../core/types';
import type { AccessibilitySettings } from '../core/types';
import { borrowPlan, carryPlan } from '../core/math/tenframe';
import { countUpPlan } from '../core/math/coins';

function lines(q: Question, revealed: boolean, s: Readonly<AccessibilitySettings>): string[] {
  const [a, b] = q.operands;
  switch (q.taskType) {
    case 'subitizing_678':
      return revealed ? [`${a}`] : [];
    case 'numeral_quantity':
      return revealed ? [`${a}`] : [];
    case 'synthesis_5':
      if (!revealed) return q.learningStage === 'predict' ? [`${a} と ${b} で ？`] : [`${a} と ？ で ${a + b}`];
      return [`${a} と ${b} で ${a + b}`, `${a} + ${b} = ${a + b}`];
    case 'complement_10':
      return revealed ? [`${a} と ${10 - a} で 10`, `${a} + ${10 - a} = 10`] : [`${a} と ？ で 10`];
    case 'carry_over': {
      if (!revealed) return [`${a} + ${b}`];
      const p = carryPlan(a, b, s.carryFirstOperand);
      return [`${p.second} を ${p.toFill} と ${p.rest} に わける`, `${p.first} と ${p.toFill} で 10`, `10 と ${p.rest} で ${p.result}`, `${a} + ${b} = ${a + b}`];
    }
    case 'borrow': {
      if (!revealed) return [`${a} − ${b}`];
      if (q.strategy === 'count_up') {
        const p = countUpPlan(a, b);
        return [`${b} と ${p.toTen} で 10`, `${p.toTen} と ${p.paidOnes} で ${p.change}`, `${a} − ${b} = ${a - b}`];
      }
      const p = borrowPlan(a, b, q.strategy === 'subtract_subtract' ? 'subtract_subtract' : 'subtract_from_ten');
      if (p.strategy === 'subtract_from_ten')
        return [`10 を ${p.split[0]} と ${p.split[1]} に わける`, `${p.split[0]} を とる`, `${p.split[1]} と ${p.ones} で ${p.result}`, `${a} − ${b} = ${a - b}`];
      return [`${b} を ${p.split[0]} と ${p.split[1]} に わける`, `${p.split[0]} を とる`, `10 から ${p.split[1]} を とって ${p.result}`, `${a} − ${b} = ${a - b}`];
    }
    case 'balance': {
      // v2.3: 左の重りは 10 と のこり（10以下なら1つ）
      const left = a > 10 ? `10 + ${a - 10}` : `${a}`;
      return revealed ? [`${left} = ${b} + ${a - b}`] : [`${left} = ${b} + ？`];
    }
    case 'arrays':
    case 'doubling':
    case 'period':
      return [];
    case 'halving': {
      // v2.7: 出題中は「〜の はんぶん は ？」だけ。答えは試行が終わってから
      if (!revealed) return [`${a} の はんぶん は ？`];
      const h = a / 2;
      return [`${h} と ${h} で ${a}`, `${a} の はんぶん は ${h}`];
    }
  }
}

/** 学校の表記（さくらんぼ）。分ける数の下に2つの枝を描く */
function Cherry({ q, s }: { q: Question; s: Readonly<AccessibilitySettings> }) {
  const [a, b] = q.operands;
  let left: string;
  let right: string;
  let result: number;
  let splitIndex: 0 | 1;
  let parts: [number, number];
  if (q.taskType === 'carry_over') {
    const p = carryPlan(a, b, s.carryFirstOperand);
    left = String(a);
    right = String(b);
    result = a + b;
    // 先にフレームに入れない方（second）を分ける
    splitIndex = s.carryFirstOperand === 'larger' ? (a >= b ? 1 : 0) : 1;
    parts = [p.toFill, p.rest];
  } else if (q.taskType === 'borrow' && q.strategy !== 'count_up') {
    const p = borrowPlan(a, b, q.strategy === 'subtract_subtract' ? 'subtract_subtract' : 'subtract_from_ten');
    left = String(a);
    right = String(b);
    result = a - b;
    if (p.strategy === 'subtract_from_ten') {
      splitIndex = 0;
      parts = [10, p.ones];
    } else {
      splitIndex = 1;
      parts = [p.split[0], p.split[1]];
    }
  } else return null;
  const op = q.taskType === 'carry_over' ? '+' : '−';
  const xs = [60, 160];
  const sx = xs[splitIndex];
  return (
    <svg viewBox="0 0 320 170" width={320} height={170} className="cherry" aria-label="がっこうの かきかた">
      <text x={xs[0]} y={50} textAnchor="middle" fontSize={40} fontWeight={700}>
        {left}
      </text>
      <text x={110} y={50} textAnchor="middle" fontSize={40}>
        {op}
      </text>
      <text x={xs[1]} y={50} textAnchor="middle" fontSize={40} fontWeight={700}>
        {right}
      </text>
      <text x={250} y={50} textAnchor="middle" fontSize={40}>
        = {result}
      </text>
      <path d={`M${sx} 60 L${sx - 28} 105 M${sx} 60 L${sx + 28} 105`} stroke="#3a3226" strokeWidth={3} fill="none" />
      {[sx - 32, sx + 32].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy={130} r={24} fill="#fff" stroke="#3a3226" strokeWidth={3} />
          <text x={cx} y={141} textAnchor="middle" fontSize={28} fontWeight={700}>
            {parts[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function NumberView({ q, revealed, s }: { q: Question; revealed: boolean; s: Readonly<AccessibilitySettings> }) {
  const [school, setSchool] = useState(false);
  const ls = q.learningStage === 'explore' ? [] : lines(q, revealed, s);
  const canSchool = revealed && (q.taskType === 'carry_over' || (q.taskType === 'borrow' && q.strategy !== 'count_up'));
  return (
    <div className="number-view" aria-live="polite">
      {ls.length === 0 ? <span className="nv-muted">（かずは ここに でるよ）</span> : ls.map((l, i) => <div key={i} className={i === ls.length - 1 && revealed ? 'nv-line nv-final' : 'nv-line'}>{l}</div>)}
      {canSchool && (
        <div className="nv-school">
          <button type="button" className="btn-soft small" onClick={() => setSchool((x) => !x)} aria-pressed={school}>
            がっこうの かきかた
          </button>
          {school && <Cherry q={q} s={s} />}
        </div>
      )}
    </div>
  );
}
