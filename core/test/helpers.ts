import { createApp, type App } from '../src/app';
import { openDb } from '../src/db';
import type { Db } from '../src/sqlite';

export function createProject(db: Db, name = 'P'): number {
  return Number(db.prepare('INSERT INTO projects(name, description) VALUES (?, ?)').run(name, '').lastInsertRowid);
}

export async function makeApp(): Promise<{ app: App; db: Db }> {
  const db = await openDb();
  return { db, app: createApp(db) };
}
