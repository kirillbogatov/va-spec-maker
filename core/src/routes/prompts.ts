import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { notFound } from '../errors';
import { logPromptChanged } from '../history';
import { assertSameProject, connect, disconnect } from '../links';
import { assertUniqueName } from '../unique';
import { cleanStrings, parseId, requireString } from '../validate';

interface PromptRow { id: number; project_id: number; name: string; full_answers: string }

/** Сколько раз промпт выбран в строках таблиц (ошибки) и в состояниях схемы. */
const USES = `((SELECT COUNT(*) FROM scenario_steps t WHERE t.prompt_id = prompts.id) + (SELECT COUNT(*) FROM scenario_states st WHERE st.prompt_id = prompts.id))`;

export function promptsRouter(db: Db): RouterT {
  const r = Router();

  const load = (id: number) => {
    const p = db
      .prepare('SELECT id, project_id, name, full_answers FROM prompts WHERE id = ?')
      .get(id) as PromptRow | undefined;
    if (!p) throw notFound('Промпт');
    return { ...p, full_answers: JSON.parse(p.full_answers) as string[] };
  };

  const scenariosOf = (id: number) =>
    db
      .prepare('SELECT s.id, s.name FROM scenario_prompts sp JOIN scenarios s ON s.id = sp.scenario_id WHERE sp.prompt_id = ? ORDER BY s.id')
      .all(id) as { id: number; name: string }[];

  /** hint — первый непустой ответ: краткое описание для выпадающих списков. */
  const listRows = (rows: unknown[]) =>
    (rows as { id: number; has_answer: number; full_answers: string }[]).map(({ full_answers, ...r }) => ({
      ...r,
      has_answer: !!r.has_answer,
      hint: (JSON.parse(full_answers) as string[]).find((a) => a.trim()) ?? '',
      scenarios: scenariosOf(r.id),
    }));

  const create = (pid: number, body: any) => {
    const name = requireString(body?.name, 'Название');
    assertUniqueName(db, 'prompts', pid, name, 'Промпт');
    const info = db.prepare("INSERT INTO prompts(project_id, name, full_answers) VALUES (?, ?, '[]')").run(pid, name);
    return { id: Number(info.lastInsertRowid), name };
  };

  r.get('/projects/:pid/prompts', (req, res) => {
    const pid = parseId(req.params.pid);
    res.json(listRows(db.prepare(`SELECT id, name, full_answers, full_answers <> '[]' AS has_answer, ${USES} AS step_count FROM prompts WHERE project_id = ? ORDER BY id`).all(pid)));
  });

  /** Промпты, подключённые к сценарию, в порядке подключения. */
  r.get('/scenarios/:sid/prompts', (req, res) => {
    const sid = parseId(req.params.sid);
    res.json(
      listRows(
        db
          .prepare(
            `SELECT prompts.id, prompts.name, prompts.full_answers, prompts.full_answers <> '[]' AS has_answer, ${USES} AS step_count
             FROM scenario_prompts sp JOIN prompts ON prompts.id = sp.prompt_id
             WHERE sp.scenario_id = ? ORDER BY sp.position, sp.id`,
          )
          .all(sid),
      ),
    );
  });

  r.post('/projects/:pid/prompts', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    res.status(201).json(create(pid, req.body));
  });

  /** Создаёт промпт в проекте и сразу подключает его к сценарию. */
  r.post('/scenarios/:sid/prompts', (req, res) => {
    const sid = parseId(req.params.sid);
    const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(sid) as { project_id: number } | undefined;
    if (!s) throw notFound('Сценарий');
    const created = db.transaction(() => {
      const c = create(s.project_id, req.body);
      connect(db, 'prompt', sid, c.id);
      return c;
    })();
    res.status(201).json(created);
  });

  r.put('/scenarios/:sid/prompts/:pid', (req, res) => {
    const sid = parseId(req.params.sid);
    const pid = parseId(req.params.pid);
    assertSameProject(db, 'prompt', sid, pid);
    connect(db, 'prompt', sid, pid);
    res.json({ id: pid });
  });

  r.delete('/scenarios/:sid/prompts/:pid', (req, res) => {
    disconnect(db, 'prompt', parseId(req.params.sid), parseId(req.params.pid));
    res.status(204).end();
  });

  r.get('/prompts/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/prompts/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const b = (req.body ?? {}) as Record<string, unknown>;
    assertUniqueName(db, 'prompts', cur.project_id, requireString(b.name, 'Название'), 'Промпт', id);
    const next = { name: requireString(b.name, 'Название'), full_answers: cleanStrings(b.full_answers) };
    db.prepare('UPDATE prompts SET name = ?, full_answers = ? WHERE id = ?').run(next.name, JSON.stringify(next.full_answers), id);
    logPromptChanged(db, id, cur, next);
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
