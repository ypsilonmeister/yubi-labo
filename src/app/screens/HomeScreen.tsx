// ホーム画面。P2 でモードB（🧬かんじ工場）が加わった（未実装モードは出さない、SPEC §10）。
// 🪴 = はたけ、📗 = ぶんしずかん（どちらもコレクション閲覧）。
export function HomeScreen({
  onOpenMaze,
  onOpenKanji,
  onOpenFarm,
  onOpenZukan,
}: {
  onOpenMaze: () => void;
  onOpenKanji: () => void;
  onOpenFarm: () => void;
  onOpenZukan: () => void;
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
