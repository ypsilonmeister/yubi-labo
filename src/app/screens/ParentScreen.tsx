import { useEffect, useMemo, useRef, useState } from 'react';
import { audioGuide } from '../../core/audio/AudioGuide';
import {
  exportAll,
  getAllSessions,
  getProgress,
  getSetting,
  importAll,
  isMemoryMode,
  setSetting,
  type ExportData,
  type SessionRecord,
} from '../../core/storage/db';
import { KANJI_ENTRIES } from '../../games/kanji/data';
import { MAZE_LEVELS } from '../../games/maze/levels';
import {
  loadEnabledKanjiIds,
  loadKanjiProgress,
  saveEnabledKanjiIds,
  type KanjiProgressMap,
} from '../../games/kanji/scheduler';

// SPEC §4.7 — 保護者画面（P5）。日本語テキスト使用OK（子ども向け画面ではない）。
// グラフは自己比較のみ。他者比較・平均データは存在しない（原則4）。

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}分${sec.toString().padStart(2, '0')}秒`;
}

function levelNumber(levelId: string): number {
  const m = /(\d+)/.exec(levelId);
  return m ? parseInt(m[1], 10) : 0;
}

// セッション系列の折れ線グラフ（SVG、依存なし）
function TrendChart({
  points,
  color,
  unit,
  yMaxHint,
}: {
  points: { label: string; value: number }[];
  color: string;
  unit: string;
  yMaxHint?: number;
}) {
  if (points.length === 0) {
    return <p className="parent-note">記録が増えると表示されます</p>;
  }
  const W = 420;
  const H = 130;
  const PAD = 28;
  const yMax = Math.max(yMaxHint ?? 0, ...points.map((p) => p.value)) || 1;
  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - (v / yMax) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  return (
    <svg className="parent-chart" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#ccc" strokeWidth="1" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill={color} />
          <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" fontSize="11" fill="#555">
            {p.value}
            {unit}
          </text>
          <text x={x(i)} y={H - PAD + 14} textAnchor="middle" fontSize="10" fill="#888">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ParentScreen({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [kanjiProgress, setKanjiProgress] = useState<KanjiProgressMap>({});
  const [minutes, setMinutes] = useState(5);
  const [gesture, setGesture] = useState<'dwell' | 'pinch'>('dwell');
  const [volume, setVolume] = useState(1);
  const [challengeOk, setChallengeOk] = useState(true);
  const [wordStagesOk, setWordStagesOk] = useState(true);
  const [labOk, setLabOk] = useState(true);
  const [difficultyMode, setDifficultyMode] = useState<'auto' | 'gentle' | 'challenge'>('auto');
  const [mojiStage, setMojiStage] = useState(0);
  const [labCount, setLabCount] = useState(0);
  const [enabledIds, setEnabledIds] = useState<string[]>(KANJI_ENTRIES.map((e) => e.id));
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const [ss, kp, min, ges, vol, ch, ws, lab, dm, ids] = await Promise.all([
      getAllSessions(),
      loadKanjiProgress(),
      getSetting('sessionMinutes', 5),
      getSetting<'dwell' | 'pinch'>('hand.gesture', 'dwell'),
      getSetting('volume', 1),
      getSetting('moji.challenge.enabled', true),
      getSetting('moji.wordStages.enabled', true),
      getSetting('lab.enabled', true),
      getSetting<'auto' | 'gentle' | 'challenge'>('maze.difficultyMode', 'auto'),
      loadEnabledKanjiIds(),
    ]);
    setSessions(ss.filter((s) => s.endedAt > 0).sort((a, b) => a.startedAt - b.startedAt));
    setKanjiProgress(kp);
    setMinutes(min);
    setGesture(ges);
    setVolume(vol);
    setChallengeOk(ch);
    setWordStagesOk(ws);
    setLabOk(lab);
    setDifficultyMode(dm);
    setEnabledIds(ids ?? KANJI_ENTRIES.map((e) => e.id));
    const [mp, labDisc] = await Promise.all([
      getProgress<{ stage: number }>('moji.progress', { stage: 0 }),
      getProgress<string[]>('lab.discovered', []),
    ]);
    setMojiStage(mp.stage ?? 0);
    setLabCount(labDisc.length);
  };

  useEffect(() => {
    void reload();
  }, []);

  // ── ② 推移データ（自己比較のみ） ──
  const trends = useMemo(() => {
    const recent = sessions.slice(-8);
    const maze: { label: string; value: number }[] = [];
    const mazeLv: { label: string; value: number }[] = [];
    const kanjiCount: { label: string; value: number }[] = [];
    const moji: { label: string; value: number }[] = [];
    const seenKanji = new Set<string>();
    // 累積カウントは全セッションで進め、直近分だけ表示する
    for (const s of sessions) {
      const label = new Date(s.startedAt).toLocaleDateString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
      });
      const mazePlays = s.plays.filter((p) => p.game === 'maze' && p.completed);
      const outs = mazePlays
        .map((p) => p.metrics['outRatio'])
        .filter((v): v is number => typeof v === 'number');
      const inRecent = recent.includes(s);
      if (outs.length > 0 && inRecent) {
        maze.push({
          label,
          value: Math.round((outs.reduce((a, b) => a + b, 0) / outs.length) * 100),
        });
        mazeLv.push({
          label,
          value: Math.max(...mazePlays.map((p) => levelNumber(p.levelId))),
        });
      }
      for (const p of s.plays) {
        if (p.game === 'kanji' && p.completed && typeof p.metrics['char'] === 'string') {
          seenKanji.add(p.metrics['char'] as string);
        }
      }
      if (inRecent && s.plays.some((p) => p.game === 'kanji' && p.completed)) {
        kanjiCount.push({ label, value: seenKanji.size });
      }
      const reactions = s.plays
        .filter((p) => p.game === 'moji' && p.completed)
        .map((p) => p.metrics['reactionMs'])
        .filter((v): v is number => typeof v === 'number');
      if (reactions.length > 0 && inRecent) {
        moji.push({
          label,
          value: Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length / 100) / 10,
        });
      }
    }
    return { maze, mazeLv, kanjiCount, moji };
  }, [sessions]);

  const kanjiStats = useMemo(() => {
    const entries = Object.values(kanjiProgress);
    const learned = entries.filter((p) => p.completions > 0).length;
    const mastered = entries.filter((p) => p.mastered).length;
    const lv4 = entries.filter((p) => p.lv4Star).length;
    const stars = entries.filter((p) => p.recallStar).length;
    return { learned, mastered, lv4, stars };
  }, [kanjiProgress]);

  // ── ③ 設定ハンドラ ──
  const changeMinutes = (v: number) => {
    setMinutes(v);
    void setSetting('sessionMinutes', v);
  };
  const changeGesture = (v: 'dwell' | 'pinch') => {
    setGesture(v);
    void setSetting('hand.gesture', v);
  };
  const changeVolume = (v: number) => {
    setVolume(v);
    audioGuide.setVolume(v);
    void setSetting('volume', v);
  };
  const changeChallenge = (v: boolean) => {
    setChallengeOk(v);
    void setSetting('moji.challenge.enabled', v);
  };
  const changeWordStages = (v: boolean) => {
    setWordStagesOk(v);
    void setSetting('moji.wordStages.enabled', v);
  };
  const changeLab = (v: boolean) => {
    setLabOk(v);
    void setSetting('lab.enabled', v);
  };
  const changeDifficulty = (v: 'auto' | 'gentle' | 'challenge') => {
    setDifficultyMode(v);
    void setSetting('maze.difficultyMode', v);
  };
  const toggleKanji = (id: string) => {
    const next = enabledIds.includes(id)
      ? enabledIds.filter((x) => x !== id)
      : [...enabledIds, id];
    setEnabledIds(next);
    void saveEnabledKanjiIds(next);
  };
  // 新収録字の一括有効化（移行用。旧データは12字分の配列のため新字が出題されない、SPEC §12.8）
  const enableAllKanji = () => {
    const all = KANJI_ENTRIES.map((e) => e.id);
    setEnabledIds(all);
    void saveEnabledKanjiIds(all);
    setNotice('すべての字を出題対象にしました');
  };

  // ── ④ エクスポート/インポート ──
  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `yubilab-export-${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('エクスポートしました');
  };

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ExportData;
      await importAll(data);
      await reload();
      setNotice('インポートして復元しました');
    } catch {
      setNotice('インポートに失敗しました（ファイル形式を確認してください）');
    }
  };

  return (
    <div className="parent-screen">
      <div className="parent-header">
        <h1>保護者画面</h1>
        <button className="parent-close" onClick={onBack}>
          とじる
        </button>
      </div>

      {isMemoryMode() && (
        <p className="parent-warning">
          ⚠ ブラウザのデータ保存（IndexedDB）が使えないため、記録はこのタブを閉じると消えます。
        </p>
      )}
      {notice && <p className="parent-notice">{notice}</p>}

      <section className="parent-section">
        <h2>記録の推移</h2>
        <div className="parent-charts">
          <div>
            <h3>迷路: はみ出し率（低いほど安定）</h3>
            <TrendChart points={trends.maze} color="#2a7fbf" unit="%" yMaxHint={50} />
          </div>
          <div>
            <h3>迷路: 到達レベル</h3>
            <TrendChart points={trends.mazeLv} color="#4a9b52" unit="" yMaxHint={MAZE_LEVELS.length} />
          </div>
          <div>
            <h3>漢字: 完成した字（累積）</h3>
            <TrendChart points={trends.kanjiCount} color="#b06fb8" unit="字" yMaxHint={KANJI_ENTRIES.length} />
          </div>
          <div>
            <h3>もじさがし: 平均反応時間</h3>
            <TrendChart points={trends.moji} color="#c98a3d" unit="秒" />
          </div>
        </div>
        <p className="parent-note">
          漢字の定着: 完成 {kanjiStats.learned}/{KANJI_ENTRIES.length} ・ マスター{' '}
          {kanjiStats.mastered} ・ Lv4達成 {kanjiStats.lv4} ・ 想起チェック正解 {kanjiStats.stars}
        </p>
        <p className="parent-note">
          もじさがし: 到達ステージ {mojiStage + 1}/10 ・ ごうせいラボ: 発見した字{' '}
          {labCount}/{KANJI_ENTRIES.length}
        </p>
      </section>

      <section className="parent-section">
        <h2>セッション履歴</h2>
        {sessions.length === 0 ? (
          <p className="parent-note">まだ記録がありません</p>
        ) : (
          <table className="parent-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>時間</th>
                <th>入力</th>
                <th>迷路</th>
                <th>漢字</th>
                <th>もじ</th>
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.startedAt)}</td>
                  <td>{fmtDuration(s.endedAt - s.startedAt)}</td>
                  <td>{s.inputKind === 'hand' ? 'ハンド' : s.inputKind === 'touch' ? 'タッチ' : 'マウス'}</td>
                  <td>{s.plays.filter((p) => p.game === 'maze' && p.completed).length}</td>
                  <td>{s.plays.filter((p) => p.game === 'kanji' && p.completed).length}</td>
                  <td>{s.plays.filter((p) => p.game === 'moji' && p.completed).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="parent-section">
        <h2>設定</h2>
        <div className="parent-settings">
          <label>
            セッション長
            <select
              value={minutes}
              onChange={(e) => changeMinutes(parseInt(e.target.value, 10))}
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map((m) => (
                <option key={m} value={m}>
                  {m}分
                </option>
              ))}
            </select>
          </label>
          <label>
            ハンド操作のつかみ方
            <select
              value={gesture}
              onChange={(e) => changeGesture(e.target.value as 'dwell' | 'pinch')}
            >
              <option value="dwell">とどまる（推奨）</option>
              <option value="pinch">つまむ</option>
            </select>
          </label>
          <label>
            音量
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
            />
          </label>
          <label>
            むずかしさ（迷路）
            <select
              value={difficultyMode}
              onChange={(e) => changeDifficulty(e.target.value as 'auto' | 'gentle' | 'challenge')}
            >
              <option value="auto">じどう（おすすめ）</option>
              <option value="gentle">やさしめ</option>
              <option value="challenge">ちょうせん</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={challengeOk}
              onChange={(e) => changeChallenge(e.target.checked)}
            />
            もじさがしのチャレンジモードを許可する
          </label>
          <label>
            <input
              type="checkbox"
              checked={wordStagesOk}
              onChange={(e) => changeWordStages(e.target.checked)}
            />
            もじさがしの「ことばモード」を出す
          </label>
          <label>
            <input type="checkbox" checked={labOk} onChange={(e) => changeLab(e.target.checked)} />
            ホームに「ごうせいラボ」を出す
          </label>
        </div>
      </section>

      <section className="parent-section">
        <div className="parent-section-head">
          <h2>漢字の出題範囲</h2>
          <button className="parent-inline-button" onClick={enableAllKanji}>
            すべての字を有効化（新しい字を含む）
          </button>
        </div>
        {[1, 2].map((grade) => {
          const group = KANJI_ENTRIES.filter((e) => e.grade === grade);
          if (group.length === 0) return null;
          return (
            <div key={grade} className="parent-kanji-group">
              <h3>{grade}年生の漢字</h3>
              <div className="parent-kanji-grid">
                {group.map((e) => (
                  <label key={e.id} className="parent-kanji-check">
                    <input
                      type="checkbox"
                      checked={enabledIds.includes(e.id)}
                      onChange={() => toggleKanji(e.id)}
                    />
                    {e.char}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        <p className="parent-note">
          新しい字は最初オフになっています。「すべての字を有効化」で追加できます。すべて外した場合は全字が出題されます。
        </p>
      </section>

      <section className="parent-section">
        <h2>データ</h2>
        <div className="parent-data-buttons">
          <button onClick={() => void doExport()}>エクスポート（JSON保存）</button>
          <button onClick={() => fileRef.current?.click()}>インポート（復元）</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="parent-note">
          すべての記録・設定をJSONファイルとして保存/復元できます（療育機関との共有・バックアップ用）。データは外部送信されません。
        </p>
      </section>
    </div>
  );
}
