import { groupConditions } from './conditions';
import type { Db } from '../sqlite';
import { orderTransitionRows } from './state-order';
import { notFound } from '../errors';
import { STRINGS, type SpecLang } from './i18n';
import { matchKeywords } from '../keywords';

export interface TransitionRow {
  state: string;
  intent: string | null;
  request_params: string;
  condition: string;
  prompt: string | null;
  system_action: string;
  next_states: string;
}

/** Как описаны интенты в проекте (настройка хранится в браузере): определяет, какие колонки значений выводить. */
export type IntentMode = 'phrases' | 'patterns' | 'both' | 'keywords';

export const parseIntentMode = (v: unknown): IntentMode => (v === 'phrases' || v === 'patterns' || v === 'keywords' ? v : 'both');

export interface ProjectSpec {
  /** Вкладки всех сценариев с метаданными, для выгрузки проекта. */
  parts?: SpecPart[];
  changelog?: { date?: string; scenario?: string; task: string; author: string; description: string }[];
  project: { id: number; name: string; description: string };
  /** Не задан — как «both»: колонки по наличию данных. */
  intentMode?: IntentMode;
  intents: {
    name: string;
    phrases: string[];
    patterns: string[];
    /** Ключевые слова каждой фразы (по порядку фраз). */
    keywords?: string[][];
    entities: { name: string; required: boolean }[];
  }[];
  entities: {
    name: string;
    type: string;
    range_min: string;
    range_max: string;
    multiple_values: boolean;
    values: { value: string; synonyms: string[] }[];
  }[];
  prompts: { name: string; full_answers: string[] }[];
  dependencies: { scenario: string; name: string; type: string; values: string[]; description?: string }[];
  transitions: TransitionRow[];
}

/** Часть (вкладка) сценария: в документе — подраздел только в State transitions. */
export interface SpecPart {
  scenario?: string;
  preconditions?: string[];
  precondition?: string;
  precond_mode?: 'all' | 'any';
  title: string;
  description: string;
  transitions: TransitionRow[];
}

/** Документ сценария: общие таблицы целиком, переходы — по вкладкам. */
export interface ScenarioDoc {
  spec: ProjectSpec;
  parts: SpecPart[];
  /** Журнал изменений, который ведут вручную; выводится вверху документа после описания. */
  changelog: { date?: string; task: string; author: string; description: string }[];
}

/**
 * Спецификация сценария: интенты, сущности и промпты — общие для всех вкладок,
 * разбиение по вкладкам и их предусловия выводятся перед таблицами переходов.
 */
