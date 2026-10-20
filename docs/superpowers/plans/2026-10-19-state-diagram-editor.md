# Редактор схемы переходов — план реализации

> **Для агентов:** ОБЯЗАТЕЛЬНЫЙ SUB-SKILL: используйте superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans. Шаги отмечены чекбоксами (`- [ ]`).

**Цель:** схема состояний становится редактором Transition table: ребро схемы — это строка перехода, таблица в спецификацию генерируется из схемы.

**Архитектура:** хранение не меняется — ребро это строка `scenario_steps` (`kind = transition`, одно значение в `next_states`). Добавляется только раскладка узлов (`scenarios.layout`, JSON). Чистая логика (разбиение старых строк, канонический порядок, переименование/удаление состояний) живёт в `web/src/lib/fsm.ts`; редактор — компоненты на React Flow. Таблица для экспорта получается из канонического порядка строк при сохранении, готовый вид показывает существующая вкладка «Предпросмотр».

**Стек:** React 19, `@xyflow/react` 12, Vitest, Express + better-sqlite3.

## Глобальные ограничения

- Ребро = одна строка перехода: `state` (источник) + интент + условия → ровно одно значение `next_states`. Из одного состояния по одному интенту возможно несколько рёбер в разные состояния (ветвление по условиям); параллельные рёбра между одной парой узлов допустимы. Узлов-развилок нет.
- Первое состояние — вход. Порядок рёбер внутри состояния — приоритет проверки условий. Каноническая последовательность строк: обход в ширину от входа, внутри состояния по порядку рёбер, затем недостижимые состояния; строки Errors идут после переходов.
- Таблица Errors остаётся таблицей и на схеме не отображается.
- Старые строки с несколькими значениями в `next_states` разбиваются на рёбра при открытии сценария; в БД они остаются как были, пока пользователь что-то не изменит. Экспорт рёбра обратно не склеивает.
- Состояние без исходящих переходов — предупреждение, не ошибка. Слова END/EXIT/FINISH/STOP/DONE/КОНЕЦ/ВЫХОД — конечные, ошибок о них нет.
- Импорт `cn` — из `@/lib/utils`. shadcn здесь на Base UI: `Select` принимает `items`, `value`, `onValueChange` (см. `StepsTable.tsx`).
- Сообщения интерфейса — по-русски, комментарии в коде — по-русски, в стиле соседних файлов.
- В рабочем дереве много незакоммиченных изменений предыдущей работы (в том числе в файлах, которые правит этот план). Коммитьте только файлы, перечисленные в шаге коммита задачи, и не откатывайте чужие правки.

---

### Задача 1: Чистая логика схемы (`fsm.ts`)

**Файлы:**
- Создать: `web/src/lib/fsm.ts`
- Создать: `web/src/lib/fsm.test.ts`
- Изменить: `web/src/lib/types.ts` (тип `Layout`, поле `layout` у `Scenario`)

**Интерфейсы:**
- Потребляет: `splitNext` из `web/src/lib/states.ts`, `Step` из `types.ts`.
- Производит (используют задачи 4–5):
  - `splitLegacySteps(steps: Step[]): Step[]`
  - `canonicalOrder(steps: Step[]): Step[]`
  - `renameState(steps: Step[], layout: Layout, from: string, to: string): { steps: Step[]; layout: Layout }`
  - `removeState(steps: Step[], layout: Layout, name: string): { steps: Step[]; layout: Layout }`
  - `moveEdge(steps: Step[], key: string, dir: -1 | 1): Step[]`
  - `makeEntry(steps: Step[], name: string): Step[]`
  - `uniqueStateName(taken: string[], base?: string): string`
  - `newTransition(from: string, to: string): Step`

- [ ] **Шаг 1: Добавить тип `Layout`**

В `web/src/lib/types.ts` перед `export interface Scenario` добавить и дополнить `Scenario`:

```ts
/** Положение узлов схемы: имя состояния → координаты. Только раскладка, на экспорт не влияет. */
export type Layout = Record<string, { x: number; y: number }>;
```

```ts
export interface Scenario {
  id: number; project_id: number; name: string; description: string;
  entities: ScenarioEntity[]; dependencies: Dependency[]; steps: Step[]; layout: Layout;
}
```

- [ ] **Шаг 2: Написать падающие тесты**

