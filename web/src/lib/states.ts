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

/** Явный wildcard отличается от незаполненного интента и старого правила ошибок. */
export function stepIntentLabel(step: Step, intentName: (id: number | null) => string | null, empty = 'без интента'): string {
  if (step.match_any_intent) return 'Любой интент';
  return intentName(step.intent_id) ?? empty;
}

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
        }
      }
      if (s.kind === 'transition' && from) {
        edges.push({ id: `${s.key ?? index}|${t}`, stepKey: s.key, from, to: t, label: stepIntentLabel(s, intentName, '') });
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
    if (s.kind !== 'transition' || !s.state.trim() || (s.intent_id === null && !s.match_any_intent)) continue;
    const k = `${s.state.trim()}\u0000${s.match_any_intent ? '*' : s.intent_id}`;
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
