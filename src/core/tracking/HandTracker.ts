import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// SPEC §4.2 — 手指トラッキング中核。getUserMedia + HandLandmarker を所有し、
// rAF ループで毎フレーム検出する。カメラ映像は子どもに一切表示しない（§2.7, §4.2.1）。

// カメラ正規化座標（0-1）。x は既にミラー反転済み（前面カメラ、§4.2 末尾）。
export interface HandFrame {
  indexTip: { x: number; y: number }; // landmark 8（人差し指先=カーソル）
  thumbTip: { x: number; y: number }; // landmark 4（親指先=ピンチ）
  wrist: { x: number; y: number }; // landmark 0（手首=スケール基点）
  middleMcp: { x: number; y: number }; // landmark 9（中指付根=スケール基点）
  confidence: number; // 0-1
  timestamp: number;
}

// カメラが使えない場合に呼び出し側が捕捉できる型付きエラー（§7 ガードレール: デバイス起因）。
export class CameraUnavailableError extends Error {
  // ES2020 lib は Error.cause を持たないため独自フィールドで保持
  readonly reason?: unknown;
  constructor(reason?: unknown) {
    super('camera unavailable');
    this.name = 'CameraUnavailableError';
    this.reason = reason;
  }
}

type StatusListener = (s: 'tracking' | 'lost') => void;

// MediaPipe ランドマークの添字（§4.2.1）
const IDX_WRIST = 0;
const IDX_THUMB_TIP = 4;
const IDX_INDEX_TIP = 8;
const IDX_MIDDLE_MCP = 9;

// 手を見失ってから lost 判定までの猶予（§4.2.5）
const LOST_GRACE_MS = 500;

export class HandTracker {
  onStatus?: StatusListener;

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: HandLandmarker | null = null;
  // video 直渡しはブラウザ/ドライバ組合せによりフレーム取込が空振りすることがあるため
  // canvas に描いたピクセルを渡す（実機で video 直渡しは landmarks が常に0になる問題を確認済み）
  private grabCanvas: HTMLCanvasElement | null = null;
  private grabCtx: CanvasRenderingContext2D | null = null;
  private rafId = 0;
  private running = false;
  private starting: Promise<void> | null = null;

  private subs = new Set<(f: HandFrame | null) => void>();

  private lastVideoTime = -1;
  private lastSeenAt = 0; // 直近で手を検出した時刻
  private status: 'tracking' | 'lost' = 'lost';

  // 冪等な start（§: 二重初期化を防ぐ）
  async start(): Promise<void> {
    if (this.running) return;
    if (this.starting) return this.starting;
    this.starting = this.doStart();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async doStart(): Promise<void> {
    // 画面外に配置する video 要素（子どもには一切見せない、§2.7/§4.2.1）。
    // DOM 未接続のままだと一部ブラウザでデコードがスロットリングされ
    // currentTime が進まず検出ループが空振りし続けるため、必ず接続する。
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.setAttribute('aria-hidden', 'true');
    document.body.appendChild(video);
    this.video = video;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
    } catch (e) {
      this.cleanupVideo();
      throw new CameraUnavailableError(e);
    }

    video.srcObject = this.stream;
    try {
      await video.play();
    } catch (e) {
      this.stop();
      throw new CameraUnavailableError(e);
    }

    // ローカル配信の wasm / モデルのみ使用（外部通信なし、§2.8）
    // BASE_URL: GitHub Pages 等サブパス配信でも解決できるよう絶対パス直書きを避ける
    const base = import.meta.env.BASE_URL;
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    // delegate: 'CPU' — 実機で GPU delegate 時にグラフは起動するのに検出結果が
    // 常に空になる事象を確認したため明示的にCPUへ固定。しきい値もやや緩和。
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${base}mediapipe/hand_landmarker.task`,
        delegate: 'CPU',
      },
      numHands: 1,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
    });

    this.grabCanvas = document.createElement('canvas');
    this.grabCanvas.width = video.videoWidth || 640;
    this.grabCanvas.height = video.videoHeight || 480;
    this.grabCtx = this.grabCanvas.getContext('2d', { willReadFrequently: true });

    this.running = true;
    this.lastSeenAt = performance.now();
    this.status = 'lost';
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.cleanupVideo();
    this.grabCanvas = null;
    this.grabCtx = null;
    this.lastVideoTime = -1;
    this.status = 'lost';
  }

  private cleanupVideo(): void {
    if (this.video) {
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
  }

  subscribe(cb: (f: HandFrame | null) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private setStatus(next: 'tracking' | 'lost'): void {
    if (this.status === next) return; // 遷移時のみ通知（連打防止, §4.2.5）
    this.status = next;
    this.onStatus?.(next);
  }

  private loop = (): void => {
    if (!this.running || !this.video || !this.landmarker) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    // 新しいフレームが来たときのみ検出（VIDEO モードの要件）
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    let frame: HandFrame | null = null;
    try {
      let input: HTMLVideoElement | HTMLCanvasElement = this.video;
      if (this.grabCanvas && this.grabCtx) {
        if (this.grabCanvas.width !== this.video.videoWidth && this.video.videoWidth > 0) {
          this.grabCanvas.width = this.video.videoWidth;
          this.grabCanvas.height = this.video.videoHeight;
        }
        this.grabCtx.drawImage(this.video, 0, 0);
        input = this.grabCanvas;
      }
      const result = this.landmarker.detectForVideo(input, now);
      const hand = result.landmarks[0];
      if (hand && hand.length > IDX_MIDDLE_MCP) {
        // handedness スコアを confidence に流用（無ければ 1）
        const score = result.handedness[0]?.[0]?.score;
        frame = {
          indexTip: { x: 1 - hand[IDX_INDEX_TIP].x, y: hand[IDX_INDEX_TIP].y },
          thumbTip: { x: 1 - hand[IDX_THUMB_TIP].x, y: hand[IDX_THUMB_TIP].y },
          wrist: { x: 1 - hand[IDX_WRIST].x, y: hand[IDX_WRIST].y },
          middleMcp: { x: 1 - hand[IDX_MIDDLE_MCP].x, y: hand[IDX_MIDDLE_MCP].y },
          confidence: typeof score === 'number' ? score : 1,
          timestamp: now,
        };
      }
    } catch {
      // 単一フレームの検出失敗は無視（次フレームで回復）
      frame = null;
    }

    if (frame) {
      this.lastSeenAt = now;
      this.setStatus('tracking');
    } else if (now - this.lastSeenAt >= LOST_GRACE_MS) {
      this.setStatus('lost');
    }

    this.subs.forEach((cb) => cb(frame));
  };
}