Создать `web/src/lib/fsm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canonicalOrder, makeEntry, moveEdge, newTransition, removeState, renameState, splitLegacySteps, uniqueStateName } from './fsm';
import type { Step } from './types';

const step = (key: string, state: string, next: string, p: Partial<Step> = {}): Step => ({
  key, kind: 'transition', state, intent_id: null, request_params: '', condition: '', conditions: [],
  prompt_id: null, system_action: '', next_states: next, ...p,
});
const keys = (steps: Step[]) => steps.map((s) => s.key);

describe('splitLegacySteps', () => {
  it('разбивает строку с несколькими следующими состояниями на рёбра с копиями полей', () => {
    const src = step('a', 'ST_A', 'ST_B, ST_C', { system_action: 'X', conditions: [{ dep: 'd', value: '1' }] });
    const out = splitLegacySteps([src]);
    expect(out.map((s) => s.next_states)).toEqual(['ST_B', 'ST_C']);
    expect(out[0].key).toBe('a');
    expect(out[1].key).not.toBe('a');
    expect(out.every((s) => s.system_action === 'X' && s.state === 'ST_A')).toBe(true);
    out[1].conditions[0].value = '2';
    expect(out[0].conditions[0].value).toBe('1');
  });
  it('не трогает строки с одним значением, пустые и Errors', () => {
    const rows = [step('a', 'A_1', 'B_2'), step('b', 'A_1', ''), step('c', 'E_1', 'X_1 Y_1', { kind: 'error' })];
    expect(splitLegacySteps(rows)).toEqual(rows);
  });
});

describe('canonicalOrder', () => {
  it('обходит в ширину от входа, держит порядок внутри состояния, недостижимые в конце, Errors после', () => {
    const err = step('e', 'DRIVER_ONLY', 'ST_A', { kind: 'error' });
    const rows = [step('1', 'ST_A', 'ST_B'), step('2', 'ST_D', 'ST_A'), step('3', 'ST_B', 'ST_C'), step('4', 'ST_A', 'ST_C'), err];
    expect(keys(canonicalOrder(rows))).toEqual(['1', '4', '3', '2', 'e']);
  });
  it('оставляет пустой список пустым', () => {
    expect(canonicalOrder([])).toEqual([]);
  });
});

describe('операции над состояниями', () => {
  const rows = [step('1', 'ST_A', 'ST_B'), step('2', 'ST_B', 'ST_A'), step('3', 'ST_B', 'END')];
  const layout = { ST_A: { x: 0, y: 0 }, ST_B: { x: 240, y: 0 } };

  it('renameState переименовывает источник, цели и раскладку', () => {
    const r = renameState(rows, layout, 'ST_B', 'ST_WAIT');
    expect(r.steps.map((s) => [s.state, s.next_states])).toEqual([['ST_A', 'ST_WAIT'], ['ST_WAIT', 'ST_A'], ['ST_WAIT', 'END']]);
    expect(Object.keys(r.layout)).toEqual(['ST_A', 'ST_WAIT']);
  });
  it('removeState удаляет все рёбра, входящие и исходящие, и запись раскладки', () => {
    const r = removeState(rows, layout, 'ST_B');
    expect(r.steps).toEqual([]);
    expect(r.layout).toEqual({ ST_A: { x: 0, y: 0 } });
  });
  it('moveEdge меняет местами соседние рёбра одного состояния и не выходит за границы', () => {
    const three = [step('1', 'ST_A', 'X_1'), step('2', 'ST_B', 'X_1'), step('3', 'ST_A', 'Y_1')];
    expect(keys(moveEdge(three, '3', -1))).toEqual(['3', '2', '1']);
    expect(keys(moveEdge(three, '1', -1))).toEqual(['1', '2', '3']);
    expect(keys(moveEdge(three, '3', 1))).toEqual(['1', '2', '3']);
  });
  it('makeEntry переносит строки состояния в начало', () => {
    expect(keys(makeEntry(rows, 'ST_B'))).toEqual(['2', '3', '1']);
  });
  it('uniqueStateName и newTransition', () => {
    expect(uniqueStateName(['ST_NEW', 'ST_NEW_2'])).toBe('ST_NEW_3');
    expect(uniqueStateName([])).toBe('ST_NEW');
    const t = newTransition('A_1', 'B_2');
    expect(t).toMatchObject({ kind: 'transition', state: 'A_1', next_states: 'B_2', intent_id: null, prompt_id: null });
    expect(t.key).toBeTruthy();
  });
});
```

- [ ] **Шаг 3: Убедиться, что тесты падают**

Run: `cd web && npx vitest run src/lib/fsm.test.ts`
Expected: FAIL — «Failed to resolve import "./fsm"».

- [ ] **Шаг 4: Реализовать `fsm.ts`**

Создать `web/src/lib/fsm.ts`:

```ts
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
```

- [ ] **Шаг 5: Тесты проходят**

Run: `cd web && npx vitest run src/lib/fsm.test.ts`
Expected: PASS, 8 тестов.

- [ ] **Шаг 6: Коммит**

```bash
git add web/src/lib/fsm.ts web/src/lib/fsm.test.ts web/src/lib/types.ts
git commit -m "feat(web): pure FSM helpers for the transition diagram editor"
```

---

### Задача 2: Анализ — рёбра по строкам, конечные слова, детерминизм

**Файлы:**
- Изменить: `web/src/lib/states.ts`
- Изменить: `web/src/lib/states.test.ts`
- Изменить: `web/src/pages/scenarios/ScenarioChecks.tsx`

**Интерфейсы:**
- Потребляет: `Step`, `StepIssue` и существующие `splitNext`, `TERMINAL`, `STATE_LIKE`.
- Производит (используют задачи 4–5):
  - `GraphEdge = { id: string; stepKey: string | undefined; from: string; to: string; label: string }` — **по одному ребру на строку** (раньше рёбра между парой узлов склеивались, `labels: string[]`);
  - `analyzeSteps` возвращает ребра и к конечным словам (END…); состояние без исходящих — предупреждение вместо ошибки; новые замечания о детерминизме.

- [ ] **Шаг 1: Обновить тесты**

В `web/src/lib/states.test.ts` заменить блоки `describe('analyzeSteps')` и `describe('layoutGraph')` на:

```ts
describe('analyzeSteps', () => {
  const name = (id: number | null) => (id === 7 ? 'INT_YES' : null);
  it('строит рёбра (по одному на строку), находит состояния без исходящих и недостижимые', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B END', intent_id: 7 });
    const b = step({ state: 'ST_B', next_states: 'ST_MISSING' });
    const c = step({ state: 'ST_LONELY' });
    const r = analyzeSteps([a, b, c], name);
    expect(r.states).toEqual(['ST_A', 'ST_B', 'ST_LONELY']);
    expect(r.edges).toContainEqual({ id: `${a.key}|ST_B`, stepKey: a.key, from: 'ST_A', to: 'ST_B', label: 'INT_YES' });
    expect(r.edges.some((e) => e.from === 'ST_A' && e.to === 'END')).toBe(true);
    expect(r.dangling).toEqual(['ST_MISSING']);
    expect(r.unreachable).toEqual(['ST_LONELY']);
    expect(r.issues.get(b.key!)?.[0].level).toBe('warn');
  });
  it('не склеивает параллельные рёбра между одной парой состояний', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7, conditions: [{ dep: 'x', value: '1' }] });
    const b = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7, conditions: [{ dep: 'x', value: '2' }] });
    expect(analyzeSteps([a, b], name).edges).toHaveLength(2);
  });
  it('предупреждает о строке без состояния и без ответа', () => {
    const s = step({ state: '', prompt_id: null, next_states: 'ST_X' });
    const r = analyzeSteps([s], name);
    expect(r.issues.get(s.key!)?.map((i) => i.level)).toContain('error');
    expect(r.issues.get(s.key!)?.some((i) => i.level === 'warn')).toBe(true);
  });
  it('находит одинаковые условия у переходов из одного состояния по одному интенту', () => {
    const c = [{ dep: 'x', value: '1' }];
    const a = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7, conditions: c });
    const b = step({ state: 'ST_A', next_states: 'ST_C', intent_id: 7, conditions: [...c] });
    const r = analyzeSteps([a, b], name);
    expect(r.issues.get(a.key!)?.some((i) => i.level === 'error')).toBeFalsy();
    expect(r.issues.get(b.key!)?.some((i) => i.level === 'error' && i.text.startsWith('Те же условия'))).toBe(true);
  });
  it('предупреждает, если переход без условий стоит не последним, и не трогает разные интенты', () => {
    const a = step({ state: 'ST_A', next_states: 'ST_B', intent_id: 7 });
    const b = step({ state: 'ST_A', next_states: 'ST_C', intent_id: 7, conditions: [{ dep: 'x', value: '1' }] });
    const other = step({ state: 'ST_A', next_states: 'ST_C', intent_id: 8 });
    const r = analyzeSteps([a, b, other], name);
    expect(r.issues.get(a.key!)?.some((i) => i.level === 'warn' && i.text.startsWith('Переход без условий'))).toBe(true);
    expect(r.issues.get(other.key!)?.some((i) => i.text.startsWith('Переход без условий'))).toBeFalsy();
  });
});

describe('layoutGraph', () => {
  it('раскладывает по слоям от входа', () => {
    const { nodes } = layoutGraph(['A_1', 'B_2'], [{ id: '1', stepKey: '1', from: 'A_1', to: 'B_2', label: '' }]);
    expect(nodes.find((n) => n.name === 'A_1')!.layer).toBe(0);
    expect(nodes.find((n) => n.name === 'B_2')!.layer).toBe(1);
  });
});
```

- [ ] **Шаг 2: Тесты падают**

Run: `cd web && npx vitest run src/lib/states.test.ts`
Expected: FAIL (форма рёбер, уровень замечания).

- [ ] **Шаг 3: Изменить `states.ts`**

Заменить `GraphEdge` и тело `analyzeSteps` (от `export interface GraphEdge` до конца функции) на:

```ts
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
}

/** Подпись условий для сравнения: порядок пар не важен. */
const conditionSignature = (s: Step) =>
  JSON.stringify([s.conditions.map((c) => `${c.dep}=${c.value}`).sort(), s.condition.trim()]);
const hasNoConditions = (s: Step) => s.conditions.length === 0 && !s.condition.trim();

export function analyzeSteps(steps: Step[], intentName: (id: number | null) => string | null): Analysis {
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
    if (s.kind === 'transition' && !s.prompt_id && !s.system_action.trim() && !s.next_states.trim())
      add(s.key, { level: 'warn', text: 'Строка ничего не делает: нет ответа, действия и следующего состояния' });
    else if (s.kind === 'transition' && !s.prompt_id) add(s.key, { level: 'warn', text: 'Не выбран ответ ассистента' });
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
  return { states, edges, unreachable, dangling: [...dangling], issues };
}
```

`layoutGraph` не меняется (использует только `e.from` / `e.to`).

- [ ] **Шаг 4: Обновить `buildChecks`**

В `web/src/pages/scenarios/ScenarioChecks.tsx` заменить строку с `p.analysis.dangling`:

```ts
  for (const d of p.analysis.dangling) out.push({ level: 'warn', text: `У состояния «${d}» нет исходящих переходов (если оно не конечное, добавьте их)`, tab: 'logic' });
```

и перед `const order = ...` добавить:

```ts
  const clashes = rows.filter((r) => r.text.startsWith('Те же условия')).length;
  if (clashes) out.push({ level: 'error', text: `Переходов с повторяющимися условиями: ${clashes}`, tab: 'logic' });
  const shadowing = rows.filter((r) => r.text.startsWith('Переход без условий стоит не последним')).length;
  if (shadowing) out.push({ level: 'warn', text: `Переходов без условий, перекрывающих следующие: ${shadowing}`, tab: 'logic' });
```

- [ ] **Шаг 5: Тесты и типы**

Run: `cd web && npx vitest run src/lib && npx tsc -b`
Expected: тесты PASS. `tsc` покажет ошибки только в `StateGraph.tsx` (использует `labels`) — он будет удалён в задаче 5; если нужен чистый `tsc` сейчас, временно замените в `StateGraph.tsx` `e.labels.join(', ')` на `e.label`.

- [ ] **Шаг 6: Коммит**

```bash
git add web/src/lib/states.ts web/src/lib/states.test.ts web/src/pages/scenarios/ScenarioChecks.tsx web/src/pages/scenarios/StateGraph.tsx
git commit -m "feat(web): per-step graph edges and determinism checks"
```

---

### Задача 3: Сервер — хранение раскладки

**Файлы:**
- Изменить: `server/src/db.ts` (схема + миграция)
- Изменить: `server/src/routes/scenarios.ts`
- Изменить: `server/test/scenarios.test.ts`
- Изменить: `server/test/migrate.test.ts`

**Интерфейсы:**
- Производит: `GET /api/scenarios/:id` и ответ `PUT` содержат `layout: Record<string, {x: number; y: number}>`; `PUT` принимает `layout`, при отсутствии поля раскладка сохраняется как была.

- [ ] **Шаг 1: Падающие тесты**

В `server/test/scenarios.test.ts` перед `it('deletes a scenario'` добавить:

```ts
  it('stores node layout, drops malformed points and keeps it when omitted', async () => {
    const { app, pid } = await setup();
    const c = await request(app).post(`/api/projects/${pid}/scenarios`).send({ name: 'S' });
    expect((await request(app).get(`/api/scenarios/${c.body.id}`)).body.layout).toEqual({});
    const put = await request(app)
      .put(`/api/scenarios/${c.body.id}`)
      .send({ name: 'S', layout: { ST_A: { x: 10.4, y: 20 }, ST_BAD: { x: 'a', y: 1 }, '': { x: 1, y: 1 } } });
    expect(put.status).toBe(200);
    expect(put.body.layout).toEqual({ ST_A: { x: 10, y: 20 } });
    const again = await request(app).put(`/api/scenarios/${c.body.id}`).send({ name: 'S2' });
    expect(again.body.layout).toEqual({ ST_A: { x: 10, y: 20 } });
  });
```

