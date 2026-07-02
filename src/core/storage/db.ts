import { openDB, type IDBPDatabase } from 'idb';

// SPEC §4.5 — IndexedDB 永続化。失敗時はメモリ動作で続行（§9 エラー処理）。

export interface ReplaySample {
  t: number;
  x: number;
  y: number;
  active: boolean;
}

export interface PlayRecord {
  game: 'maze' | 'kanji' | 'moji' | 'dummy'; // 'dummy' は P0 検証用
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

// セッション終了時の保護者向け警告表示の判定に使う（§9）
export function isMemoryMode(): boolean {
  return memoryMode;
}