export function loadScenarioDoc(db: Db, scenarioId: number, lang: SpecLang = 'ru'): ScenarioDoc {
  const scenario = db.prepare('SELECT id, project_id, name, description FROM scenarios WHERE id = ?').get(scenarioId) as
    | { id: number; project_id: number; name: string; description: string }
    | undefined;
  if (!scenario) throw notFound('Сценарий');
  const projectId = scenario.project_id;
  const project = db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(projectId) as ProjectSpec['project'];
  const parts = db.prepare('SELECT id, name, description, preconditions, precondition, precond_mode FROM scenario_parts WHERE scenario_id = ? ORDER BY position, id').all(scenarioId) as {
    id: number; name: string; description: string; preconditions?: string; precondition?: string; precond_mode?: 'all' | 'any';
  }[];
  if (!parts.length) parts.push({ id: -1, name: scenario.name, description: '' });

  // Сущности сценария — те, что указаны у его интентов (вкладка «Интенты»)
  const entityIds = new Set<number>();
  for (const row of db.prepare('SELECT entity_id FROM scenario_entities WHERE scenario_id = ? UNION SELECT entity_id FROM scenario_dependencies WHERE scenario_id = ? AND entity_id IS NOT NULL').all(scenarioId, scenarioId) as { entity_id: number }[]) entityIds.add(row.entity_id);
  for (const row of db.prepare("SELECT conditions FROM scenario_steps WHERE scenario_id = ? AND kind <> 'error'").all(scenarioId) as { conditions: string }[]) {
    for (const condition of JSON.parse(row.conditions) as { entity_id?: number }[]) if (condition.entity_id !== undefined) entityIds.add(condition.entity_id);
  }
  // Сущности, используемые только в предусловиях вкладок, тоже входят в документ.
  for (const part of parts) {
    for (const c of JSON.parse(part.preconditions ?? '[]') as { entity_id?: number }[]) {
      if (c.entity_id !== undefined) entityIds.add(c.entity_id);
    }
  }
  const intentIds = new Set(
    (db.prepare('SELECT intent_id FROM scenario_intents WHERE scenario_id = ?').all(scenarioId) as { intent_id: number }[]).map((r) => r.intent_id),
  );
  const promptIds = new Set(
    (db.prepare('SELECT prompt_id FROM scenario_prompts WHERE scenario_id = ?').all(scenarioId) as { prompt_id: number }[]).map((r) => r.prompt_id),
  );
  for (const iid of intentIds) {
    for (const r of db
      .prepare('SELECT entity_id FROM intent_entities WHERE intent_id = ?')
      .all(iid) as { entity_id: number }[]) {
      entityIds.add(r.entity_id);
    }
  }
  const spec = buildSpec(db, projectId, { ...project, name: scenario.name, description: scenario.description }, lang, { scenarioId, partId: null, intentIds, promptIds, entityIds });
  const changelog = db.prepare('SELECT date, task, author, description FROM scenario_changelog WHERE scenario_id = ? ORDER BY position, id').all(scenarioId) as ScenarioDoc['changelog'];
  return {
    spec: { ...spec, transitions: [] },
    changelog,
    parts: parts.map((part) => {
      const ps = buildSpec(db, projectId, project, lang, { scenarioId, partId: part.id, intentIds, promptIds, entityIds });
      return { title: part.name, description: part.description,
        preconditions: formatPartPreconditions(db, projectId, scenarioId, part.preconditions ?? '[]', lang, part.precond_mode),
        precondition: part.precondition ?? '', precond_mode: part.precond_mode ?? 'all',
        transitions: ps.transitions };
    }),
  };
}

interface Scope {
  scenarioId: number;
  /** null — все части сценария. */
  partId: number | null;
  intentIds: Set<number>;
  promptIds: Set<number>;
  entityIds: Set<number>;
}

export function loadProjectSpec(db: Db, projectId: number, lang: SpecLang = 'ru'): ProjectSpec {
  const project = db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(projectId) as
    | ProjectSpec['project']
    | undefined;
  if (!project) throw notFound('Проект');
  const projectParts = (db.prepare('SELECT id, name FROM scenarios WHERE project_id = ? AND is_template = 0 ORDER BY id').all(projectId) as { id: number; name: string }[])
    .flatMap((scenario) => loadScenarioDoc(db, scenario.id, lang).parts.map((part) => ({ ...part, scenario: scenario.name })));
  return { ...buildSpec(db, projectId, project, lang), parts: projectParts, changelog: db.prepare('SELECT c.date, s.name AS scenario, c.task, c.author, c.description FROM scenario_changelog c JOIN scenarios s ON s.id = c.scenario_id WHERE s.project_id = ? AND s.is_template = 0 ORDER BY s.id, c.position, c.id').all(projectId) as NonNullable<ProjectSpec['changelog']> };
}