В `server/test/migrate.test.ts` в конец теста `moves slots and phrases...` перед `db.close();` добавить:

```ts
    expect(db.prepare('SELECT layout FROM scenarios').all()).toEqual([{ layout: '{}' }]);
```

- [ ] **Шаг 2: Тесты падают**

Run: `cd server && npx vitest run test/scenarios.test.ts test/migrate.test.ts`
Expected: FAIL (`layout` отсутствует / `no such column`).

- [ ] **Шаг 3: Схема и миграция**

В `server/src/db.ts` в `CREATE TABLE IF NOT EXISTS scenarios` добавить колонку:

```sql
  description TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT '{}'
```

В `migrate`, перед `bindToScenarios(db);`:

```ts
    if (!hasColumn(db, 'scenarios', 'layout')) {
      db.exec("ALTER TABLE scenarios ADD COLUMN layout TEXT NOT NULL DEFAULT '{}'");
    }
```

- [ ] **Шаг 4: Роут**

В `server/src/routes/scenarios.ts`:

Добавить в начало файла после `StepCondition`:

```ts
type Layout = Record<string, { x: number; y: number }>;

/** Оставляет только корректные точки раскладки: непустое имя и конечные числа. */
function cleanLayout(raw: unknown): Layout {
  const out: Layout = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, p] of Object.entries(raw as Record<string, any>)) {
    if (name.trim() && Number.isFinite(p?.x) && Number.isFinite(p?.y)) out[name] = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  return out;
}
```

В `load` заменить запрос и возврат:

```ts
    const s = db.prepare('SELECT id, project_id, name, description, layout FROM scenarios WHERE id = ?').get(id) as
      | { id: number; project_id: number; name: string; description: string; layout: string }
      | undefined;
```

```ts
    const { layout, ...head } = s;
    return { ...head, layout: JSON.parse(layout) as Layout, entities, dependencies, steps };
```

В `PUT` после вычисления `steps` добавить `const layout = b.layout === undefined ? cur.layout : cleanLayout(b.layout);`, а `UPDATE scenarios` заменить на:

```ts
      db.prepare('UPDATE scenarios SET name = ?, description = ?, layout = ? WHERE id = ?').run(name, optString(b.description), JSON.stringify(layout), id);
```

- [ ] **Шаг 5: Тесты проходят**

Run: `cd server && npx vitest run`
Expected: PASS (весь серверный набор; убедитесь, что тесты экспорта и сценариев не сломались).

- [ ] **Шаг 6: Коммит**

```bash
git add server/src/db.ts server/src/routes/scenarios.ts server/test/scenarios.test.ts server/test/migrate.test.ts
git commit -m "feat(server): store scenario diagram layout"
```

---

### Задача 4: Компоненты редактора схемы

**Файлы:**
- Изменить: `web/package.json` (зависимость)
- Изменить: `web/src/pages/scenarios/StepsTable.tsx` (экспорт `OptionSelect`)
- Создать: `web/src/pages/scenarios/state-editor/StateNode.tsx`
- Создать: `web/src/pages/scenarios/state-editor/EdgePanel.tsx`
- Создать: `web/src/pages/scenarios/state-editor/NodePanel.tsx`
- Создать: `web/src/pages/scenarios/state-editor/StateEditor.tsx`

**Интерфейсы:**
- Потребляет: всё из задач 1–2; `ConditionsCell`, `depLabel` (`./dependencies`), `Section`/`FieldLabel`, `ConfirmDialog` не нужен.
- Производит (использует задача 5):
  ```ts
  export function StateEditor(props: {
    steps: Step[];            // только kind = 'transition'
    layout: Layout;
    analysis: Analysis;       // analyzeSteps(steps) только по переходам
    intents: IntentListItem[]; prompts: PromptListItem[];
    dependencies: Dependency[]; entities: EntityListItem[];
    onChange: (next: { steps: Step[]; layout: Layout }) => void;
  }): JSX.Element
  ```

Автотестов нет (UI проверяется вручную, как в остальном проекте); шлюз задачи — `tsc -b` и ручная проверка в шаге 8.

- [ ] **Шаг 1: Зависимость и экспорт**

Run: `cd web && npm install @xyflow/react@^12.12.0`

В `web/src/pages/scenarios/StepsTable.tsx` заменить `interface Option` на `export interface Option` и `function OptionSelect` на `export function OptionSelect`.

- [ ] **Шаг 2: Узел и ребро** — создать `web/src/pages/scenarios/state-editor/StateNode.tsx`:

```tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Handle, Position, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface StateNodeData extends Record<string, unknown> {
  name: string; entry: boolean; terminal: boolean; unreachable: boolean; selected: boolean;
}

export function StateNode({ data }: NodeProps<Node<StateNodeData>>) {
  return (
    <div
      className={cn(
        'w-[190px] rounded-lg border px-3 py-2.5 text-center font-mono text-xs',
        data.entry ? 'border-2 border-brand bg-brand/10' : data.unreachable ? 'border-dashed border-destructive bg-destructive/10' : data.terminal ? 'border-emerald-600 bg-emerald-50' : 'border-border bg-card',
        data.selected && 'ring-2 ring-brand/50',
      )}
      title={data.name}
    >
      <Handle type="target" position={Position.Left} />
      <span className="block truncate text-foreground">{data.name}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export interface TransitionEdgeData extends Record<string, unknown> {
  stepKey: string | undefined; index: number; count: number; loop: boolean; label: string; bad: boolean;
}

/** Ребро-переход. Параллельные рёбра между одной парой узлов разнесены по вертикали, петля рисуется над узлом. */
export function TransitionEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<Edge<TransitionEdgeData>>) {
  const { index = 0, count = 1, loop = false, label = '', bad = false } = data ?? {};
  const spread = index - (count - 1) / 2;
  let path: string;
  let lx: number;
  let ly: number;
  if (loop) {
    path = `M${sourceX} ${sourceY} C${sourceX + 60} ${sourceY - 80} ${targetX - 60} ${targetY - 80} ${targetX} ${targetY}`;
    lx = (sourceX + targetX) / 2;
    ly = sourceY - 62 - index * 18;
  } else {
    [path, lx, ly] = getBezierPath({
      sourceX, sourceY: sourceY + spread * 12, sourcePosition, targetX, targetY: targetY + spread * 12, targetPosition,
    });
  }
  return (
    <>
      <BaseEdge
        path={path} markerEnd={markerEnd} interactionWidth={20}
        className={cn(selected ? 'stroke-brand' : bad ? 'stroke-destructive' : 'stroke-muted-foreground')}
        style={{ strokeWidth: selected ? 2 : 1.3 }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            className={cn('nodrag nopan pointer-events-none absolute max-w-48 truncate rounded bg-background/90 px-1.5 py-0.5 text-[10px]', selected ? 'text-brand' : 'text-foreground')}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Шаг 3: Панель ребра** — создать `web/src/pages/scenarios/state-editor/EdgePanel.tsx`:

```tsx
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FieldLabel } from '@/components/Section';
import { cn, GHOST } from '@/lib/utils';
import { splitNext, type StepIssue } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, PromptListItem, Step } from '@/lib/types';
import { ConditionsCell } from '../ConditionsCell';
import { OptionSelect } from '../StepsTable';

interface Props {
  step: Step;
  states: string[];
  intents: IntentListItem[];
  prompts: PromptListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  issues: StepIssue[];
  onPatch: (p: Partial<Step>) => void;
  onRemove: () => void;
  onClose: () => void;
}

