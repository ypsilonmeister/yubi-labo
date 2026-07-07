import { useEffect, useState } from 'react';
import { getProgress } from '../../core/storage/db';
import { MAZE_LEVELS } from '../../games/maze/levels';

// SPEC §5.6 — コレクション「はたけ」。眺めるだけの癒し画面。
// 株数はレベル総数から導出（5レベル = 1株、SPEC §12.4）。

const STAGES = ['🌰', '🌱', '🌿', '🌸', '🍎'];
const RIPE = ['🍎', '🍊', '🍇', '🍓', '🍋', '🍑', '🥝', '🍈', '🌻'];
const POT_COUNT = Math.ceil(MAZE_LEVELS.length / 5);

export function FarmScreen({ onBack }: { onBack: () => void }) {
  const [cleared, setCleared] = useState(0);

  useEffect(() => {
    void getProgress('maze.cleared', 0).then(setCleared);
  }, []);

  return (
    <div className="center-fill">
      <div className="farm-row" style={{ flexWrap: 'wrap', maxWidth: 980, justifyContent: 'center' }}>
        {Array.from({ length: POT_COUNT }, (_, i) => {
          const stage = Math.max(0, Math.min(5, cleared - i * 5));
          const icon = stage === 0 ? '🕳️' : stage >= 5 ? RIPE[i % RIPE.length] : STAGES[stage - 1];
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
