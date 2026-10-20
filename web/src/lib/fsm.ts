import { splitNext } from './states';
import type { Layout, Step } from './types';

/** Строки старого формата с несколькими следующими состояниями превращаются в отдельные рёбра. */
export function splitLegacySteps(steps: Step[]): Step[] {
  return steps.flatMap((s) => {
    if (s.kind !== 'transition') return [s];
    const targets = splitNext(s.next_states);
    if (targets.length < 2) return [s];
    return targets.map((t, i) => ({
      ...s,
      key: i === 0 ? s.key : crypto.randomUUID(),
      conditions: s.conditions.map((c) => ({ ...c })),
      next_states: t,
    }));
  });
}

/**
 * Порядок строк для спецификации: обход в ширину от входа (состояния первой строки),
 * внутри состояния — прежний порядок рёбер, затем недостижимые состояния; Errors — в конце.
 */
export function canonicalOrder(steps: Step[]): Step[] {
  const transitions = steps.filter((s) => s.kind === 'transition');
  const rest = steps.filter((s) => s.kind !== 'transition');
  const byState = new Map<string, Step[]>();
  for (const s of transitions) {
    const k = s.state.trim();
    byState.set(k, [...(byState.get(k) ?? []), s]);
  }
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (root: string) => {
    const queue = [root];
    seen.add(root);
    while (queue.length) {
      const cur = queue.shift()!;
      order.push(cur);
      for (const s of byState.get(cur) ?? []) {
        for (const t of splitNext(s.next_states)) {
          if (byState.has(t) && !seen.has(t)) {
            seen.add(t);
            queue.push(t);
          }
        }
      }
    }
  };
  const states = [...byState.keys()];
  for (const st of states) if (!seen.has(st)) walk(st);
  return [...order.flatMap((st) => byState.get(st) ?? []), ...rest];
}

export function renameState(steps: Step[], layout: Layout, from: string, to: string): { steps: Step[]; layout: Layout } {
  const swap = (t: string) => (t === from ? to : t);
  return {
    steps: steps.map((s) => {
      const targets = splitNext(s.next_states);
      return {
        ...s,
        state: s.state.trim() === from ? to : s.state,
        next_states: targets.includes(from) ? targets.map(swap).join(' ') : s.next_states,
      };
    }),
    layout: Object.fromEntries(Object.entries(layout).map(([k, v]) => [swap(k), v])),
  };
}

/** Удаляет состояние вместе со всеми рёбрами, которые из него выходят или в него входят. */
export function removeState(steps: Step[], layout: Layout, name: string): { steps: Step[]; layout: Layout } {
  return {
    steps: steps.filter((s) => s.state.trim() !== name && !splitNext(s.next_states).includes(name)),
    layout: Object.fromEntries(Object.entries(layout).filter(([k]) => k !== name)),
  };
}

/** Сдвигает ребро среди рёбер того же состояния (порядок = приоритет проверки условий). */
export function moveEdge(steps: Step[], key: string, dir: -1 | 1): Step[] {
  const i = steps.findIndex((s) => s.key === key);
  if (i < 0) return steps;
  const state = steps[i].state.trim();
  let j = i + dir;
  while (j >= 0 && j < steps.length && steps[j].state.trim() !== state) j += dir;
  if (j < 0 || j >= steps.length) return steps;
  const out = [...steps];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Входное состояние сценария всегда называется так. */
export const ENTRY_STATE = 'VA_ACTIVATION';

/**
 * Приводит имя входа (состояние первой строки перехода) к ENTRY_STATE.
 * Если состояние с таким именем уже есть — меняется с входом именами.
 */
export function normalizeEntry(steps: Step[], layout: Layout): { steps: Step[]; layout: Layout } {
  const entry = steps.find((s) => s.kind === 'transition' && s.state.trim())?.state.trim();
  if (!entry || entry === ENTRY_STATE) return { steps, layout };
  const taken = steps.some((s) => s.state.trim() === ENTRY_STATE || splitNext(s.next_states).includes(ENTRY_STATE)) || ENTRY_STATE in layout;
  if (!taken) return renameState(steps, layout, entry, ENTRY_STATE);
  const tmp = renameState(steps, layout, ENTRY_STATE, '__ENTRY_SWAP__');
  const moved = renameState(tmp.steps, tmp.layout, entry, ENTRY_STATE);
  return renameState(moved.steps, moved.layout, '__ENTRY_SWAP__', entry);
}

/** Вход — состояние первой строки: переносим строки состояния в начало. */
export function makeEntry(steps: Step[], name: string): Step[] {
  return [...steps.filter((s) => s.state.trim() === name), ...steps.filter((s) => s.state.trim() !== name)];
}

export function uniqueStateName(taken: string[], base = 'ST_NEW'): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export const newTransition = (from: string, to: string): Step => ({
  key: crypto.randomUUID(), kind: 'transition', state: from, intent_id: null, request_params: '',
  condition: '', conditions: [], prompt_id: null, system_action: '', next_states: to,
});
