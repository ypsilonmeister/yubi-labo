import { useEffect, useRef } from 'react';
import { LOGICAL_W, LOGICAL_H } from '../../core/coords';
import { audioGuide } from '../../core/audio/AudioGuide';
import type { PointerState } from '../../core/input/PointerSource';
import { createPointerSource } from '../../core/input/inputProvider';
import { ReplayRecorder } from '../../core/engine/ReplayRecorder';
import { getProgress, setProgress, type PlayRecord } from '../../core/storage/db';
import type { KanjiEntry } from '../kanji/types';
import {
  GLYPH_SPOKEN,
  PALETTE_GLYPHS,
  jukugoFromChars,
  kanjiFromParts,
} from './recipes';

// モードD「ごうせいラボ」（SPEC §12.7）。Build-a-Molecule の漢字版・自由実験。
// 原則1(NO-FAIL): くっつかない組み合わせは何も起きずそっと離れるだけ。音・否定表示なし。
// 文字表示は学習内容としての例外（§12.2）。

const KANJI_FONT = '"UD デジタル 教科書体 N-R", "UD Digi Kyokasho N-R", "Klee One", serif';
const ATOM = 96; // 原子（パーツ）の一辺
const CHIP = 128; // 完成漢字チップの一辺
const COMBINE_DIST = 140; // この距離内の原子群でレシピ照合（SPEC §12.7）
const TAP_MOVE = 18; // これ未満の移動はタップ（チップ分解）とみなす

// パレット（原子トレイ）の配置。全パーツ glyph が画面内に収まるよう下部に敷き詰める。
const PAL_PER_ROW = 15;
const PAL_TILE = 66;
const PAL_GAP = 6;
const PAL_BOTTOM_Y = 786; // 最下行の中心Y
const PAL_ROWS = Math.ceil(PALETTE_GLYPHS.length / PAL_PER_ROW);
const PAL_TOP_Y = PAL_BOTTOM_Y - (PAL_ROWS - 1) * (PAL_TILE + PAL_GAP); // 最上行の中心Y
const WORK_BOTTOM = PAL_TOP_Y - PAL_TILE / 2 - 40; // 原子が浮遊できる下限

let uid = 0;

