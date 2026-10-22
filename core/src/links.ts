import { HttpError, notFound } from './errors';
import type { Db } from './sqlite';

export type LinkKind = 'intent' | 'prompt';

const LINK = {
  intent: { table: 'scenario_intents', col: 'intent_id', of: 'intents', what: 'Интент' },
  prompt: { table: 'scenario_prompts', col: 'prompt_id', of: 'prompts', what: 'Промпт' },
} as const;

/** Подключает объект проекта к сценарию; уже подключённый не меняется (флаг is_global сохраняется). */
export function connect(db: Db, kind: LinkKind, scenarioId: number, id: number): void {
  const l = LINK[kind];
  const next = (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM ${l.table} WHERE scenario_id = ?`).get(scenarioId) as { n: number }).n;
  db.prepare(`INSERT OR IGNORE INTO ${l.table}(scenario_id, ${l.col}, position) VALUES (?, ?, ?)`).run(scenarioId, id, next);
}

/** Сценарий и объект должны существовать и быть из одного проекта; чужой объект считается ненайденным. */
export function assertSameProject(db: Db, kind: LinkKind, scenarioId: number, id: number): void {
  const l = LINK[kind];
  const s = db.prepare('SELECT project_id FROM scenarios WHERE id = ?').get(scenarioId) as { project_id: number } | undefined;
  if (!s) throw notFound('Сценарий');
  const o = db.prepare(`SELECT project_id FROM ${l.of} WHERE id = ?`).get(id) as { project_id: number } | undefined;
  if (!o || o.project_id !== s.project_id) throw notFound(l.what);
}

/** Сколько строк и состояний сценария ссылаются на объект. */
function usesInScenario(db: Db, kind: LinkKind, scenarioId: number, id: number): number {
  const count = (sql: string) => (db.prepare(sql).get(scenarioId, id) as { n: number }).n;
  if (kind === 'intent') return count('SELECT COUNT(*) AS n FROM scenario_steps WHERE scenario_id = ? AND intent_id = ?');
  return (
    count('SELECT COUNT(*) AS n FROM scenario_steps WHERE scenario_id = ? AND prompt_id = ?') +
    count('SELECT COUNT(*) AS n FROM scenario_states WHERE scenario_id = ? AND prompt_id = ?')
  );
}

/** Отключает объект от сценария, если в сценарии на него больше нет ссылок. */
export function disconnect(db: Db, kind: LinkKind, scenarioId: number, id: number): void {
  const l = LINK[kind];
  if (!db.prepare(`SELECT 1 FROM ${l.table} WHERE scenario_id = ? AND ${l.col} = ?`).get(scenarioId, id)) {
    throw new HttpError(404, 'not_found', 'Объект не подключён к сценарию');
  }
  const uses = usesInScenario(db, kind, scenarioId, id);
  if (uses) {
    throw new HttpError(409, 'in_use', `${l.what} используется в сценарии (${uses}) — сначала уберите его из шагов`, { uses });
  }
  db.prepare(`DELETE FROM ${l.table} WHERE scenario_id = ? AND ${l.col} = ?`).run(scenarioId, id);
}

/** Меняет флаг «глобальный» у подключённого интента; снять его нельзя, пока есть глобальные переходы. */
export function setGlobal(db: Db, scenarioId: number, intentId: number, isGlobal: boolean): void {
  if (!isGlobal) {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM scenario_steps WHERE scenario_id = ? AND intent_id = ? AND kind = 'global'").get(scenarioId, intentId) as { n: number }).n;
    if (n) throw new HttpError(409, 'in_use', `У интента есть глобальные переходы (${n}) — сначала удалите их`, { uses: n });
  }
  db.prepare('UPDATE scenario_intents SET is_global = ? WHERE scenario_id = ? AND intent_id = ?').run(isGlobal ? 1 : 0, scenarioId, intentId);
}