function StateSelect({ value, states, label, onChange }: { value: string; states: string[]; label: string; onChange: (v: string) => void }) {
  const items = [...(value && !states.includes(value) ? [value] : []), ...states].map((s) => ({ value: s, label: s }));
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={cn(GHOST, 'w-full font-mono text-[13px]')} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Редактор одного ребра = одной строки Transition table. */
export function EdgePanel({ step, states, intents, prompts, dependencies, entities, issues, onPatch, onRemove, onClose }: Props) {
  const intentOptions = [{ value: 'none', label: '— не выбран —' }, ...intents.map((i) => ({ value: String(i.id), label: i.name }))];
  const promptOptions = [{ value: 'none', label: '— не выбран —' }, ...prompts.map((p) => ({ value: String(p.id), label: p.name }))];
  const target = splitNext(step.next_states)[0] ?? '';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Переход</h3>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Удалить переход" onClick={onRemove}><Trash2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Закрыть панель" onClick={onClose}><X className="size-4" /></Button>
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="space-y-1 text-xs">
          {issues.map((i, n) => (
            <li key={n} className={cn('flex items-start gap-1.5', i.level === 'error' ? 'text-destructive' : 'text-amber-600')}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {i.text}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Из состояния</FieldLabel>
          <StateSelect value={step.state} states={states} label="Исходное состояние" onChange={(state) => onPatch({ state })} />
        </div>
        <div>
          <FieldLabel>В состояние</FieldLabel>
          <StateSelect value={target} states={states} label="Следующее состояние" onChange={(next_states) => onPatch({ next_states })} />
        </div>
      </div>
      <div>
        <FieldLabel>Интент</FieldLabel>
        <OptionSelect options={intentOptions} value={step.intent_id} onChange={(intent_id) => onPatch({ intent_id })} label="Интент" />
      </div>
      <div>
        <FieldLabel>Условия</FieldLabel>
        <ConditionsCell conditions={step.conditions} freeText={step.condition} dependencies={dependencies} entities={entities} onChange={onPatch} />
      </div>
      <div>
        <FieldLabel>Ответ ассистента</FieldLabel>
        <OptionSelect options={promptOptions} value={step.prompt_id} onChange={(prompt_id) => onPatch({ prompt_id })} label="Ответ ассистента" />
      </div>
      <div>
        <FieldLabel>Действие системы</FieldLabel>
        <Textarea rows={1} className={cn(GHOST, 'field-sizing-content min-h-9')} value={step.system_action} onChange={(e) => onPatch({ system_action: e.target.value })} aria-label="Действие системы" />
      </div>
    </div>
  );
}
```

- [ ] **Шаг 4: Панель узла** — создать `web/src/pages/scenarios/state-editor/NodePanel.tsx`:

```tsx
import { useState } from 'react';
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/Section';
import { cn, GHOST } from '@/lib/utils';
import type { Step } from '@/lib/types';

interface Props {
  name: string;
  isEntry: boolean;
  /** Исходящие строки состояния в порядке приоритета. */
  rows: Step[];
  edgeText: (s: Step) => string;
  onRename: (to: string) => void;
  onMakeEntry: () => void;
  onRemove: () => void;
  onSelectEdge: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onClose: () => void;
}

/** Редактор узла: имя, признак входа и порядок исходящих рёбер (порядок = приоритет проверки условий). */
export function NodePanel({ name, isEntry, rows, edgeText, onRename, onMakeEntry, onRemove, onSelectEdge, onMove, onClose }: Props) {
  const [value, setValue] = useState(name);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Состояние{isEntry && <span className="ml-2 text-xs font-normal text-brand">вход</span>}</h3>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Удалить состояние" onClick={onRemove}><Trash2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Закрыть панель" onClick={onClose}><X className="size-4" /></Button>
        </div>
      </div>
      <div>
        <FieldLabel>Имя</FieldLabel>
        <Input
          className={cn(GHOST, 'font-mono')} value={value} aria-label="Имя состояния"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { onRename(value); setValue(name); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </div>
      <Button variant="outline" size="sm" disabled={isEntry || rows.length === 0} onClick={onMakeEntry}>Сделать входом</Button>
      <div>
        <FieldLabel>Исходящие переходы (сверху вниз — порядок проверки)</FieldLabel>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет исходящих переходов — состояние конечное. Протяните связь от правого края узла к другому узлу.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1 rounded-md bg-muted p-1">
                <button type="button" className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-background" onClick={() => onSelectEdge(s.key!)}>
                  {edgeText(s)}
                </button>
                <Button variant="ghost" size="icon" aria-label="Выше" disabled={i === 0} onClick={() => onMove(s.key!, -1)}><ArrowUp className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Ниже" disabled={i === rows.length - 1} onClick={() => onMove(s.key!, 1)}><ArrowDown className="size-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Шаг 5: Редактор** — создать `web/src/pages/scenarios/state-editor/StateEditor.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, MarkerType, ReactFlow, type Connection, type Edge, type Node, type NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LayoutGrid, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/Section';
import { makeEntry, moveEdge, newTransition, removeState, renameState, uniqueStateName } from '@/lib/fsm';
import { layoutGraph, splitNext, type Analysis } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Layout, PromptListItem, Step } from '@/lib/types';
import { depLabel } from '../dependencies';
import { EdgePanel } from './EdgePanel';
import { NodePanel } from './NodePanel';
import { StateNode, TransitionEdge, type StateNodeData, type TransitionEdgeData } from './StateNode';

const nodeTypes = { state: StateNode };
const edgeTypes = { transition: TransitionEdge };

type Selection = { type: 'node'; name: string } | { type: 'edge'; key: string } | null;

interface Props {
  /** Только переходы (kind = transition). */
  steps: Step[];
  layout: Layout;
  /** analyzeSteps по этим же строкам. */
  analysis: Analysis;
  intents: IntentListItem[];
  prompts: PromptListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  onChange: (next: { steps: Step[]; layout: Layout }) => void;
}

/** Редактор конечного автомата: узлы — состояния, рёбра — строки Transition table. */
export function StateEditor({ steps, layout, analysis, intents, prompts, dependencies, entities, onChange }: Props) {
  const [selected, setSelected] = useState<Selection>(null);

  const names = useMemo(() => {
    const out = [...analysis.states];
    for (const e of analysis.edges) if (!out.includes(e.to)) out.push(e.to);
    for (const k of Object.keys(layout)) if (!out.includes(k)) out.push(k);
    return out;
  }, [analysis, layout]);
  const auto = useMemo(() => new Map(layoutGraph(names, analysis.edges).nodes.map((n) => [n.name, { x: n.x, y: n.y }])), [names, analysis.edges]);

  const edgeText = (s: Step) => {
    const intent = intents.find((i) => i.id === s.intent_id)?.name ?? 'без интента';
    const conds = [
      ...s.conditions.map((c) => {
        const dep = dependencies.find((d) => d.ref === c.dep);
        return `${dep ? depLabel(dep, entities) : c.dep}=${c.value}`;
      }),
      s.condition.trim(),
    ].filter(Boolean);
    const to = splitNext(s.next_states)[0];
    const text = conds.length ? `${intent} [${conds.join(', ')}]` : intent;
    return to ? `${text} → ${to}` : text;
  };
  const edgeLabel = (s: Step) => edgeText(s).replace(/ → .*$/, '');

  const hasOut = useMemo(() => new Set(analysis.edges.map((e) => e.from)), [analysis.edges]);
  const unreachable = useMemo(() => new Set(analysis.unreachable), [analysis.unreachable]);
  const derivedNodes = useMemo<Node<StateNodeData>[]>(
    () =>
      names.map((name) => ({
        id: name,
        type: 'state',
        position: layout[name] ?? auto.get(name) ?? { x: 0, y: 0 },
        data: {
          name, entry: name === analysis.states[0], terminal: !hasOut.has(name), unreachable: unreachable.has(name),
          selected: selected?.type === 'node' && selected.name === name,
        },
      })),
    [names, layout, auto, analysis.states, hasOut, unreachable, selected],
  );
  // Узлы живут в локальном состоянии, чтобы перетаскивание было плавным; фиксируем координаты при отпускании.
  const [nodes, setNodes] = useState(derivedNodes);
  useEffect(() => setNodes(derivedNodes), [derivedNodes]);

  const edges = useMemo<Edge<TransitionEdgeData>[]>(() => {
    const groups = new Map<string, string[]>();
    for (const e of analysis.edges) groups.set(`${e.from}>${e.to}`, [...(groups.get(`${e.from}>${e.to}`) ?? []), e.id]);
    return analysis.edges.map((e) => {
      const group = groups.get(`${e.from}>${e.to}`)!;
      const step = steps.find((s) => s.key === e.stepKey);
      return {
        id: e.id, source: e.from, target: e.to, type: 'transition',
        selected: selected?.type === 'edge' && selected.key === e.stepKey,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          stepKey: e.stepKey, index: group.indexOf(e.id), count: group.length, loop: e.from === e.to,
          label: step ? edgeLabel(step) : e.label,
          bad: (analysis.issues.get(e.stepKey ?? '') ?? []).some((i) => i.level === 'error'),
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, steps, selected, intents, dependencies, entities]);

  const positions = (): Layout =>
    Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]));
  /** Любое изменение фиксирует раскладку всех узлов, чтобы узел без рёбер не пропал. */
  const commit = (next: Step[], nextLayout?: Layout) => onChange({ steps: next, layout: nextLayout ?? positions() });

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    const step = newTransition(c.source, c.target);
    commit([...steps, step]);
    setSelected({ type: 'edge', key: step.key! });
  };
  const addNode = () => {
    const name = uniqueStateName(names);
    const y = Math.max(0, ...nodes.map((n) => n.position.y)) + 90;
    onChange({ steps, layout: { ...positions(), [name]: { x: 20, y } } });
    setSelected({ type: 'node', name });
  };
  const rename = (from: string, raw: string) => {
    const to = raw.trim();
    if (!to || to === from) return;
    if (names.includes(to)) {
      toast.error(`Состояние «${to}» уже есть`);
      return;
    }
    onChange(renameState(steps, positions(), from, to));
    setSelected({ type: 'node', name: to });
  };
  const undoable = (message: string, next: { steps: Step[]; layout: Layout }) => {
    const prev = { steps, layout: positions() };
    onChange(next);
    toast(message, { action: { label: 'Отменить', onClick: () => onChange(prev) } });
  };
  const removeNode = (name: string) => {
    setSelected(null);
    undoable(`Состояние «${name}» удалено вместе с переходами`, removeState(steps, positions(), name));
  };
  const removeEdge = (key: string) => {
    setSelected(null);
    undoable('Переход удалён', { steps: steps.filter((s) => s.key !== key), layout: positions() });
  };
  const patchEdge = (key: string, p: Partial<Step>) => commit(steps.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const relayout = () => onChange({ steps, layout: Object.fromEntries(auto) });

  const selectedStep = selected?.type === 'edge' ? steps.find((s) => s.key === selected.key) : undefined;
  const orphans = steps.filter((s) => !s.state.trim());

  return (
    <Section
      title="Схема переходов"
      action={
        <>
          <button type="button" onClick={relayout} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <LayoutGrid className="size-4" /> Разложить заново
          </button>
          <button type="button" onClick={addNode} className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
            <Plus className="size-4" /> Добавить состояние
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Узел — состояние, связь — переход (строка Transition table). Протяните связь от правого края узла к левому краю другого, чтобы добавить переход. Таблица для спецификации строится из схемы — смотрите вкладку «Предпросмотр».
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-[65vh] min-h-96 overflow-hidden rounded-md border bg-background">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(c: NodeChange[]) => setNodes((ns) => applyNodeChanges(c, ns) as Node<StateNodeData>[])}
            onNodeDragStop={() => commit(steps)}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected({ type: 'node', name: n.id })}
            onEdgeClick={(_, e) => e.data?.stepKey && setSelected({ type: 'edge', key: e.data.stepKey })}
            onPaneClick={() => setSelected(null)}
            deleteKeyCode={null}
            nodesFocusable
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <div className="min-w-0 rounded-md border p-4">
          {selected?.type === 'node' && (
            <NodePanel
              key={selected.name}
              name={selected.name}
              isEntry={selected.name === analysis.states[0]}
              rows={steps.filter((s) => s.state.trim() === selected.name)}
              edgeText={edgeText}
              onRename={(to) => rename(selected.name, to)}
              onMakeEntry={() => commit(makeEntry(steps, selected.name))}
              onRemove={() => removeNode(selected.name)}
              onSelectEdge={(key) => setSelected({ type: 'edge', key })}
              onMove={(key, dir) => commit(moveEdge(steps, key, dir))}
              onClose={() => setSelected(null)}
            />
          )}
          {selectedStep && (
            <EdgePanel
              key={selectedStep.key}
              step={selectedStep}
              states={names}
              intents={intents}
              prompts={prompts}
              dependencies={dependencies}
              entities={entities}
              issues={analysis.issues.get(selectedStep.key ?? '') ?? []}
              onPatch={(p) => patchEdge(selectedStep.key!, p)}
              onRemove={() => removeEdge(selectedStep.key!)}
              onClose={() => setSelected(null)}
            />
          )}
          {!selected && <p className="text-sm text-muted-foreground">Выберите состояние или переход на схеме, чтобы изменить его.</p>}
          {orphans.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-1 text-xs font-medium text-destructive">Строки без состояния ({orphans.length}) — их нет на схеме</p>
              <ul className="space-y-1">
                {orphans.map((s) => (
                  <li key={s.key}>
                    <button type="button" className="w-full truncate rounded bg-muted px-2 py-1 text-left text-sm hover:bg-muted/70" onClick={() => setSelected({ type: 'edge', key: s.key! })}>
                      {edgeText(s)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Шаг 6: Типы**

Run: `cd web && npx tsc -b`
Expected: ошибок в новых файлах нет. Типичные правки: сигнатуры `getBezierPath`/`EdgeProps` в `@xyflow/react` 12 (см. типы пакета), `noUnusedLocals`. Исправьте по сообщениям компилятора, не меняя поведения.

- [ ] **Шаг 7: Коммит**

```bash
git add web/package.json package-lock.json web/src/pages/scenarios/StepsTable.tsx web/src/pages/scenarios/state-editor
git commit -m "feat(web): React Flow editor for the state diagram"
```

- [ ] **Шаг 8: Ручная проверка откладывается до задачи 5** (редактор ещё не подключён к форме).

---

### Задача 5: Подключение к форме сценария, чистка, спецификация

**Файлы:**
- Изменить: `web/src/pages/scenarios/ScenarioForm.tsx`
- Изменить: `web/src/pages/scenarios/ScenariosPage.tsx:17`
- Удалить: `web/src/pages/scenarios/StateGraph.tsx`
- Изменить: `docs/superpowers/specs/2026-10-17-cui-spec-maker-design.md`
- Изменить: `README.md` (если описывает таблицу переходов — одной строкой про схему)

**Интерфейсы:**
- Потребляет: `StateEditor` (задача 4), `splitLegacySteps`/`canonicalOrder` (задача 1), `Scenario.layout` (задачи 1, 3).

- [ ] **Шаг 1: `ScenarioForm.tsx` — импорты, вкладки, черновик**

Импорты: убрать `import { StateGraph } from './StateGraph';`, добавить

```ts
import { canonicalOrder, splitLegacySteps } from '@/lib/fsm';
import { StateEditor } from './state-editor/StateEditor';
import type { Dependency, Layout, Scenario, Step } from '@/lib/types';
```

(вместо прежнего `import type { Dependency, Scenario, Step }`).

Вкладки: `ScenarioTab = 'general' | 'intents' | 'prompts' | 'logic' | 'preview'`; из `TABS` удалить `{ id: 'graph', label: 'Схема' }`.

```ts
type Draft = Pick<Scenario, 'name' | 'description' | 'entities' | 'dependencies' | 'steps' | 'layout'>;
```

В `useState<Draft>` заменить `steps` и добавить `layout`:

```ts
    steps: splitLegacySteps(scenario.steps.map((s) => ({ ...s, key: crypto.randomUUID() }))),
    layout: scenario.layout ?? {},
```

- [ ] **Шаг 2: Анализ по переходам и сохранение в каноническом порядке**

После существующего `analysis` добавить:

```ts
  const transitions = useMemo(() => draft.steps.filter((s) => s.kind === 'transition'), [draft.steps]);
  const fsm = useMemo(() => analyzeSteps(transitions, (id) => intents.find((i) => i.id === id)?.name ?? null), [transitions, intents]);
```

В `useAutosave` заменить вызов сохранения:

```ts
    await api.scenarios.save(scenario.id, { ...d, steps: canonicalOrder(d.steps), entities: d.entities.filter((e) => e.entity_id !== null) });
```

Рядом с `setPart` добавить:

```ts
  const setTransitions = (rows: Step[], layout?: Layout) =>
    setDraft((d) => ({ ...d, layout: layout ?? d.layout, steps: [...rows, ...d.steps.filter((s) => s.kind === 'error')] }));
```

- [ ] **Шаг 3: Вкладка «Сценарная логика»**

Первый `<StepsTable kind="transition" ...>` заменить на:

```tsx
      <StateEditor
        steps={transitions}
        layout={draft.layout}
        analysis={fsm}
        intents={intents}
        prompts={prompts}
        dependencies={draft.dependencies}
        entities={entities}
        onChange={({ steps, layout }) => setTransitions(steps, layout)}
      />
```

Блок `{tab === 'graph' && (...)}` удалить целиком. В `ScenariosPage.tsx:17` убрать `|| tab === 'graph'`. Удалить файл `StateGraph.tsx` (`git rm web/src/pages/scenarios/StateGraph.tsx`; он ещё не в индексе — тогда обычный `rm`).

- [ ] **Шаг 4: Типы, тесты, линт**

Run: `cd web && npx tsc -b && npx vitest run && cd ../server && npx vitest run`
Expected: всё зелёное. Проверьте также `npx oxlint` в `web`, если он настроен в проекте.

- [ ] **Шаг 5: Ручная проверка в браузере**

Запустите приложение (`start.bat` или `npm run dev` из корня) и пройдите сценарий:
1. Откройте сценарий, у которого уже есть таблица переходов (в том числе со строкой вида «ST_B ST_C» в «Следующие состояния»): схема показывает рёбра, строка с двумя целями превратилась в два ребра; пока ничего не менялось, в БД лежит прежнее.
2. «Добавить состояние» → узел `ST_NEW`; переименуйте в панели (Enter), попробуйте занятое имя — тост об ошибке.
3. Протяните связь от правого края узла A к левому краю B, затем ещё одну такую же — получится два параллельных ребра; у каждого свой интент и условие. Протяните связь узла в самого себя — петля над узлом.
4. В панели узла A переставьте исходящие рёбра стрелками; задайте двум рёбрам одного интента одинаковые условия — красная подсветка и пункт в «Проверка».
5. Перетащите узлы, обновите страницу (подождите «Сохранено») — раскладка и порядок сохранились.
6. Вкладка «Предпросмотр»: Transition table идёт от входа, внутри состояния — в порядке рёбер; Errors по-прежнему редактируются таблицей на вкладке «Сценарная логика».
7. Удалите состояние и нажмите «Отменить» в тосте.

- [ ] **Шаг 6: Спецификация и README**

В `docs/superpowers/specs/2026-10-17-cui-spec-maker-design.md`:
- в разделе «Модель данных» заменить пункт `scenario_nodes` на: «`scenarios.layout` — JSON `{состояние: {x, y}}`: положение узлов схемы (и узлов без рёбер, которые иначе нигде не хранились). Только раскладка, на экспорт не влияет; узлы без записи раскладываются автоматически слоями от входа.»
- в разделе «Сценарии» убрать фразы про «признак „конечное“» (панель узла: имя, вход, порядок рёбер), про отдельный «предпросмотр таблицы с выделением ребра» (предпросмотр — существующая вкладка «Предпросмотр», строки идут в каноническом порядке) и про `scenario_nodes`; проверку «состояние без исходящих» описать как предупреждение без понятия «помеченное конечным»; указать, что схема показывает только `transition`-строки, а таблица Errors остаётся таблицей.

В `README.md` — одна строка про редактор схемы, если в нём описан раздел сценариев.

- [ ] **Шаг 7: Коммит**

```bash
git add web/src/pages/scenarios/ScenarioForm.tsx web/src/pages/scenarios/ScenariosPage.tsx docs/superpowers/specs/2026-10-17-cui-spec-maker-design.md README.md
git rm -f web/src/pages/scenarios/StateGraph.tsx 2>/dev/null || rm -f web/src/pages/scenarios/StateGraph.tsx
git commit -m "feat(web): edit transitions on the state diagram; table is generated from it"
```

---

## Самопроверка плана

- **Покрытие спецификации:** ребро = строка с одной целью (задачи 1, 4); ветвление по условиям и параллельные рёбра (задачи 2, 4: рёбра не склеиваются, разнесены по вертикали); редактирование (создание связью, панели узла и ребра — задача 4); порядок = приоритет (`moveEdge`, `canonicalOrder`); вход (`makeEntry`); раскладка (`scenarios.layout`, задача 3; «Разложить заново»); предпросмотр таблицы (вкладка «Предпросмотр» + канонический порядок при сохранении, задача 5); проверки — недостижимые, пустые, детерминизм, состояние без исходящих (задача 2); Errors как таблица (задача 5); миграция старых строк (`splitLegacySteps`, задача 5).
- **Согласованность имён:** `GraphEdge.stepKey/id/label` (задача 2) используются в `StateEditor`; `Layout` (задача 1) — в сервере (структурно тот же тип), `ScenarioForm` и редакторе; `OptionSelect`/`Option` экспортируются в задаче 4 до использования.
- **Известные ограничения, не вошедшие в план (YAGNI):** отмена/повтор для правок на полотне, кроме удаления; удаление клавишей Delete (отключено, чтобы не стереть случайно); тёмная тема полотна React Flow.
