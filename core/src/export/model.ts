import type { Db } from '../sqlite';
import { notFound } from '../errors';

export interface TransitionRow {
  state: string;
  intent: string | null;
  request_params: string;
  condition: string;
  prompt: string | null;
  system_action: string;
  next_states: string;
}

export interface ProjectSpec {
  project: { id: number; name: string; description: string };
  intents: {
    name: string;
    phrases: string[];
    entities: { name: string; required: boolean }[];
  }[];
  entities: {
    name: string;
    multiple_values: boolean;
    values: { value: string; synonyms: string[] }[];
  }[];
  /** Сущности сценария с его follow-up prompt. */
  scenario_entities: { scenario: string; name: string; followup_prompt: string; required: boolean; is_array: boolean }[];
  prompts: { name: string; full_answers: string[]; short_answers: string[] }[];
  dependencies: { scenario: string; name: string; type: string; values: string[] }[];
  transitions: TransitionRow[];
  errors: TransitionRow[];
}

/** Часть (вкладка) сценария: в документе — подраздел только в State transitions. */
export interface SpecPart {
  title: string;
  description: string;
  transitions: TransitionRow[];
}

/** Документ сценария: общие таблицы целиком, переходы — по вкладкам. */
export interface ScenarioDoc {
  spec: ProjectSpec;
  parts: SpecPart[];
}

/**
 * Спецификация сценария: интенты, сущности, промпты и ошибки — общие для всех вкладок,
 * разбиение по вкладкам видно только в переходах. Единственная вкладка выводится без подзаголовка.
 */
