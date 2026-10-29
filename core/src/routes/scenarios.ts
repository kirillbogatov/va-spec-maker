import { Router, type RouterT } from '../router';
import type { Db } from '../sqlite';
import { badRequest, notFound } from '../errors';
import { connect } from '../links';
import { clearHistory, listHistory, logCreated, logScenarioChanges, type ScenarioSnapshot } from '../history';
import { optString, parseId, requireString } from '../validate';

const DEP_TYPES = ['string', 'enum', 'bool'];

/**
 * Условие: значение зависимости сценария (dep), значение сущности проекта (entity_id, dep пуст)
 * или наличие ключевого слова в запросе (keyword_id: «=» — есть, «!=» — нет; значение пустое).
 */
type ConditionOp = '=' | '!=' | '<' | '>';
interface StepCondition { dep: string; value: string; entity_id?: number; keyword_id?: number; op?: ConditionOp }
const parseOp = (v: unknown): ConditionOp => (v === '!=' || v === '<' || v === '>' ? v : '=');
/**
 * Состояние схемы: точка раскладки плюс то, что происходит при входе в состояние —
 * описание, ответ ассистента и действие системы.
 */
interface StateInfo { x: number; y: number; description: string; prompt_id: number | null; system_action: string }
type Layout = Record<string, StateInfo>;

/** Оставляет только корректные состояния: непустое имя и конечные числа в точке раскладки. */
function cleanLayout(raw: unknown): Layout {
  const out: Layout = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, p] of Object.entries(raw as Record<string, any>)) {
    if (!name.trim() || !Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
    out[name] = {
      x: Math.round(p.x), y: Math.round(p.y),
      description: optString(p.description),
      prompt_id: p.prompt_id == null ? null : parseId(p.prompt_id),
      system_action: optString(p.system_action),
    };
  }
  return out;
}

