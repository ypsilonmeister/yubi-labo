// GameModePlugin（§10）を React コンポーネントで実装するためのアダプタ。
// シェルは plugin のメソッドだけを呼び、モードの中身は View が持つ。

import { createRoot, type Root } from 'react-dom/client';
import { useSyncExternalStore, type ComponentType } from 'react';
import { ErrorBoundary, MODE_ERROR_EVENT } from '../../app/ErrorBoundary';
import type { AccessibilitySettings, GameContext, GameModePlugin, LearningStage, Question, Strategy, TaskCategory } from '../../core/types';

export interface BridgeState {
  question: Question | null;
  /** 問題を読み込むたびに増える（View の key に使う） */
  qKey: number;
  settings: Readonly<AccessibilitySettings>;
  hintLevel: 0 | 1 | 2 | 3;
  hintCount: number;
  paused: boolean;
  /** シェルが完了せずに試行を閉じた（とばした） */
  closed: boolean;
  /** 閉じた試行の画面に答えが出たことをシェルに知らせる */
  onAnswerShown?: () => void;
}

type Handlers = { undo?: () => void; hint?: (level: 1 | 2 | 3) => void };

export class ModeBridge {
  ctx!: GameContext;
  state: BridgeState;
  handlers: Handlers = {};
  private listeners = new Set<() => void>();

  constructor(settings: Readonly<AccessibilitySettings>) {
    this.state = { question: null, qKey: 0, settings, hintLevel: 0, hintCount: 0, paused: false, closed: false };
  }

  set(patch: Partial<BridgeState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.state;
}

export function useBridge(b: ModeBridge): BridgeState {
  return useSyncExternalStore(b.subscribe, b.getSnapshot);
}

export interface PluginMeta {
  id: GameModePlugin['id'];
  title: string;
  description: string;
  supportedTasks: TaskCategory[];
  supportedStrategies: Strategy[];
  stages: Partial<Record<TaskCategory, LearningStage[]>>;
  group?: 'core' | 'lab';
}

export function createReactPlugin(meta: PluginMeta, View: ComponentType<{ bridge: ModeBridge }>): GameModePlugin {
  let root: Root | null = null;
  let el: HTMLElement | null = null;
  let bridge: ModeBridge | null = null;
  const stageSet = new Set<LearningStage>(['explore', 'transfer', 'revisit']);
  Object.values(meta.stages).forEach((ss) => ss?.forEach((s) => stageSet.add(s)));
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    supportedTasks: meta.supportedTasks,
    supportedStages: [...stageSet],
    supportedStrategies: meta.supportedStrategies,
    stagesFor: (t) => meta.stages[t] ?? [],
    group: meta.group ?? 'core',
    mount(container, context) {
      bridge = new ModeBridge(context.settings);
      bridge.ctx = context;
      // マウントごとに専用の要素を作る（前のルートの遅延アンマウントと衝突しないように）
      el = document.createElement('div');
      el.className = 'plugin-root';
      container.appendChild(el);
      root = createRoot(el);
      const node = el;
      // 描画例外はここで止め、PlayScreen 側の境界へイベントで知らせる（白画面にしない）
      root.render(
        <ErrorBoundary onBack={() => {}} fallback={null} onError={() => node.dispatchEvent(new CustomEvent(MODE_ERROR_EVENT, { bubbles: true }))}>
          <View bridge={bridge} />
        </ErrorBoundary>,
      );
    },
    loadQuestion(q) {
      bridge?.set({ question: q, qKey: (bridge.state.qKey ?? 0) + 1, hintLevel: 0, hintCount: 0, paused: false, closed: false, onAnswerShown: undefined });
    },
    showHint(level) {
      if (!bridge) return;
      bridge.set({ hintLevel: Math.max(bridge.state.hintLevel, level) as 0 | 1 | 2 | 3, hintCount: bridge.state.hintCount + 1 });
      bridge.handlers.hint?.(level);
    },
    undo() {
      bridge?.handlers.undo?.();
    },
    pause() {
      bridge?.set({ paused: true });
    },
    resume() {
      bridge?.set({ paused: false });
    },
    applySettings(s) {
      bridge?.set({ settings: s });
    },
    closeTrial(onAnswerShown) {
      bridge?.set({ closed: true, onAnswerShown });
    },
    destroy() {
      const r = root;
      const node = el;
      root = null;
      el = null;
      if (bridge) {
        bridge.handlers = {};
        bridge = null;
      }
      // React の描画中に別ルートを同期アンマウントしないよう、次のタスクで外す
      setTimeout(() => {
        r?.unmount();
        node?.remove();
      }, 0);
    },
  };
}
