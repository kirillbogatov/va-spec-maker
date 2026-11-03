import type { Db } from './sqlite';
import { badRequest } from './errors';
import { optString, parseId } from './validate';

export interface Precondition { dep: string; value: string; entity_id?: number; keyword_id?: number; op?: '=' | '!=' | '<' | '>' }

/** Part conditions use the same typed references as transitions, but remain scoped to the part. */
export function readPreconditions(raw: unknown, json = false): Precondition[] {
  if (raw === undefined) return [];
  if (json && typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { throw badRequest('Некорректные предусловия вкладки'); }
  }
  if (!Array.isArray(raw)) throw badRequest('Предусловия вкладки должны быть массивом');
  return raw.map(c => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw badRequest('Некорректное предусловие вкладки');
    if (c.keyword_id != null) return { dep: '', keyword_id: parseId(c.keyword_id), op: c.op === '!=' ? '!=' : '=', value: '' };
    const op = c.op === '!=' || c.op === '<' || c.op === '>' ? c.op : '=';
    return c.entity_id != null
      ? { dep: '', entity_id: parseId(c.entity_id), op, value: optString(c.value) }
      : { dep: optString(c.dep), op, value: optString(c.value) };
  });
}

export function preconditionMode(raw: unknown): 'all' | 'any' {
  if (raw === undefined) return 'all';
  if (raw !== 'all' && raw !== 'any') throw badRequest('Неизвестный режим предусловий вкладки');
  return raw;
}

export function validatePreconditions(db: Db, projectId: number, refs: Set<string>, conditions: Precondition[]) {
  for (const c of conditions) {
    if (c.entity_id !== undefined) {
      if (!db.prepare('SELECT 1 FROM entities WHERE id = ? AND project_id = ?').get(c.entity_id, projectId)) throw badRequest('Сущность предусловия не найдена в проекте');
    } else if (c.keyword_id !== undefined) {
      if (!db.prepare('SELECT 1 FROM keywords WHERE id = ? AND project_id = ?').get(c.keyword_id, projectId)) throw badRequest('Понятие предусловия не найдено в проекте');
    } else if (!refs.has(c.dep)) throw badRequest('Предусловие ссылается на несуществующую зависимость');
  }
}

/** Resolve JSON references after all imported dictionary IDs and scenario dependencies exist. */
export function restoreImportedPreconditions(db: Db, projectId: number, maps: Record<string, Map<number, number>>, partIds: Iterable<number> = maps.scenario_parts?.values() ?? []) {
  for (const id of partIds) {
    const part = db.prepare('SELECT scenario_id, preconditions, precondition, precond_mode FROM scenario_parts WHERE id = ?').get(id);
    const conditions = readPreconditions(part.preconditions, true).map(c => {
      if (c.entity_id !== undefined) {
        const entity_id = maps.entities.get(c.entity_id);
        if (entity_id === undefined) throw badRequest('Не найдена сущность предусловия при импорте');
        return { ...c, entity_id };
      }
      if (c.keyword_id !== undefined) {
        const keyword_id = maps.keywords.get(c.keyword_id);
        if (keyword_id === undefined) throw badRequest('Не найдено понятие предусловия при импорте');
        return { ...c, keyword_id };
      }
      return c;
    });
    const refs = new Set<string>(db.prepare('SELECT ref FROM scenario_dependencies WHERE scenario_id = ?').all(part.scenario_id).map(r => r.ref));
    validatePreconditions(db, projectId, refs, conditions);
    if (typeof part.precondition !== 'string') throw badRequest('Некорректный текст предусловия вкладки');
    db.prepare('UPDATE scenario_parts SET preconditions = ?, precond_mode = ? WHERE id = ?').run(JSON.stringify(conditions), preconditionMode(part.precond_mode), id);
  }
}

/** IDs stay stable on rename; deletion must not leave JSON references dangling. */
export function conditionScenarios(db: Db, key: 'entity_id' | 'keyword_id', id: number): { id: number; name: string }[] {
  const rows = db.prepare(`SELECT s.id, s.name, t.conditions FROM scenario_steps t JOIN scenarios s ON s.id = t.scenario_id
    UNION ALL SELECT s.id, s.name, p.preconditions AS conditions FROM scenario_parts p JOIN scenarios s ON s.id = p.scenario_id`).all();
  const out = new Map<number, { id: number; name: string }>();
  for (const r of rows) if ((JSON.parse(r.conditions) as Record<string, unknown>[]).some(c => c[key] === id)) out.set(r.id, { id: r.id, name: r.name });
  return [...out.values()];
}
