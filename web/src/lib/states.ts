import type { Layout, Step } from './types';

/** Слова, которые обозначают завершение диалога и не требуют строки-состояния. */
const TERMINAL = /^(END|EXIT|FINISH|STOP|DONE|КОНЕЦ|ВЫХОД)$/i;
/** Токен похож на имя состояния: ST_WAIT, WAIT_CONFIRM, IDLE… */
const STATE_LIKE = /^[A-Za-z][A-Za-z0-9.-]*(_[A-Za-z0-9.-]+)+$|^[A-Z][A-Z0-9]{2,}$/;

export const splitNext = (s: string): string[] => s.split(/[\s,;|]+|->|→/).map((t) => t.trim()).filter(Boolean);

export interface StepIssue { level: 'error' | 'warn'; text: string }

/** Ребро схемы = одна строка перехода (параллельные рёбра между парой состояний не склеиваются). */
export interface GraphEdge { id: string; stepKey: string | undefined; from: string; to: string; label: string }
export interface Analysis {
  /** Уникальные состояния в порядке появления. */
  states: string[];
  edges: GraphEdge[];
  /** Состояния, на которые никто не ссылается (кроме первого). */
  unreachable: string[];
  /** Состояния, на которые есть ссылки, но у них нет исходящих переходов. */
  dangling: string[];
  /** Замечания по строкам, ключ — step.key. */
  issues: Map<string, StepIssue[]>;
  /** Замечания по состояниям, ключ — имя состояния. */
  stateIssues: Map<string, StepIssue[]>;
}

/** Подпись условий для сравнения: порядок пар не важен. */
const conditionSignature = (s: Step) =>
  JSON.stringify([s.conditions.map((c) => `${c.entity_id !== undefined ? `#${c.entity_id}` : c.dep}${c.op ?? '='}${c.value}`).sort(), s.condition.trim()]);
const hasNoConditions = (s: Step) => s.conditions.length === 0 && !s.condition.trim();

export function analyzeSteps(all: Step[], intentName: (id: number | null) => string | null, info: Layout = {}): Analysis {
  // Глобальные строки — не часть графа состояний: у них нет исходного состояния
  const steps = all.filter((s) => s.kind !== 'global');
  const states: string[] = [];
  for (const s of steps) {
    const st = s.state.trim();
    if (st && !states.includes(st)) states.push(st);
  }
  const known = new Set(states);
  const edges: GraphEdge[] = [];
  const referenced = new Set<string>();
  const dangling = new Set<string>();
  const issues = new Map<string, StepIssue[]>();
  const add = (key: string | undefined, i: StepIssue) => {
    if (!key) return;
    issues.set(key, [...(issues.get(key) ?? []), i]);
  };

  steps.forEach((s, index) => {
    const from = s.state.trim();
    if (!from) add(s.key, { level: 'error', text: 'Не заполнено состояние' });
    if (s.kind === 'transition' && !s.next_states.trim()) add(s.key, { level: 'warn', text: 'Не указано следующее состояние' });
    for (const t of splitNext(s.next_states)) {
      const terminal = TERMINAL.test(t);
      if (!terminal && !STATE_LIKE.test(t)) continue;
      if (!terminal) {
        referenced.add(t);
        if (!known.has(t)) {
          dangling.add(t);
          add(s.key, { level: 'warn', text: `У состояния «${t}» нет исходящих переходов — если оно не конечное, добавьте их` });
        }
      }
      if (s.kind === 'transition' && from) {
        edges.push({ id: `${s.key ?? index}|${t}`, stepKey: s.key, from, to: t, label: intentName(s.intent_id) ?? '' });
      }
    }
  });

  // Цель глобального перехода достижима из любого состояния
  for (const g of all) {
    if (g.kind !== 'global') continue;
    for (const t of splitNext(g.next_states)) if (STATE_LIKE.test(t)) referenced.add(t);
  }

  // Детерминизм: из одного состояния по одному интенту условия должны различаться,
  // а переход без условий (запасной) — стоять последним.
  const groups = new Map<string, Step[]>();
  for (const s of steps) {
    if (s.kind !== 'transition' || !s.state.trim() || s.intent_id === null) continue;
    const k = `${s.state.trim()}\u0000${s.intent_id}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const seen = new Set<string>();
    group.forEach((s, i) => {
      const sig = conditionSignature(s);
      if (seen.has(sig)) add(s.key, { level: 'error', text: 'Те же условия уже есть у другого перехода из этого состояния по этому интенту' });
      seen.add(sig);
      if (hasNoConditions(s) && i < group.length - 1)
        add(s.key, { level: 'warn', text: 'Переход без условий стоит не последним: следующие за ним по этому интенту не сработают' });
    });
  }

  const entry = states[0];
  const unreachable = states.filter((s) => s !== entry && !referenced.has(s));

  // Ответ ассистента задаётся состоянием, в которое приходит пользователь; у входа его нет.
  const stateIssues = new Map<string, StepIssue[]>();
  for (const name of new Set([...states, ...referenced, ...Object.keys(info)])) {
    if (name === entry || info[name]?.prompt_id) continue;
    stateIssues.set(name, [{ level: 'warn', text: 'Не выбран ответ ассистента' }]);
  }
  return { states, edges, unreachable, dangling: [...dangling], issues, stateIssues };
}

/** Замечания по строкам глобальных переходов; known — состояния схемы. Ключ — step.key. */
export function globalIssues(steps: Step[], known: string[]): Map<string, StepIssue[]> {
  const out = new Map<string, StepIssue[]>();
  for (const s of steps) {
    if (s.kind !== 'global' || !s.key) continue;
    const list: StepIssue[] = [];
    if (s.intent_id === null) list.push({ level: 'error', text: 'Не выбран интент' });
    const targets = splitNext(s.next_states);
    if (targets.length === 0) list.push({ level: 'warn', text: 'Не указано следующее состояние' });
    for (const t of targets) if (!TERMINAL.test(t) && !known.includes(t)) list.push({ level: 'warn', text: `Состояния «${t}» нет в схеме` });
    if (list.length) out.set(s.key, list);
  }
  return out;
}

export interface Placed { name: string; x: number; y: number; layer: number }

/** Слоистая раскладка: слой = расстояние от входа (BFS); недостижимые идут отдельными корнями. */
export function layoutGraph(states: string[], edges: GraphEdge[], colW = 240, rowH = 76): { nodes: Placed[]; width: number; height: number } {
  const all = [...states];
  for (const e of edges) if (!all.includes(e.to)) all.push(e.to);
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const layer = new Map<string, number>();
  const roots = all.filter((s, i) => i === 0 || !edges.some((e) => e.to === s));
  for (const r of roots) {
    if (layer.has(r)) continue;
    layer.set(r, 0);
    const queue = [r];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of out.get(cur) ?? []) {
        if (!layer.has(n)) {
          layer.set(n, layer.get(cur)! + 1);
          queue.push(n);
        }
      }
    }
  }
  for (const s of all) if (!layer.has(s)) layer.set(s, 0); // цикл без входа
  const perLayer = new Map<number, number>();
  const nodes = all.map((name) => {
    const l = layer.get(name)!;
    const row = perLayer.get(l) ?? 0;
    perLayer.set(l, row + 1);
    return { name, layer: l, x: 20 + l * colW, y: 20 + row * rowH };
  });
  const maxLayer = Math.max(0, ...layer.values());
  const maxRows = Math.max(1, ...perLayer.values());
  return { nodes, width: 40 + maxLayer * colW + 200, height: 40 + (maxRows - 1) * rowH + 44 };
}
