// 保護者画面（§11.3）。子ども向け画面とは別の、大人向けの表示。
// 観察結果を医学的診断や「脳疲労度」として表示しない（受け入れテスト10）。

import { useMemo, useState } from 'react';
import type { Store } from '../../core/storage/db';
import type { AppData, ModeId, Session, TaskCategory, TimeOfDay } from '../../core/types';
import { GameRegistry } from '../../core/registry';
import { TASKS } from '../../core/storage/dataio';
import { formatJst, isoWithOffset, jstDateKey, TIME_OF_DAY_LABEL } from '../../core/time';
import { MODE_LABEL_PARENT, STAGE_LABEL_PARENT, TASK_LABEL_PARENT } from '../labels';
import { aggregate, allRows, dayRotation, heatAxis, heatCells, isGraded, preference, SEQ_STEPS, seqColor, transferStats, type Agg, type Row } from './analytics';
import { SettingsPanel } from './SettingsPanel';
import { DataPanel } from './DataPanel';

type Tab = 'overview' | 'compare' | 'heatmap' | 'history' | 'settings' | 'data';
const TABS: [Tab, string][] = [
  ['overview', '概要'],
  ['compare', 'モード比較'],
  ['heatmap', '組み合わせ別'],
  ['history', '履歴・観察メモ'],
  ['settings', '設定'],
  ['data', 'データ'],
];

interface Props {
  store: Store;
  onSaveProfile: (p: AppData['profile']) => void;
  onEndSession: () => void;
  sessionOpen: boolean;
  onClose: () => void;
}

