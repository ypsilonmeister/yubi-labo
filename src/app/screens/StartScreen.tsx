// 起動画面。🌟タップが AudioContext resume のユーザージェスチャーを兼ねる。
export function StartScreen({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="center-fill">
      <button className="icon-button big-start" onClick={onBegin} aria-label="はじめる">
        🌟
      </button>
    </div>
  );
}
