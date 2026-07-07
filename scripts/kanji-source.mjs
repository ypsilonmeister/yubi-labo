// v1.1 追加漢字のソース（SPEC §12.5）。generate-kanji.mjs が既存12字の後ろに展開する。
// 選定基準: ①全パーツが単独表示可能な1コードポイント ②既習パーツの再利用（順序記憶の転移）
// ③興味領域（植物・宇宙・天体・地学・水・自然）。象形の一体字（鳥馬魚）や
// 単独グリフに割れない字（光風谷）は入れない。
// パーツ・マルチセットは全字（既存含む）で一意（validate-kanji.mjs が保証）。

// zone は完成枠内の正規化位置(0-1)。既存エントリのレイアウト原型に合わせている。
export const NEW_KANJI = [
  {
    id: 'kanji-hoshi', char: '星', reading: 'ほし', grade: 2,
    storyText: 'そらに ひかりが うまれて ほし に なるよ',
    meaningEmoji: ['🌌', '⭐'],
    parts: [
      { glyph: '日', zone: { x: 0.3, y: 0.04, w: 0.4, h: 0.42 }, spokenName: 'ひ' },
      { glyph: '生', zone: { x: 0.12, y: 0.5, w: 0.76, h: 0.46 }, spokenName: 'いきる' },
    ],
  },
  {
    id: 'kanji-hare', char: '晴', reading: 'はれ', grade: 2,
    storyText: 'あおい そらに ひが でて はれ に なるよ',
    meaningEmoji: ['🌥️', '☀️'],
    parts: [
      { glyph: '日', zone: { x: 0.04, y: 0.1, w: 0.38, h: 0.8 }, spokenName: 'ひ' },
      { glyph: '青', zone: { x: 0.46, y: 0.06, w: 0.5, h: 0.88 }, spokenName: 'あお' },
    ],
  },
  {
    id: 'kanji-kumo', char: '雲', reading: 'くも', grade: 2,
    storyText: 'あめの したで もくもく ふくらんで くも に なるよ',
    meaningEmoji: ['🌧️', '☁️'],
    parts: [
      { glyph: '雨', zone: { x: 0.08, y: 0.04, w: 0.84, h: 0.44 }, spokenName: 'あめ' },
      { glyph: '云', zone: { x: 0.18, y: 0.52, w: 0.64, h: 0.44 }, spokenName: 'くも' },
    ],
  },
  {
    id: 'kanji-sora', char: '空', reading: 'そら', grade: 1,
    storyText: 'たかい ところに あなが あいて そら に なるよ',
    meaningEmoji: ['🌫️', '🌌'],
    parts: [
      { glyph: '穴', zone: { x: 0.08, y: 0.04, w: 0.84, h: 0.5 }, spokenName: 'あな' },
      { glyph: '工', zone: { x: 0.22, y: 0.58, w: 0.56, h: 0.38 }, spokenName: 'こう' },
    ],
  },
  {
    id: 'kanji-umi', char: '海', reading: 'うみ', grade: 2,
    storyText: 'みずが いっぱい あつまって おおきな うみ に なるよ',
    meaningEmoji: ['💧', '🌊'],
    parts: [
      { glyph: '氵', zone: { x: 0.02, y: 0.06, w: 0.28, h: 0.88 }, spokenName: 'さんずい' },
      { glyph: '毎', zone: { x: 0.34, y: 0.06, w: 0.62, h: 0.88 }, spokenName: 'まい' },
    ],
  },
  {
    id: 'kanji-ike', char: '池', reading: 'いけ', grade: 2,
    storyText: 'みずが たまって ちいさな いけ に なるよ',
    meaningEmoji: ['💧', '🏞️'],
    parts: [
      { glyph: '氵', zone: { x: 0.02, y: 0.06, w: 0.28, h: 0.88 }, spokenName: 'さんずい' },
      { glyph: '也', zone: { x: 0.34, y: 0.1, w: 0.6, h: 0.8 }, spokenName: 'なり' },
    ],
  },
  {
    id: 'kanji-chi', char: '地', reading: 'ち', grade: 2,
    storyText: 'つちが ひろがって ちめん の ち に なるよ',
    meaningEmoji: ['🟫', '🌍'],
    parts: [
      { glyph: '土', zone: { x: 0.06, y: 0.1, w: 0.36, h: 0.8 }, spokenName: 'つち' },
      { glyph: '也', zone: { x: 0.48, y: 0.1, w: 0.48, h: 0.8 }, spokenName: 'なり' },
    ],
  },
  {
    id: 'kanji-kou', char: '校', reading: 'こう', grade: 1,
    storyText: 'きが まじわって がっこう の こう に なるよ',
    meaningEmoji: ['🌳', '🏫'],
    parts: [
      { glyph: '木', zone: { x: 0.04, y: 0.08, w: 0.42, h: 0.84 }, spokenName: 'き' },
      { glyph: '交', zone: { x: 0.5, y: 0.06, w: 0.46, h: 0.88 }, spokenName: 'まじわる' },
    ],
  },
  {
    id: 'kanji-mura', char: '村', reading: 'むら', grade: 1,
    storyText: 'きの そばに ひとが あつまって むら に なるよ',
    meaningEmoji: ['🌳', '🏘️'],
    parts: [
      { glyph: '木', zone: { x: 0.04, y: 0.08, w: 0.42, h: 0.84 }, spokenName: 'き' },
      { glyph: '寸', zone: { x: 0.5, y: 0.08, w: 0.46, h: 0.84 }, spokenName: 'すん' },
    ],
  },
  {
    id: 'kanji-machi', char: '町', reading: 'まち', grade: 1,
    storyText: 'たんぼの よこに みちが できて まち に なるよ',
    meaningEmoji: ['🌾', '🏙️'],
    parts: [
      { glyph: '田', zone: { x: 0.06, y: 0.14, w: 0.42, h: 0.72 }, spokenName: 'た' },
      { glyph: '丁', zone: { x: 0.52, y: 0.1, w: 0.44, h: 0.8 }, spokenName: 'てい' },
    ],
  },
  {
    id: 'kanji-na', char: '名', reading: 'な', grade: 1,
    storyText: 'ゆうがた くちで よぶと なまえ の な に なるよ',
    meaningEmoji: ['🗣️', '📛'],
    parts: [
      { glyph: '夕', zone: { x: 0.16, y: 0.04, w: 0.62, h: 0.5 }, spokenName: 'ゆう' },
      { glyph: '口', zone: { x: 0.24, y: 0.56, w: 0.52, h: 0.4 }, spokenName: 'くち' },
    ],
  },
  {
    id: 'kanji-omou', char: '思', reading: 'おもう', grade: 2,
    storyText: 'あたまと こころで かんがえて おもう に なるよ',
    meaningEmoji: ['💭', '🧠'],
    parts: [
      { glyph: '田', zone: { x: 0.2, y: 0.04, w: 0.6, h: 0.48 }, spokenName: 'た' },
      { glyph: '心', zone: { x: 0.1, y: 0.54, w: 0.8, h: 0.42 }, spokenName: 'こころ' },
    ],
  },
  {
    id: 'kanji-ka', char: '科', reading: 'か', grade: 2,
    storyText: 'いねを はかりで しらべる か に なるよ',
    meaningEmoji: ['🌾', '🔬'],
    parts: [
      { glyph: '禾', zone: { x: 0.04, y: 0.08, w: 0.44, h: 0.84 }, spokenName: 'のぎ' },
      { glyph: '斗', zone: { x: 0.52, y: 0.08, w: 0.44, h: 0.84 }, spokenName: 'とます' },
    ],
  },
  {
    id: 'kanji-toki', char: '時', reading: 'とき', grade: 2,
    storyText: 'ひが すすんで じかん の とき に なるよ',
    meaningEmoji: ['🌞', '⏰'],
    parts: [
      { glyph: '日', zone: { x: 0.04, y: 0.1, w: 0.38, h: 0.8 }, spokenName: 'ひ' },
      { glyph: '寺', zone: { x: 0.46, y: 0.06, w: 0.5, h: 0.88 }, spokenName: 'てら' },
    ],
  },
  {
    id: 'kanji-aida', char: '間', reading: 'あいだ', grade: 2,
    storyText: 'もんの あいだから ひが さして あいだ に なるよ',
    meaningEmoji: ['🚪', '⏳'],
    parts: [
      { glyph: '門', zone: { x: 0.04, y: 0.04, w: 0.9, h: 0.92 }, spokenName: 'もん' },
      { glyph: '日', zone: { x: 0.3, y: 0.32, w: 0.4, h: 0.52 }, spokenName: 'ひ' },
    ],
  },
  {
    id: 'kanji-kiku', char: '聞', reading: 'きく', grade: 2,
    storyText: 'もんの ところで みみを すまして きく に なるよ',
    meaningEmoji: ['🚪', '👂'],
    parts: [
      { glyph: '門', zone: { x: 0.04, y: 0.04, w: 0.9, h: 0.92 }, spokenName: 'もん' },
      { glyph: '耳', zone: { x: 0.28, y: 0.3, w: 0.44, h: 0.58 }, spokenName: 'みみ' },
    ],
  },
  {
    id: 'kanji-karada', char: '体', reading: 'からだ', grade: 2,
    storyText: 'ひとの もとに なる からだ の じ だよ',
    meaningEmoji: ['🧍', '💪'],
    parts: [
      { glyph: '亻', zone: { x: 0.02, y: 0.06, w: 0.3, h: 0.88 }, spokenName: 'にんべん' },
      { glyph: '本', zone: { x: 0.34, y: 0.06, w: 0.62, h: 0.88 }, spokenName: 'ほん' },
    ],
  },
  {
    id: 'kanji-ji', char: '字', reading: 'じ', grade: 1,
    storyText: 'やねの したで こどもが まなぶ じ だよ',
    meaningEmoji: ['🏠', '🔤'],
    parts: [
      { glyph: '宀', zone: { x: 0.1, y: 0.04, w: 0.8, h: 0.34 }, spokenName: 'うかんむり' },
      { glyph: '子', zone: { x: 0.2, y: 0.4, w: 0.6, h: 0.56 }, spokenName: 'こ' },
    ],
  },
  {
    id: 'kanji-sato', char: '里', reading: 'さと', grade: 2,
    storyText: 'たんぼと つちが ならんで さと に なるよ',
    meaningEmoji: ['🌾', '🏞️'],
    parts: [
      { glyph: '田', zone: { x: 0.18, y: 0.04, w: 0.64, h: 0.52 }, spokenName: 'た' },
      { glyph: '土', zone: { x: 0.14, y: 0.58, w: 0.72, h: 0.38 }, spokenName: 'つち' },
    ],
  },
  {
    id: 'kanji-no', char: '野', reading: 'の', grade: 2,
    storyText: 'さとから ひろがる のはら の の に なるよ',
    meaningEmoji: ['🏞️', '🌾'],
    parts: [
      { glyph: '里', zone: { x: 0.04, y: 0.08, w: 0.44, h: 0.84 }, spokenName: 'さと' },
      { glyph: '予', zone: { x: 0.52, y: 0.08, w: 0.44, h: 0.84 }, spokenName: 'よ' },
    ],
  },
  {
    id: 'kanji-hyaku', char: '百', reading: 'ひゃく', grade: 1,
    storyText: 'いちの したに しろを おいて ひゃく に なるよ',
    meaningEmoji: ['1️⃣', '💯'],
    parts: [
      { glyph: '一', zone: { x: 0.18, y: 0.06, w: 0.64, h: 0.18 }, spokenName: 'いち' },
      { glyph: '白', zone: { x: 0.22, y: 0.28, w: 0.56, h: 0.66 }, spokenName: 'しろ' },
    ],
  },
  {
    id: 'kanji-bun', char: '分', reading: 'ぶん', grade: 2,
    storyText: 'かたなで はんぶんに わけて ぶん に なるよ',
    meaningEmoji: ['🔪', '➗'],
    parts: [
      { glyph: '八', zone: { x: 0.16, y: 0.06, w: 0.68, h: 0.42 }, spokenName: 'はち' },
      { glyph: '刀', zone: { x: 0.24, y: 0.52, w: 0.52, h: 0.44 }, spokenName: 'かたな' },
    ],
  },
  {
    id: 'kanji-kai', char: '会', reading: 'かい', grade: 2,
    storyText: 'ひとが あつまって あう かい に なるよ',
    meaningEmoji: ['🧍', '👥'],
    parts: [
      { glyph: '人', zone: { x: 0.14, y: 0.04, w: 0.72, h: 0.46 }, spokenName: 'ひと' },
      { glyph: '云', zone: { x: 0.18, y: 0.52, w: 0.64, h: 0.44 }, spokenName: 'うん' },
    ],
  },
  {
    id: 'kanji-soto', char: '外', reading: 'そと', grade: 2,
    storyText: 'ゆうがたに そとへ でる そと に なるよ',
    meaningEmoji: ['🌆', '🚪'],
    parts: [
      { glyph: '夕', zone: { x: 0.06, y: 0.08, w: 0.46, h: 0.84 }, spokenName: 'ゆう' },
      { glyph: '卜', zone: { x: 0.54, y: 0.1, w: 0.42, h: 0.8 }, spokenName: 'ぼく' },
    ],
  },
];
