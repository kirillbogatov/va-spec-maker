import type { Dependency, DictionaryDependency, ScenarioPart } from './types';

export interface ValueRename { from: string; to: string }

/** Apply exactly the shared change to both the draft and its conflict-check baseline. */
export function applyDependencyRecord<T extends { dependencies: Dependency[]; parts: ScenarioPart[] }>(source: T, record: DictionaryDependency, previousName: string, renames: ValueRename[]): T {
  const matches = (d: Dependency) => d.dictionary_id === record.id || (d.entity_id === null && d.name === previousName);
  const refs = new Set(source.dependencies.filter(matches).map((d) => d.ref));
  const renamed = (conditions: ScenarioPart['steps'][number]['conditions']) => conditions.map((c) => {
    if (!refs.has(c.dep) || c.entity_id !== undefined || 'concept_id' in c || 'keyword_id' in c) return c;
    const rename = renames.find((r) => r.from === c.value);
    return rename ? { ...c, value: rename.to } : c;
  });
  return { ...source,
    dependencies: source.dependencies.map((d) => {
      if (!matches(d)) return d;
      const bool = d.type === 'bool' && record.values.length === 2 && record.values[0] === 'true' && record.values[1] === 'false';
      return { ...d, dictionary_id: record.id, name: record.name, description: record.description ?? '', type: bool ? 'bool' : record.values.length ? 'enum' : 'string', options: bool ? [] : record.values };
    }),
    parts: source.parts.map((p) => ({ ...p, steps: p.steps.map((s) => ({ ...s, conditions: renamed(s.conditions) })), preconditions: renamed(p.preconditions ?? []) })),
  };
}
