import { openDB, type IDBPDatabase } from 'idb';

// SPEC §4.5 — IndexedDB 永続化。失敗時はメモリ動作で続行（§9 エラー処理）。

export interface ReplaySample {
  t: number;
  x: number;
  y: number;
  active: boolean;
}

export interface PlayRecord {
  game: 'maze' | 'kanji' | 'moji' | 'lab' | 'dummy'; // 'lab' = ごうせいラボ §12.7、'dummy' は P0 検証用
  levelId: string;
  startedAt: number;
  durationMs: number;
  completed: boolean; // 途中終了=false（失敗ではない）
  metrics: Record<string, unknown>;
  replay?: ReplaySample[];
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  inputKind: 'mouse' | 'touch' | 'hand';
  plays: PlayRecord[];
}

const DB_NAME = 'yubilab';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;
let memoryMode = false;
const memSessions: SessionRecord[] = [];
const memKV = new Map<string, unknown>();

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('progress');
        db.createObjectStore('settings');
      },
    });
  }
  return dbPromise;
}

export async function saveSession(s: SessionRecord): Promise<void> {
  try {
    await (await getDB()).put('sessions', s);
  } catch {
    memoryMode = true;
    memSessions.push(s);
  }
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  try {
    return await (await getDB()).getAll('sessions');
  } catch {
    memoryMode = true;
    return [...memSessions];
  }
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await (await getDB()).get('settings', key);
    return (v as T) ?? fallback;
  } catch {
    memoryMode = true;
    return (memKV.get(key) as T) ?? fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    await (await getDB()).put('settings', value, key);
  } catch {
    memoryMode = true;
    memKV.set(key, value);
  }
}

export async function getProgress<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await (await getDB()).get('progress', key);
    return (v as T) ?? fallback;
  } catch {
    memoryMode = true;
    return (memKV.get(`progress:${key}`) as T) ?? fallback;
  }
}

export async function setProgress(key: string, value: unknown): Promise<void> {
  try {
    await (await getDB()).put('progress', value, key);
  } catch {
    memoryMode = true;
    memKV.set(`progress:${key}`, value);
  }
}

// セッション終了時の保護者向け警告表示の判定に使う（§9）
export function isMemoryMode(): boolean {
  return memoryMode;
}

// ── エクスポート/インポート（SPEC §4.5 / §4.7、P5 受け入れ条件: 往復で完全復元） ──

export interface ExportData {
  app: 'yubilab';
  version: number;
  exportedAt: number;
  sessions: SessionRecord[];
  progress: Record<string, unknown>;
  settings: Record<string, unknown>;
}

async function dumpStore(store: 'progress' | 'settings'): Promise<Record<string, unknown>> {
  const db = await getDB();
  const keys = await db.getAllKeys(store);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[String(key)] = await db.get(store, key);
  }
  return out;
}

export async function exportAll(): Promise<ExportData> {
  const base: ExportData = {
    app: 'yubilab',
    version: DB_VERSION,
    exportedAt: Date.now(),
    sessions: [],
    progress: {},
    settings: {},
  };
  try {
    base.sessions = await (await getDB()).getAll('sessions');
    base.progress = await dumpStore('progress');
    base.settings = await dumpStore('settings');
  } catch {
    memoryMode = true;
    base.sessions = [...memSessions];
    for (const [k, v] of memKV) {
      if (k.startsWith('progress:')) base.progress[k.slice('progress:'.length)] = v;
      else base.settings[k] = v;
    }
  }
  return base;
}

// 既存データを置き換えて完全復元する
export async function importAll(data: ExportData): Promise<void> {
  if (data.app !== 'yubilab' || !Array.isArray(data.sessions)) {
    throw new Error('invalid export data');
  }
  try {
    const db = await getDB();
    const tx = db.transaction(['sessions', 'progress', 'settings'], 'readwrite');
    await tx.objectStore('sessions').clear();
    await tx.objectStore('progress').clear();
    await tx.objectStore('settings').clear();
    for (const s of data.sessions) await tx.objectStore('sessions').put(s);
    for (const [k, v] of Object.entries(data.progress ?? {})) {
      await tx.objectStore('progress').put(v, k);
    }
    for (const [k, v] of Object.entries(data.settings ?? {})) {
      await tx.objectStore('settings').put(v, k);
    }
    await tx.done;
  } catch {
    memoryMode = true;
    memSessions.length = 0;
    memSessions.push(...data.sessions);
    memKV.clear();
    for (const [k, v] of Object.entries(data.progress ?? {})) memKV.set(`progress:${k}`, v);
    for (const [k, v] of Object.entries(data.settings ?? {})) memKV.set(k, v);
  }
}
