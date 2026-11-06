import type { Db } from './sqlite';
import { Router } from './router';
import { badRequest, notFound } from './errors';
import { parseId } from './validate';

export function splitPromptAnswers(db: Db, pid: number): boolean {
  return db.prepare('SELECT split_answers FROM prompt_settings WHERE project_id = ?').get(pid)?.split_answers === 1;
}

/** Unified answers live in full_answers; short_answers is empty. Preserve order and every variant. */
export function normalizePromptAnswers(db: Db, pid: number, full: string[], short: string[]) {
  return splitPromptAnswers(db, pid)
    ? { full_answers: full, short_answers: short }
    : { full_answers: [...full, ...short], short_answers: [] as string[] };
}

export function mergeProjectPromptAnswers(db: Db, pid: number) {
  if (splitPromptAnswers(db, pid)) return;
  for (const table of ['prompts', 'response_templates']) {
    for (const row of db.prepare(`SELECT id, full_answers, short_answers FROM ${table} WHERE project_id = ? AND short_answers <> '[]'`).all(pid)) {
      const answers = normalizePromptAnswers(db, pid, JSON.parse(row.full_answers), JSON.parse(row.short_answers));
      db.prepare(`UPDATE ${table} SET full_answers = ?, short_answers = ? WHERE id = ?`)
        .run(JSON.stringify(answers.full_answers), JSON.stringify(answers.short_answers), row.id);
    }
  }
}

export function promptSettingsRouter(db: Db) {
  const r = Router();
  const project = (raw: string) => {
    const pid = parseId(raw);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    return pid;
  };
  r.get('/projects/:pid/prompt-settings', (req, res) => {
    res.json({ splitAnswers: splitPromptAnswers(db, project(req.params.pid)) });
  });
  r.put('/projects/:pid/prompt-settings', (req, res) => {
    const pid = project(req.params.pid);
    if (typeof req.body?.splitAnswers !== 'boolean') throw badRequest('Разделение ответов должно быть true или false');
    db.transaction(() => {
      db.prepare('INSERT INTO prompt_settings(project_id, split_answers) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET split_answers = excluded.split_answers')
        .run(pid, Number(req.body.splitAnswers));
      if (!req.body.splitAnswers) mergeProjectPromptAnswers(db, pid);
    })();
    res.json({ splitAnswers: req.body.splitAnswers });
  });
  return r;
}
