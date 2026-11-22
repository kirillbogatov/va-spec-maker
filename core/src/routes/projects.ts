import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { badRequest, notFound } from '../errors';
import { dumpProject, importProject } from '../project-dump';
import { optString, parseId, requireString } from '../validate';

export function projectsRouter(db: Db): RouterT {
  const r = Router();
  const get = (id: number) =>
    db.prepare('SELECT id, name, description, branch_group_id, branch_name FROM projects WHERE id = ?').get(id) as
      | { id: number; name: string; description: string; branch_group_id: number; branch_name: string }
      | undefined;
  const assertBranchNameAvailable = (groupId: number, branchName: string, exceptId?: number) => {
    const duplicate = (db.prepare('SELECT id, branch_name FROM projects WHERE branch_group_id = ?').all(groupId) as { id: number; branch_name: string }[])
      .some((branch) => branch.id !== exceptId && branch.branch_name.toLowerCase() === branchName.toLowerCase());
    if (duplicate) throw badRequest('Ветка с таким названием уже существует');
  };

  r.get('/projects', (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT p.id, p.name, p.description, p.branch_group_id, p.branch_name, p.created_at,
                  (SELECT COUNT(*) FROM projects b WHERE b.branch_group_id = p.branch_group_id) AS branch_count,
                  (SELECT COUNT(*) FROM scenarios s WHERE s.project_id = p.id AND s.is_template = 0) AS scenario_count,
                  (SELECT COUNT(*) FROM intents i WHERE i.project_id = p.id AND i.is_template = 0) AS intent_count,
                  (SELECT COUNT(*) FROM entities e WHERE e.project_id = p.id) AS entity_count,
                  (SELECT COUNT(*) FROM prompts pr WHERE pr.project_id = p.id AND pr.is_template = 0) AS prompt_count,
                  -- упрощённая готовность: описание, интенты с фразами или паттернами, ответы промптов, зависимости со значениями и хотя бы один переход
                  (SELECT COUNT(*) FROM scenarios s WHERE s.project_id = p.id AND s.is_template = 0
                     AND TRIM(s.description) <> ''
                     AND EXISTS (SELECT 1 FROM scenario_intents si WHERE si.scenario_id = s.id)
                     AND NOT EXISTS (SELECT 1 FROM scenario_intents si JOIN intents i ON i.id = si.intent_id
                                       WHERE si.scenario_id = s.id AND i.enabled = 1
                                         AND NOT EXISTS (SELECT 1 FROM intent_phrases f WHERE f.intent_id = i.id AND TRIM(f.text) <> '')
                                         AND NOT EXISTS (SELECT 1 FROM intent_patterns f WHERE f.intent_id = i.id AND TRIM(f.text) <> ''))
                     AND NOT EXISTS (SELECT 1 FROM scenario_prompts sp JOIN prompts pr ON pr.id = sp.prompt_id
                                       WHERE sp.scenario_id = s.id AND pr.full_answers = '[]')
                     AND NOT EXISTS (SELECT 1 FROM scenario_dependencies d WHERE d.scenario_id = s.id AND d.type <> 'bool' AND d.options = '[]')
                     AND EXISTS (SELECT 1 FROM scenario_steps t WHERE t.scenario_id = s.id AND t.kind = 'transition')
                  ) AS ready_count
           FROM projects p ORDER BY p.created_at DESC, p.id DESC`,
        )
        .all(),
    );
  });

  r.post('/projects', (req, res) => {
    const name = requireString(req.body?.name, 'Название');
    const description = optString(req.body?.description);
    const id = Number(db.prepare('INSERT INTO projects(name, description) VALUES (?, ?)').run(name, description).lastInsertRowid);
    db.prepare("UPDATE projects SET branch_group_id = ?, branch_name = 'main' WHERE id = ?").run(id, id);
    res.status(201).json({ id, name, description, branch_group_id: id, branch_name: 'main' });
  });

  r.post('/projects/import', (req, res) => {
    const id = importProject(db, req.body);
    db.prepare("UPDATE projects SET branch_group_id = ?, branch_name = 'main' WHERE id = ?").run(id, id);
    res.status(201).json({ id, name: get(id)!.name });
  });

  r.patch('/projects/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = get(id);
    if (!cur) throw notFound('Проект');
    const name = req.body?.name === undefined ? cur.name : requireString(req.body.name, 'Название');
    const description = req.body?.description === undefined ? cur.description : optString(req.body.description);
    db.prepare('UPDATE projects SET name = ?, description = ? WHERE branch_group_id = ?').run(name, description, cur.branch_group_id);
    res.json({ id, name, description });
  });

  r.delete('/projects/:id', (req, res) => {
    const id = parseId(req.params.id);
    const row = get(id);
    if (!row) throw notFound('Проект');
    const count = db.prepare('SELECT COUNT(*) AS count FROM projects WHERE branch_group_id = ?').get(row.branch_group_id).count as number;
    if (count > 1) throw badRequest('Удалите ветки проекта отдельно, затем повторите удаление проекта');
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.status(204).end();
  });

  r.post('/projects/:id/duplicate', (req, res) => {
    const dump = dumpProject(db, parseId(req.params.id));
    const name = `${dump.name} (копия)`;
    const id = importProject(db, dump, name);
    db.prepare("UPDATE projects SET branch_group_id = ?, branch_name = 'main' WHERE id = ?").run(id, id);
    res.status(201).json({ id, name });
  });

  r.get('/projects/:id/branches', (req, res) => {
    const source = get(parseId(req.params.id));
    if (!source) throw notFound('Проект');
    res.json(db.prepare(`SELECT id, name, description, branch_group_id, branch_name FROM projects
      WHERE branch_group_id = ? ORDER BY CASE WHEN id = branch_group_id THEN 0 ELSE 1 END, branch_name COLLATE NOCASE`)
      .all(source.branch_group_id));
  });

  r.post('/projects/:id/branches', (req, res) => {
    const source = get(parseId(req.params.id));
    if (!source) throw notFound('Проект');
    const branchName = requireString(req.body?.name, 'Название ветки');
    assertBranchNameAvailable(source.branch_group_id, branchName);
    const id = Number(db.prepare('INSERT INTO projects(name, description, branch_group_id, branch_name) VALUES (?, ?, ?, ?)')
      .run(source.name, source.description, source.branch_group_id, branchName).lastInsertRowid);
    res.status(201).json({ id, name: source.name, description: source.description, branch_group_id: source.branch_group_id, branch_name: branchName });
  });

  r.post('/projects/:id/branches/clone', (req, res) => {
    const source = get(parseId(req.params.id));
    if (!source) throw notFound('Проект');
    const branchName = requireString(req.body?.name, 'Название ветки');
    assertBranchNameAvailable(source.branch_group_id, branchName);
    const id = db.transaction(() => {
      const cloned = importProject(db, dumpProject(db, source.id), source.name);
      db.prepare('UPDATE projects SET branch_group_id = ?, branch_name = ? WHERE id = ?').run(source.branch_group_id, branchName, cloned);
      return cloned;
    })();
    res.status(201).json({ id, name: source.name, description: source.description, branch_group_id: source.branch_group_id, branch_name: branchName });
  });

  r.patch('/projects/:id/branches/:branchId', (req, res) => {
    const source = get(parseId(req.params.id));
    const branch = get(parseId(req.params.branchId));
    if (!source || !branch || source.branch_group_id !== branch.branch_group_id) throw notFound('Ветка');
    const branchName = requireString(req.body?.name, 'Название ветки');
    assertBranchNameAvailable(branch.branch_group_id, branchName, branch.id);
    db.prepare('UPDATE projects SET branch_name = ? WHERE id = ?').run(branchName, branch.id);
    res.json({ ...branch, branch_name: branchName });
  });

  r.delete('/projects/:id/branches/:branchId', (req, res) => {
    const source = get(parseId(req.params.id));
    const branchId = parseId(req.params.branchId);
    const branch = get(branchId);
    if (!source || !branch || branch.branch_group_id !== source.branch_group_id) throw notFound('Ветка');
    const count = db.prepare('SELECT COUNT(*) AS count FROM projects WHERE branch_group_id = ?').get(source.branch_group_id).count as number;
    if (count <= 1) throw badRequest('Нельзя удалить последнюю ветку проекта');
    db.transaction(() => {
      if (branch.id === branch.branch_group_id) {
        const replacement = db.prepare('SELECT id FROM projects WHERE branch_group_id = ? AND id <> ? ORDER BY id LIMIT 1').get(branch.branch_group_id, branch.id);
        db.prepare('UPDATE projects SET branch_group_id = ? WHERE branch_group_id = ?').run(replacement.id, branch.branch_group_id);
      }
      db.prepare('DELETE FROM projects WHERE id = ?').run(branchId);
    })();
    res.status(204).end();
  });

  r.get('/projects/:id/dump', (req, res) => {
    res.json(dumpProject(db, parseId(req.params.id)));
  });

  return r;
}
