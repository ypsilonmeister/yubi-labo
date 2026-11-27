// v2.16（§9.11）M の入口: 段と形式を本人が選ぶ。おまかせ進行には混ぜない。

import { useState } from 'react';
import type { AccessibilitySettings, KukuForm, KukuJudge } from '../../core/types';
import { ModeIcon } from '../icons';
import { KUKU_FORM_LABEL } from '../labels';

const DANS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const FORMS: Exclude<KukuForm, 'mix'>[] = ['up', 'down', 'shuffle'];

export function KukuSetupScreen(props: {
  s: Readonly<AccessibilitySettings>;
  judge: KukuJudge;
  onJudge: (j: KukuJudge) => void;
  /** mix では段を使わない */
  onStart: (form: KukuForm, dan: number) => void;
  onBack: () => void;
  initialDan?: number;
}) {
  const [dan, setDan] = useState<number | null>(props.initialDan ?? null);
  return (
    <div className="screen">
      <header className="screen-header">
        <button type="button" className="btn-icon" onClick={props.onBack} aria-label="もどる">
          ←
        </button>
        <ModeIcon mode="mode_m_kuku" s={props.s} size={40} />
        <h2>くくテスト れんしゅう</h2>
      </header>

      <h3 className="kuku-setup-title">なんの だん？</h3>
      <div className="kuku-dans" role="group" aria-label="だん">
        {DANS.map((d) => (
          <button key={d} type="button" className={`btn-soft kuku-pick${dan === d ? ' on' : ''}`} aria-pressed={dan === d} onClick={() => setDan(d)}>
            {d}の だん
          </button>
        ))}
      </div>

      <h3 className="kuku-setup-title">どの じゅんばん？</h3>
      <div className="kuku-forms">
        {FORMS.map((f) => (
          <button key={f} type="button" className="btn-main" disabled={dan === null} onClick={() => dan !== null && props.onStart(f, dan)}>
            {KUKU_FORM_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="kuku-forms">
        <button type="button" className="btn-soft" onClick={() => props.onStart('mix', dan ?? 1)}>
          {KUKU_FORM_LABEL.mix}
        </button>
      </div>

      <h3 className="kuku-setup-title">こたえを きく ひと</h3>
      <div className="kuku-forms" role="group" aria-label="こたえを きく ひと">
        {(
          [
            ['self', 'じぶん'],
            ['parent', 'おうちの ひと'],
          ] as [KukuJudge, string][]
        ).map(([j, label]) => (
          <button key={j} type="button" className={`btn-soft kuku-pick${props.judge === j ? ' on' : ''}`} aria-pressed={props.judge === j} onClick={() => props.onJudge(j)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
