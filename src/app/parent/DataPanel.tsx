// データ管理（§11.3）: JSON（通常・匿名化）、CSV（セッション・試行・イベント別）、
// インポート（形式・バージョン検証 → 重複ID検出 → プレビュー → 復元前バックアップ → 適用）

import { useEffect, useState } from 'react';
import type { Store } from '../../core/storage/db';
import type { AppData } from '../../core/types';
import { anonymize, eventsCsv, exportFileName, mergeData, previewImport, sessionsCsv, trialsCsv, type ImportPreview } from '../../core/storage/dataio';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const snapshot = (d: AppData): AppData => JSON.parse(JSON.stringify(d));

export function DataPanel({ store }: { store: Store }) {
  const [anon, setAnon] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<string>('');
  const idle = store.data.profile.learning!.idleThresholdMs;

  useEffect(() => {
    void store.estimate().then((e) => {
      if (e.usage !== undefined && e.quota) setUsage(`端末内の使用量: 約 ${(e.usage / 1024 / 1024).toFixed(1)}MB / ${(e.quota / 1024 / 1024).toFixed(0)}MB`);
    });
  }, [store]);

  const data = () => (anon ? anonymize(snapshot(store.data)) : snapshot(store.data));

  const onFile = async (f: File | undefined) => {
    setMessage(null);
    if (!f) return setPreview(null);
    setPreview(previewImport(await f.text(), store.data));
  };

  const apply = async (mode: 'merge' | 'replace') => {
    if (!preview?.data) return;
    // 復元前に、いまのデータをファイルとして保存する
    download(exportFileName('backup-before-import', 'json'), JSON.stringify(snapshot(store.data), null, 2), 'application/json');
    const next = mode === 'merge' ? mergeData(snapshot(store.data), preview.data) : preview.data;
    await store.replaceAll(next);
    setPreview(null);
    setMessage(mode === 'merge' ? '追加しました（重複したセッションは除きました）。' : '置き換えました。');
  };

  return (
    <section className="p-section">
      <h3>書き出し</h3>
      <label className="p-check">
        <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
        匿名化する（呼び名と自由記述欄を除く。学校・医療機関・他のAIに渡すときはこちら）
      </label>
      <div className="p-buttons">
        <button type="button" className="p-btn" onClick={() => download(exportFileName(anon ? 'anon' : 'all', 'json'), JSON.stringify(data(), null, 2), 'application/json')}>
          JSON
        </button>
        <button type="button" className="p-btn" onClick={() => download(exportFileName('sessions', 'csv'), sessionsCsv(data()), 'text/csv')}>
          CSV（セッション単位）
        </button>
        <button type="button" className="p-btn" onClick={() => download(exportFileName('trials', 'csv'), trialsCsv(data(), idle), 'text/csv')}>
          CSV（試行単位）
        </button>
        <button type="button" className="p-btn" onClick={() => download(exportFileName('events', 'csv'), eventsCsv(data()), 'text/csv')}>
          CSV（イベント単位）
        </button>
      </div>
      {usage && <p className="p-note">{usage}。容量がいっぱいになっても古い記録は自動で消しません。書き出してから整理してください。</p>}

      <h3>読み込み（復元）</h3>
      <p className="p-note">v2.1 の JSON と、v1（localStorage 版）の JSON を読み込めます。適用の前に、いまのデータをバックアップとして自動でダウンロードします。</p>
      <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} />
      {preview && (
        <div className="p-preview">
          {preview.errors.length ? (
            <>
              <p className="p-alert">読み込めません。いまのデータは変更していません。</p>
              <ul>
                {preview.errors.slice(0, 10).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>
                形式: {preview.format}／セッション {preview.sessionCount}件・試行 {preview.trialCount}件
                {preview.duplicateSessionIds.length > 0 && `／既にあるセッション ${preview.duplicateSessionIds.length}件`}
                {preview.duplicateTrialIds.length > 0 && `／重複する試行ID ${preview.duplicateTrialIds.length}件`}
              </p>
              {preview.migration && (
                <p className="p-note">
                  v1 からの移行: 記録 {preview.migration.logCount}件 → 試行 {preview.migration.trialCount}件（移行できない記録 {preview.migration.skipped}件、fatigueWarning {preview.migration.droppedFatigueWarnings}件は移行しません）
                </p>
              )}
              <div className="p-buttons">
                <button type="button" className="p-btn" onClick={() => void apply('merge')}>
                  追加する（重複は除く）
                </button>
                <button type="button" className="p-btn danger" onClick={() => void apply('replace')}>
                  すべて置き換える
                </button>
                <button type="button" className="p-btn" onClick={() => setPreview(null)}>
                  やめる
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {message && <p className="p-saved">{message}</p>}
    </section>
  );
}
