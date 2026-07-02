import { useEffect } from 'react';
import { audioGuide } from '../../core/audio/AudioGuide';

// 終了画面（SPEC §4.4.3）。🌙表示で操作ロック。ハイライト再生は P1 で追加。
export function EndScreen() {
  useEffect(() => {
    audioGuide.speak('app.session.end');
  }, []);

  return (
    <div className="center-fill">
      <div className="end-moon" aria-hidden="true">
        🌙
      </div>
    </div>
  );
}
