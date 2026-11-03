import { describe, expect, it } from 'vitest';
import type { Dependency, Entity, ScenarioPart, StepCondition } from './types';
import { preconditionCoverage } from './preconditionCoverage';

const dep = (ref: string, options: string[] = []): Dependency => ({ ref, name: ref, entity_id: null, type: options.length ? 'enum' : 'string', options });
const condition = (dep: string, value: string, op: StepCondition['op'] = '='): StepCondition => ({ dep, value, op });
const part = (preconditions: StepCondition[] = [], patch: Partial<ScenarioPart> = {}): ScenarioPart => ({
  name: 'Основная', description: '', layout: {}, preconditions,
  steps: [{ state: 'ST_A', next_states: 'ST_B', kind: 'transition', intent_id: 1, request_params: '', condition: '', conditions: [], prompt_id: null, system_action: '' }],
  ...patch,
});
const entity = (type: Entity['type'] = 'string'): Entity => ({ id: 1, project_id: 1, name: 'ENT', description: '', type, range_min: '', range_max: '', multiple_values: false, values: [{ value: 'driver', synonyms: [] }, { value: 'passenger', synonyms: [] }], used_by: [] });

describe('preconditionCoverage', () => {
  it('reports a concrete free string without alternative behavior', () => {
    expect(preconditionCoverage([part([condition('DEP', 'driver')])], [dep('DEP')], [])).toEqual([
      { partIndex: 0, text: 'Для предусловия «DEP = driver» не описано поведение при других значениях' },
    ]);
  });

  it('accepts a complement or an unconditional fallback with behavior', () => {
    const first = part([condition('DEP', 'driver')]);
    expect(preconditionCoverage([first, part([condition('DEP', 'driver', '!=')])], [dep('DEP')], [])).toEqual([]);
    expect(preconditionCoverage([first, part()], [dep('DEP')], [])).toEqual([]);
    expect(preconditionCoverage([first, part([], { steps: [] })], [dep('DEP')], [])).toHaveLength(1);
  });

  it('requires all enumerable alternatives, but not a nonexistent other value', () => {
    const a = part([condition('DEP', 'a')]);
    const b = part([condition('DEP', 'b')]);
    expect(preconditionCoverage([a, b], [dep('DEP', ['a', 'b'])], [])).toEqual([]);
    expect(preconditionCoverage([a, b], [dep('DEP', ['a', 'b', 'c'])], [])).toHaveLength(2);
    expect(preconditionCoverage([a], [dep('DEP', ['a'])], [])).toEqual([]);
    expect(preconditionCoverage([a, b], [dep('DEP')], [])).toHaveLength(2);
  });

  it('does not mistake a fallback in a different AND context for full coverage', () => {
    const a = part([condition('POSITION', 'driver'), condition('MODE', 'on')]);
    const differentContext = part([condition('POSITION', 'driver', '!='), condition('MODE', 'off')]);
    const sameContext = part([condition('POSITION', 'driver', '!='), condition('MODE', 'on')]);
    const deps = [dep('POSITION'), dep('MODE')];
    const positionIssues = (parts: ScenarioPart[]) => preconditionCoverage(parts, deps, []).filter((i) => i.partIndex === 0 && i.text.includes('POSITION'));
    expect(positionIssues([a, differentContext])).toHaveLength(1);
    expect(positionIssues([a, sameContext])).toEqual([]);
  });

  it('unions several partial fallbacks under the remaining context', () => {
    const a = part([condition('POSITION', 'driver')]);
    const fallbacks = ['on', 'off'].map((mode) => part([condition('POSITION', 'driver', '!='), condition('MODE', mode)]));
    const deps = [dep('POSITION'), dep('MODE', ['on', 'off'])];
    expect(preconditionCoverage([a, ...fallbacks], deps, []).filter((i) => i.partIndex === 0)).toEqual([]);
    expect(preconditionCoverage([a, fallbacks[0]], deps, []).filter((i) => i.partIndex === 0)).toHaveLength(1);
  });

  it('honors OR instead of assuming each alternative is an AND prerequisite', () => {
    const a = part([condition('DEP', 'a'), condition('DEP', 'b')], { precond_mode: 'any' });
    expect(preconditionCoverage([a], [dep('DEP', ['a', 'b'])], [])).toEqual([]);
    expect(preconditionCoverage([a], [dep('DEP', ['a', 'b', 'c'])], [])).toHaveLength(2);
    const fallback = part([condition('DEP', 'a', '!=')]);
    expect(preconditionCoverage([a, fallback], [dep('DEP')], [])).toEqual([]);
  });

  it('treats prose as an OR alternative rather than an extra AND restriction', () => {
    const a = part([condition('DEP', 'a')], { precond_mode: 'any', precondition: 'Online' });
    const complement = part([condition('DEP', 'a', '!=')]);
    expect(preconditionCoverage([a, complement], [dep('DEP')], [])).toEqual([]);
    expect(preconditionCoverage([a], [dep('DEP')], [])).toHaveLength(1);
    const partial = part([condition('DEP', 'a', '!=')], { precondition: 'Online' });
    expect(preconditionCoverage([a, partial], [dep('DEP')], [])).toHaveLength(1);
  });

  it('checks direct entities and treats a linked dependency as the same variable', () => {
    const e = entity();
    const a = part([{ dep: '', entity_id: 1, value: 'driver' }]);
    const d = { ...dep('ALIAS'), entity_id: 1 };
    expect(preconditionCoverage([a], [d], [e])).toHaveLength(1);
    expect(preconditionCoverage([a, part([condition('ALIAS', 'passenger')])], [d], [e])).toEqual([]);
  });

  it('skips numeric entities, including entity-backed dependencies', () => {
    const e = entity('number');
    expect(preconditionCoverage([part([{ dep: '', entity_id: 1, value: '3' }, condition('ALIAS', '3')])], [{ ...dep('ALIAS'), entity_id: 1 }], [e])).toEqual([]);
  });

  it('requires the opposite boolean for entities and dependencies', () => {
    const d = { ...dep('FLAG'), type: 'bool' as const };
    expect(preconditionCoverage([part([condition('FLAG', 'true')])], [d], [])).toHaveLength(1);
    expect(preconditionCoverage([part([condition('FLAG', 'true')]), part([condition('FLAG', 'false')])], [d], [])).toEqual([]);
    const e = entity('boolean');
    expect(preconditionCoverage([part([{ dep: '', entity_id: 1, value: 'true' }])], [], [e])).toHaveLength(1);
  });

  it('does not use restrictive prose or an unrelated keyword as an unconditional fallback', () => {
    const a = part([condition('DEP', 'a')]);
    expect(preconditionCoverage([a, part([], { precondition: 'Only while online' })], [dep('DEP')], [])).toHaveLength(1);
    expect(preconditionCoverage([a, part([{ dep: '', value: '', keyword_id: 42 }])], [dep('DEP')], [])).toHaveLength(1);
    const context = { dep: '', value: '', keyword_id: 42 };
    expect(preconditionCoverage([part([condition('DEP', 'a'), context]), part([condition('DEP', 'a', '!='), context])], [dep('DEP')], [])).toEqual([]);
  });

  it('does not require alternatives for a keyword, inequality, or unfinished equality', () => {
    expect(preconditionCoverage([part([{ dep: '', value: '', keyword_id: 1 }, condition('DEP', 'a', '!='), condition('DEP', '')])], [dep('DEP')], [])).toEqual([]);
  });
});
