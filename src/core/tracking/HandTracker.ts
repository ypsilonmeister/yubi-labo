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
  private rafId = 0;
  private running = false;
  private starting: Promise<void> | null = null;

  private subs = new Set<(f: HandFrame | null) => void>();

  private lastVideoTime = -1;
  private lastSeenAt = 0; // 直近で手を検出した時刻
  private status: 'tracking' | 'lost' = 'lost';
  private lastDebugLogAt = 0; // TEMP DEBUG

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
    // TEMP DEBUG: ?debugcam=1 で開発者が実際の映像を目視確認できるようにする（原因特定後に削除）
    const debugCam = new URLSearchParams(location.search).has('debugcam');
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted = true;
    if (debugCam) {
      video.style.position = 'fixed';
      video.style.right = '8px';
      video.style.bottom = '8px';
      video.style.width = '240px';
      video.style.height = '180px';
      video.style.zIndex = '99999';
      video.style.border = '2px solid red';
      video.style.transform = 'scaleX(-1)';
    } else {
      video.style.position = 'fixed';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
    }
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
    // TEMP DEBUG: play() 直後の状態（原因特定後に削除）
    console.debug('[HandTracker] after play()', {
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      streamActive: this.stream.active,
      trackState: this.stream.getVideoTracks()[0]?.readyState,
    });

    // ローカル配信の wasm / モデルのみ使用（外部通信なし、§2.8）
    // BASE_URL: GitHub Pages 等サブパス配信でも解決できるよう絶対パス直書きを避ける
    const base = import.meta.env.BASE_URL;
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    // TEMP DEBUG: video/currentTime/landmarksゼロの切り分け用にCPU delegateを明示
    // （デフォルトはGPUだが、環境によってはグラフは起動するのに検出結果が
    // 常に空になる既知の相性問題がある）
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
    // TEMP DEBUG: 1秒おきにループ生死とvideo状態を必ず出す（原因特定後に削除）
    if (now - this.lastDebugLogAt > 1000) {
      this.lastDebugLogAt = now;
      console.debug('[HandTracker] loop alive', {
        readyState: this.video.readyState,
        currentTime: this.video.currentTime,
        lastVideoTime: this.lastVideoTime,
        videoWidth: this.video.videoWidth,
        videoHeight: this.video.videoHeight,
        paused: this.video.paused,
      });
    }
    // 新しいフレームが来たときのみ検出（VIDEO モードの要件）
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    let frame: HandFrame | null = null;
    try {
      const result = this.landmarker.detectForVideo(this.video, now);
      // TEMP DEBUG: 検出状況を可視化するための一時ログ（原因特定後に削除）
      if (Math.random() < 0.2) {
        console.debug('[HandTracker] videoSize', this.video.videoWidth, this.video.videoHeight,
          'landmarks', result.landmarks.length);
      }
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
    } catch (e) {
      // TEMP DEBUG: 単一フレームの検出失敗は無視（次フレームで回復）— 原因特定のため一時的に記録
      console.error('[HandTracker] detectForVideo failed', e);
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
