import type { Db } from './sqlite';
import { HttpError } from './errors';

/** Название интента/промпта уникально в проекте без учёта регистра и пробелов по краям. */
export function assertUniqueName(
  db: Db,
  table: 'intents' | 'prompts',
  projectId: number,
  name: string,
  what: string,
  exceptId?: number,
): void {
  const rows = db.prepare(`SELECT id, name FROM ${table} WHERE project_id = ?`).all(projectId) as { id: number; name: string }[];
  const key = name.trim().toLowerCase();
  if (rows.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === key)) {
    throw new HttpError(409, 'duplicate', `${what} с названием «${name}» уже существует`);
  }
}
