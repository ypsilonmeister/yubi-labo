import { useRef } from 'react';
import type { InputMode } from '../../core/input/inputProvider';
import { useNonGamePointerSelect } from '../useNonGamePointerSelect';

// ホーム画面。P2 でモードB（🧬かんじ工場）が加わった（未実装モードは出さない、SPEC §10）。
// 🪴 = はたけ、📗 = ぶんしずかん。右上 = 入力切替 👆/🖐 と 🔧 再キャリブレーション（§4.4.2）。
// ⚙ = 保護者画面（3秒長押しで開く = 子どもの誤操作防止、SPEC §4.7）。

const PARENT_HOLD_MS = 3000;

export function HomeScreen({
  onOpenMaze,
  onOpenKanji,
  onOpenMoji,
  onOpenLab,
  labEnabled,
  onOpenFarm,
  onOpenZukan,
  onOpenParent,
  inputMode,
  onToggleInput,
  onCalibrate,
}: {
  onOpenMaze: () => void;
  onOpenKanji: () => void;
  onOpenMoji: () => void;
  onOpenLab: () => void;
  labEnabled: boolean;
  onOpenFarm: () => void;
  onOpenZukan: () => void;
  onOpenParent: () => void;
  inputMode: InputMode;
  onToggleInput: () => void;
  onCalibrate: () => void;
}) {
  const holdTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useNonGamePointerSelect(containerRef, inputMode);

  const startHold = () => {
    cancelHold();
    holdTimer.current = window.setTimeout(onOpenParent, PARENT_HOLD_MS);
  };
  const cancelHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <div className="center-fill" ref={containerRef}>
      <div className="home-row">
        <button className="icon-button game-card" onClick={onOpenMaze} aria-label="ねっこのめいろ">
          🌱
          <span className="card-label" aria-hidden="true">めいろ</span>
        </button>
        <button className="icon-button game-card" onClick={onOpenKanji} aria-label="かんじこうじょう">
          🧬
          <span className="card-label" aria-hidden="true">かんじ</span>
        </button>
        <button className="icon-button game-card" onClick={onOpenMoji} aria-label="もじさがし">
          🔍
          <span className="card-label" aria-hidden="true">もじ</span>
        </button>
        {labEnabled && (
          <button className="icon-button game-card" onClick={onOpenLab} aria-label="ごうせいラボ">
            🧪
            <span className="card-label" aria-hidden="true">ラボ</span>
          </button>
        )}
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
        <button
          className="icon-button input-toggle parent-gear"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          aria-label="ほごしゃがめん（3びょう ながおし）"
        >
          ⚙
        </button>
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
