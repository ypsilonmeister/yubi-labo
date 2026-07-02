// ホーム画面。P1 はモードA（🌱迷路）のみ表示（未実装モードは出さない、SPEC §10）。
// 🪴 = はたけ（コレクション閲覧、SPEC §5.6）。
export function HomeScreen({
  onOpenMaze,
  onOpenFarm,
}: {
  onOpenMaze: () => void;
  onOpenFarm: () => void;
}) {
  return (
    <div className="center-fill">
      <button className="icon-button game-card" onClick={onOpenMaze} aria-label="ねっこのめいろ">
        🌱
      </button>
      <button className="icon-button farm-button" onClick={onOpenFarm} aria-label="はたけ">
        🪴
      </button>
    </div>
  );
}
