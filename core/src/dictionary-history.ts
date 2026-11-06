import type { Db } from './sqlite';
import { Router } from './router';
import { badRequest, notFound } from './errors';
import { parseId } from './validate';

const TABLES: Record<string, string> = {
  intents: 'intents', entities: 'entities', prompts: 'prompts', dependencies: 'dependency_dictionary',
  concepts: 'concepts', keywords: 'keywords', 'result-codes': 'result_codes', 'response-templates': 'response_templates',
};
const LABELS: Record<string, string> = {
  name: 'Название', description: 'Описание', comment: 'Комментарий', synonyms: 'Синонимы', group_name: 'Группа',
  enabled: 'Включён', multiple_values: 'Несколько значений', followup_prompt: 'Уточняющий промпт', type: 'Тип',
  range_min: 'Минимум', range_max: 'Максимум', values: 'Значения', full_answers: 'Полные ответы', short_answers: 'Короткие ответы',
  text: 'Текст', source: 'Исходная фраза', value: 'Значение', required: 'Обязательная', entity_id: 'Сущность',
  phrases: 'Фразы', patterns: 'Паттерны', entities: 'Сущности',
};
const CHILDREN = [
  { table: 'entity_values', parent: 'entities', fk: 'entity_id', key: 'values', fields: 'value, synonyms' },
  { table: 'intent_phrases', parent: 'intents', fk: 'intent_id', key: 'phrases', fields: 'text' },
  { table: 'intent_patterns', parent: 'intents', fk: 'intent_id', key: 'patterns', fields: 'text' },
  { table: 'intent_entities', parent: 'intents', fk: 'intent_id', key: 'entities', fields: 'entity_id, required' },
];

export function initDictionaryHistory(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS dictionary_history (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    item_name TEXT NOT NULL,
    at TEXT NOT NULL,
    description TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS dictionary_history_project_kind ON dictionary_history(project_id, kind, id);`);
}

interface Snapshot { projectId: number; kind: string; name: string; fields: Record<string, unknown> }
function snapshot(db: Db, importedKind?: string) {
  const rows = new Map<string, Snapshot>();
  for (const [kind, table] of Object.entries(TABLES)) {
    if (!db.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', table)) continue;
    for (const row of db.prepare(`SELECT * FROM ${table}${table === 'intents' || table === 'prompts' ? ' WHERE is_template = 0' : ''}`).all()) {
      const { id, project_id, scenario_id: _legacy, is_template: _template, ...fields } = row;
      // Replacement imports may delete a row and reuse its SQLite ID for another name.
      const key = kind === importedKind ? `${kind}:${project_id}:${row.name}` : `${kind}:${id}`;
      rows.set(key, { projectId: project_id, kind, name: row.name, fields });
    }
  }
  // Compare ordered content, ignoring child row IDs recreated during autosave.
  for (const child of CHILDREN) {
    for (const item of rows.values()) if (item.kind === child.parent) item.fields[child.key] = [];
    for (const row of db.prepare(`SELECT ${child.fk}, ${child.fields} FROM ${child.table} ORDER BY position, id`).all()) {
      const { [child.fk]: id, ...content } = row;
      const parent = rows.get(`${child.parent}:${id}`);
      if (parent) (parent.fields[child.key] as unknown[]).push(content);
    }
  }
  return rows;
}
const display = (value: unknown): string => {
  if (value == null || value === '') return '—';
  if (typeof value === 'string') {
    try { return display(JSON.parse(value)); } catch { return value; }
  }
  if (Array.isArray(value)) return value.length ? value.map(display).join('; ') : '—';
  if (typeof value === 'object') return Object.entries(value).map(([key, v]) => `${LABELS[key] ?? key}: ${display(v)}`).join(', ');
  return String(value);
};

/** Mutating handlers are synchronous; data and audit entries commit or roll back together. */
export function withDictionaryHistory(db: Db, mutate: () => void | Promise<void>, importedKind?: string) {
  return db.transaction(() => {
    const before = snapshot(db, importedKind);
    const result = mutate();
    if (result) throw new Error('Mutation handlers must be synchronous');
    const after = snapshot(db, importedKind);
    const at = new Date().toISOString();
    const projectIds = new Set(db.prepare('SELECT id FROM projects').all().map((p) => p.id));
    const insert = db.prepare('INSERT INTO dictionary_history(project_id, kind, item_name, at, description) VALUES (?, ?, ?, ?, ?)');
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const old = before.get(key), next = after.get(key), item = next ?? old!;
      // Project deletion must not recreate history for a deleted project.
      if (!projectIds.has(item.projectId)) continue;
      let description: string;
      if (!old) description = 'Элемент создан';
      else if (!next) description = 'Элемент удалён';
      else {
        const changes = Object.keys(next.fields).filter((field) => JSON.stringify(old.fields[field]) !== JSON.stringify(next.fields[field]));
        if (!changes.length) continue;
        description = changes.map((field) => `${LABELS[field] ?? field}: ${display(old.fields[field])} → ${display(next.fields[field])}`).join('\n');
      }
      insert.run(item.projectId, item.kind, item.name, at, description);
    }
  })();
}

export function dictionaryHistoryRouter(db: Db) {
  const router = Router();
  router.get('/projects/:pid/dictionaries/:kind/history', (req, res) => {
    const pid = parseId(req.params.pid);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(pid)) throw notFound('Проект');
    if (!TABLES[req.params.kind] || !Object.hasOwn(TABLES, req.params.kind)) throw badRequest('Неизвестный справочник');
    res.json(db.prepare('SELECT id, kind, item_name, at, description FROM dictionary_history WHERE project_id = ? AND kind = ? ORDER BY at DESC, id DESC').all(pid, req.params.kind));
  });
  return router;
}
