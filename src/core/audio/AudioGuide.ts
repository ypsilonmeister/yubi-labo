// SPEC §4.3 / 付録B — 音声ガイド。
// 解決順: キー → /audio/{key}.mp3 → speechSynthesis (ja-JP, 0.9倍速)。
// 禁止語彙（「ざんねん」「しっぱい」等）をこのファイルに書かないこと。

const SCRIPTS: Record<string, string> = {
  'app.welcome': 'ゆびラボへ ようこそ！ あそびたい ゲームを ゆびで えらんでね',
  'app.session.warn': 'そろそろ おわりの じかんが ちかづいてるよ',
  'app.session.end': 'きょうも たくさん じっけんできたね。つづきは あしたの おたのしみ！',
  'app.highlight.intro': 'これ、きのうの きみだよ。みてて',
  'app.highlight.praise': 'じょうずだったねえ',
  'hand.lost': 'カメラから てが みえなくなっちゃった。カメラの まえで ゆびを だしてね',
  'hand.found': 'みつけた！ いくよ、さん、に、いち',
  'hand.rest': 'いちど うでを おろして、ぶらぶらして いいよ',
  'hand.rest.done': 'おかえり！ つづきを やろう',
  'calib.topright': 'みぎうえの ほしを ゆびで さしてね',
  'calib.bottomleft': 'ひだりしたの ほしを さしてね',
  'calib.center': 'まんなかの ほしを さしてね',
  'calib.topleft': 'ひだりうえの ほしを さしてね',
  'calib.bottomright': 'みぎしたの ほしを さしてね',
  'calib.done': 'じゅんび かんぺき！ ゆびが カーソルに なったよ',
  'camera.unavailable': 'カメラが おやすみみたい。ゆびか マウスで あそぼう',
  'maze.intro': 'ここから ねっこを のばそう。みずいろの みちに そって、ゆっくり すすんでね',
  'maze.stop.request': 'あかい おひさまだ。ここで ピタッと とまってみよう',
  'maze.stop.done': 'ピタッと とまれたね！',
  'maze.clear.1': 'ゴール！ さいごまで ゆっくり すすめたね',
  'maze.clear.2': 'やったね！ とまるのが じょうずに なってきた',
  'maze.clear.3': 'ねっこが みずを みつけたよ。ぐんぐん そだつね',
  'maze.stuck': 'ちょっと むずかしいね。ひかる みちに ついてきて',
  'kanji.seq.first': 'まず {partName}',
  'kanji.seq.next': 'つぎに {partName}',
  'kanji.hint': '{partName} は {positionName} だよ',
  'kanji.complete': '{reading}、ゲットだね！',
  'kanji.recall.q': '{reading} は どれだった？',
  'kanji.recall.miss': 'こたえは これ。もういっかい つくってみよう',
  'moji.q': '{char} は どこかな？',
  'moji.correct': '{char}！ せいかい！',
  'moji.other': 'それは {char} だね。{target} を さがしてみよう',
  'moji.challenge.end': 'しゅうりょう〜！ きょうは ほし {n} こ！',
  'moji.set.clear': 'ほしが たまったね！ いい ちょうし！',
  'moji.challenge.start': 'スタート！ すきなだけ さがそう！',
  'common.stuck': 'ちょっと むずかしいね。いっしょに やってみよう',
  'dummy.intro': 'ひかる ほしを ゆびで さわってみよう',
};

class AudioGuide {
  private audioCtx: AudioContext | null = null;
  private lastKey = '';
  private lastAt = 0;
  private current: HTMLAudioElement | null = null;
  private volume = 1;

  // 保護者画面の音量設定（0-1、SPEC §4.7）
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  getVolume(): number {
    return this.volume;
  }

  // 初回ユーザージェスチャーで呼ぶ（ブラウザ自動再生制限対策、SPEC §9）
  async unlock(): Promise<void> {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
    window.speechSynthesis?.getVoices();
  }

  speak(key: string, vars: Record<string, string | number> = {}): void {
    const now = performance.now();
    // 同一キーの3秒以内の連続再生は抑止（SPEC §4.3）
    if (key === this.lastKey && now - this.lastAt < 3000) return;
    this.lastKey = key;
    this.lastAt = now;

    const script = SCRIPTS[key];
    if (!script) return;
    const text = script.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

    // 再生中の重複はキューせず置き換え（SPEC §4.3）
    this.stopCurrent();

    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${key}.mp3`);
    audio.volume = this.volume;
    this.current = audio;
    let fellBack = false;
    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      this.tts(text);
    };
    audio.addEventListener('error', fallback);
    audio.play().catch(fallback);
  }

  // データ由来の動的文（漢字の読み・成り立ちストーリー等）を直接読み上げる
  speakText(text: string): void {
    const now = performance.now();
    if (text === this.lastKey && now - this.lastAt < 3000) return;
    this.lastKey = text;
    this.lastAt = now;
    this.stopCurrent();
    this.tts(text);
  }

  // 柔らかい肯定系の効果音（ブザー系禁止、SPEC §3.2）
  chime(): void {
    const ctx = this.audioCtx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.18 * this.volume), ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  }

  private stopCurrent(): void {
    this.current?.pause();
    this.current = null;
    window.speechSynthesis?.cancel();
  }

  private tts(text: string): void {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.9;
    u.volume = this.volume;
    window.speechSynthesis.speak(u);
  }
}

export const audioGuide = new AudioGuide();
