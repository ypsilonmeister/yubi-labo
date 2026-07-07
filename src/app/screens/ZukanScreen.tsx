import { useEffect, useState } from 'react';
import { audioGuide } from '../../core/audio/AudioGuide';
import { KANJI_ENTRIES } from '../../games/kanji/data';
import { loadKanjiProgress, type KanjiProgressMap } from '../../games/kanji/scheduler';

// SPEC §6.5 — ぶんしずかん。完成した漢字が分子カードとして並ぶ、眺めて聴くだけの画面。
// 漢字そのものは学習コンテンツなので表示OK（テキストレスUIの例外、SPEC §2.2）。
// タップで読み・成り立ちを読み上げる。未収集はほんのり光る空きスロット。

export function ZukanScreen({ onBack }: { onBack: () => void }) {
  const [progress, setProgress] = useState<KanjiProgressMap>({});

  useEffect(() => {
    void loadKanjiProgress().then(setProgress);
  }, []);

  return (
    <div className="center-fill">
      <div className="zukan-grid">
        {KANJI_ENTRIES.map((entry) => {
          const p = progress[entry.id];
          const collected = !!p && p.completions > 0;
          if (!collected) {
            return <div key={entry.id} className="zukan-card empty" aria-hidden="true" />;
          }
          const cls = `zukan-card${p.mastered ? ' mastered' : ''}`;
          return (
            <button
              key={entry.id}
              className={cls}
              aria-label={entry.reading}
              onClick={() => {
                audioGuide.speakText(`「${entry.reading}」。${entry.storyText}`);
              }}
            >
              <span className="zukan-char">{entry.char}</span>
              <span className="zukan-reading" aria-hidden="true">{entry.reading}</span>
              {p.lv4Star && <span className="zukan-crown">👑</span>}
              {p.recallStar && <span className="zukan-star">✨</span>}
            </button>
          );
        })}
      </div>
      <button className="icon-button back-button" onClick={onBack} aria-label="もどる">
        🏠
      </button>
    </div>
  );
}
