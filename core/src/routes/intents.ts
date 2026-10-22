import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { badRequest, notFound } from '../errors';
import { assertSameProject, connect, disconnect, setGlobal } from '../links';
import { assertUniqueName } from '../unique';
import { cleanStrings, optString, parseId, requireString } from '../validate';

interface IntentRow {
  id: number; project_id: number; name: string; enabled: number; comment: string;
}

export function intentsRouter(db: Db): RouterT {
  const r = Router();

  const load = (id: number) => {
    const row = db
      .prepare('SELECT id, project_id, name, enabled, comment FROM intents WHERE id = ?')
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

  const scenariosOf = (id: number) =>
    db
      .prepare('SELECT s.id, s.name FROM scenario_intents si JOIN scenarios s ON s.id = si.scenario_id WHERE si.intent_id = ? ORDER BY s.id')
      .all(id) as { id: number; name: string }[];

  type ListRow = { id: number; name: string; enabled: number; phrase_count: number; hint: string; is_global?: number };
  const decorate = (rows: ListRow[]) =>
    rows.map(({ is_global, ...x }) => ({
      ...x,
      enabled: !!x.enabled,
      ...(is_global === undefined ? {} : { is_global: !!is_global }),
      scenarios: scenariosOf(x.id),
    }));

  const PHRASES = '(SELECT COUNT(*) FROM intent_phrases p WHERE p.intent_id = i.id)';
  /** Краткое описание для выпадающих списков: комментарий, иначе первая фраза (как в меню). */
  const HINT = `COALESCE(NULLIF(TRIM(i.comment), ''), (SELECT p.text FROM intent_phrases p WHERE p.intent_id = i.id AND TRIM(p.text) <> '' ORDER BY p.position, p.id LIMIT 1), '')`;

  r.get('/projects/:pid/intents', (req, res) => {
    const rows = db
      .prepare(`SELECT i.id, i.name, i.enabled, ${PHRASES} AS phrase_count, ${HINT} AS hint FROM intents i WHERE i.project_id = ? ORDER BY i.name`)
      .all(parseId(req.params.pid)) as ListRow[];
    res.json(decorate(rows));
  });

  /** Интенты, подключённые к сценарию, в порядке подключения. */
  r.get('/scenarios/:sid/intents', (req, res) => {
    const rows = db
      .prepare(
        `SELECT i.id, i.name, i.enabled, si.is_global, ${PHRASES} AS phrase_count, ${HINT} AS hint
         FROM scenario_intents si JOIN intents i ON i.id = si.intent_id
         WHERE si.scenario_id = ? ORDER BY si.position, si.id`,
      )
      .all(parseId(req.params.sid)) as ListRow[];
    res.json(decorate(rows));
  });

  const create = (pid: number, body: any) => {
    const name = requireString(body?.name, 'Название');
    assertUniqueName(db, 'intents', pid, name, 'Интент');
    const info = db.prepare('INSERT INTO intents(project_id, name) VALUES (?, ?)').run(pid, name);
    return { id: Number(info.lastInsertRowid), name };
  };

  r.post('/projects/:pid/intents', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    res.status(201).json(create(pid, req.body));
  });

  /** Создаёт интент в проекте и сразу подключает его к сценарию. */
  r.post('/scenarios/:sid/intents', (req, res) => {
    const sid = parseId(req.params.sid);
    const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(sid) as { project_id: number } | undefined;
    if (!s) throw notFound('Сценарий');
    const created = db.transaction(() => {
      const c = create(s.project_id, req.body);
      connect(db, 'intent', sid, c.id);
      return c;
    })();
    res.status(201).json(created);
  });

  /** Подключает существующий интент (если ещё не подключён) и, если передан is_global, меняет флаг. */
  r.put('/scenarios/:sid/intents/:iid', (req, res) => {
    const sid = parseId(req.params.sid);
    const iid = parseId(req.params.iid);
    assertSameProject(db, 'intent', sid, iid);
    db.transaction(() => {
      connect(db, 'intent', sid, iid);
      if (typeof req.body?.is_global === 'boolean') setGlobal(db, sid, iid, req.body.is_global);
    })();
    const row = db.prepare('SELECT is_global FROM scenario_intents WHERE scenario_id = ? AND intent_id = ?').get(sid, iid) as { is_global: number };
    res.json({ id: iid, is_global: !!row.is_global });
  });

  r.delete('/scenarios/:sid/intents/:iid', (req, res) => {
    disconnect(db, 'intent', parseId(req.params.sid), parseId(req.params.iid));
    res.status(204).end();
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
    db.prepare("DELETE FROM scenario_steps WHERE kind = 'global' AND intent_id = ?").run(id);
    db.prepare('DELETE FROM intents WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
