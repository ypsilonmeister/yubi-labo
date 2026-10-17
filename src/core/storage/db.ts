// 永続化。§11.3 の推奨どおり IndexedDB を標準にする（イベントログが多いため）。
// 起動時に全データをメモリへ読み、変更は差分で書き戻す。容量逼迫時に古いログを勝手に消さない。

import { openDB, type IDBPDatabase } from 'idb';
import type { AppData, CraftEntry, Session } from '../types';
import { craftKey, emptyAppData, migrateV1, withDefaults, type MigrationReport } from './dataio';

const DB_NAME = 'math_craft_app_data_v2';
const V1_KEY = 'math_craft_app_data_v1';

type Listener = () => void;

export class Store {
  data: AppData = emptyAppData();
  /** 保存に失敗した（容量・プライベートモード等）。保護者画面でエクスポートを案内する */
  saveError: string | null = null;
  migrationReport: MigrationReport | null = null;
  private db: IDBPDatabase | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<string, Session>();
  private timer: number | null = null;
  version = 0;

  static async open(): Promise<Store> {
    const s = new Store();
    try {
      s.db = await openDB(DB_NAME, 1, {
        upgrade(db) {
          db.createObjectStore('sessions', { keyPath: 'sessionId' });
          db.createObjectStore('meta');
        },
      });
      const [profile, craft, sessions, report] = await Promise.all([
        s.db.get('meta', 'profile'),
        s.db.get('meta', 'craftBook'),
        s.db.getAll('sessions'),
        s.db.get('meta', 'migrationReport'),
      ]);
      s.data = {
        schemaVersion: '2.1',
        profile: withDefaults(profile),
        sessions: (sessions as Session[]).sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()),
        craftBook: (craft as CraftEntry[] | undefined) ?? [],
      };
      s.migrationReport = (report as MigrationReport | undefined) ?? null;
      await s.migrateFromLocalStorage();
    } catch (e) {
      s.db = null;
      s.saveError = `端末内の保存領域が使えません（${(e as Error).message}）。記録はこのページを閉じるまでしか残りません。`;
    }
    return s;
  }

  /** v1（localStorage）のデータがあれば一度だけ移行する。元データは消さない */
  private async migrateFromLocalStorage() {
    if (!this.db || this.migrationReport) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(V1_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const { data, report, errors } = migrateV1(JSON.parse(raw));
      if (errors.length) return;
      const ids = new Set(this.data.sessions.map((x) => x.sessionId));
      const tx = this.db.transaction('sessions', 'readwrite');
      for (const s of data.sessions) if (!ids.has(s.sessionId)) await tx.store.put(s);
      await tx.done;
      this.data.sessions = [...this.data.sessions, ...data.sessions.filter((x) => !ids.has(x.sessionId))].sort(
        (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );
      this.migrationReport = report;
      await this.db.put('meta', report, 'migrationReport');
    } catch {
      // 壊れた v1 データは移行しない（既存データは触らない）
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private async guard(op: () => Promise<unknown>) {
    if (!this.db) return;
    try {
      await op();
      if (this.saveError?.startsWith('保存できませんでした')) this.saveError = null;
    } catch (e) {
      this.saveError = `保存できませんでした（${(e as Error).message}）。保護者画面からエクスポートしてください。古い記録は自動では消しません。`;
      this.changed();
    }
  }

  /** セッションの変更を少し遅らせてまとめて書く */
  saveSession(s: Session, immediate = false) {
    const i = this.data.sessions.findIndex((x) => x.sessionId === s.sessionId);
    if (i >= 0) this.data.sessions[i] = s;
    else this.data.sessions.push(s);
    this.pending.set(s.sessionId, s);
    if (immediate) void this.flush();
    else if (this.timer === null) this.timer = window.setTimeout(() => void this.flush(), 600);
    this.changed();
  }

  async flush() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const items = [...this.pending.values()];
    this.pending.clear();
    if (!items.length) return;
    // structuredClone で、その時点の内容を書く（以降のメモリ上の変更と分ける）
    await this.guard(async () => {
      const tx = this.db!.transaction('sessions', 'readwrite');
      for (const s of items) await tx.store.put(structuredClone(s));
      await tx.done;
    });
  }

  async saveProfile(profile: AppData['profile']) {
    this.data.profile = profile;
    this.changed();
    await this.guard(() => this.db!.put('meta', structuredClone(profile), 'profile'));
  }

  /** 図鑑に追加（同じ組み合わせはすでにあれば何もしない）。新しく増えたら true */
  addCraft(entry: CraftEntry): boolean {
    const book = this.data.craftBook ?? (this.data.craftBook = []);
    if (book.some((e) => craftKey(e) === craftKey(entry))) return false;
    book.push(entry);
    this.changed();
    void this.guard(() => this.db!.put('meta', structuredClone(book), 'craftBook'));
    return true;
  }

  async updateSession(sessionId: string, patch: Partial<Session>) {
    const s = this.data.sessions.find((x) => x.sessionId === sessionId);
    if (!s) return;
    Object.assign(s, patch);
    this.saveSession(s, true);
  }

  /** インポートの適用（呼び出し側で事前にバックアップを保存しておく） */
  async replaceAll(next: AppData) {
    await this.flush();
    this.data = { ...next, profile: withDefaults(next.profile), craftBook: next.craftBook ?? [] };
    await this.guard(async () => {
      const tx = this.db!.transaction(['sessions', 'meta'], 'readwrite');
      await tx.objectStore('sessions').clear();
      for (const s of this.data.sessions) await tx.objectStore('sessions').put(structuredClone(s));
      await tx.objectStore('meta').put(structuredClone(this.data.profile), 'profile');
      await tx.objectStore('meta').put(structuredClone(this.data.craftBook), 'craftBook');
      await tx.done;
    });
    this.changed();
  }

  async estimate(): Promise<{ usage?: number; quota?: number }> {
    try {
      return (await navigator.storage?.estimate?.()) ?? {};
    } catch {
      return {};
    }
  }
}