function buildSpec(db: Db, projectId: number, project: ProjectSpec['project'], lang: SpecLang, scope?: Scope): ProjectSpec {
  const keywordDefs = (db.prepare('SELECT name, synonyms FROM keywords WHERE project_id = ? ORDER BY id').all(projectId) as { name: string; synonyms: string }[]).map((k) => ({
    name: k.name,
    synonyms: JSON.parse(k.synonyms) as string[],
  }));
  const intents = (
    (db.prepare(`SELECT id, name FROM intents WHERE project_id = ? ${scope ? '' : 'AND is_template = 0'} ORDER BY id`).all(projectId) as { id: number; name: string }[]).filter(
      (i) => !scope || scope.intentIds.has(i.id),
    )
  ).map((i) => {
    const phrases = (db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(i.id) as { text: string }[]).map((p) => p.text);
    return {
    name: i.name,
    phrases,
    keywords: phrases.map((p) => matchKeywords(p, keywordDefs)),
    patterns: (db.prepare('SELECT text FROM intent_patterns WHERE intent_id = ? ORDER BY position, id').all(i.id) as { text: string }[]).map((p) => p.text),
    entities: (
      db
        .prepare(
          `SELECT e.name, ie.required FROM intent_entities ie JOIN entities e ON e.id = ie.entity_id
           WHERE ie.intent_id = ? ORDER BY ie.position, ie.id`,
        )
        .all(i.id) as { name: string; required: number }[]
    ).map((e) => ({ name: e.name, required: !!e.required })),
    };
  });

  const entities = (
    (db
      .prepare('SELECT id, name, type, range_min, range_max, multiple_values FROM entities WHERE project_id = ? ORDER BY id')
      .all(projectId) as { id: number; name: string; type: string; range_min: string; range_max: string; multiple_values: number }[]).filter(
      (e) => !scope || scope.entityIds.has(e.id),
    )
  ).map((e) => ({
    name: e.name,
    type: e.type,
    range_min: e.range_min,
    range_max: e.range_max,
    multiple_values: !!e.multiple_values,
    values: e.type !== 'string' ? [] : (
      db.prepare('SELECT value, synonyms FROM entity_values WHERE entity_id = ? ORDER BY position, id').all(e.id) as {
        value: string; synonyms: string;
      }[]
    ).map((v) => ({ value: v.value, synonyms: JSON.parse(v.synonyms) as string[] })),
  }));

  const prompts = (
    db
      .prepare(`SELECT id, name, full_answers FROM prompts WHERE project_id = ? ${scope ? '' : 'AND is_template = 0'} ORDER BY id`)
      .all(projectId) as { id: number; name: string; full_answers: string }[]
  )
    .filter((p) => !scope || scope.promptIds.has(p.id))
    .map(({ id: _id, ...p }) => p)
    .map((p) => ({ ...p, full_answers: JSON.parse(p.full_answers) as string[] }));

  const depLabel = new Map<string, string>();
  const dependencies = (
    db
      .prepare(
        `SELECT s.name AS scenario, d.ref, COALESCE(e.name, d.name) AS name, d.description, d.entity_id, d.type, d.options
         FROM scenario_dependencies d
         JOIN scenarios s ON s.id = d.scenario_id
         LEFT JOIN entities e ON e.id = d.entity_id
         WHERE s.project_id = ? AND ((? IS NULL AND s.is_template = 0) OR s.id = ?) ORDER BY s.id, d.position, d.id`,
      )
      .all(projectId, scope?.scenarioId ?? null, scope?.scenarioId ?? null) as { scenario: string; ref: string; name: string; description: string; entity_id: number | null; type: string; options: string }[]
  ).map((d) => {
    depLabel.set(d.ref, d.name);
    let values = d.type === 'enum' ? (JSON.parse(d.options) as string[]) : d.type === 'bool' ? ['true', 'false'] : [];
    if (d.entity_id !== null) {
      const entity = db.prepare('SELECT type FROM entities WHERE id = ?').get(d.entity_id) as { type: string } | undefined;
      values = entity?.type === 'boolean' ? ['true', 'false'] : entity?.type === 'string' ? (db.prepare('SELECT value FROM entity_values WHERE entity_id = ? ORDER BY position, id').all(d.entity_id) as { value: string }[]).map((v) => v.value) : [];
    }
    return { scenario: d.scenario, name: d.name, type: d.type, values, description: d.description };
  });

  // Ответ ассистента и действие системы перехода берутся из состояния, в которое он ведёт.
  const stateInfo = new Map<string, { prompt: string | null; system_action: string }>();
  for (const st of db
    .prepare(
      `SELECT st.part_id, st.name, p.name AS prompt, st.system_action
       FROM scenario_states st
       JOIN scenarios s ON s.id = st.scenario_id
       LEFT JOIN prompts p ON p.id = st.prompt_id
       WHERE s.project_id = ?`,
    )
    .all(projectId) as { part_id: number | null; name: string; prompt: string | null; system_action: string }[]) {
    stateInfo.set(`${st.part_id}|${st.name}`, st);
  }

  type Raw = TransitionRow & { kind: string; conditions: string; cond_mode: string; part_id: number | null };
  const rows = db
    .prepare(
      `SELECT t.part_id, t.kind, t.state, CASE WHEN t.match_any_intent = 1 THEN ? ELSE i.name END AS intent, t.request_params, t.condition, t.conditions, t.cond_mode, p.name AS prompt, t.system_action, t.next_states
       FROM scenario_steps t
       JOIN scenarios s ON s.id = t.scenario_id
       LEFT JOIN intents i ON i.id = t.intent_id
       LEFT JOIN prompts p ON p.id = t.prompt_id
       WHERE s.project_id = ? AND t.kind <> 'error' AND ((? IS NULL AND s.is_template = 0) OR t.scenario_id = ?) AND (? IS NULL OR t.part_id = ?) ORDER BY s.id, t.part_id, t.position, t.id`,
    )
    .all(STRINGS[lang].anyIntent, projectId, scope?.scenarioId ?? null, scope?.scenarioId ?? null, scope?.partId ?? null, scope?.partId ?? null) as Raw[];
  const entityName = new Map((db.prepare('SELECT id, name FROM entities WHERE project_id = ?').all(projectId) as { id: number; name: string }[]).map((e) => [e.id, e.name]));
  const keywordName = new Map((db.prepare('SELECT id, name FROM keywords WHERE project_id = ?').all(projectId) as { id: number; name: string }[]).map((k) => [k.id, k.name]));
  const strip = ({ kind, conditions, cond_mode, part_id, ...row }: Raw): TransitionRow => {
    const pairs = (JSON.parse(conditions) as { dep: string; value: string; entity_id?: number; keyword_id?: number; op?: string }[])
      .map((c) => ({ ...c, label: c.keyword_id !== undefined ? keywordName.get(c.keyword_id) : c.entity_id !== undefined ? entityName.get(c.entity_id) : depLabel.get(c.dep) }))
      .filter((c) => c.label !== undefined)
      .map((c) => (c.keyword_id !== undefined ? `${STRINGS[lang][c.op === '!=' ? 'conceptAbsent' : 'conceptPresent']}: ${c.label}` : `[${c.label}] ${c.op || '='} ${c.value}`));
    const all = groupConditions([...pairs, ...row.condition.split('\n').map((l) => l.trim())].filter(Boolean), cond_mode);
    const out = { ...row, condition: [...(cond_mode === 'any' && all.length > 1 ? [STRINGS[lang].anyOf] : []), ...all].join('\n') };
    const targets = row.next_states.split(/[\s,;|]+|->|→/).map((x) => x.trim()).filter(Boolean).map((t) => stateInfo.get(`${part_id}|${t}`));
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))].join('\n');
    return { ...out, prompt: uniq(targets.map((t) => t?.prompt)) || null, system_action: uniq(targets.map((t) => t?.system_action)) };
  };

  return {
    project,
    intents,
    entities,
    prompts,
    dependencies,
    transitions: orderTransitionRows(db, projectId, rows.filter((r) => r.kind === 'transition')).map(strip),
  };
}

