// Mode M：九九テストれんしゅう（v2.16・§9.11）。学校の口頭テストと同じ形（のぼり・くだり・バラバラ）の リハーサル。
// 式を見て声で答え、「こたえを みる」で確かめて、「いえた／まだ」を自分で（親判定では聞いていた親が）押す。
// 点・合否・順位・タイマー・効果音はない。1式が1試行。つぎの式へはシェルのボタンで本人が進む
// （申告のあとは「つぎへ」、とばしたあとは「つぎの しきへ」）。

import { useEffect, useRef, useState } from 'react';
import { createReactPlugin, useBridge, type ModeBridge } from '../kit/bridge';
import { useTrialCore } from '../kit/useTrialCore';
import { KUKU_REPORT, KUKU_REVEAL, kukuResult, type KukuPair } from '../../core/math/kuku';
import { canReadAloud, pickLocalVoice, speak, speechApi, stopSpeaking } from '../../core/speech';
import { KukuBoard } from './KukuBoard';

/** 端末内の日本語の声があるか（声の一覧は あとから届くことがある） */
function useLocalVoice(): boolean {
  const has = () => !!pickLocalVoice(speechApi()?.getVoices() ?? []);
  const [ok, setOk] = useState(has);
  useEffect(() => {
    const api = speechApi();
    if (!api) return;
    const update = () => setOk(has());
    update();
    api.addEventListener?.('voiceschanged', update);
    return () => api.removeEventListener?.('voiceschanged', update);
  }, []);
  return ok;
}

function Task({ bridge, sequence, onSequence }: { bridge: ModeBridge; sequence: boolean; onSequence: (on: boolean) => void }) {
  const core = useTrialCore(bridge);
  const { q, settings } = core;
  const pair: KukuPair = [q.operands[0], q.operands[1]];
  const form = q.rehearsal?.form ?? 'up';
  const judge = q.rehearsal?.judge ?? 'self';
  const [revealed, setRevealed] = useState(false);
  const [reported, setReported] = useState(false);
  // 答えを一度でも見たか。見たあとのヒントは「ヒントを使って答えた」に数えない
  const seen = useRef(false);
  const hinted = useRef(false);

  core.onHint(() => {
    if (!seen.current) hinted.current = true;
  });
  // とばして閉じた試行には記録が残らないので、画面でも答えの確認と申告を受けつけない
  const closed = () => core.done.current || bridge.state.closed;
  core.onUndo(() => {
    if (closed() || !revealed) return;
    core.ctx.emit({ type: 'undo' });
    setRevealed(false);
  });

  const voice = useLocalVoice();
  const readable = voice && canReadAloud(settings);
  const say = () => speak(`${pair[0]} かける ${pair[1]}`, bridge.state.settings);
  const paused = core.s.paused;
  const quiet = !readable || paused;
  useEffect(() => {
    if (quiet) stopSpeaking();
  }, [quiet]);
  // 式が出たときに1回だけ読む（読み上げ ON のとき。答えは読まない）
  const spoken = useRef(false);
  useEffect(() => {
    if (!quiet && !spoken.current) spoken.current = say();
  });
  useEffect(() => () => stopSpeaking(), []);

  const reveal = () => {
    if (closed() || revealed) return;
    seen.current = true;
    core.ctx.emit({ type: 'attempt', payload: { action: KUKU_REVEAL } });
    setRevealed(true);
  };

  const report = (said: boolean) => {
    if (closed() || !revealed) return;
    core.done.current = true;
    setReported(true);
    core.ctx.emit({
      type: 'decision_made',
      // 機械の判定ではなく、自己確認（self）か親判定（parent）の申告
      payload: { action: KUKU_REPORT, said, judgedBy: judge, form, hintUsed: hinted.current, sequenceShown: form === 'down' && sequence },
    });
    core.ctx.emit({ type: 'input_disabled', payload: { reason: 'finished' } });
    core.ctx.complete(kukuResult(said, hinted.current));
  };

  return (
    <KukuBoard
      pair={pair}
      form={form}
      judge={judge}
      revealed={revealed}
      reported={reported}
      skipped={core.s.closed}
      hint={core.hintLevel >= 1}
      sequence={sequence}
      onReveal={reveal}
      onReport={report}
      onToggleSequence={() => {
        core.ctx.emit({ type: 'settings_changed', payload: { kukuSequence: !sequence } });
        onSequence(!sequence);
      }}
      onSpeak={readable ? say : undefined}
    />
  );
}

function View({ bridge }: { bridge: ModeBridge }) {
  const st = useBridge(bridge);
  // くだりの並び（初期は表示）。問題をまたいで、本人が切り替えた状態を保つ
  const [sequence, setSequence] = useState(true);
  if (!st.question) return null;
  return <Task key={st.qKey} bridge={bridge} sequence={sequence} onSequence={setSequence} />;
}

export const KukuMode = createReactPlugin(
  {
    id: 'mode_m_kuku',
    title: 'くくテスト れんしゅう',
    description:
      '九九の口頭テストと同じ形（のぼり・くだり・バラバラ・ぜんぶの段）のリハーサル。式を見て声で答え、答えを確かめて「いえた／まだ」を自己確認か親判定で記録する。点数・合否・順位・タイマーはない。',
    supportedTasks: ['kuku_rehearsal'],
    supportedStrategies: ['none'],
    stages: { kuku_rehearsal: ['construct'] },
    group: 'core',
  },
  View,
);
