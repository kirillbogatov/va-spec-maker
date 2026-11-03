import { describe, expect, it } from 'vitest';
import { analyzeSteps, globalIssues, stepIntentLabel } from './states';
import { duplicateState, newTransition } from './fsm';
import type { Dependency, Step } from './types';
import { buildChecks } from '@/pages/scenarios/ScenarioChecks';
import { duplicatePart } from '@/pages/scenarios/duplicatePart';
import { createConditionStates } from '@/pages/scenarios/state-editor/conditionStates';

const wildcard = (key: string, condition = ''): Step => ({
  ...newTransition('VA_ACTIVATION', 'ST_DONE'), key, match_any_intent: true, condition,
});
const name = (id: number | null) => id === 7 ? 'INT_SEVEN' : null;

describe('explicit any-intent transitions', () => {
  it('labels wildcard separately from unselected null and legacy scenario-wide errors', () => {
    const any = wildcard('any');
    const empty = { ...any, match_any_intent: false };
    expect(stepIntentLabel(any, name)).toBe('Любой интент');
    expect(stepIntentLabel(empty, name)).toBe('без интента');
    expect(stepIntentLabel({ ...empty, kind: 'error' }, name)).toBe('Любой интент сценария');
    expect(stepIntentLabel({ ...empty, intent_id: 7 }, name)).toBe('INT_SEVEN');
    expect(analyzeSteps([any, { ...empty, key: 'empty' }], name).edges.map((e) => e.label)).toEqual(['Любой интент', '']);
  });

  it('checks duplicate and shadowed wildcard branches without merging them with concrete or empty intent', () => {
    const first = wildcard('first');
    const duplicate = wildcard('duplicate');
    const conditional = wildcard('conditional', 'ready');
    const concrete = { ...wildcard('concrete'), match_any_intent: false, intent_id: 7 };
    const empty = { ...wildcard('empty'), match_any_intent: false };
    const issues = analyzeSteps([first, concrete, empty, duplicate, conditional].map((s) => ({ ...s, next_states: 'END' })), name).issues;
    expect(issues.get('duplicate')).toContainEqual(expect.objectContaining({ level: 'error', text: expect.stringContaining('Те же условия') }));
    expect(issues.get('first')).toContainEqual(expect.objectContaining({ level: 'warn', text: expect.stringContaining('не последним') }));
    expect(issues.get('concrete')).toBeUndefined();
    expect(issues.get('empty')).toBeUndefined();
  });

  it('accepts wildcard globals while still rejecting an unselected global intent', () => {
    const any: Step = { ...wildcard('any'), kind: 'global', state: '' };
    const empty = { ...any, key: 'empty', match_any_intent: false };
    const issues = globalIssues([any, empty], ['ST_DONE']);
    expect(issues.has('any')).toBe(false);
    expect(issues.get('empty')).toContainEqual({ level: 'error', text: 'Не выбран интент' });
    const checks = buildChecks({ description: 'Ready', parts: [{ name: 'Main', steps: [wildcard('transition'), any], analysis: analyzeSteps([wildcard('transition'), any], name) }], intents: [], prompts: [] });
    expect(checks.some((c) => c.text === 'Есть глобальный переход без интента')).toBe(false);
  });

  it('preserves wildcard when copying a state, part, and generated condition branches', () => {
    const source = wildcard('source');
    const copied = duplicateState([source], {}, 'ST_DONE');
    expect(copied.steps.find((s) => s.next_states === copied.name)).toMatchObject({ match_any_intent: true, intent_id: null });
    const part = { name: 'Main', description: '', steps: [source], layout: {} };
    expect(duplicatePart(part, [part]).steps[0]).toMatchObject({ match_any_intent: true, intent_id: null });
    const dependencies: Dependency[] = [{ ref: 'zone', name: 'Zone', entity_id: null, type: 'enum', options: ['front', 'rear'] }];
    const template = { ...source, conditions: [{ dep: 'zone', value: '' }] };
    const emptyIntent = { ...template, key: 'empty', match_any_intent: false, conditions: [{ dep: 'zone', value: 'rear' }] };
    const generated = createConditionStates([template, emptyIntent], {}, template.key!, dependencies, []);
    expect(generated.count).toBe(2);
    expect(generated.steps.filter((s) => s.key !== 'empty')).toHaveLength(2);
    expect(generated.steps.filter((s) => s.key !== 'empty').every((s) => s.match_any_intent && s.intent_id === null)).toBe(true);
  });
});