export function loadScenarioDoc(db: Db, scenarioId: number): ScenarioDoc {
  const scenario = db.prepare('SELECT id, project_id, name, description FROM scenarios WHERE id = ?').get(scenarioId) as
    | { id: number; project_id: number; name: string; description: string }
    | undefined;
  if (!scenario) throw notFound('Сценарий');
  const projectId = scenario.project_id;
  const project = db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(projectId) as ProjectSpec['project'];
  const parts = db.prepare('SELECT id, name, description FROM scenario_parts WHERE scenario_id = ? ORDER BY position, id').all(scenarioId) as {
    id: number; name: string; description: string;
  }[];
  if (!parts.length) parts.push({ id: -1, name: scenario.name, description: '' });

  const entityIds = new Set<number>();
  for (const r of db.prepare('SELECT entity_id FROM scenario_dependencies WHERE scenario_id = ? AND entity_id IS NOT NULL').all(scenarioId) as { entity_id: number }[]) {
    entityIds.add(r.entity_id);
  }
  for (const r of db.prepare('SELECT entity_id FROM scenario_entities WHERE scenario_id = ?').all(scenarioId) as { entity_id: number }[]) {
    entityIds.add(r.entity_id);
  }
  const stepRefs = db.prepare('SELECT intent_id, prompt_id FROM scenario_steps WHERE scenario_id = ?').all(scenarioId) as { intent_id: number | null; prompt_id: number | null }[];
  const stateRefs = db.prepare('SELECT prompt_id FROM scenario_states WHERE scenario_id = ?').all(scenarioId) as { prompt_id: number | null }[];
  const intentIds = new Set(stepRefs.map((r) => r.intent_id).filter((x): x is number => x != null));
  const promptIds = new Set([...stepRefs, ...stateRefs].map((r) => r.prompt_id).filter((x): x is number => x != null));
  for (const iid of intentIds) {
    for (const r of db
      .prepare('SELECT entity_id FROM intent_entities WHERE intent_id = ?')
      .all(iid) as { entity_id: number }[]) {
      entityIds.add(r.entity_id);
    }
  }
  const spec = buildSpec(db, projectId, { ...project, name: scenario.name, description: scenario.description }, { scenarioId, partId: null, intentIds, promptIds, entityIds });
  const single = parts.length === 1;
  return {
    spec: { ...spec, transitions: [] },
    parts: parts.map((part) => ({
      title: single ? scenario.name : part.name,
      description: part.description,
      transitions: buildSpec(db, projectId, project, { scenarioId, partId: part.id, intentIds, promptIds, entityIds }).transitions,
    })),
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

export function loadProjectSpec(db: Db, projectId: number): ProjectSpec {
  const project = db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(projectId) as
    | ProjectSpec['project']
    | undefined;
  if (!project) throw notFound('Проект');
  return buildSpec(db, projectId, project);
}

function buildSpec(db: Db, projectId: number, project: ProjectSpec['project'], scope?: Scope): ProjectSpec {
  const intents = (
    (db.prepare('SELECT id, name FROM intents WHERE project_id = ? ORDER BY id').all(projectId) as { id: number; name: string }[]).filter(
      (i) => !scope || scope.intentIds.has(i.id),
    )
  ).map((i) => ({
    name: i.name,
    phrases: (db.prepare('SELECT text FROM intent_phrases WHERE intent_id = ? ORDER BY position, id').all(i.id) as { text: string }[]).map((p) => p.text),
    entities: (
      db
        .prepare(
          `SELECT e.name, ie.required FROM intent_entities ie JOIN entities e ON e.id = ie.entity_id
           WHERE ie.intent_id = ? ORDER BY ie.position, ie.id`,
        )
        .all(i.id) as { name: string; required: number }[]
    ).map((e) => ({ name: e.name, required: !!e.required })),
  }));

  const entities = (
    (db
      .prepare('SELECT id, name, multiple_values FROM entities WHERE project_id = ? ORDER BY id')
      .all(projectId) as { id: number; name: string; multiple_values: number }[]).filter(
      (e) => !scope || scope.entityIds.has(e.id),
    )
  ).map((e) => ({
    name: e.name,
    multiple_values: !!e.multiple_values,
    values: (
      db.prepare('SELECT value, synonyms FROM entity_values WHERE entity_id = ? ORDER BY position, id').all(e.id) as {
        value: string; synonyms: string;
      }[]
    ).map((v) => ({ value: v.value, synonyms: JSON.parse(v.synonyms) as string[] })),
  }));

  const scenario_entities = (db
    .prepare(
      `SELECT s.name AS scenario, e.name, se.followup_prompt, se.required, se.is_array
       FROM scenario_entities se
       JOIN scenarios s ON s.id = se.scenario_id
       JOIN entities e ON e.id = se.entity_id
       WHERE s.project_id = ? AND (? IS NULL OR s.id = ?) ORDER BY s.id, se.position, se.id`,
    )
    .all(projectId, scope?.scenarioId ?? null, scope?.scenarioId ?? null) as { scenario: string; name: string; followup_prompt: string; required: number; is_array: number }[]).map((e) => ({ ...e, required: !!e.required, is_array: !!e.is_array }));

  const prompts = (
    db
      .prepare('SELECT id, name, full_answers, short_answers FROM prompts WHERE project_id = ? ORDER BY id')
      .all(projectId) as { id: number; name: string; full_answers: string; short_answers: string }[]
  )
    .filter((p) => !scope || scope.promptIds.has(p.id))
    .map(({ id: _id, ...p }) => p)
    .map((p) => ({ ...p, full_answers: JSON.parse(p.full_answers) as string[], short_answers: JSON.parse(p.short_answers) as string[] }));

  const depLabel = new Map<string, string>();
  const dependencies = (
    db
      .prepare(
        `SELECT s.name AS scenario, d.ref, COALESCE(e.name, d.name) AS name, d.type, d.options
         FROM scenario_dependencies d
         JOIN scenarios s ON s.id = d.scenario_id
         LEFT JOIN entities e ON e.id = d.entity_id
         WHERE s.project_id = ? AND (? IS NULL OR s.id = ?) ORDER BY s.id, d.position, d.id`,
      )
      .all(projectId, scope?.scenarioId ?? null, scope?.scenarioId ?? null) as { scenario: string; ref: string; name: string; type: string; options: string }[]
  ).map((d) => {
    depLabel.set(d.ref, d.name);
    const values = d.type === 'enum' ? (JSON.parse(d.options) as string[]) : d.type === 'bool' ? ['true', 'false'] : [];
    return { scenario: d.scenario, name: d.name, type: d.type, values };
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

  type Raw = TransitionRow & { kind: string; conditions: string; part_id: number | null };
  const rows = db
    .prepare(
      `SELECT t.part_id, t.kind, t.state, CASE WHEN t.any_intent = 1 THEN 'Любой интент сценария' ELSE i.name END AS intent, t.request_params, t.condition, t.conditions, p.name AS prompt, t.system_action, t.next_states
       FROM scenario_steps t
       JOIN scenarios s ON s.id = t.scenario_id
       LEFT JOIN intents i ON i.id = t.intent_id
       LEFT JOIN prompts p ON p.id = t.prompt_id
       WHERE s.project_id = ? AND (? IS NULL OR t.scenario_id = ?) AND (? IS NULL OR t.part_id = ?) ORDER BY s.id, t.part_id, t.position, t.id`,
    )
    .all(projectId, scope?.scenarioId ?? null, scope?.scenarioId ?? null, scope?.partId ?? null, scope?.partId ?? null) as Raw[];
  const entityName = new Map((db.prepare('SELECT id, name FROM entities WHERE project_id = ?').all(projectId) as { id: number; name: string }[]).map((e) => [e.id, e.name]));
  const strip = ({ kind, conditions, part_id, ...row }: Raw): TransitionRow => {
    const pairs = (JSON.parse(conditions) as { dep: string; value: string; entity_id?: number; op?: string }[])
      .map((c) => ({ ...c, label: c.entity_id !== undefined ? entityName.get(c.entity_id) : depLabel.get(c.dep) }))
      .filter((c) => c.label !== undefined)
      .map((c) => `[${c.label}] ${c.op || '='} ${c.value}`);
    const out = { ...row, condition: [...pairs, ...row.condition.split('\n').map((l) => l.trim())].filter(Boolean).join('\n') };
    if (kind === 'error') return out;
    const targets = row.next_states.split(/[\s,;|]+|->|→/).map((x) => x.trim()).filter(Boolean).map((t) => stateInfo.get(`${part_id}|${t}`));
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))].join('\n');
    return { ...out, prompt: uniq(targets.map((t) => t?.prompt)) || null, system_action: uniq(targets.map((t) => t?.system_action)) };
  };

  return {
    project,
    intents,
    entities,
    scenario_entities,
    prompts,
    dependencies,
    transitions: rows.filter((r) => r.kind !== 'error').map(strip),
    errors: rows.filter((r) => r.kind === 'error').map(strip),
  };
}
