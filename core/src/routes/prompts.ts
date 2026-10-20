import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { notFound } from '../errors';
import { assertUniqueName } from '../unique';
import { cleanStrings, parseId, requireString } from '../validate';

interface PromptRow { id: number; project_id: number; scenario_id: number | null; name: string; full_answers: string; short_answers: string }

/** Сколько раз промпт выбран в строках таблиц (ошибки) и в состояниях схемы. */
const USES = `((SELECT COUNT(*) FROM scenario_steps t WHERE t.prompt_id = prompts.id) + (SELECT COUNT(*) FROM scenario_states st WHERE st.prompt_id = prompts.id))`;

const listRows =(rows: unknown[]) => (rows as { has_answer: number }[]).map((r) => ({ ...r, has_answer: !!r.has_answer }));

export function promptsRouter(db: Db): RouterT {
  const r = Router();

  const load = (id: number) => {
    const p = db
      .prepare('SELECT id, project_id, scenario_id, name, full_answers, short_answers FROM prompts WHERE id = ?')
      .get(id) as PromptRow | undefined;
    if (!p) throw notFound('Промпт');
    return { ...p, full_answers: JSON.parse(p.full_answers) as string[], short_answers: JSON.parse(p.short_answers) as string[] };
  };

  const create = (pid: number, scenarioId: number | null, body: any) => {
    const name = requireString(body?.name, 'Название');
    assertUniqueName(db, 'prompts', pid, name, 'Промпт');
    const info = db.prepare('INSERT INTO prompts(project_id, scenario_id, name) VALUES (?, ?, ?)').run(pid, scenarioId, name);
    return { id: Number(info.lastInsertRowid), name };
  };

  r.get('/projects/:pid/prompts', (req, res) => {
    const pid = parseId(req.params.pid);
    res.json(listRows(db.prepare(`SELECT id, name, scenario_id, full_answers <> '[]' AS has_answer, ${USES} AS step_count FROM prompts WHERE project_id = ? ORDER BY id`).all(pid)));
  });

  r.get('/scenarios/:sid/prompts', (req, res) => {
    const sid = parseId(req.params.sid);
    res.json(listRows(db.prepare(`SELECT id, name, scenario_id, full_answers <> '[]' AS has_answer, ${USES} AS step_count FROM prompts WHERE scenario_id = ? ORDER BY id`).all(sid)));
  });

  r.post('/projects/:pid/prompts', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    res.status(201).json(create(pid, null, req.body));
  });

  r.post('/scenarios/:sid/prompts', (req, res) => {
    const sid = parseId(req.params.sid);
    const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(sid) as { project_id: number } | undefined;
    if (!s) throw notFound('Сценарий');
    res.status(201).json(create(s.project_id, sid, req.body));
  });

  r.get('/prompts/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/prompts/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    assertUniqueName(db, 'prompts', cur.project_id, requireString(b.name, 'Название'), 'Промпт', id);
    db.prepare('UPDATE prompts SET name = ?, full_answers = ?, short_answers = ? WHERE id = ?').run(
      requireString(b.name, 'Название'), JSON.stringify(cleanStrings(b.full_answers)),
      JSON.stringify(cleanStrings(b.short_answers)), id,
    );
    res.json(load(id));
  });

  r.delete('/prompts/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
