// ホーム画面。P0 はダミーゲーム1枚のみ（未実装モードのアイコンは出さない、SPEC §10）。
export function HomeScreen({ onOpenGame }: { onOpenGame: () => void }) {
  return (
    <div className="center-fill">
      <button className="icon-button game-card" onClick={onOpenGame} aria-label="ほしあつめ">
        🧪
      </button>
    </div>
  );
}
