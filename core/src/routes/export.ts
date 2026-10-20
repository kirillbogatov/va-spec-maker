import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { badRequest } from '../errors';
import { renderDocx, renderDocxScenario } from '../export/docx';
import { renderMarkdown, renderMarkdownScenario } from '../export/markdown';
import { loadProjectSpec, loadScenarioDoc } from '../export/model';
import { parseId } from '../validate';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function exportRouter(db: Db): RouterT {
  const r = Router();

  r.get('/scenarios/:id/export', async (req, res) => {
    const id = parseId(req.params.id);
    const format = req.query.format;
    if (format !== 'md' && format !== 'docx') throw badRequest('Параметр format должен быть md или docx');
    // Документ описывает один сценарий; вкладки отражаются только в State transitions
    const doc = loadScenarioDoc(db, id);
    const name = (db.prepare('SELECT name FROM scenarios WHERE id = ?').get(id) as { name: string }).name;
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}.${format}`);
    if (format === 'md') {
      res.type('text/markdown; charset=utf-8').send(renderMarkdownScenario(doc, date));
    } else {
      res.type(DOCX_TYPE).send(await renderDocxScenario(doc, name));
    }
  });

  /** Markdown сценария для предпросмотра на странице (без заголовка attachment). */
  r.get('/scenarios/:id/preview', (req, res) => {
    res.type('text/markdown; charset=utf-8').send(renderMarkdownScenario(loadScenarioDoc(db, parseId(req.params.id)), new Date().toISOString().slice(0, 10)));
  });

  /** Все сценарии проекта одним документом. */
  r.get('/projects/:pid/export', async (req, res) => {
    const spec = loadProjectSpec(db, parseId(req.params.pid));
    const format = req.query.format;
    if (format !== 'md' && format !== 'docx') throw badRequest('Параметр format должен быть md или docx');
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(spec.project.name)}.${format}`);
    if (format === 'md') res.type('text/markdown; charset=utf-8').send(renderMarkdown(spec, date));
    else res.type(DOCX_TYPE).send(await renderDocx(spec, date));
  });

  return r;
}
