// シェル: 画面の切り替えと、設定・記録・エンジンのつなぎ込みだけを持つ

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Store } from '../core/storage/db';
import { SessionEngine } from '../core/engine/SessionEngine';
import type { PickContext } from '../core/engine/questions';
import type { AppData, LearningStage, ModeId, TaskCategory } from '../core/types';
import { isoWithOffset, jstDateKey } from '../core/time';
import { HomeScreen, ModeScreen, StartScreen } from './screens/HomeScreens';
import { PlayScreen, type PlaySpec } from './screens/PlayScreen';
import { CraftBookScreen } from './screens/CraftBookScreen';
import { EndScreen } from './screens/EndScreen';
import { ParentGate } from './ParentGate';
import { ParentScreen } from './parent/ParentScreen';

type Screen =
  | { name: 'start' }
  | { name: 'home' }
  | { name: 'mode'; mode: ModeId }
  | { name: 'play'; spec: PlaySpec; key: number }
  | { name: 'craft' }
  | { name: 'end' }
  | { name: 'parent'; back: Screen };

// 保存領域は1つだけ開く（StrictMode で effect が2回走っても同じ Store を使う）
let storePromise: Promise<Store> | null = null;

export function App() {
  const [store, setStore] = useState<Store | null>(null);
  useEffect(() => {
    storePromise ??= Store.open();
    void storePromise.then(setStore);
  }, []);
  if (!store) return <div className="screen center muted">…</div>;
  return <Loaded store={store} />;
}

function Loaded({ store }: { store: Store }) {
  useSyncExternalStore(
    useCallback((fn: () => void) => store.subscribe(fn), [store]),
    () => store.version,
  );
  const data = store.data;
  const settings = data.profile.settings;
  const learning = data.profile.learning!;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const learningRef = useRef(learning);
  learningRef.current = learning;
  const engineRef = useRef<SessionEngine | null>(null);
  if (!engineRef.current) engineRef.current = new SessionEngine(store, () => settingsRef.current, () => learningRef.current);
  const engine = engineRef.current;
  useEffect(() => () => engine.dispose(), [engine]);

  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const playKey = useRef(0);

  const pickContext = useCallback((): PickContext => {
    const today = jstDateKey(isoWithOffset());
    const recentIds = engine.session?.trials.map((t) => t.question.id) ?? [];
    const priorDayIds = new Set<string>();
    for (const s of store.data.sessions)
      for (const t of s.trials)
        if (t.result?.outcome === 'completed' && jstDateKey(t.startedAt ?? s.startedAt) < today) priorDayIds.add(t.question.id);
    return { recentIds, priorDayIds };
  }, [engine, store]);

  const play = (spec: PlaySpec) => setScreen({ name: 'play', spec, key: ++playKey.current });
  const onCraft = (value: number, parts: number[], mode: ModeId) => {
    store.addCraft({ value, parts, firstMadeAt: isoWithOffset(), modeId: mode });
  };

  const saveProfile = (p: AppData['profile']) => {
    void store.saveProfile(p);
    engine.emitShell({ type: 'settings_changed' });
  };

  const openParent = () => setScreen((cur) => (cur.name === 'parent' ? cur : { name: 'parent', back: cur.name === 'play' ? { name: 'home' } : cur }));
  const childScreen = screen.name !== 'parent';

  return (
    <div className={`app scheme-${settings.colorScheme}${settings.quietMode ? ' quiet' : ''}${settings.reducedMotion ? ' reduce-motion' : ''}`}>
      {screen.name === 'start' && <StartScreen onStart={() => setScreen({ name: 'home' })} />}
      {screen.name === 'home' && (
        <HomeScreen
          s={settings}
          learning={learning}
          onMode={(mode) => setScreen({ name: 'mode', mode })}
          onCraft={() => setScreen({ name: 'craft' })}
          onEnd={() => {
            engine.endSession('child_chose_end');
            setScreen({ name: 'end' });
          }}
        />
      )}
      {screen.name === 'mode' && (
        <ModeScreen
          s={settings}
          mode={screen.mode}
          onBack={() => setScreen({ name: 'home' })}
          onPlay={(task: TaskCategory, stage: LearningStage) => play({ mode: screen.mode, task, stage })}
        />
      )}
      {screen.name === 'play' && (
        <PlayScreen
          key={screen.key}
          spec={screen.spec}
          engine={engine}
          settings={settings}
          learning={learning}
          pickContext={pickContext}
          onCraft={onCraft}
          onExit={() => setScreen({ name: 'mode', mode: screen.spec.mode })}
          onTransfer={play}
        />
      )}
      {screen.name === 'craft' && <CraftBookScreen entries={data.craftBook ?? []} s={settings} onBack={() => setScreen({ name: 'home' })} />}
      {screen.name === 'end' && (
        <EndScreen
          askSelfReport={learning.selfReportEnabled}
          onReport={(r) => {
            const last = store.data.sessions[store.data.sessions.length - 1];
            if (last) void store.updateSession(last.sessionId, { childSelfReport: r });
          }}
          onAgain={() => setScreen({ name: 'start' })}
        />
      )}
      {screen.name === 'parent' && (
        <ParentScreen
          store={store}
          onSaveProfile={saveProfile}
          onEndSession={() => engine.endSession('parent_ended')}
          sessionOpen={engine.hasOpenSession()}
          onClose={() => setScreen(screen.back)}
        />
      )}
      {childScreen && <ParentGate onOpen={openParent} />}
    </div>
  );
}