export function ParentScreen({ store, onSaveProfile, onEndSession, sessionOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const data = store.data;
  const learning = data.profile.learning!;
  const rows = useMemo(() => allRows(data, learning.idleThresholdMs), [data, store.version, learning.idleThresholdMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="parent">
      <header className="parent-header">
        <h1>保護者画面</h1>
        <button type="button" className="p-btn" onClick={onClose}>
          子どもの画面にもどる
        </button>
      </header>
      {store.saveError && <div className="p-alert">{store.saveError}</div>}
      <nav className="p-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      <main className="p-main">
        {tab === 'overview' && <Overview store={store} rows={rows} sessionOpen={sessionOpen} onEndSession={onEndSession} />}
        {tab === 'compare' && <Compare rows={rows} store={store} />}
        {tab === 'heatmap' && <Heatmap rows={rows} store={store} />}
        {tab === 'history' && <History store={store} />}
        {tab === 'settings' && <SettingsPanel profile={data.profile} onSave={onSaveProfile} />}
        {tab === 'data' && <DataPanel store={store} />}
      </main>
    </div>
  );
}

const pct = (x: number, n: number) => (n ? `${Math.round((100 * x) / n)}%` : '—');
const sec = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}秒`);

function Cautions() {
  return (
    <ul className="p-cautions">
      <li>本人が選んだモードで遊んだ結果の<strong>観察</strong>です。統制された比較ではありません（§7.4）。</li>
      <li>正答率が高いことは、そのモードが合っている・負担が小さいことを意味しません。</li>
      <li>反応時間は補助の指標です。疲労や数え直しの推定には使いません。医学的な判断には使わないでください。</li>
    </ul>
  );
}

// ---------- 概要 ----------

function Overview({ store, rows, sessionOpen, onEndSession }: { store: Store; rows: Row[]; sessionOpen: boolean; onEndSession: () => void }) {
  const data = store.data;
  const today = jstDateKey(isoWithOffset());
  const modes = GameRegistry.all().map((p) => p.id);
  const pref = preference(rows);
  const tr = transferStats(rows);
  const days = new Set(rows.map((r) => r.day)).size;
  const reports = data.sessions.reduce<Record<string, number>>((acc, s) => {
    if (s.childSelfReport) acc[s.childSelfReport] = (acc[s.childSelfReport] ?? 0) + 1;
    return acc;
  }, {});
  const mr = store.migrationReport;
  return (
    <section className="p-section">
      <Cautions />
      <div className="p-cards">
        <div className="p-card">
          <div className="p-k">セッション</div>
          <div className="p-v">{data.sessions.length}</div>
        </div>
        <div className="p-card">
          <div className="p-k">試行</div>
          <div className="p-v">{rows.length}</div>
        </div>
        <div className="p-card">
          <div className="p-k">日数</div>
          <div className="p-v">{days}</div>
        </div>
        <div className="p-card">
          <div className="p-k">今日の最初のモード案（本人に希望がない日だけ）</div>
          <div className="p-v small">{MODE_LABEL_PARENT[dayRotation(modes, today)]}</div>
        </div>
      </div>
      {sessionOpen && (
        <p>
          いまのセッションは続いています。{' '}
          <button type="button" className="p-btn" onClick={onEndSession}>
            保護者がセッションを終える
          </button>
        </p>
      )}
      <h3>本人の選好の手がかり（機械ログ）</h3>
      <table className="p-table">
        <thead>
          <tr>
            <th>モード</th>
            <th>試行（探索を含む）</th>
            <th>うち自由探索</th>
            <th>セッションの最初に選んだ回数</th>
          </tr>
        </thead>
        <tbody>
          {modes.map((m) => (
            <tr key={m}>
              <td>{MODE_LABEL_PARENT[m]}</td>
              <td>{pref[m]?.trials ?? 0}</td>
              <td>{pref[m]?.exploreTrials ?? 0}</td>
              <td>{pref[m]?.firstOfSession ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>表現横断と後日再現（機械ログ）</h3>
      <table className="p-table">
        <tbody>
          <tr>
            <th>別の表現での初回（問題×表現）</th>
            <td>
              {tr.firstAttempts}件、初回で自力 {tr.firstIndependent}件
            </td>
          </tr>
          <tr>
            <th>　うち方略が同じ表現間</th>
            <td>
              {tr.sameStrategy.n}件、自力 {tr.sameStrategy.independent}件
            </td>
          </tr>
          <tr>
            <th>　うち方略が違う表現間（例: 減加法→加数法）</th>
            <td>
              {tr.diffStrategy.n}件、自力 {tr.diffStrategy.independent}件
            </td>
          </tr>
          <tr>
            <th>同じモード内の反復</th>
            <td>
              {tr.repeats.n}件、自力 {tr.repeats.independent}件
            </td>
          </tr>
          <tr>
            <th>後日再確認（前日以前の問題をもう一度）</th>
            <td>
              {tr.revisit.n}件、自力 {tr.revisit.independent}件
            </td>
          </tr>
        </tbody>
      </table>
      <h3>本人の自己報告</h3>
      <p>
        {Object.keys(reports).length === 0
          ? '記録なし（設定で「終わりに『どうだった？』を聞く」をONにした場合のみ）'
          : `よかった ${reports.good ?? 0}・ふつう ${reports.so_so ?? 0}・たいへんだった ${reports.tough ?? 0}・こたえない ${reports.no_answer ?? 0}`}
      </p>
      {mr && (
        <>
          <h3>v1 データの移行</h3>
          <p>
            v1 の記録 {mr.logCount}件から、{mr.sessionCount}セッション・{mr.trialCount}試行を移行しました（移行できなかった記録 {mr.skipped}件）。v1 の
            <code>fatigueWarning</code>（{mr.droppedFatigueWarnings}件）は仕様（§11.4）により移行していません。
          </p>
        </>
      )}
    </section>
  );
}

// ---------- モード比較 ----------

function Compare({ rows, store }: { rows: Row[]; store: Store }) {
  const learning = store.data.profile.learning!;
  const [tod, setTod] = useState<TimeOfDay | 'all'>('all');
  const [stage, setStage] = useState<'decide' | 'construct' | 'predict'>('decide');
  const filtered = rows.filter(
    (r) =>
      isGraded(r) &&
      (tod === 'all' || r.tod === tod) &&
      (stage === 'decide' || (stage === 'predict' ? r.trial.question.learningStage === 'predict' : r.trial.question.learningStage !== 'predict')),
  );
  const plugins = GameRegistry.all();
  return (
    <section className="p-section">
      <Cautions />
      <div className="p-filters">
        <label>
          時間帯
          <select value={tod} onChange={(e) => setTod(e.target.value as TimeOfDay | 'all')}>
            <option value="all">すべて</option>
            {(Object.keys(TIME_OF_DAY_LABEL) as TimeOfDay[]).map((t) => (
              <option key={t} value={t}>
                {TIME_OF_DAY_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          段階
          <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
            <option value="decide">決定点のある段階すべて</option>
            <option value="construct">本課題・表現横断・後日再確認</option>
            <option value="predict">予測</option>
          </select>
        </label>
      </div>
      <p className="p-note">
        比較（割合）は、モード×課題ごとに {learning.minTrialsForComparison}試行かつ {learning.minDaysForComparison}日以上のときだけ表示します（設定で変更可）。件数と日数は常に表示します。
      </p>
      <div className="p-scroll">
        <table className="p-table">
          <thead>
            <tr>
              <th>課題</th>
              <th>モード</th>
              <th>完了</th>
              <th>日数</th>
              <th>自力</th>
              <th>ヒント後</th>
              <th>実演後</th>
              <th>未完了</th>
              <th>スキップ</th>
              <th>中断</th>
              <th>操作時間の中央値（補助）</th>
              <th>最初の操作までの中央値（補助）</th>
            </tr>
          </thead>
          <tbody>
            {TASKS.flatMap((task) =>
              plugins
                .filter((p) => p.supportedTasks.includes(task))
                .map((p) => {
                  const a = aggregate(filtered.filter((r) => r.trial.modeId === p.id && r.trial.question.taskType === task));
                  const enough = a.n >= learning.minTrialsForComparison && a.days >= learning.minDaysForComparison;
                  const cell = (x: number) => (enough ? `${x}（${pct(x, a.n)}）` : `${x}`);
                  return (
                    <tr key={`${task}-${p.id}`} className={a.n === 0 && a.skipped === 0 ? 'muted' : ''}>
                      <td>{TASK_LABEL_PARENT[task]}</td>
                      <td>{MODE_LABEL_PARENT[p.id]}</td>
                      <td>{a.n}</td>
                      <td>{a.days}</td>
                      <td>{cell(a.independent)}</td>
                      <td>{cell(a.afterHint)}</td>
                      <td>{cell(a.afterDemo)}</td>
                      <td>{cell(a.notCompleted)}</td>
                      <td>{a.skipped}</td>
                      <td>{a.abandoned}</td>
                      <td>{enough ? sec(a.medianActiveMs) : '—'}</td>
                      <td>{enough ? sec(a.medianFirstMs) : '—'}</td>
                    </tr>
                  );
                }),
            )}
          </tbody>
        </table>
      </div>
      <p className="p-note">「未完了」は予測が外れた等で決定点を通らなかった試行、「スキップ」「中断」はそれとは別に数えています（受け入れテスト2）。ヒント後・実演後の正答は自力に含めていません（受け入れテスト1）。</p>
    </section>
  );
}

// ---------- 組み合わせ別（ヒートマップ） ----------

function Heatmap({ rows, store }: { rows: Row[]; store: Store }) {
  const learning = store.data.profile.learning!;
  const [task, setTask] = useState<TaskCategory>('carry_over');
  const [mode, setMode] = useState<ModeId | 'all'>('all');
  const [tod, setTod] = useState<TimeOfDay | 'all'>('all');
  const axis = heatAxis(task, learning.synthesisMax);
  const cells = heatCells(rows.filter((r) => (mode === 'all' || r.trial.modeId === mode) && (tod === 'all' || r.tod === tod)), task);
  const cols = axis.cols ?? [null];
  const render = (r: number, c: number | null) => {
    if (!axis.valid(r, c)) return <td key={String(c)} className="hm-na" aria-label="対象外" />;
    const a: Agg | undefined = cells.get(axis.key(r, c));
    if (!a || a.n === 0) return <td key={String(c)} className="hm-empty" title="記録なし" />;
    const { fill, ink } = seqColor(a.independent / a.n);
    const title = `${axis.key(r, c)}: 完了${a.n}件（${a.days}日）、自力${a.independent}・ヒント後${a.afterHint}・実演後${a.afterDemo}・未完了${a.notCompleted}、最初の操作まで中央値 ${sec(a.medianFirstMs)}`;
    return (
      <td key={String(c)} style={{ background: fill, color: ink }} title={title}>
        {a.independent}/{a.n}
      </td>
    );
  };
  return (
    <section className="p-section">
      <div className="p-filters">
        <label>
          課題
          <select value={task} onChange={(e) => setTask(e.target.value as TaskCategory)}>
            {TASKS.map((t) => (
              <option key={t} value={t}>
                {TASK_LABEL_PARENT[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          モード
          <select value={mode} onChange={(e) => setMode(e.target.value as ModeId | 'all')}>
            <option value="all">すべて</option>
            {GameRegistry.all().map((p) => (
              <option key={p.id} value={p.id}>
                {MODE_LABEL_PARENT[p.id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          時間帯
          <select value={tod} onChange={(e) => setTod(e.target.value as TimeOfDay | 'all')}>
            <option value="all">すべて</option>
            {(Object.keys(TIME_OF_DAY_LABEL) as TimeOfDay[]).map((t) => (
              <option key={t} value={t}>
                {TIME_OF_DAY_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="p-note">各マスは「自力で完了した数 / 完了した数」。色が濃いほど自力の割合が高い。マスに触れると内訳が出ます。少ない件数で傾向を決めつけないでください。</p>
      <div className="p-scroll">
        <table className="p-table hm">
          <thead>
            <tr>
              <th>
                {axis.rowLabel}
                {axis.cols ? ` ＼ ${axis.colLabel}` : ''}
              </th>
              {axis.cols ? axis.cols.map((c) => <th key={c}>{c}</th>) : <th>記録</th>}
            </tr>
          </thead>
          <tbody>
            {axis.rows.map((r) => (
              <tr key={r}>
                <th>{r}</th>
                {cols.map((c) => render(r, c))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hm-legend" aria-label="凡例">
        <span>自力の割合 低い</span>
        {SEQ_STEPS.map((c) => (
          <span key={c} className="hm-swatch" style={{ background: c }} />
        ))}
        <span>高い</span>
        <span className="hm-swatch hm-empty-swatch" />
        <span>記録なし</span>
      </div>
    </section>
  );
}

// ---------- 履歴・観察メモ ----------

const END_REASON: Record<NonNullable<Session['endReason']>, string> = {
  child_chose_end: '本人が終了',
  parent_ended: '保護者が終了',
  app_closed: 'アプリを閉じた',
  unknown: '不明',
};
const OUTCOME: Record<string, string> = { completed: '完了', skipped: 'スキップ', abandoned: '中断', explored: '探索・観察' };
const ASSIST: Record<string, string> = { independent: '自力', after_hint: 'ヒント後', after_demo: '実演後', not_completed: '未完了' };

function History({ store }: { store: Store }) {
  const sessions = store.data.sessions.slice().reverse();
  if (!sessions.length) return <p>まだ記録がありません。</p>;
  return (
    <section className="p-section">
      <p className="p-note">保護者の観察は、機械ログ・本人の自己報告とは別の欄として保存します。行動の解釈（例: あくび＝負荷）を選択肢にはしていません。気づいたことは自由記述へ。</p>
      {sessions.map((s) => (
        <details key={s.sessionId} className="p-session">
          <summary>
            {formatJst(s.startedAt)}（{TIME_OF_DAY_LABEL[s.timeOfDay]}）・{s.trials.length}試行・{s.endReason ? END_REASON[s.endReason] : '続いている'}
            {s.childSelfReport ? `・本人: ${{ good: 'よかった', so_so: 'ふつう', tough: 'たいへんだった', no_answer: 'こたえない' }[s.childSelfReport]}` : ''}
          </summary>
          <ObservationForm store={store} session={s} />
          <div className="p-scroll">
            <table className="p-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>時刻</th>
                  <th>モード</th>
                  <th>課題</th>
                  <th>段階</th>
                  <th>数</th>
                  <th>結果</th>
                  <th>ヒント</th>
                  <th>形が合わなかった回数</th>
                </tr>
              </thead>
              <tbody>
                {s.trials.map((t) => (
                  <tr key={t.trialId}>
                    <td>{t.orderInSession}</td>
                    <td>{t.startedAt ? formatJst(t.startedAt).slice(-5) : ''}</td>
                    <td>{MODE_LABEL_PARENT[t.modeId]}</td>
                    <td>{TASK_LABEL_PARENT[t.question.taskType]}</td>
                    <td>{STAGE_LABEL_PARENT[t.question.learningStage]}</td>
                    <td>{t.question.operands.join(', ')}</td>
                    <td>
                      {t.result ? OUTCOME[t.result.outcome] : '—'}
                      {t.result?.outcome === 'completed' ? `・${ASSIST[t.result.assistanceLevel]}` : ''}
                    </td>
                    <td>{t.result?.maxHintLevel ? `L${t.result.maxHintLevel}` : ''}</td>
                    <td>{t.result?.mistakeCount || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}

function ObservationForm({ store, session }: { store: Store; session: Session }) {
  const o = session.parentObservation ?? {};
  const [enjoyment, setEnjoyment] = useState(o.enjoyment ?? 'unknown');
  const [conditionNote, setCondition] = useState(o.conditionNote ?? '');
  const [note, setNote] = useState(o.note ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="p-obs"
      onSubmit={(e) => {
        e.preventDefault();
        void store.updateSession(session.sessionId, { parentObservation: { enjoyment, conditionNote, note } });
        setSaved(true);
      }}
    >
      <label>
        楽しんでいた様子（保護者の印象）
        <select value={enjoyment} onChange={(e) => setEnjoyment(e.target.value as typeof enjoyment)}>
          <option value="unknown">わからない</option>
          <option value="positive">楽しそう</option>
          <option value="neutral">ふつう</option>
          <option value="negative">楽しくなさそう</option>
        </select>
      </label>
      <label>
        体調・状況（前夜の睡眠など、自由記述）
        <input value={conditionNote} onChange={(e) => setCondition(e.target.value)} />
      </label>
      <label>
        メモ（自由記述）
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>
      <button type="submit" className="p-btn">
        保存
      </button>
      {saved && <span className="p-saved">保存しました</span>}
    </form>
  );
}
