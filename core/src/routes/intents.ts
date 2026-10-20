import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { badRequest, notFound } from '../errors';
import { assertUniqueName } from '../unique';
import { cleanStrings, optString, parseId, requireString } from '../validate';

interface IntentRow {
  id: number; project_id: number; scenario_id: number | null; name: string; enabled: number; comment: string;
}

export function intentsRouter(db: Db): RouterT {
  const r = Router();

  const load = (id: number) => {
    const row = db
      .prepare('SELECT id, project_id, scenario_id, name, enabled, comment FROM intents WHERE id = ?')
      .get(id) as IntentRow | undefined;
    if (!row) throw notFound('Интент');
    return {
      ...row,
      enabled: !!row.enabled,
      phrases: (db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(id) as { text: string }[]).map((p) => p.text),
      entities: (db.prepare('SELECT entity_id, required FROM intent_entities WHERE intent_id = ? ORDER BY position, id').all(id) as { entity_id: number; required: number }[])
        .map((e) => ({ entity_id: e.entity_id, required: !!e.required })),
    };
  };

  const list = (where: string, param: number) =>
    (
      db
        .prepare(
          `SELECT i.id, i.name, i.enabled, i.scenario_id,
                  (SELECT COUNT(*) FROM intent_phrases p WHERE p.intent_id = i.id) AS phrase_count
           FROM intents i WHERE ${where} ORDER BY i.name`,
        )
        .all(param) as { id: number; name: string; enabled: number; scenario_id: number | null; phrase_count: number }[]
    ).map((x) => ({ ...x, enabled: !!x.enabled }));

  const create = (pid: number, scenarioId: number | null, body: any) => {
    const name = requireString(body?.name, 'Название');
    assertUniqueName(db, 'intents', pid, name, 'Интент');
    const info = db.prepare('INSERT INTO intents(project_id, scenario_id, name) VALUES (?, ?, ?)').run(pid, scenarioId, name);
    return { id: Number(info.lastInsertRowid), name };
  };

  r.get('/projects/:pid/intents', (req, res) => {
    res.json(list('i.project_id = ?', parseId(req.params.pid)));
  });

  r.get('/scenarios/:sid/intents', (req, res) => {
    res.json(list('i.scenario_id = ?', parseId(req.params.sid)));
  });

  r.post('/projects/:pid/intents', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    res.status(201).json(create(pid, null, req.body));
  });

  r.post('/scenarios/:sid/intents', (req, res) => {
    const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(parseId(req.params.sid)) as { project_id: number } | undefined;
    if (!s) throw notFound('Сценарий');
    res.status(201).json(create(s.project_id, parseId(req.params.sid), req.body));
  });

  r.get('/intents/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/intents/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const b = (req.body ?? {}) as Record<string, any>;
    const name = requireString(b.name, 'Название');
    assertUniqueName(db, 'intents', cur.project_id, name, 'Интент', id);

    const findEntity = db.prepare('SELECT 1 FROM entities WHERE id = ? AND project_id = ?');
    const entities = (Array.isArray(b.entities) ? b.entities : []).map((e: any) => ({
      entity_id: parseId(e?.entity_id),
      required: !!e?.required,
    }));
    for (const e of entities) {
      if (!findEntity.get(e.entity_id, cur.project_id)) throw badRequest('Сущность не найдена в проекте');
    }
    const phrases = cleanStrings(b.phrases);

    db.transaction(() => {
      db.prepare('UPDATE intents SET name = ?, enabled = ?, comment = ? WHERE id = ?').run(
        name, b.enabled === false ? 0 : 1, optString(b.comment), id,
      );
      db.prepare('DELETE FROM intent_phrases WHERE intent_id = ?').run(id);
      db.prepare('DELETE FROM intent_entities WHERE intent_id = ?').run(id);
      const insPhrase = db.prepare('INSERT INTO intent_phrases(intent_id, text, position) VALUES (?, ?, ?)');
      const insEntity = db.prepare('INSERT INTO intent_entities(intent_id, entity_id, required, position) VALUES (?, ?, ?, ?)');
      phrases.forEach((t, i) => insPhrase.run(id, t, i));
      entities.forEach((e: { entity_id: number; required: boolean }, i: number) => insEntity.run(id, e.entity_id, e.required ? 1 : 0, i));
    })();
    res.json(load(id));
  });

  r.delete('/intents/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM intents WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
