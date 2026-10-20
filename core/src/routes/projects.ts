import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { notFound } from '../errors';
import { dumpProject, importProject } from '../project-dump';
import { optString, parseId, requireString } from '../validate';

export function projectsRouter(db: Db): RouterT {
  const r = Router();
  const get = (id: number) =>
    db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(id) as
      | { id: number; name: string; description: string }
      | undefined;

  r.get('/projects', (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT p.id, p.name, p.description, p.created_at,
                  (SELECT COUNT(*) FROM scenarios s WHERE s.project_id = p.id) AS scenario_count
           FROM projects p ORDER BY p.created_at DESC, p.id DESC`,
        )
        .all(),
    );
  });

  r.post('/projects', (req, res) => {
    const name = requireString(req.body?.name, 'Название');
    const description = optString(req.body?.description);
    const id = Number(db.prepare('INSERT INTO projects(name, description) VALUES (?, ?)').run(name, description).lastInsertRowid);
    res.status(201).json({ id, name, description });
  });

  r.post('/projects/import', (req, res) => {
    const id = importProject(db, req.body);
    res.status(201).json({ id, name: get(id)!.name });
  });

  r.patch('/projects/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = get(id);
    if (!cur) throw notFound('Проект');
    const name = req.body?.name === undefined ? cur.name : requireString(req.body.name, 'Название');
    const description = req.body?.description === undefined ? cur.description : optString(req.body.description);
    db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(name, description, id);
    res.json({ id, name, description });
  });

  r.delete('/projects/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!get(id)) throw notFound('Проект');
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.status(204).end();
  });

  r.post('/projects/:id/duplicate', (req, res) => {
    const dump = dumpProject(db, parseId(req.params.id));
    const name = `${dump.name} (копия)`;
    res.status(201).json({ id: importProject(db, dump, name), name });
  });

  r.get('/projects/:id/dump', (req, res) => {
    res.json(dumpProject(db, parseId(req.params.id)));
  });

  return r;
}
