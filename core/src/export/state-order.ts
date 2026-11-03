import type { Db } from '../sqlite';

interface Transition { part_id: number | null; state: string; next_states: string }

/** Порядок строк документа следует схеме; хранимый порядок проверки условий не меняется. */
export function orderTransitionRows<T extends Transition>(db: Db, projectId: number, rows: T[]): T[] {
  const orders = new Map<number, Map<string, number>>();
  for (const part of db.prepare(
    'SELECT p.id, p.layout FROM scenario_parts p JOIN scenarios s ON s.id = p.scenario_id WHERE s.project_id = ?',
  ).all(projectId) as { id: number; layout: string }[]) {
    const layout = JSON.parse(part.layout) as Record<string, { order?: number }>;
    orders.set(part.id, new Map(Object.entries(layout)
      .filter(([, info]) => Number.isFinite(info?.order))
      .map(([name, info]) => [name, info.order!])));
  }
  const parts = new Map<number | null, T[]>();
  for (const row of rows) {
    const group = parts.get(row.part_id) ?? [];
    group.push(row);
    parts.set(row.part_id, group);
  }
  return [...parts].flatMap(([partId, group]) => {
    const order = partId === null ? undefined : orders.get(partId);
    if (!order?.size) return group;
    const rank = (state: string) => order.get(state.trim()) ?? Number.MAX_SAFE_INTEGER;
    const targetRank = (row: T) => rank(row.next_states.split(/[\s,;|]+|->|→/).find(Boolean) ?? '');
    // Сначала состояния-источники, затем ветви к состояниям одного уровня.
    // Несколько правил для одной пары состояний сохраняют взаимный порядок.
    return [...group].sort((a, b) => rank(a.state) - rank(b.state) || targetRank(a) - targetRank(b));
  });
}
