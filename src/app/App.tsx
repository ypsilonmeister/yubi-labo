import { useCallback, useRef, useState } from 'react';
import { Stage } from './Stage';
import { VisualTimer } from './VisualTimer';
import { StartScreen } from './screens/StartScreen';
import { HomeScreen } from './screens/HomeScreen';
import { DummyGame } from './screens/DummyGame';
import { EndScreen } from './screens/EndScreen';
import { audioGuide } from '../core/audio/AudioGuide';
import { SessionTimer } from '../core/engine/SessionTimer';
import { detectPointerKind } from '../core/input/PointerSource';
import { getSetting, saveSession, type PlayRecord, type SessionRecord } from '../core/storage/db';

type Screen = 'start' | 'home' | 'game' | 'end';

export function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [ratio, setRatio] = useState(1);
  const [blink, setBlink] = useState(false);
  const [endRequested, setEndRequested] = useState(false);

  const timerRef = useRef<SessionTimer | null>(null);
  const sessionRef = useRef<SessionRecord | null>(null);

  // 🌟タップ = AudioContext の解錠を兼ねる（SPEC §9）
  const begin = useCallback(async () => {
    await audioGuide.unlock();
    const minutes = await getSetting('sessionMinutes', 5);
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
    audioGuide.speak('app.welcome');
    setScreen('home');
  }, []);

  const openGame = useCallback(() => {
    setScreen('game');
    timerRef.current?.start();
  }, []);

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
      {screen !== 'start' && screen !== 'end' && <VisualTimer ratio={ratio} blink={blink} />}
      {screen === 'start' && <StartScreen onBegin={begin} />}
      {screen === 'home' && <HomeScreen onOpenGame={openGame} />}
      {screen === 'game' && (
        <DummyGame endRequested={endRequested} onPlay={recordPlay} onFinish={finishSession} />
      )}
      {screen === 'end' && <EndScreen />}
    </Stage>
  );
}
