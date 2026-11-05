import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { notFound } from '../errors';
import { assertUniqueName } from '../unique';
import { cleanStrings, parseId, requireString } from '../validate';

export function responseTemplatesRouter(db: Db): RouterT {
  const r = Router();
  const load = (id: number) => {
    const row = db.prepare('SELECT * FROM response_templates WHERE id = ?').get(id) as
      { id: number; project_id: number; name: string; full_answers: string; short_answers: string } | undefined;
    if (!row) throw notFound('Шаблон ответа');
    return { ...row, full_answers: JSON.parse(row.full_answers) as string[], short_answers: JSON.parse(row.short_answers) as string[] };
  };
  r.get('/projects/:pid/response-templates', (req, res) => {
    const rows = db.prepare('SELECT id FROM response_templates WHERE project_id = ? ORDER BY id').all(parseId(req.params.pid)) as { id: number }[];
    res.json(rows.map(({ id }) => {
      const row = load(id);
      return { ...row, has_answer: row.full_answers.some(a => a.trim()), hint: row.full_answers.find(a => a.trim()) ?? '', scenarios: [], step_count: 0 };
    }));
  });
  r.post('/projects/:pid/response-templates', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const name = requireString(req.body?.name, 'Название');
    assertUniqueName(db, 'response_templates', pid, name, 'Шаблон ответа');
    const id = Number(db.prepare('INSERT INTO response_templates(project_id, name, full_answers, short_answers) VALUES (?, ?, ?, ?)')
      .run(pid, name, JSON.stringify(cleanStrings(req.body?.full_answers)), JSON.stringify(cleanStrings(req.body?.short_answers))).lastInsertRowid);
    res.status(201).json(load(id));
  });
  r.get('/response-templates/:id', (req, res) => { res.json(load(parseId(req.params.id))); });
  r.put('/response-templates/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const name = requireString(req.body?.name, 'Название');
    assertUniqueName(db, 'response_templates', cur.project_id, name, 'Шаблон ответа', id);
    db.prepare('UPDATE response_templates SET name = ?, full_answers = ?, short_answers = ? WHERE id = ?')
      .run(name, JSON.stringify(cleanStrings(req.body?.full_answers)), JSON.stringify(cleanStrings(req.body?.short_answers)), id);
    res.json(load(id));
  });
  r.delete('/response-templates/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM response_templates WHERE id = ?').run(id);
    res.status(204).end();
  });
  return r;
}
