// §3.2 / §10 Game Mode Registry。登録時に ID 重複・対応課題・対応段階・必須メソッドを検証する

import type { GameModePlugin, LearningStage, ModeId, TaskCategory } from './types';

const REQUIRED_METHODS = ['mount', 'loadQuestion', 'showHint', 'undo', 'pause', 'resume', 'applySettings', 'destroy', 'stagesFor'] as const;
const STAGES: LearningStage[] = ['explore', 'observe', 'predict', 'construct', 'transfer', 'revisit'];
const TASKS: TaskCategory[] = ['subitizing_678', 'numeral_quantity', 'synthesis_5', 'complement_10', 'carry_over', 'borrow', 'arrays', 'balance', 'doubling', 'period'];

class Registry {
  private plugins = new Map<ModeId, GameModePlugin>();

  register(p: GameModePlugin) {
    if (this.plugins.has(p.id)) throw new Error(`モードIDが重複しています: ${p.id}`);
    for (const m of REQUIRED_METHODS)
      if (typeof (p as unknown as Record<string, unknown>)[m] !== 'function') throw new Error(`${p.id}: ${m}() がありません`);
    if (!p.supportedTasks.length || !p.supportedTasks.every((t) => TASKS.includes(t))) throw new Error(`${p.id}: supportedTasks が不正`);
    if (!p.supportedStages.length || !p.supportedStages.every((s) => STAGES.includes(s))) throw new Error(`${p.id}: supportedStages が不正`);
    for (const t of p.supportedTasks)
      if (!p.stagesFor(t).every((s) => p.supportedStages.includes(s))) throw new Error(`${p.id}: ${t} の段階が supportedStages にない`);
    this.plugins.set(p.id, p);
  }

  get(id: ModeId): GameModePlugin {
    const p = this.plugins.get(id);
    if (!p) throw new Error(`未登録のモード: ${id}`);
    return p;
  }

  all(): GameModePlugin[] {
    return [...this.plugins.values()];
  }

  /** 同じ課題を扱える別のモード（§9.5「別の世界でも見る」） */
  transferTargets(task: TaskCategory, from: ModeId): GameModePlugin[] {
    return this.all().filter((p) => p.id !== from && p.supportedTasks.includes(task) && p.stagesFor(task).includes('construct'));
  }
}

export const GameRegistry = new Registry();
