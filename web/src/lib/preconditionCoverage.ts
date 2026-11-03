import type { Dependency, Entity, ScenarioPart, StepCondition } from './types';

type Part = Pick<ScenarioPart, 'name' | 'steps' | 'preconditions' | 'precond_mode' | 'precondition'>;
export interface PreconditionCoverageIssue { partIndex: number; text: string }
type Value = string | symbol;
type Cube = Map<string, Set<Value>>;
interface Variable { key: string; name: string; numeric: boolean; choices?: string[] }
const OTHER = Symbol('another value');

/** Finds gaps outside concrete preconditions, keeping the other AND prerequisites fixed.
 * Equality predicates partition open strings into mentioned values and an "other" value.
 * Subtracting the union of tab predicates avoids treating unrelated or partial fallbacks as coverage.
 */
export function preconditionCoverage(parts: readonly Part[], dependencies: readonly Dependency[], entities: readonly Entity[]): PreconditionCoverageIssue[] {
  const variables = new Map<string, Variable>();
  const mentioned = new Map<string, Set<Value>>();
  const domains = new Map<string, Set<Value>>();
  const resolve = (c: StepCondition): Variable | undefined => {
    if (c.keyword_id !== undefined) return { key: `keyword:${c.keyword_id}`, name: '', numeric: false, choices: ['true', 'false'] };
    const d = dependencies.find((d) => d.ref === c.dep);
    const id = c.entity_id ?? d?.entity_id;
    const e = id == null ? undefined : entities.find((e) => e.id === id);
    if (id != null && !e) return undefined;
    if (e) return {
      key: `entity:${e.id}`, name: e.name, numeric: e.type === 'number',
      choices: e.type === 'boolean' ? ['true', 'false'] : e.type === 'string' && e.values.length ? e.values.map((v) => v.value) : undefined,
    };
    return d ? { key: `dep:${d.ref}`, name: d.name, numeric: false, choices: d.type === 'bool' ? ['true', 'false'] : d.type === 'enum' && d.options.length ? d.options : undefined } : undefined;
  };
  const remember = (v: Variable, value: string) => {
    variables.set(v.key, v);
    const values = mentioned.get(v.key) ?? new Set<Value>();
    values.add(value);
    mentioned.set(v.key, values);
  };
  // Unsupported comparisons and prose remain independent predicates: they cannot prove coverage.
  const opaque = (key: string): Variable => ({ key, name: '', numeric: false, choices: ['true', 'false'] });
  const atom = (c: StepCondition): { variable: Variable; value: string; not: boolean } | undefined => {
    const v = resolve(c);
    if (c.keyword_id !== undefined && v) return { variable: v, value: 'true', not: c.op === '!=' };
    if (!v || !c.value.trim()) return { variable: opaque(`unknown:${JSON.stringify(c)}`), value: 'true', not: false };
    if (c.op === '<' || c.op === '>') return { variable: opaque(`comparison:${v.key}:${c.op}:${c.value}`), value: 'true', not: false };
    return { variable: v, value: c.value, not: c.op === '!=' };
  };
  const proseLines = (part: Part) => (part.precondition ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const part of parts) {
    for (const c of part.preconditions ?? []) {
      const a = atom(c);
      if (a) remember(a.variable, a.value);
    }
    for (const line of proseLines(part)) remember(opaque(`text:${line}`), 'true');
  }
  for (const [key, v] of variables) domains.set(key, new Set<Value>(v.choices ?? [...mentioned.get(key)!, OTHER]));
  const intersection = (a: ReadonlySet<Value>, b: ReadonlySet<Value>) => new Set([...a].filter((v) => b.has(v)));
  const constrain = (cube: Cube, key: string, values: Set<Value>): Cube => {
    const next = new Map(cube);
    next.set(key, intersection(cube.get(key) ?? domains.get(key)!, values));
    return next;
  };
  const possible = (cube: Cube) => [...cube.values()].every((s) => s.size > 0);
  const clause = (c: StepCondition): Cube => {
    const a = atom(c)!;
    const domain = domains.get(a.variable.key)!;
    return new Map([[a.variable.key, new Set([...domain].filter((v) => a.not ? v !== a.value : v === a.value))]]);
  };
  const join = (a: Cube, b: Cube): Cube => {
    let result = a;
    for (const [key, values] of b) result = constrain(result, key, values);
    return result;
  };
  const prose = (part: Part): Cube[] => proseLines(part).map((line) => new Map([[`text:${line}`, new Set<Value>(['true'])]]));
  const predicates = (part: Part): Cube[] => {
    const clauses = [...(part.preconditions ?? []).map(clause), ...prose(part)];
    if (part.precond_mode === 'any' && clauses.length) return clauses.filter(possible);
    return [clauses.reduce(join, new Map())].filter(possible);
  };
  const hasBehavior = (part: Part) => part.steps.some((s) => s.state.trim() || s.next_states.trim() || s.system_action.trim() || s.prompt_id != null || s.intent_id != null || s.match_any_intent);
  const coverage = parts.filter(hasBehavior).flatMap(predicates);
  /** Disjoint pieces of a region left after removing one covered cube. */
  const subtract = (region: Cube, covered: Cube): Cube[] => {
    if (!possible(join(region, covered))) return [region];
    const remaining: Cube[] = [];
    let inside = region;
    for (const [key, values] of covered) {
      const before = inside.get(key) ?? domains.get(key)!;
      const outside = new Set([...before].filter((v) => !values.has(v)));
      if (outside.size) remaining.push(constrain(inside, key, outside));
      inside = constrain(inside, key, values);
    }
    return remaining;
  };
  const uncovered = (region: Cube): boolean => {
    if (!possible(region)) return false;
    let remainder = [region];
    for (const cube of coverage) {
      remainder = remainder.flatMap((piece) => subtract(piece, cube));
      if (!remainder.length) return false;
      // An unusually complex table should produce a conservative warning, never a false pass.
      if (remainder.length > 4096) return true;
    }
    return remainder.length > 0;
  };
  const issues: PreconditionCoverageIssue[] = [];
  parts.forEach((part, partIndex) => {
    const conditions = part.preconditions ?? [];
    const seen = new Set<string>();
    conditions.forEach((c, index) => {
      const v = resolve(c);
      if (!v || v.numeric || c.keyword_id !== undefined || (c.op ?? '=') !== '=' || !c.value.trim()) return;
      const token = `${v.key}:${JSON.stringify(c.value)}`;
      if (seen.has(token)) return;
      seen.add(token);
      let context: Cube = part.precond_mode === 'any' ? new Map() : prose(part).reduce(join, new Map());
      if (part.precond_mode !== 'any') {
        conditions.forEach((other, j) => { if (j !== index) context = join(context, clause(other)); });
      }
      const domain = domains.get(v.key)!;
      context = constrain(context, v.key, new Set([...domain].filter((value) => value !== c.value)));
      if (uncovered(context)) issues.push({ partIndex, text: `Для предусловия «${v.name} = ${c.value}» не описано поведение при других значениях` });
    });
  });
  return issues;
}
