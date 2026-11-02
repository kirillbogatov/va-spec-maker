import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { notFound } from '../errors';
import { optString, parseId, requireString } from '../validate';
import { updateDependencyCopies } from '../dependency-links';

interface Row { id: number; project_id: number; name: string; description: string; values: string }

const cleanValues = (v: unknown): string[] => {
  const out = (Array.isArray(v) ? v : []).map((x) => optString(x).trim()).filter(Boolean);
  return [...new Set(out)];
};

/** Справочник зависимостей проекта: название и возможные значения. Сценарии подставляют их в свои зависимости. */
export function dependencyDictionaryRouter(db: Db): RouterT {
  const r = Router();

  const usage = db.prepare(
    `SELECT DISTINCT s.id, s.name FROM scenario_dependencies d JOIN scenarios s ON s.id = d.scenario_id
     WHERE s.project_id = ? AND d.entity_id IS NULL AND (d.dictionary_id = ? OR (d.dictionary_id IS NULL AND d.name = ?)) ORDER BY s.id`,
  );

  const load = (id: number) => {
    const d = db
      .prepare('SELECT id, project_id, name, description, "values" AS "values" FROM dependency_dictionary WHERE id = ?')
      .get(id) as Row | undefined;
    if (!d) throw notFound('Зависимость');
    return { ...d, values: JSON.parse(d.values) as string[], used_by: usage.all(d.project_id, d.id, d.name) };
  };

  r.get('/projects/:pid/dependency-dictionary', (req, res) => {
    const pid = parseId(req.params.pid);
    const rows = db
      .prepare('SELECT id, name, description, "values" AS "values" FROM dependency_dictionary WHERE project_id = ? ORDER BY name')
      .all(pid) as { id: number; name: string; values: string }[];
    res.json(rows.map((d) => ({ ...d, values: JSON.parse(d.values) as string[], used_by: usage.all(pid, d.id, d.name) })));
  });

  r.post('/projects/:pid/dependency-dictionary', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = requireString(req.body?.name, 'Название');
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const info = db.prepare('INSERT INTO dependency_dictionary(project_id, name) VALUES (?, ?)').run(pid, name);
    res.status(201).json({ id: Number(info.lastInsertRowid), name, description: '', values: [] });
  });

  r.get('/dependency-dictionary/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/dependency-dictionary/:id', (req, res) => {
    const id = parseId(req.params.id);
    const current = load(id);
    const name = requireString(req.body?.name, 'Название');
    const description = req.body?.description === undefined ? current.description : optString(req.body.description);
    const values = cleanValues(req.body?.values);
    db.transaction(() => {
      // Подключаем старые записи, которые ещё связаны со справочником только именем.
      db.prepare(`UPDATE scenario_dependencies SET dictionary_id = ?, editable = 0 WHERE dictionary_id IS NULL AND entity_id IS NULL AND name = ?
        AND scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?)`).run(id, current.name, current.project_id);
      db.prepare('UPDATE dependency_dictionary SET name = ?, description = ?, "values" = ? WHERE id = ?').run(name, description, JSON.stringify(values), id);
      updateDependencyCopies(db, id, name, values, description);
    })();
    res.json(load(id));
  });

  r.delete('/dependency-dictionary/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM dependency_dictionary WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