/** Те же подписи структурных условий, что в строках переходов, но область — вкладка. */
function formatPartPreconditions(db: Db, projectId: number, scenarioId: number, raw: string, lang: SpecLang, mode?: string): string[] {
  const entities = new Map((db.prepare('SELECT id, name FROM entities WHERE project_id = ?').all(projectId) as { id: number; name: string }[]).map((row) => [row.id, row.name]));
  const concepts = new Map((db.prepare('SELECT id, name FROM keywords WHERE project_id = ?').all(projectId) as { id: number; name: string }[]).map((row) => [row.id, row.name]));
  const dependencies = new Map((db.prepare('SELECT d.ref, COALESCE(e.name, d.name) AS name FROM scenario_dependencies d LEFT JOIN entities e ON e.id = d.entity_id WHERE d.scenario_id = ?').all(scenarioId) as { ref: string; name: string }[]).map((row) => [row.ref, row.name]));
  return groupConditions((JSON.parse(raw) as { dep: string; value: string; entity_id?: number; keyword_id?: number; op?: string }[]).map((c) => {
    const label = c.keyword_id !== undefined ? concepts.get(c.keyword_id) : c.entity_id !== undefined ? entities.get(c.entity_id) : dependencies.get(c.dep);
    if (label === undefined) return '';
    return c.keyword_id !== undefined ? `${STRINGS[lang][c.op === '!=' ? 'conceptAbsent' : 'conceptPresent']}: ${label}` : `[${label}] ${c.op || '='} ${c.value}`;
  }).filter(Boolean), mode);
}
