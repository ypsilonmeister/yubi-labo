import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBridge, type ModeBridge } from './bridge';
import { Animator } from './Animator';
import { exploredResult, makeResult } from './result';
import { softChime } from '../../core/sound';
import type { Snap } from './snap';

export type DemoPhase = null | 'pick' | 'place';

/**
 * 1問ぶんの共通処理。View は key={qKey} の子で使うこと（問題ごとに状態をリセットするため）。
 */
export function useTrialCore(bridge: ModeBridge) {
  const s = useBridge(bridge);
  const ctx = bridge.ctx;
  const anim = useMemo(() => new Animator(bridge), [bridge]);
  const mistakes = useRef(0);
  const done = useRef(false);
  const [demo, setDemo] = useState<DemoPhase>(null);
  const undoRef = useRef<(() => void) | null>(null);
  const hintRef = useRef<((level: 1 | 2 | 3) => void) | null>(null);

  useEffect(() => {
    anim.revive();
    ctx.emit({ type: 'input_enabled' });
    bridge.handlers.undo = () => undoRef.current?.();
    bridge.handlers.hint = (lvl) => hintRef.current?.(lvl);
    return () => {
      anim.cancel();
      bridge.handlers = {};
    };
  }, [bridge, ctx, anim]);

  const onUndo = useCallback((fn: () => void) => {
    undoRef.current = fn;
  }, []);
  const onHint = useCallback((fn: (level: 1 | 2 | 3) => void) => {
    hintRef.current = fn;
  }, []);

  /** L3: 正しい選択肢をゆっくり示し、目標に置いた様子を見せてから元に戻す */
  const runDemo = useCallback(async () => {
    await anim.run('demo', async () => {
      setDemo('pick');
      await anim.wait(1200);
      setDemo('place');
      await anim.wait(1800);
      setDemo(null);
    });
  }, [anim]);

  const finish = useCallback(
    (solved: boolean) => {
      if (done.current) return;
      done.current = true;
      if (solved) softChime(bridge.state.settings);
      ctx.emit({ type: 'input_disabled', payload: { reason: 'finished' } });
      ctx.complete(
        makeResult({ solved, mistakeCount: mistakes.current, hintCount: bridge.state.hintCount, maxHintLevel: bridge.state.hintLevel }),
      );
    },
    [bridge, ctx],
  );

  const finishExplored = useCallback(() => {
    if (done.current) return;
    done.current = true;
    ctx.emit({ type: 'input_disabled', payload: { reason: 'finished' } });
    ctx.complete(exploredResult());
  }, [ctx]);

  /** v2.2: ダイレクト操作のとき、置き先 to へのワンタップ・オートスナップ。OFF なら undefined（選ぶ→置き先をタップ） */
  const snap = useCallback(
    (to: string | null | undefined): Snap | undefined =>
      s.settings.directManipulation && to ? { to, ms: anim.ms(420), run: (fly) => anim.run('snap', fly) } : undefined,
    [s.settings.directManipulation, anim],
  );

  return {
    s,
    q: s.question!,
    direct: s.settings.directManipulation,
    snap,
    settings: s.settings,
    hintLevel: s.hintLevel,
    ctx,
    anim,
    mistakes,
    done,
    demo,
    runDemo,
    finish,
    finishExplored,
    onUndo,
    onHint,
  };
}

export type TrialCore = ReturnType<typeof useTrialCore>;

/** 選択（タップで選ぶ・もう一度タップで解除）。§8.1 */
export function usePicker(core: Pick<TrialCore, 'ctx'>) {
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = useCallback(
    (key: string, value?: number) => {
      setSelected((cur) => {
        if (cur === key) {
          core.ctx.emit({ type: 'item_deselected', payload: { key } });
          return null;
        }
        core.ctx.emit({ type: 'item_selected', payload: { key, value } });
        return key;
      });
    },
    [core.ctx],
  );
  const clear = useCallback(() => setSelected(null), []);
  return { selected, toggle, clear, setSelected };
}
