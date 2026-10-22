import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { HttpError, notFound } from '../errors';
import { parseEntityKind, type EntityKind, type EntityType } from '../entity-types';
import { cleanStrings, optString, parseId, requireString } from '../validate';

interface ValueIn { value: string; synonyms: string[] }

function cleanValues(raw: unknown): ValueIn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => ({
      value: typeof v?.value === 'string' ? v.value.trim() : '',
      synonyms: cleanStrings(v?.synonyms),
    }))
    .filter((v) => v.value);
}

export function entitiesRouter(db: Db): RouterT {
  const r = Router();

  const usedBy = (id: number) =>
    (
      db
        .prepare(
          `SELECT DISTINCT i.id, i.name FROM intent_entities ie
           JOIN intents i ON i.id = ie.intent_id WHERE ie.entity_id = ? ORDER BY i.name`,
        )
        .all(id) as { id: number; name: string }[]
    ).map((i) => ({
      ...i,
      scenario_ids: (db.prepare('SELECT scenario_id FROM scenario_intents WHERE intent_id = ? ORDER BY scenario_id').all(i.id) as { scenario_id: number }[]).map((r) => r.scenario_id),
    }));

  const load = (id: number) => {
    const e = db
      .prepare('SELECT id, project_id, name, description, multiple_values, type, range_min, range_max FROM entities WHERE id = ?')
      .get(id) as
      | { id: number; project_id: number; name: string; description: string; multiple_values: number; type: EntityType; range_min: string; range_max: string }
      | undefined;
    if (!e) throw notFound('Сущность');
    const values = (
      db.prepare('SELECT value, synonyms FROM entity_values WHERE entity_id = ? ORDER BY position, id').all(id) as {
        value: string;
        synonyms: string;
      }[]
    ).map((v) => ({ value: v.value, synonyms: JSON.parse(v.synonyms) as string[] }));
    return { ...e, multiple_values: !!e.multiple_values, values, used_by: usedBy(id) };
  };

  r.get('/projects/:pid/entities', (req, res) => {
    const pid = parseId(req.params.pid);
    const ids = db.prepare('SELECT id FROM entities WHERE project_id = ? ORDER BY name').all(pid) as { id: number }[];
    res.json(ids.map(({ id }) => { const e = load(id); return { ...e, value_count: e.values.length }; }));
  });

  r.post('/projects/:pid/entities', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = requireString(req.body?.name, 'Название');
    const kind = parseEntityKind(req.body);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const info = db
      .prepare('INSERT INTO entities(project_id, name, type, range_min, range_max) VALUES (?, ?, ?, ?, ?)')
      .run(pid, name, kind.type, kind.range_min, kind.range_max);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, ...kind });
  });

  r.get('/entities/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/entities/:id', (req, res) => {
    const id = parseId(req.params.id);
    const current = load(id);
    const name = requireString(req.body?.name, 'Название');
    const description = optString(req.body?.description);
    const kind: EntityKind = parseEntityKind(req.body, current);
    const values = kind.type === 'string' ? cleanValues(req.body?.values) : [];
    db.transaction(() => {
      db.prepare('UPDATE entities SET name = ?, description = ?, multiple_values = ?, type = ?, range_min = ?, range_max = ? WHERE id = ?').run(
        name, description, req.body?.multiple_values ? 1 : 0, kind.type, kind.range_min, kind.range_max, id,
      );
      db.prepare('DELETE FROM entity_values WHERE entity_id = ?').run(id);
      const ins = db.prepare('INSERT INTO entity_values(entity_id, value, synonyms, position) VALUES (?, ?, ?, ?)');
      values.forEach((v, i) => ins.run(id, v.value, JSON.stringify(v.synonyms), i));
    })();
    res.json(load(id));
  });

  r.delete('/entities/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    const intents = usedBy(id);
    if (intents.length && req.query.force !== '1') {
      throw new HttpError(409, 'in_use', 'Сущность используется в интентах', { intents });
    }
    db.prepare('DELETE FROM entities WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
