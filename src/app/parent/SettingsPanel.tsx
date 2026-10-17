import type { AccessibilitySettings, AppData, LearningSettings } from '../../core/types';
import { DEFAULT_LEARNING, DEFAULT_SETTINGS } from '../../core/settings';

type Opt<T> = [T, string][];

interface Field<K> {
  key: K;
  label: string;
  help?: string;
  options?: Opt<string | number | boolean>;
  number?: { min: number; max: number; step: number };
  text?: boolean;
}

const A11Y: Field<keyof AccessibilitySettings>[] = [
  { key: 'soundEnabled', label: '音', help: '初期はOFF。ONでも成功時のやわらかい音だけで、間違いの音はありません。音なしで全課題が完了できます。', options: [[false, 'OFF'], [true, 'ON']] },
  { key: 'quietMode', label: '静かなモード', help: '星などの演出と音を止め、演出を「おだやか」以下にします。', options: [[false, 'OFF'], [true, 'ON']] },
  { key: 'effectLevel', label: '成功演出の強さ', help: '正解が続いても強くなりません。', options: [['none', 'なし'], ['calm', 'おだやか（初期）'], ['normal', 'ふつう']] },
  { key: 'reducedMotion', label: '動きを減らす', help: 'OSの「視差効果を減らす」設定も反映します。動きの代わりに状態を1つずつ切り替えて見せます。', options: [[false, 'OFF'], [true, 'ON']] },
  { key: 'animationSpeed', label: '分解・合体の速さ', options: [['slow', 'ゆっくり'], ['normal', 'ふつう'], ['instant', 'すぐ（動かさない）']] },
  { key: 'inputMethod', label: '操作', help: 'タップ（選ぶ→置き先をタップ）は常に使えます。「ドラッグも使う」にすると、置き先へ引っぱって置くこともできます。', options: [['tap', 'タップ'], ['drag', 'ドラッグも使う']] },
  { key: 'showEquationOnRequest', label: '「かずで みる」ボタン', help: '本人が押したときだけ数・式を表示します（答えは問題が終わってから）。', options: [[true, '表示する'], [false, '表示しない']] },
  { key: 'highlightEmptySlots', label: '空席の強調', help: '静的な輪郭と明るさの差で示します（点滅はしません）。', options: [[true, 'する'], [false, 'しない']] },
  { key: 'colorScheme', label: '配色（全モード共通）', help: '色だけで答えが分かる課題はありません。', options: [['cuisenaire', 'キュイゼネール'], ['unified', '独自の共通配色'], ['mono', '単色（形・長さのみ）']] },
  { key: 'tenFrameFill', label: '10フレームの埋め方', options: [['pairs', '左の列から上下1組ずつ（初期）'], ['fives', '上段5個のあと下段']] },
  { key: 'carryFirstOperand', label: '繰り上がりで先にフレームに入れる数', options: [['larger', '大きい方（初期）'], ['first', '先に出た数']] },
  { key: 'borrowStrategy', label: '繰り下がりの方略（C）', help: 'D（両替）は常に加数法（お釣り）です。', options: [['subtract_from_ten', '減加法（初期）'], ['subtract_subtract', '減減法']] },
  { key: 'fiveToken', label: '5トークン（D）', help: 'ONでは 1が5枚で5、5が2枚で10 に交換します。', options: [[false, 'OFF'], [true, 'ON']] },
];

const LEARN: Field<keyof LearningSettings>[] = [
  { key: 'choiceCount', label: '選択肢の数', options: [[2, '2'], [3, '3（初期）'], [4, '4']] },
  { key: 'synthesisMax', label: '合成の範囲', options: [[5, '5まで（初期）'], [10, '10まで']] },
  { key: 'craftBookEnabled', label: 'クラフト図鑑（つくったもの）', help: '作ったものだけを残します。正答率・速さ・ヒント回数は出しません（§8.5・保護者が判断）。', options: [[true, '使う'], [false, '使わない']] },
  { key: 'selfReportEnabled', label: '終わりに「どうだった？」を聞く', help: '3択＋「こたえない」。初期はOFF。', options: [[false, '聞かない'], [true, '聞く']] },
  { key: 'minTrialsForComparison', label: '比較を表示する最低試行数', number: { min: 1, max: 100, step: 1 } },
  { key: 'minDaysForComparison', label: '比較を表示する最低日数', number: { min: 1, max: 30, step: 1 } },
  { key: 'idleThresholdMs', label: '無操作とみなす時間（ミリ秒・分析用）', number: { min: 1000, max: 120000, step: 1000 } },
];

function Control<K extends string>({ f, value, onChange }: { f: Field<K>; value: unknown; onChange: (v: unknown) => void }) {
  if (f.options)
    return (
      <div className="p-seg" role="radiogroup" aria-label={f.label}>
        {f.options.map(([v, label]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {label}
          </button>
        ))}
      </div>
    );
  if (f.number) return <input type="number" min={f.number.min} max={f.number.max} step={f.number.step} value={Number(value)} onChange={(e) => onChange(Math.max(f.number!.min, Math.min(f.number!.max, Number(e.target.value) || f.number!.min)))} />;
  return null;
}

export function SettingsPanel({ profile, onSave }: { profile: AppData['profile']; onSave: (p: AppData['profile']) => void }) {
  const s = profile.settings;
  const l = profile.learning ?? DEFAULT_LEARNING;
  return (
    <section className="p-section">
      <h3>表示・操作</h3>
      <div className="p-form">
        {A11Y.map((f) => (
          <div key={f.key} className="p-row">
            <div className="p-label">
              {f.label}
              {f.help && <small>{f.help}</small>}
            </div>
            <Control f={f} value={s[f.key]} onChange={(v) => onSave({ ...profile, settings: { ...s, [f.key]: v } })} />
          </div>
        ))}
      </div>
      <h3>出題・記録</h3>
      <div className="p-form">
        <div className="p-row">
          <div className="p-label">
            記録上の呼び名
            <small>実名でなくてかまいません。匿名化エクスポートでは除かれます。</small>
          </div>
          <input value={profile.playerLabel} onChange={(e) => onSave({ ...profile, playerLabel: e.target.value })} />
        </div>
        {LEARN.map((f) => (
          <div key={f.key} className="p-row">
            <div className="p-label">
              {f.label}
              {f.help && <small>{f.help}</small>}
            </div>
            <Control f={f} value={l[f.key]} onChange={(v) => onSave({ ...profile, learning: { ...l, [f.key]: v } })} />
          </div>
        ))}
      </div>
      <button type="button" className="p-btn" onClick={() => onSave({ ...profile, settings: { ...DEFAULT_SETTINGS }, learning: { ...DEFAULT_LEARNING } })}>
        初期設定にもどす
      </button>
    </section>
  );
}
