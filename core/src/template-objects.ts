import type { Db } from './sqlite';

type Table = 'intents' | 'prompts';

/** Older databases/dumps have no ownership flag. Keep shared regular objects visible. */
export function markLegacyTemplateObjects(db: Db, table: Table, ids?: number[]) {
  if (ids && !ids.length) return;
  const col = table === 'intents' ? 'intent_id' : 'prompt_id';
  const references = `EXISTS (SELECT 1 FROM scenario_${table} l WHERE l.scenario_id = s.id AND l.${col} = o.id)
    OR EXISTS (SELECT 1 FROM scenario_steps t WHERE t.scenario_id = s.id AND t.${col} = o.id)
    ${table === 'prompts' ? 'OR EXISTS (SELECT 1 FROM scenario_states st WHERE st.scenario_id = s.id AND st.prompt_id = o.id)' : ''}`;
  db.prepare(`UPDATE ${table} AS o SET is_template = 1
    WHERE o.is_template = 0 ${ids ? `AND o.id IN (${ids.map(() => '?').join(',')})` : ''}
    AND EXISTS (SELECT 1 FROM scenarios s WHERE s.is_template = 1 AND (${references}))
    AND NOT EXISTS (SELECT 1 FROM scenarios s WHERE s.is_template = 0 AND (${references}))`).run(...(ids ?? []));
}

/** A persisted flag keeps template-only objects private even after unlinking/deletion. */
export function initTemplateObjects(db: Db) {
  for (const table of ['intents', 'prompts'] as const) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.length || columns.some((c) => c.name === 'is_template')) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0`);
    markLegacyTemplateObjects(db, table);
  }
}
