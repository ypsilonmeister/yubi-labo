import type { InputMode } from '../../core/input/inputProvider';

// ホーム画面。P2 でモードB（🧬かんじ工場）が加わった（未実装モードは出さない、SPEC §10）。
// 🪴 = はたけ、📗 = ぶんしずかん。右上 = 入力切替 👆/🖐 と 🔧 再キャリブレーション（§4.4.2）。
export function HomeScreen({
  onOpenMaze,
  onOpenKanji,
  onOpenMoji,
  onOpenFarm,
  onOpenZukan,
  inputMode,
  onToggleInput,
  onCalibrate,
}: {
  onOpenMaze: () => void;
  onOpenKanji: () => void;
  onOpenMoji: () => void;
  onOpenFarm: () => void;
  onOpenZukan: () => void;
  inputMode: InputMode;
  onToggleInput: () => void;
  onCalibrate: () => void;
}) {
  return (
    <div className="center-fill">
      <div className="home-row">
        <button className="icon-button game-card" onClick={onOpenMaze} aria-label="ねっこのめいろ">
          🌱
        </button>
        <button className="icon-button game-card" onClick={onOpenKanji} aria-label="かんじこうじょう">
          🧬
        </button>
        <button className="icon-button game-card" onClick={onOpenMoji} aria-label="もじさがし">
          🔍
        </button>
      </div>
      <div className="input-corner">
        <button
          className="icon-button input-toggle"
          onClick={onToggleInput}
          aria-label="にゅうりょく きりかえ"
        >
          {inputMode === 'hand' ? '🖐' : '👆'}
        </button>
        {inputMode === 'hand' && (
          <button className="icon-button input-toggle" onClick={onCalibrate} aria-label="ちょうせい">
            🔧
          </button>
        )}
      </div>
      <button className="icon-button zukan-button" onClick={onOpenZukan} aria-label="ぶんしずかん">
        📗
      </button>
      <button className="icon-button farm-button" onClick={onOpenFarm} aria-label="はたけ">
        🪴
      </button>
    </div>
  );
}
