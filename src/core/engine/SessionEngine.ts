// セッション（1回の着席）＞ 試行（1問）の記録を受け持つ（§11.1）。
// §10: 時刻はエンジンだけが付与する。complete() は各問1回のみ有効。

import type { AccessibilitySettings, GameContext, GameEvent, LearningSettings, ModeId, Question, Session, Trial, TrialResult } from '../types';
import type { Store } from '../storage/db';
import { isoWithOffset, timeOfDayOf, uid } from '../time';
import { validateQuestion } from './questions';

export interface TrialHandle {
  trial: Trial;
  context: GameContext;
  /** 終わっていなければ skipped / abandoned で閉じる */
  close(outcome: 'skipped' | 'abandoned'): void;
  isDone(): boolean;
}

export class SessionEngine {
  session: Session | null = null;
  private perfStart = 0;
  private current: { trial: Trial; done: boolean } | null = null;
  private onVisibility = () => {
    if (!this.current || this.current.done) return;
    this.push(this.current.trial, { type: document.hidden ? 'visibility_hidden' : 'visibility_visible' });
    if (document.hidden) void this.store.flush();
  };
  private onPageHide = () => {
    if (this.current && !this.current.done) this.finishTrial(this.current, null, 'abandoned');
    if (this.session && !this.session.endedAt) {
      this.session.endedAt = isoWithOffset();
      this.session.endReason = 'app_closed';
      this.store.saveSession(this.session, true);
    }
  };

  /** 試行が閉じたとき（完了・スキップ・中断）に呼ばれる。PlayScreen が設定する */
  onTrialDone: ((trial: Trial) => void) | null = null;

  constructor(
    private store: Store,
    private getSettings: () => Readonly<AccessibilitySettings>,
    private getLearning: () => Readonly<LearningSettings>,
  ) {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
  }

  private now(): number {
    return performance.now() - this.perfStart;
  }

  private ensureSession(): Session {
    if (this.session && !this.session.endedAt) return this.session;
    const d = new Date();
    this.perfStart = performance.now();
    this.session = { sessionId: uid('s-'), startedAt: isoWithOffset(d), timeOfDay: timeOfDayOf(d), trials: [] };
    this.store.saveSession(this.session, true);
    return this.session;
  }

  private push(trial: Trial, e: Omit<GameEvent, 'timestampMs'>) {
    trial.events.push({ ...e, timestampMs: Math.round(this.now() * 10) / 10 });
    if (this.session) this.store.saveSession(this.session);
  }

  /** 試行を始める。出題前に §9.0 の範囲などを検証する */
  startTrial(modeId: ModeId, question: Question, onCraft: (value: number, parts: number[]) => void, roundId?: string): TrialHandle {
    const errs = validateQuestion(question);
    if (errs.length) throw new Error(`問題が不正です: ${errs.join(' / ')}`);
    if (this.current && !this.current.done) this.finishTrial(this.current, null, 'abandoned');
    const session = this.ensureSession();
    const d = new Date();
    const trial: Trial = {
      trialId: uid('t-'),
      orderInSession: session.trials.length + 1,
      modeId,
      question,
      settingsSnapshot: { ...this.getSettings() },
      events: [],
      startedAt: isoWithOffset(d),
      timeOfDay: timeOfDayOf(d),
      ...(roundId ? { roundId } : {}),
    };
    session.trials.push(trial);
    const slot = { trial, done: false };
    this.current = slot;
    this.push(trial, { type: 'question_shown', payload: { questionId: question.id, stage: question.learningStage } });
    if (document.hidden) this.push(trial, { type: 'visibility_hidden' });

    const engine = this;
    const context: GameContext = {
      emit(e) {
        if (slot.done) return;
        engine.push(trial, e);
      },
      complete(result) {
        if (slot.done) return; // 各問1回のみ
        engine.finishTrial(slot, result, null);
      },
      craft(value, parts) {
        if (engine.getLearning().craftBookEnabled) onCraft(value, parts);
      },
      get settings() {
        return engine.getSettings();
      },
      get learning() {
        return engine.getLearning();
      },
    };
    return {
      trial,
      context,
      close: (outcome) => {
        if (!slot.done) this.finishTrial(slot, null, outcome);
      },
      isDone: () => slot.done,
    };
  }

  private finishTrial(slot: { trial: Trial; done: boolean }, result: TrialResult | null, closeAs: 'skipped' | 'abandoned' | null) {
    slot.done = true;
    const t = slot.trial;
    const explore = t.question.learningStage === 'explore' || t.question.learningStage === 'observe';
    let final: TrialResult;
    if (result) {
      final = result;
    } else if (explore) {
      // 探索・観察は決定点がないので、離れたときに explored として閉じる（成績には入れない）
      final = { outcome: 'explored', assistanceLevel: 'not_completed', correctWithoutHint: false, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 };
    } else {
      final = { outcome: closeAs ?? 'abandoned', assistanceLevel: 'not_completed', correctWithoutHint: false, mistakeCount: 0, hintCount: 0, maxHintLevel: 0 };
    }
    t.result = final;
    const evType = final.outcome === 'skipped' ? 'skipped' : final.outcome === 'abandoned' ? 'abandoned' : 'completed';
    t.events.push({ type: evType, timestampMs: Math.round(this.now() * 10) / 10, payload: { outcome: final.outcome, assistanceLevel: final.assistanceLevel } });
    if (this.session) this.store.saveSession(this.session, true);
    if (this.current === slot) this.current = null;
    this.onTrialDone?.(t);
  }

  /** 現在の試行にイベントを足す（シェル側の操作: ヒント、ポーズ、数で見る等） */
  emitShell(e: Omit<GameEvent, 'timestampMs'>) {
    if (this.current && !this.current.done) this.push(this.current.trial, e);
  }

  endSession(reason: NonNullable<Session['endReason']>) {
    if (this.current && !this.current.done) this.finishTrial(this.current, null, 'abandoned');
    if (!this.session || this.session.endedAt) return;
    this.session.endedAt = isoWithOffset();
    this.session.endReason = reason;
    this.store.saveSession(this.session, true);
  }

  setSelfReport(r: NonNullable<Session['childSelfReport']>) {
    if (!this.session) return;
    this.session.childSelfReport = r;
    this.store.saveSession(this.session, true);
  }

  hasOpenSession(): boolean {
    return !!this.session && !this.session.endedAt;
  }
}
