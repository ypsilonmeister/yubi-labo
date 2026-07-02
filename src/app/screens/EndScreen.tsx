import { useEffect, useState } from 'react';
import { audioGuide } from '../../core/audio/AudioGuide';
import { HighlightPlayer } from '../HighlightPlayer';
import { selectHighlights, type Highlight } from '../../core/engine/highlights';
import { getAllSessions, type SessionRecord } from '../../core/storage/db';

// 終了画面（SPEC §4.4.3）: 今日のハイライト再生 → ほめる音声 → 🌙で操作ロック。
export function EndScreen({ session }: { session: SessionRecord | null }) {
  const [highlights, setHighlights] = useState<Highlight[] | null>(null);
  const [replayDone, setReplayDone] = useState(false);

  useEffect(() => {
    if (!session) {
      setHighlights([]);
      return;
    }
    void getAllSessions().then((all) => {
      const history = all.filter((s) => s.id !== session.id && s.endedAt > 0);
      setHighlights(selectHighlights(session, history, 2));
    });
  }, [session]);

  useEffect(() => {
    if (replayDone || (highlights !== null && highlights.length === 0)) {
      audioGuide.speak('app.session.end');
    }
  }, [replayDone, highlights]);

  if (highlights === null) return null;

  if (highlights.length > 0 && !replayDone) {
    return (
      <HighlightPlayer highlights={highlights} withIntro={false} onDone={() => setReplayDone(true)} />
    );
  }

  return (
    <div className="center-fill">
      <div className="end-moon" aria-hidden="true">
        🌙
      </div>
    </div>
  );
}
