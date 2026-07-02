import { useEffect, useState } from 'react';
import { getProgress } from '../../core/storage/db';

// SPEC §5.6 — コレクション「はたけ」。眺めるだけの癒し画面。
// 20レベル = 4株 × 5段階（種→芽→葉→花→実）。

const STAGES = ['🌰', '🌱', '🌿', '🌸', '🍎'];
const RIPE = ['🍎', '🍊', '🍇', '🍓'];

export function FarmScreen({ onBack }: { onBack: () => void }) {
  const [cleared, setCleared] = useState(0);

  useEffect(() => {
    void getProgress('maze.cleared', 0).then(setCleared);
  }, []);

  return (
    <div className="center-fill">
      <div className="farm-row">
        {[0, 1, 2, 3].map((i) => {
          const stage = Math.max(0, Math.min(5, cleared - i * 5));
          const icon = stage === 0 ? '🕳️' : stage >= 5 ? RIPE[i] : STAGES[stage - 1];
          return (
            <div key={i} className="farm-pot" aria-hidden="true">
              <div className="farm-plant">{icon}</div>
              <div className="farm-soil">🪴</div>
            </div>
          );
        })}
      </div>
      <button className="icon-button back-button" onClick={onBack} aria-label="もどる">
        🏠
      </button>
    </div>
  );
}
