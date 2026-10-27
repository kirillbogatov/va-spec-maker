import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { HttpError, notFound } from '../errors';
import { cleanKeywordName, cleanSynonyms, keywordsToTxt, parseKeywordsTxt } from '../keywords';
import { optString, parseId, requireString } from '../validate';

interface Row { id: number; project_id: number; name: string; synonyms: string }

const view = (r: Row) => ({ id: r.id, project_id: r.project_id, name: r.name, synonyms: JSON.parse(r.synonyms) as string[], used_by: [] as { id: number; name: string }[] });

/** Справочник ключевых слов проекта: код и синонимы. Фразам интентов ключевые слова подбираются по тексту, привязок нет. */
export function keywordsRouter(db: Db): RouterT {
  const r = Router();

  const all = (pid: number) =>
    (db.prepare('SELECT id, project_id, name, synonyms FROM keywords WHERE project_id = ?').all(pid) as Row[]).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  const load = (id: number): Row => {
    const k = db.prepare('SELECT id, project_id, name, synonyms FROM keywords WHERE id = ?').get(id) as Row | undefined;
    if (!k) throw notFound('Ключевое слово');
    return k;
  };
  const assertUnique = (pid: number, name: string, exceptId?: number) => {
    const key = name.toLowerCase();
    if (all(pid).some((k) => k.id !== exceptId && k.name.toLowerCase() === key)) {
      throw new HttpError(409, 'duplicate', `Ключевое слово «${name}» уже существует`);
    }
  };
  const cleanName = (v: unknown) => {
    const name = cleanKeywordName(requireString(v, 'Код'));
    if (!name) throw new HttpError(400, 'bad_request', 'Поле «Код» не может быть пустым');
    return name;
  };
  const requireProject = (pid: number) => {
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
  };

  r.get('/projects/:pid/keywords', (req, res) => {
    res.json(all(parseId(req.params.pid)).map(view));
  });

  r.post('/projects/:pid/keywords', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = cleanName(req.body?.name);
    requireProject(pid);
    assertUnique(pid, name);
    const info = db.prepare('INSERT INTO keywords(project_id, name) VALUES (?, ?)').run(pid, name);
    res.status(201).json(view(load(Number(info.lastInsertRowid))));
  });

  r.get('/projects/:pid/keywords/export', (req, res) => {
    const items = all(parseId(req.params.pid)).map((k) => ({ name: k.name, synonyms: JSON.parse(k.synonyms) as string[] }));
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''keywords.txt");
    res.type('text/plain; charset=utf-8').send(keywordsToTxt(items));
  });

  r.post('/projects/:pid/keywords/import', (req, res) => {
    const pid = parseId(req.params.pid);
    requireProject(pid);
    const { items, skipped } = parseKeywordsTxt(optString(req.body?.text));
    const existing = new Map(all(pid).map((k) => [k.name.toLowerCase(), k.id]));
    let added = 0;
    let updated = 0;
    db.transaction(() => {
      for (const k of items) {
        const id = existing.get(k.name.toLowerCase());
        if (id === undefined) {
          db.prepare('INSERT INTO keywords(project_id, name, synonyms) VALUES (?, ?, ?)').run(pid, k.name, JSON.stringify(k.synonyms));
          added++;
        } else {
          db.prepare('UPDATE keywords SET synonyms = ? WHERE id = ?').run(JSON.stringify(k.synonyms), id);
          updated++;
        }
      }
    })();
    res.json({ added, updated, skipped });
  });

  r.get('/keywords/:id', (req, res) => {
    res.json(view(load(parseId(req.params.id))));
  });

  r.put('/keywords/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const name = cleanName(req.body?.name);
    assertUnique(cur.project_id, name, id);
    const synonyms = cleanSynonyms(Array.isArray(req.body?.synonyms) ? req.body.synonyms.map(optString) : []);
    db.prepare('UPDATE keywords SET name = ?, synonyms = ? WHERE id = ?').run(name, JSON.stringify(synonyms), id);
    res.json(view(load(id)));
  });

  r.delete('/keywords/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM keywords WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