export function scenariosRouter(db: Db): RouterT {
  const r = Router();

  const loadPart = (part: { id: number; name: string; description: string; layout: string }) => {
    const steps = (
      db
        .prepare(
          `SELECT name, kind, state, intent_id, request_params, condition, conditions, cond_mode, prompt_id, system_action, next_states
           FROM scenario_steps WHERE part_id = ? ORDER BY position, id`,
        )
        .all(part.id) as { conditions: string }[]
    ).map((t) => ({ ...t, conditions: JSON.parse(t.conditions) as StepCondition[] }));
    const layout: Layout = {};
    for (const { name, ...info } of db
      .prepare('SELECT name, description, prompt_id, system_action FROM scenario_states WHERE part_id = ? ORDER BY id')
      .all(part.id) as { name: string; description: string; prompt_id: number | null; system_action: string }[]) {
      layout[name] = { x: 0, y: 0, ...info };
    }
    for (const [name, p] of Object.entries(JSON.parse(part.layout) as Record<string, { x: number; y: number }>)) {
      layout[name] = layout[name] ? { ...layout[name], x: p.x, y: p.y } : { ...p, description: '', prompt_id: null, system_action: '' };
    }
    return { name: part.name, description: part.description, steps, layout };
  };

  const load = (id: number) => {
    const head = db.prepare('SELECT id, project_id, name, description FROM scenarios WHERE id = ?').get(id) as
      | { id: number; project_id: number; name: string; description: string }
      | undefined;
    if (!head) throw notFound('Сценарий');
    let partRows = db.prepare('SELECT id, name, description, layout FROM scenario_parts WHERE scenario_id = ? ORDER BY position, id').all(id) as { id: number; name: string; description: string; layout: string }[];
    if (!partRows.length) {
      db.prepare('INSERT INTO scenario_parts(scenario_id, position, name) VALUES (?, 0, ?)').run(id, head.name);
      partRows = db.prepare('SELECT id, name, description, layout FROM scenario_parts WHERE scenario_id = ?').all(id) as typeof partRows;
    }
    const dependencies = (
      db
        .prepare('SELECT ref, entity_id, name, type, options FROM scenario_dependencies WHERE scenario_id = ? ORDER BY position, id')
        .all(id) as { options: string }[]
    ).map((d) => ({ ...d, options: JSON.parse(d.options) as string[] }));
    const entities = (db
      .prepare('SELECT entity_id, followup_prompt, required, is_array FROM scenario_entities WHERE scenario_id = ? ORDER BY position, id')
      .all(id) as { entity_id: number; followup_prompt: string; required: number; is_array: number }[]).map((e) => ({ ...e, required: !!e.required, is_array: !!e.is_array }));
    return { ...head, entities, dependencies, parts: partRows.map(loadPart) };
  };

  r.get('/projects/:pid/scenarios', (req, res) => {
    const pid = parseId(req.params.pid);
    res.json(
      db
        .prepare(
          `SELECT s.id, s.name,
                  (SELECT COUNT(*) FROM scenario_steps t WHERE t.scenario_id = s.id) AS step_count
           FROM scenarios s WHERE s.project_id = ? ORDER BY s.id`,
        )
        .all(pid),
    );
  });

  r.post('/projects/:pid/scenarios', (req, res) => {
    const pid = parseId(req.params.pid);
    const name = requireString(req.body?.name, 'Название');
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    const info = db.transaction(() => {
      const i = db.prepare('INSERT INTO scenarios(project_id, name) VALUES (?, ?)').run(pid, name);
      db.prepare('INSERT INTO scenario_parts(scenario_id, position, name) VALUES (?, 0, ?)').run(i.lastInsertRowid, name);
      logCreated(db, Number(i.lastInsertRowid));
      return i;
    })();
    res.status(201).json({ id: Number(info.lastInsertRowid), name });
  });

  r.get('/scenarios/:id', (req, res) => {
    res.json(load(parseId(req.params.id)));
  });

  r.put('/scenarios/:id', (req, res) => {
    const id = parseId(req.params.id);
    const cur = load(id);
    const b = (req.body ?? {}) as Record<string, any>;
    const name = requireString(b.name, 'Название');
    const dependencies = (Array.isArray(b.dependencies) ? b.dependencies : []).map((d: any) => ({
      ref: requireString(d?.ref, 'Идентификатор зависимости'),
      entity_id: d?.entity_id == null ? null : parseId(d.entity_id),
      name: optString(d?.name).trim(),
      type: DEP_TYPES.includes(d?.type) ? (d.type as string) : 'string',
      options: (Array.isArray(d?.options) ? d.options : []).map((o: unknown) => optString(o).trim()).filter(Boolean),
    }));
    const entities = (Array.isArray(b.entities) ? b.entities : []).map((e: any) => ({
      entity_id: parseId(e?.entity_id),
      followup_prompt: optString(e?.followup_prompt),
      required: e?.required ? 1 : 0,
      is_array: e?.is_array ? 1 : 0,
    }));
    if (new Set(entities.map((e: { entity_id: number }) => e.entity_id)).size !== entities.length) {
      throw badRequest('Сущность в сценарии указана дважды');
    }
    const refs = new Set<string>(dependencies.map((d: { ref: string }) => d.ref));
    if (refs.size !== dependencies.length) throw badRequest('Идентификаторы зависимостей должны быть уникальны');
    const findEntity = db.prepare('SELECT 1 FROM entities WHERE id = ? AND project_id = ?');
    for (const e of entities) {
      if (!findEntity.get(e.entity_id, cur.project_id)) throw badRequest('Сущность сценария не найдена в проекте');
    }
    for (const d of dependencies) {
      if (d.entity_id !== null && !findEntity.get(d.entity_id, cur.project_id)) {
        throw badRequest('Сущность зависимости не найдена в проекте');
      }
    }
    const findKeyword = db.prepare('SELECT 1 FROM keywords WHERE id = ? AND project_id = ?');
    const findIntent = db.prepare('SELECT 1 FROM intents WHERE id = ? AND project_id = ?');
    const findPrompt = db.prepare('SELECT 1 FROM prompts WHERE id = ? AND project_id = ?');
    const isGlobalIntent = db.prepare('SELECT 1 FROM scenario_intents WHERE scenario_id = ? AND intent_id = ? AND is_global = 1');
    const parts = (Array.isArray(b.parts) ? b.parts : cur.parts).map((p: any, n: number) => {
      const steps = (Array.isArray(p?.steps) ? p.steps : []).map((s: any) => ({
        name: optString(s?.name).trim(),
        kind: s?.kind === 'error' || s?.kind === 'global' ? s.kind : 'transition',
        state: optString(s?.state).trim(),
        intent_id: s?.intent_id == null ? null : parseId(s.intent_id),
        request_params: optString(s?.request_params),
        condition: optString(s?.condition),
        conditions: (Array.isArray(s?.conditions) ? s.conditions : []).map((c: any) =>
          c?.keyword_id != null
            ? { dep: '', keyword_id: parseId(c.keyword_id), op: c?.op === '!=' ? '!=' : '=', value: '' }
            : c?.entity_id == null
              ? { dep: optString(c?.dep), op: parseOp(c?.op), value: optString(c?.value) }
              : { dep: '', entity_id: parseId(c.entity_id), op: parseOp(c?.op), value: optString(c?.value) },
        ) as StepCondition[],
        cond_mode: s?.cond_mode === 'any' ? 'any' : 'all',
        prompt_id: s?.prompt_id == null ? null : parseId(s.prompt_id),
        system_action: optString(s?.system_action),
        next_states: optString(s?.next_states),
      }));
      // Ответ и действие перехода живут в состоянии-назначении; в строках переходов (в том числе глобальных) их нет.
      for (const s of steps) {
        if (s.kind !== 'error') { s.prompt_id = null; s.system_action = ''; }
        if (s.kind === 'global') s.state = '';
      }
      const layout = cleanLayout(p?.layout);
      for (const s of steps) {
        if (s.conditions.some((c: StepCondition) => c.entity_id === undefined && c.keyword_id === undefined && !refs.has(c.dep))) {
          throw badRequest('Условие ссылается на несуществующую зависимость');
        }
        if (s.conditions.some((c: StepCondition) => c.entity_id !== undefined && !findEntity.get(c.entity_id, cur.project_id))) {
          throw badRequest('Сущность условия не найдена в проекте');
        }
        if (s.conditions.some((c: StepCondition) => c.keyword_id !== undefined && !findKeyword.get(c.keyword_id, cur.project_id))) {
          throw badRequest('Ключевое слово условия не найдено в проекте');
        }
        if (s.intent_id !== null && !findIntent.get(s.intent_id, cur.project_id)) {
          throw badRequest('Интент строки не найден в проекте');
        }
        if (s.kind === 'global' && s.intent_id !== null && !isGlobalIntent.get(id, s.intent_id)) {
          throw badRequest('Глобальный переход возможен только для интента, подключённого к сценарию как глобальный');
        }
        if (s.prompt_id !== null && !findPrompt.get(s.prompt_id, cur.project_id)) {
          throw badRequest('Промпт строки не найден в проекте');
        }
      }
      for (const st of Object.values(layout)) {
        if (st.prompt_id !== null && !findPrompt.get(st.prompt_id, cur.project_id)) {
          throw badRequest('Промпт состояния не найден в проекте');
        }
      }
      return { name: optString(p?.name).trim() || `${name} ${n + 1}`, description: optString(p?.description), steps, layout };
    });
    if (parts.length === 0) throw badRequest('В сценарии должна быть хотя бы одна вкладка');
    db.transaction(() => {
      db.prepare('UPDATE scenarios SET name = ?, description = ? WHERE id = ?').run(name, optString(b.description), id);
      db.prepare('DELETE FROM scenario_parts WHERE scenario_id = ?').run(id);
      db.prepare('DELETE FROM scenario_states WHERE scenario_id = ?').run(id);
      db.prepare('DELETE FROM scenario_steps WHERE scenario_id = ?').run(id);
      db.prepare('DELETE FROM scenario_entities WHERE scenario_id = ?').run(id);
      const insEnt = db.prepare('INSERT INTO scenario_entities(scenario_id, position, entity_id, followup_prompt, required, is_array) VALUES (?, ?, ?, ?, ?, ?)');
      entities.forEach((e: any, i: number) => insEnt.run(id, i, e.entity_id, e.followup_prompt, e.required, e.is_array));
      db.prepare('DELETE FROM scenario_dependencies WHERE scenario_id = ?').run(id);
      const insDep = db.prepare(
        'INSERT INTO scenario_dependencies(scenario_id, position, ref, entity_id, name, type, options) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      dependencies.forEach((d: any, i: number) =>
        insDep.run(id, i, d.ref, d.entity_id, d.name, d.type, JSON.stringify(d.options)),
      );
      const insPart = db.prepare('INSERT INTO scenario_parts(scenario_id, position, name, description, layout) VALUES (?, ?, ?, ?, ?)');
      const insState = db.prepare('INSERT INTO scenario_states(scenario_id, part_id, name, description, prompt_id, system_action) VALUES (?, ?, ?, ?, ?, ?)');
      const ins = db.prepare(
        `INSERT INTO scenario_steps(scenario_id, part_id, position, name, kind, state, intent_id, request_params, condition, conditions, cond_mode, prompt_id, system_action, next_states)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      parts.forEach((p: any, n: number) => {
        const points = Object.fromEntries(Object.entries(p.layout as Layout).map(([k, { x, y }]) => [k, { x, y }]));
        const pid = Number(insPart.run(id, n, p.name, p.description, JSON.stringify(points)).lastInsertRowid);
        for (const [k, st] of Object.entries(p.layout as Layout)) {
          if (st.description.trim() || st.prompt_id !== null || st.system_action.trim()) insState.run(id, pid, k, st.description, st.prompt_id, st.system_action);
        }
        p.steps.forEach((s: any, i: number) =>
          ins.run(id, pid, i, s.name, s.kind, s.state, s.intent_id, s.request_params, s.condition, JSON.stringify(s.conditions), s.cond_mode, s.prompt_id, s.system_action, s.next_states),
        );
      });
      // Всё, на что ссылаются строки и состояния, подключено к сценарию (глобальные интенты уже подключены проверкой выше)
      for (const p of parts) {
        for (const s of p.steps) {
          if (s.intent_id !== null) connect(db, 'intent', id, s.intent_id);
          if (s.prompt_id !== null) connect(db, 'prompt', id, s.prompt_id);
        }
        for (const st of Object.values(p.layout as Layout)) if (st.prompt_id !== null) connect(db, 'prompt', id, st.prompt_id);
      }
      logScenarioChanges(db, id, cur as unknown as ScenarioSnapshot, load(id) as unknown as ScenarioSnapshot);
    })();
    res.json(load(id));
  });

  r.get('/scenarios/:id/history', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    res.json(listHistory(db, id));
  });

  /** Журнал изменений, который ведут вручную: задача, автор, описание. В автоматическую историю не попадает. */
  const changelog = (id: number) =>
    db.prepare('SELECT task, author, description FROM scenario_changelog WHERE scenario_id = ? ORDER BY position, id').all(id) as { task: string; author: string; description: string }[];

  r.get('/scenarios/:id/changelog', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    res.json(changelog(id));
  });

  r.put('/scenarios/:id/changelog', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    const rows = (Array.isArray(req.body?.rows) ? req.body.rows : []).map((x: any) => ({
      task: optString(x?.task), author: optString(x?.author), description: optString(x?.description),
    }));
    db.transaction(() => {
      db.prepare('DELETE FROM scenario_changelog WHERE scenario_id = ?').run(id);
      const ins = db.prepare('INSERT INTO scenario_changelog(scenario_id, position, task, author, description) VALUES (?, ?, ?, ?, ?)');
      rows.forEach((x: { task: string; author: string; description: string }, i: number) => ins.run(id, i, x.task, x.author, x.description));
    })();
    res.json(changelog(id));
  });

  r.delete('/scenarios/:id/history', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    clearHistory(db, id);
    res.status(204).end();
  });

  r.delete('/scenarios/:id', (req, res) => {
    const id = parseId(req.params.id);
    load(id);
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(id);
    res.status(204).end();
  });

  return r;
}