interface Atom {
  id: number;
  glyph: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Chip {
  id: number;
  entry: KanjiEntry;
  x: number;
  y: number;
}

interface Discovery {
  entry: KanjiEntry;
  at: number; // 発見演出の開始時刻
  x: number;
  y: number;
}

export function LabGame({
  endRequested,
  onPlay,
  onFinish,
}: {
  endRequested: boolean;
  onPlay: (play: PlayRecord) => void;
  onFinish: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const endRequestedRef = useRef(endRequested);
  endRequestedRef.current = endRequested;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let disposed = false;
    let pointer: PointerState = {
      x: LOGICAL_W / 2,
      y: LOGICAL_H / 2,
      active: false,
      confidence: 1,
      timestamp: 0,
    };
    let prevActive = false;

    const atoms: Atom[] = [];
    const chips: Chip[] = [];
    let discovered = new Set<string>();
    let flash: Discovery | null = null;

    // ドラッグ状態: 原子かチップのどちらか
    let dragAtom: Atom | null = null;
    let dragChip: Chip | null = null;
    let grabX = 0;
    let grabY = 0;
    let introShown = false;
    const recorder = new ReplayRecorder();

    const source = createPointerSource(canvas);
    const unsubscribe = source.subscribe((s) => {
      pointer = s;
    });
    void source.start();

    // パレットの原子タイル位置（下部、折り返しグリッド。全 glyph が画面内に収まる）
    function paletteRects(): { glyph: string; x: number; y: number }[] {
      return PALETTE_GLYPHS.map((glyph, i) => {
        const col = i % PAL_PER_ROW;
        const row = Math.floor(i / PAL_PER_ROW);
        const cols = Math.min(PAL_PER_ROW, PALETTE_GLYPHS.length - row * PAL_PER_ROW);
        const rowW = cols * PAL_TILE + (cols - 1) * PAL_GAP;
        const startX = LOGICAL_W / 2 - rowW / 2;
        const y = PAL_TOP_Y + row * (PAL_TILE + PAL_GAP);
        return { glyph, x: startX + col * (PAL_TILE + PAL_GAP) + PAL_TILE / 2, y };
      });
    }

    function spawnAtom(glyph: string, x: number, y: number): Atom {
      const a: Atom = { id: ++uid, glyph, x, y, vx: 0, vy: 0 };
      atoms.push(a);
      return a;
    }

    function recordDiscovery(entry: KanjiEntry, isFirst: boolean): void {
      onPlayRef.current({
        game: 'lab',
        levelId: entry.id,
        startedAt: Date.now(),
        durationMs: 0,
        completed: true,
        metrics: { char: entry.char, firstDiscovery: isFirst },
        replay: recorder.finish(),
      });
      recorder.start();
    }

    function formChip(entry: KanjiEntry, x: number, y: number): void {
      const chip: Chip = { id: ++uid, entry, x, y: Math.min(y, WORK_BOTTOM - 40) };
      chips.push(chip);
      const isFirst = !discovered.has(entry.id);
      if (isFirst) {
        discovered.add(entry.id);
        void setProgress('lab.discovered', [...discovered]);
      }
      flash = { entry, at: performance.now(), x: chip.x, y: chip.y };
      audioGuide.chime();
      audioGuide.speak('lab.discover', { reading: entry.reading });
      const story = entry.storyText;
      window.setTimeout(() => {
        if (!disposed) audioGuide.speakText(story);
      }, 1600);
      recordDiscovery(entry, isFirst);
    }

    // 原子群 / チップ+原子 がレシピに一致 → 漢字チップを作る（SPEC §12.7）
    function tryCombine(dropped: Atom): void {
      // ① 近くのチップに原子を足す（例: 林チップ + 木 → 森）。3パーツ字を段階的に作れる。
      const nearChip = chips.find(
        (c) => Math.hypot(c.x - dropped.x, c.y - dropped.y) <= COMBINE_DIST,
      );
      if (nearChip) {
        const nearAtoms = atoms.filter(
          (a) => Math.hypot(a.x - dropped.x, a.y - dropped.y) <= COMBINE_DIST,
        );
        for (let n = Math.min(nearAtoms.length, 3); n >= 1; n--) {
          const group = nearAtoms.slice(0, n);
          const glyphs = [...nearChip.entry.parts.map((p) => p.glyph), ...group.map((a) => a.glyph)];
          const entry = kanjiFromParts(glyphs);
          if (entry) {
            const cx = nearChip.x;
            const cy = nearChip.y;
            chips.splice(chips.indexOf(nearChip), 1);
            for (const a of group) {
              const idx = atoms.indexOf(a);
              if (idx >= 0) atoms.splice(idx, 1);
            }
            formChip(entry, cx, cy);
            return;
          }
        }
      }

      // ② 原子だけのクラスタ（例: 木 + 木 → 林）
      const cluster = atoms.filter(
        (a) => Math.hypot(a.x - dropped.x, a.y - dropped.y) <= COMBINE_DIST,
      );
      if (cluster.length < 2) return;
      cluster.sort(
        (a, b) =>
          Math.hypot(a.x - dropped.x, a.y - dropped.y) -
          Math.hypot(b.x - dropped.x, b.y - dropped.y),
      );
      for (let n = Math.min(4, cluster.length); n >= 2; n--) {
        const group = cluster.slice(0, n);
        const entry = kanjiFromParts(group.map((a) => a.glyph));
        if (entry) {
          const cx = group.reduce((s, a) => s + a.x, 0) / n;
          const cy = group.reduce((s, a) => s + a.y, 0) / n;
          for (const a of group) {
            const idx = atoms.indexOf(a);
            if (idx >= 0) atoms.splice(idx, 1);
          }
          formChip(entry, cx, cy);
          return;
        }
      }
    }

    // チップ2枚が重なったら熟語を照合
    function tryJukugo(dropped: Chip): void {
      const other = chips.find(
        (c) => c !== dropped && Math.hypot(c.x - dropped.x, c.y - dropped.y) < CHIP,
      );
      if (!other) return;
      const j = jukugoFromChars([dropped.entry.char, other.entry.char]);
      if (j) {
        audioGuide.chime();
        audioGuide.speak('lab.jukugo', { word: j.word });
        const story = j.story;
        window.setTimeout(() => {
          if (!disposed) audioGuide.speakText(story);
        }, 1800);
        const midX = (dropped.x + other.x) / 2;
        const midY = (dropped.y + other.y) / 2;
        // 熟語の並びが見えるよう2枚を左右に整列（重なって隠れないように）
        other.x = midX - CHIP * 0.58;
        dropped.x = midX + CHIP * 0.58;
        other.y = dropped.y = midY;
        flash = { entry: dropped.entry, at: performance.now(), x: midX, y: midY };
      }
    }

    function decomposeChip(chip: Chip): void {
      const idx = chips.indexOf(chip);
      if (idx >= 0) chips.splice(idx, 1);
      const parts = chip.entry.parts;
      parts.forEach((p, i) => {
        const a = (i / parts.length) * Math.PI * 2;
        spawnAtom(p.glyph, chip.x + Math.cos(a) * 70, chip.y + Math.sin(a) * 70);
      });
    }

    function atomAt(x: number, y: number): Atom | null {
      for (let i = atoms.length - 1; i >= 0; i--) {
        const a = atoms[i]!;
        if (Math.abs(x - a.x) < ATOM / 2 && Math.abs(y - a.y) < ATOM / 2) return a;
      }
      return null;
    }
    function chipAt(x: number, y: number): Chip | null {
      for (let i = chips.length - 1; i >= 0; i--) {
        const c = chips[i]!;
        if (Math.abs(x - c.x) < CHIP / 2 && Math.abs(y - c.y) < CHIP / 2) return c;
      }
      return null;
    }
    function paletteAt(x: number, y: number): string | null {
      const half = PAL_TILE / 2 + 3;
      for (const r of paletteRects()) {
        if (Math.abs(x - r.x) < half && Math.abs(y - r.y) < half) return r.glyph;
      }
      return null;
    }

    function update(now: number): void {
      recorder.record(pointer.x, pointer.y, pointer.active);
      const downEdge = pointer.active && !prevActive;
      const upEdge = !pointer.active && prevActive;
      prevActive = pointer.active;

      if (downEdge) {
        grabX = pointer.x;
        grabY = pointer.y;
        const chip = chipAt(pointer.x, pointer.y);
        if (chip) {
          dragChip = chip;
        } else {
          const atom = atomAt(pointer.x, pointer.y);
          if (atom) {
            dragAtom = atom;
          } else {
            const g = paletteAt(pointer.x, pointer.y);
            if (g) {
              dragAtom = spawnAtom(g, pointer.x, pointer.y);
              audioGuide.speakText(GLYPH_SPOKEN.get(g) ?? g);
            }
          }
        }
      }

      if (pointer.active) {
        if (dragAtom) {
          dragAtom.x = pointer.x;
          dragAtom.y = pointer.y;
          dragAtom.vx = 0;
          dragAtom.vy = 0;
        } else if (dragChip) {
          dragChip.x = pointer.x;
          dragChip.y = pointer.y;
        }
      }

      if (upEdge) {
        const moved = Math.hypot(pointer.x - grabX, pointer.y - grabY);
        if (dragAtom) {
          tryCombine(dragAtom);
          dragAtom = null;
        } else if (dragChip) {
          if (moved < TAP_MOVE) {
            decomposeChip(dragChip);
          } else {
            tryJukugo(dragChip);
          }
          dragChip = null;
        }
      }

      // 浮遊アニメ（微小ブラウン運動）。ドラッグ中の原子は除く。
      for (const a of atoms) {
        if (a === dragAtom) continue;
        a.vx += (Math.sin((now + a.id * 97) / 900) * 0.02);
        a.vy += (Math.cos((now + a.id * 53) / 850) * 0.02);
        a.vx *= 0.96;
        a.vy *= 0.96;
        a.x = Math.max(120, Math.min(LOGICAL_W - 120, a.x + a.vx));
        a.y = Math.max(120, Math.min(WORK_BOTTOM, a.y + a.vy));
      }

      if (endRequestedRef.current) {
        onFinishRef.current();
        disposed = true;
      }
    }

    function draw(now: number): void {
      const bg = ctx!.createRadialGradient(640, 300, 100, 640, 400, 900);
      bg.addColorStop(0, '#1d2c38');
      bg.addColorStop(1, '#101a22');
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // パレット（原子トレイ）
      const palHalf = PAL_TILE / 2;
      for (const r of paletteRects()) {
        ctx!.save();
        ctx!.fillStyle = 'rgba(140, 200, 235, 0.14)';
        ctx!.beginPath();
        ctx!.roundRect(r.x - palHalf, r.y - palHalf, PAL_TILE, PAL_TILE, 14);
        ctx!.fill();
        ctx!.fillStyle = 'rgba(230, 240, 250, 0.85)';
        ctx!.font = `38px ${KANJI_FONT}`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(r.glyph, r.x, r.y + 3);
        ctx!.restore();
      }

      // 熟語などの発見フラッシュ（漢字/熟語共通のきらめき）
      if (flash) {
        const t = (now - flash.at) / 2200;
        if (t >= 1) flash = null;
        else {
          ctx!.save();
          ctx!.globalAlpha = 1 - t;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2 + t * 3;
            const rr = 40 + t * 160;
            ctx!.fillStyle = 'rgba(255, 226, 130, 0.9)';
            ctx!.beginPath();
            ctx!.arc(flash.x + Math.cos(a) * rr, flash.y + Math.sin(a) * rr, 7 * (1 - t), 0, Math.PI * 2);
            ctx!.fill();
          }
          ctx!.restore();
        }
      }

      // 浮遊原子
      for (const a of atoms) {
        ctx!.save();
        if (a === dragAtom) {
          ctx!.shadowColor = 'rgba(140, 200, 235, 0.9)';
          ctx!.shadowBlur = 26;
        }
        ctx!.fillStyle = 'rgba(247, 243, 232, 0.96)';
        ctx!.beginPath();
        ctx!.arc(a.x, a.y, ATOM / 2, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = '#2b2b33';
        ctx!.font = `${ATOM * 0.6}px ${KANJI_FONT}`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(a.glyph, a.x, a.y + 4);
        ctx!.restore();
      }

      // 完成漢字チップ（分子）
      for (const c of chips) {
        ctx!.save();
        ctx!.fillStyle = 'rgba(255, 244, 214, 0.98)';
        ctx!.strokeStyle = 'rgba(255, 214, 110, 0.7)';
        ctx!.lineWidth = 5;
        ctx!.beginPath();
        ctx!.roundRect(c.x - CHIP / 2, c.y - CHIP / 2, CHIP, CHIP, 22);
        ctx!.fill();
        ctx!.stroke();
        ctx!.fillStyle = '#2b2b33';
        ctx!.font = `${CHIP * 0.66}px ${KANJI_FONT}`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(c.entry.char, c.x, c.y + 6);
        ctx!.restore();
      }

      // カーソル
      const cr = pointer.active ? 30 : 20;
      const glow = ctx!.createRadialGradient(pointer.x, pointer.y, 2, pointer.x, pointer.y, cr);
      glow.addColorStop(0, 'rgba(180, 235, 190, 0.95)');
      glow.addColorStop(1, 'rgba(180, 235, 190, 0)');
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(pointer.x, pointer.y, cr, 0, Math.PI * 2);
      ctx!.fill();
    }

    async function init(): Promise<void> {
      const saved = await getProgress<string[]>('lab.discovered', []);
      discovered = new Set(saved);
      if (disposed) return;
      recorder.start();
      if (!introShown) {
        introShown = true;
        audioGuide.speak('lab.intro');
      }
      const loop = () => {
        if (disposed) return;
        const now = performance.now();
        update(now);
        if (!disposed) draw(now);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    void init();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsubscribe();
      source.stop();
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" width={LOGICAL_W} height={LOGICAL_H} />;
}
