import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage } from './Stage';
import { VisualTimer } from './VisualTimer';
import { HighlightPlayer } from './HighlightPlayer';
import { HandCursorRing } from './HandCursorRing';
import { StartScreen } from './screens/StartScreen';
import { HomeScreen } from './screens/HomeScreen';
import { FarmScreen } from './screens/FarmScreen';
import { EndScreen } from './screens/EndScreen';
import { ZukanScreen } from './screens/ZukanScreen';
import { CalibrationScreen } from './screens/CalibrationScreen';
import { MazeGame } from '../games/maze/MazeGame';
import { KanjiGame } from '../games/kanji/KanjiGame';
import { MojiGame } from '../games/moji/MojiGame';
import { audioGuide } from '../core/audio/AudioGuide';
import { SessionTimer } from '../core/engine/SessionTimer';
import { selectLaunchHighlights, type Highlight } from '../core/engine/highlights';
import {
  currentInputKind,
  disableHandMode,
  enableHandMode,
  type InputMode,
} from '../core/input/inputProvider';
import type { HandTracker } from '../core/tracking/HandTracker';
import type { CalibrationMatrix } from '../core/tracking/calibration';
import { getSetting, saveSession, type PlayRecord, type SessionRecord } from '../core/storage/db';

type Screen =
  | 'start'
  | 'launch-highlight'
  | 'home'
  | 'maze'
  | 'kanji'
  | 'moji'
  | 'farm'
  | 'zukan'
  | 'calibrate'
  | 'end';
// シェル層オーバーレイ: lost=トラッキングロスト（§4.2.5）、rest=ひとやすみ（§4.2.6）
type Overlay = 'none' | 'lost' | 'found' | 'rest';

const REST_AFTER_SEC = 90;
const REST_DURATION_MS = 10_000;

