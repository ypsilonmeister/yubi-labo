import { useEffect, useRef, useState } from 'react';
import { audioGuide } from '../../core/audio/AudioGuide';
import type { HandTracker } from '../../core/tracking/HandTracker';
import {
  CALIB_TARGETS,
  saveCalibration,
  solveAffine,
  type CalibrationMatrix,
} from '../../core/tracking/calibration';

// SPEC §4.2.2 — 5点キャリブレーション（みぎうえ→ひだりした→まんなか→ひだりうえ→みぎした）。
// 星を指さして約1秒静止で取得。数字なし、リングが満ちる表現のみ。
// 点数を3→5に増やしたのは、着座姿勢での指先の実移動量が小さく3点解だと
// 変換行列が不安定になりやすいため（最小二乗フィットで安定化、calibration.ts参照）。

const VOICE_KEYS = [
  'calib.topright',
  'calib.bottomleft',
  'calib.center',
  'calib.topleft',
  'calib.bottomright',
] as const;
const HOLD_MS = 1000;
const HOLD_RADIUS_CAM = 0.07; // カメラ正規化座標での静止判定半径（手ぶれを許容する程度に緩和）
// 次の星へ指を移動する時間を確保するクールダウン。無いと、前の点で成功した
// 直後にまだ指が同じ場所にある間に次の判定が始まり、そのまま連続成功して
// しまう（=事実上ひとつ前の星の位置で誤ってサンプリングされる）。
const MOVE_COOLDOWN_MS = 600;

export function CalibrationScreen({
  tracker,
  onDone,
  onCancel,
}: {
  tracker: HandTracker;
  onDone: (m: CalibrationMatrix) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [handSeen, setHandSeen] = useState(false);

  const samplesRef = useRef<Array<{ x: number; y: number }>>([]);
  const bufferRef = useRef<Array<{ t: number; x: number; y: number }>>([]);
  const stepRef = useRef(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // 次の星への移動中は静止判定を行わない猶予期間（performance.now() 基準の終了時刻）
  const cooldownUntilRef = useRef(performance.now() + MOVE_COOLDOWN_MS);

  useEffect(() => {
    // 親の再レンダーで音声・進行がリセットされないよう deps は tracker のみ
    audioGuide.speak(VOICE_KEYS[stepRef.current]);

    const unsub = tracker.subscribe((frame) => {
      if (doneRef.current) return;
      if (!frame || frame.confidence < 0.5) {
        setHandSeen(false);
        bufferRef.current = [];
        setProgress(0);
        return;
      }
      setHandSeen(true);
      const now = frame.timestamp;

      if (now < cooldownUntilRef.current) {
        // 移動猶予中: バッファを溜めず、進捗も表示しない
        bufferRef.current = [];
        setProgress(0);
        return;
      }

      const buf = bufferRef.current;
      buf.push({ t: now, x: frame.indexTip.x, y: frame.indexTip.y });
      while (buf.length > 0 && now - buf[0].t > HOLD_MS) buf.shift();

      // 直近 HOLD_MS の指先が半径内に収まっていれば「静止」。
      // 手ぶれで一瞬だけ半径を超えても、直近サンプルを起点に継続判定できるよう
      // バッファ全消去はせず末尾側から徐々に切り詰める（進捗のガクつき防止）。
      let cx = buf.reduce((s, p) => s + p.x, 0) / buf.length;
      let cy = buf.reduce((s, p) => s + p.y, 0) / buf.length;
      while (buf.length > 1 && !buf.every((p) => Math.hypot(p.x - cx, p.y - cy) < HOLD_RADIUS_CAM)) {
        buf.shift();
        cx = buf.reduce((s, p) => s + p.x, 0) / buf.length;
        cy = buf.reduce((s, p) => s + p.y, 0) / buf.length;
      }
      const heldMs = buf.length > 1 ? now - buf[0].t : 0;
      // 表示上のガクつきを抑えるため、進捗は後退させず単調に増やす
      // （成立の可否そのものは heldMs で判定するので判定の正しさには影響しない）
      setProgress((prev) => Math.max(prev * 0.9, Math.min(1, heldMs / HOLD_MS)));

      if (heldMs >= HOLD_MS) {
        samplesRef.current.push({ x: cx, y: cy });
        bufferRef.current = [];
        setProgress(0);
        audioGuide.chime();

        const next = stepRef.current + 1;
        if (next < CALIB_TARGETS.length) {
          stepRef.current = next;
          setStep(next);
          cooldownUntilRef.current = now + MOVE_COOLDOWN_MS;
          audioGuide.speak(VOICE_KEYS[next]);
        } else {
          doneRef.current = true;
          try {
            const m = solveAffine(
              samplesRef.current.map((cam, i) => ({
                cam,
                logical: CALIB_TARGETS[i],
              })),
            );
            void saveCalibration(m);
            audioGuide.speak('calib.done');
            onDoneRef.current(m);
          } catch {
            // 全点が一直線等で解けない → 最初からやり直し（責めない、無音でリスタート）
            samplesRef.current = [];
            doneRef.current = false;
            stepRef.current = 0;
            setStep(0);
            cooldownUntilRef.current = now + MOVE_COOLDOWN_MS;
            audioGuide.speak(VOICE_KEYS[0]);
          }
        }
      }
    });
    return unsub;
  }, [tracker]);

  return (
    <div className="calib-screen">
      {CALIB_TARGETS.map((t, i) => (
        <div
          key={i}
          className={`calib-star${i === step ? ' current' : ''}${i < step ? ' captured' : ''}`}
          style={{ left: t.x, top: t.y }}
        >
          {i < step ? '✨' : '⭐'}
          {i === step && (
            <div
              className="calib-ring"
              style={{
                background: `conic-gradient(rgba(255,224,130,0.95) ${progress * 360}deg, rgba(255,255,255,0.12) 0deg)`,
              }}
            />
          )}
        </div>
      ))}
      <div className={`hand-status-icon ${handSeen ? 'ok' : 'lost'}`} aria-hidden="true">
        🖐
      </div>
      <button className="icon-button back-button" onClick={onCancel} aria-label="もどる">
        🏠
      </button>
    </div>
  );
}
