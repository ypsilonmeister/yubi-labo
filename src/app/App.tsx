import { useCallback, useRef, useState } from 'react';
import { Stage } from './Stage';
import { VisualTimer } from './VisualTimer';
import { HighlightPlayer } from './HighlightPlayer';
import { StartScreen } from './screens/StartScreen';
import { HomeScreen } from './screens/HomeScreen';
import { FarmScreen } from './screens/FarmScreen';
import { EndScreen } from './screens/EndScreen';
import { MazeGame } from '../games/maze/MazeGame';
import { audioGuide } from '../core/audio/AudioGuide';
import { SessionTimer } from '../core/engine/SessionTimer';
import { selectLaunchHighlights, type Highlight } from '../core/engine/highlights';
import { detectPointerKind } from '../core/input/PointerSource';
import { getSetting, saveSession, type PlayRecord, type SessionRecord } from '../core/storage/db';

type Screen = 'start' | 'launch-highlight' | 'home' | 'maze' | 'farm' | 'end';

export function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [ratio, setRatio] = useState(1);
  const [blink, setBlink] = useState(false);
  const [endRequested, setEndRequested] = useState(false);
  const [launchHighlights, setLaunchHighlights] = useState<Highlight[]>([]);

  const timerRef = useRef<SessionTimer | null>(null);
  const sessionRef = useRef<SessionRecord | null>(null);

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
      inputKind: detectPointerKind(),
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

  const openFarm = useCallback(() => setScreen('farm'), []);
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

  return (
    <Stage>
      {(screen === 'home' || screen === 'maze') && <VisualTimer ratio={ratio} blink={blink} />}
      {screen === 'start' && <StartScreen onBegin={begin} />}
      {screen === 'launch-highlight' && (
        <HighlightPlayer highlights={launchHighlights} withIntro onDone={goHome} />
      )}
      {screen === 'home' && <HomeScreen onOpenMaze={openMaze} onOpenFarm={openFarm} />}
      {screen === 'farm' && <FarmScreen onBack={backHome} />}
      {screen === 'maze' && (
        <MazeGame endRequested={endRequested} onPlay={recordPlay} onFinish={finishSession} />
      )}
      {screen === 'end' && <EndScreen session={sessionRef.current} />}
    </Stage>
  );
}
