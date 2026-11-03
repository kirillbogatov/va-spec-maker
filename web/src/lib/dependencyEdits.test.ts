import { expect, it } from 'vitest';
import { applyDependencyRecord } from './dependencyEdits';
import { newTransition } from './fsm';
import type { Dependency, ScenarioPart } from './types';

it('updates the matching shared dependency and condition values without changing unrelated draft edits', () => {
  const dependency: Dependency = { ref: 'shared', dictionary_id: 7, entity_id: null, name: 'DEP_OLD', description: 'Old', type: 'enum', options: ['A', 'B'], editable: false };
  const source: { description: string; dependencies: Dependency[]; parts: ScenarioPart[] } = {
    description: 'Несохранённое описание сценария',
    dependencies: [dependency, { ...dependency, ref: 'other', dictionary_id: 8, name: 'DEP_OTHER' }],
    parts: [{ name: 'Main', description: '', layout: {}, preconditions: [{ dep: 'shared', value: 'A' }], steps: [
      { ...newTransition('A', 'B'), conditions: [{ dep: 'shared', value: 'A' }, { dep: 'shared', value: 'B' }, { dep: 'other', value: 'A' }] },
    ] }],
  };
  const updated = applyDependencyRecord(source, { id: 7, name: 'DEP_NEW', description: 'New', values: ['B', 'A'], used_by: [] }, 'DEP_OLD', [{ from: 'A', to: 'B' }, { from: 'B', to: 'A' }]);
  expect(updated.description).toBe(source.description);
  expect(updated.dependencies[0]).toMatchObject({ name: 'DEP_NEW', description: 'New', options: ['B', 'A'], editable: false });
  expect(updated.dependencies[1]).toBe(source.dependencies[1]);
  expect(updated.parts[0].preconditions?.[0].value).toBe('B');
  expect(updated.parts[0].steps[0].conditions.map((c) => c.value)).toEqual(['B', 'A', 'A']);
  expect(source.parts[0].steps[0].conditions[0].value).toBe('A');
  expect(source.dependencies[0].name).toBe('DEP_OLD');
});
