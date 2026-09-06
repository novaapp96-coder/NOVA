import { DB_VERSION } from '../core/constants';
import { storage } from '../core/storage';
import { createSeedDB } from './seed';
import type { DBShape } from '../core/types';

const DB_KEY = 'mycart.db.v1';

/**
 * LocalDatabase — the local persistence layer used by the repository implementations.
 * Repositories talk to this interface only, so swapping to Supabase/REST later
 * means adding new repository implementations, not touching the UI.
 */
export interface Database {
  read(): Promise<DBShape>;
  write(next: DBShape): Promise<void>;
  mutate(fn: (db: DBShape) => void | Promise<void>): Promise<DBShape>;
  reset(): Promise<DBShape>;
}

let cache: DBShape | null = null;
let pending: Promise<DBShape> | null = null;

async function ensure(): Promise<DBShape> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    const raw = await storage.get<DBShape>(DB_KEY);
    if (raw && raw.version === DB_VERSION && Array.isArray(raw.products)) {
      cache = raw;
    } else {
      cache = await createSeedDB();
      await storage.set(DB_KEY, cache);
    }
    pending = null;
    return cache!;
  })();
  return pending;
}

export const localDatabase: Database = {
  async read() {
    return ensure();
  },
  async write(next) {
    cache = next;
    await storage.set(DB_KEY, next);
  },
  async mutate(fn) {
    const db = await ensure();
    await fn(db);
    await storage.set(DB_KEY, db);
    return db;
  },
  async reset() {
    cache = null;
    await storage.remove(DB_KEY);
    return ensure();
  },
};

/** Simulated network latency so loading states are real. */
export const latency = (ms: number = 240) => new Promise((r) => setTimeout(r, ms));