export function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [ratio, setRatio] = useState(1);
  const [blink, setBlink] = useState(false);
  const [endRequested, setEndRequested] = useState(false);
  const [launchHighlights, setLaunchHighlights] = useState<Highlight[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>('pointer');
  const [handStatus, setHandStatus] = useState<'tracking' | 'lost'>('tracking');
  const [overlay, setOverlay] = useState<Overlay>('none');

  const timerRef = useRef<SessionTimer | null>(null);
  const sessionRef = useRef<SessionRecord | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const screenRef = useRef<Screen>('start');
  const overlayRef = useRef<Overlay>('none');
  const handUseSecRef = useRef(0);
  screenRef.current = screen;
  overlayRef.current = overlay;

  // 🌟タップ = AudioContext の解錠を兼ねる（SPEC §9）
  const begin = useCallback(async () => {
    await audioGuide.unlock();

    // セッション長: 保護者設定（デフォルト5分）。開発用に ?min= で上書き可。
    const paramMin = new URLSearchParams(location.search).get('min');
    const minutes = paramMin ? Math.max(0.2, parseFloat(paramMin)) : await getSetting('sessionMinutes', 5);

    const timer = new SessionTimer(minutes * 60_000);
    timer.onWarn = () => {
      audioGuide.speak('app.session.warn');
      setBlink(true);
    };
    timer.onEnd = () => setEndRequested(true);
    timer.subscribe((_ms, r) => setRatio(r));
    timerRef.current = timer;
    sessionRef.current = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      endedAt: 0,
      inputKind: currentInputKind(),
      plays: [],
    };

    // 「きのうのきみ」（SPEC §4.6）: 記録がある場合のみ再生
    const highlights = await selectLaunchHighlights();
    if (highlights.length > 0) {
      setLaunchHighlights(highlights);
      setScreen('launch-highlight');
    } else {
      audioGuide.speak('app.welcome');
      setScreen('home');
    }
  }, []);

  const goHome = useCallback(() => {
    audioGuide.speak('app.welcome');
    setScreen('home');
  }, []);

  const openMaze = useCallback(() => {
    setScreen('maze');
    timerRef.current?.start();
  }, []);

  const openKanji = useCallback(() => {
    setScreen('kanji');
    timerRef.current?.start();
  }, []);

  const openMoji = useCallback(() => {
    setScreen('moji');
    timerRef.current?.start();
  }, []);

  const openFarm = useCallback(() => setScreen('farm'), []);
  const openZukan = useCallback(() => setScreen('zukan'), []);
  const backHome = useCallback(() => setScreen('home'), []);

  const recordPlay = useCallback((play: PlayRecord) => {
    sessionRef.current?.plays.push(play);
  }, []);

  const finishSession = useCallback(() => {
    timerRef.current?.pause();
    const s = sessionRef.current;
    if (s) {
      s.endedAt = Date.now();
      void saveSession(s);
    }
    setScreen('end');
  }, []);

  // ── ハンドトラッキング（P3, SPEC §4.2） ──────────────────────

  // §4.2.5 原則7: ロストは機器の問題として提示し、ゲームを自動ポーズ
  const handleTrackStatus = useCallback((s: 'tracking' | 'lost') => {
    setHandStatus(s);
    const inGame = screenRef.current === 'maze' || screenRef.current === 'kanji' || screenRef.current === 'moji';
    if (s === 'lost') {
      if (inGame && overlayRef.current === 'none') {
        timerRef.current?.pause();
        setOverlay('lost');
        audioGuide.speak('hand.lost');
      }
    } else if (overlayRef.current === 'lost') {
      setOverlay('found');
      audioGuide.speak('hand.found');
      window.setTimeout(() => {
        setOverlay('none');
        timerRef.current?.start();
      }, 3000);
    }
  }, []);

  const stopHand = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    disableHandMode();
    setInputMode('pointer');
    setOverlay('none');
    if (sessionRef.current) sessionRef.current.inputKind = currentInputKind();
  }, []);

  const finishHandEnable = useCallback(async (matrix: CalibrationMatrix) => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    const { HandPointerSource } = await import('../core/input/HandPointerSource');
    const gesture = await getSetting<'dwell' | 'pinch'>('hand.gesture', 'dwell');
    enableHandMode(() => new HandPointerSource(tracker, matrix, gesture));
    setInputMode('hand');
    if (sessionRef.current) sessionRef.current.inputKind = 'hand';
    setScreen('home');
  }, []);

  const toggleInput = useCallback(async () => {
    if (inputMode === 'hand') {
      stopHand();
      return;
    }
    try {
      // MediaPipe 一式はハンド初回有効化まで読み込まない（バンドル分離）
      const [{ HandTracker }, calib] = await Promise.all([
        import('../core/tracking/HandTracker'),
        import('../core/tracking/calibration'),
      ]);
      const tracker = new HandTracker();
      tracker.onStatus = handleTrackStatus;
      await tracker.start();
      trackerRef.current = tracker;
      const saved = await calib.loadCalibration();
      if (saved) {
        await finishHandEnable(saved);
      } else {
        setScreen('calibrate');
      }
    } catch {
      // 原則7: カメラ側の問題として伝える（子どものせいにしない）
      trackerRef.current?.stop();
      trackerRef.current = null;
      audioGuide.speak('camera.unavailable');
    }
  }, [inputMode, stopHand, finishHandEnable, handleTrackStatus]);

  const openCalibrate = useCallback(() => setScreen('calibrate'), []);
  const cancelCalibrate = useCallback(() => {
    if (inputMode !== 'hand') stopHand();
    setScreen('home');
  }, [inputMode, stopHand]);

  // §4.2.6 疲労対策: ハンド入力で連続90秒プレイ → 10秒の「ひとやすみ」
  useEffect(() => {
    const inGame = screen === 'maze' || screen === 'kanji' || screen === 'moji';
    if (inputMode !== 'hand' || !inGame) {
      handUseSecRef.current = 0;
      return;
    }
    if (overlay !== 'none') return;
    const iv = window.setInterval(() => {
      handUseSecRef.current += 1;
      if (handUseSecRef.current >= REST_AFTER_SEC) {
        handUseSecRef.current = 0;
        timerRef.current?.pause();
        setOverlay('rest');
        audioGuide.speak('hand.rest');
        window.setTimeout(() => {
          setOverlay('none');
          audioGuide.speak('hand.rest.done');
          timerRef.current?.start();
        }, REST_DURATION_MS);
      }
    }, 1000);
    return () => window.clearInterval(iv);
  }, [screen, inputMode, overlay]);

  const inGame = screen === 'maze' || screen === 'kanji' || screen === 'moji';

  return (
    <Stage>
      {(screen === 'home' || inGame) && <VisualTimer ratio={ratio} blink={blink} />}
      {screen === 'start' && <StartScreen onBegin={begin} />}
      {screen === 'launch-highlight' && (
        <HighlightPlayer highlights={launchHighlights} withIntro onDone={goHome} />
      )}
      {screen === 'home' && (
        <HomeScreen
          onOpenMaze={openMaze}
          onOpenKanji={openKanji}
          onOpenMoji={openMoji}
          onOpenFarm={openFarm}
          onOpenZukan={openZukan}
          inputMode={inputMode}
          onToggleInput={() => void toggleInput()}
          onCalibrate={openCalibrate}
        />
      )}
      {screen === 'farm' && <FarmScreen onBack={backHome} />}
      {screen === 'zukan' && <ZukanScreen onBack={backHome} />}
      {screen === 'calibrate' &&
        (trackerRef.current ? (
          <CalibrationScreen
            tracker={trackerRef.current}
            onDone={(m) => void finishHandEnable(m)}
            onCancel={cancelCalibrate}
          />
        ) : (
          <HomeScreen
            onOpenMaze={openMaze}
            onOpenKanji={openKanji}
            onOpenMoji={openMoji}
            onOpenFarm={openFarm}
            onOpenZukan={openZukan}
            inputMode={inputMode}
            onToggleInput={() => void toggleInput()}
            onCalibrate={openCalibrate}
          />
        ))}
      {screen === 'maze' && (
        <MazeGame endRequested={endRequested} onPlay={recordPlay} onFinish={finishSession} />
      )}
      {screen === 'kanji' && (
        <KanjiGame endRequested={endRequested} onPlay={recordPlay} onFinish={finishSession} />
      )}
      {screen === 'moji' && (
        <MojiGame endRequested={endRequested} onPlay={recordPlay} onFinish={finishSession} />
      )}
      {screen === 'end' && <EndScreen session={sessionRef.current} />}

      {/* ハンド入力の共通UI: 状態アイコン・ドウェルリング・オーバーレイ */}
      {inputMode === 'hand' && (screen === 'home' || inGame) && (
        <div
          className={`hand-status-icon ${handStatus === 'tracking' ? 'ok' : 'lost'}`}
          aria-hidden="true"
        >
          🖐
        </div>
      )}
      {inputMode === 'hand' && inGame && <HandCursorRing />}
      {overlay === 'lost' && (
        <div className="shell-overlay">
          <div className="overlay-icon">📷</div>
          <div className="overlay-sub">🖐</div>
        </div>
      )}
      {overlay === 'found' && (
        <div className="shell-overlay">
          <div className="overlay-icon">🖐</div>
          <div className="count-dots" aria-hidden="true">
            <span>●</span>
            <span>●</span>
            <span>●</span>
          </div>
        </div>
      )}
      {overlay === 'rest' && (
        <div className="shell-overlay">
          <div className="overlay-icon rest-float">🙆</div>
        </div>
      )}
    </Stage>
  );
}
