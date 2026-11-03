import { entityTypeLabel, rangeSummary } from './entityTypes';
import type { Dependency, DictionaryDependency, EntityListItem, StepCondition } from './types';

export const synonymsHint = (values: string[]) => values.map((v) => v.trim()).filter(Boolean).join(', ');

export function entityHint(entity: EntityListItem | undefined): string {
  if (!entity) return '';
  if (entity.description.trim()) return entity.description.trim();
  if (entity.values.length) return entity.values.map((v) => {
    const synonyms = synonymsHint(v.synonyms);
    return synonyms ? `${v.value}: ${synonyms}` : v.value;
  }).join('; ');
  if (entity.type === 'boolean') return 'true, false';
  return [entityTypeLabel(entity.type), rangeSummary(entity)].filter(Boolean).join(', ');
}

export function dependencyHint(dependency: Dependency, entities: EntityListItem[]): string {
  if (dependency.description?.trim()) return dependency.description.trim();
  const entity = dependency.entity_id != null ? entities.find((e) => e.id === dependency.entity_id) : undefined;
  if (entity) return entityHint(entity);
  return dependency.type === 'bool' ? 'true, false' : synonymsHint(dependency.options);
}

export const dictionaryDependencyHint = (dependency: DictionaryDependency) => dependency.description?.trim() || synonymsHint(dependency.values);

/** Synonyms belong to the selected entity value, including entity-backed dependencies. */
export function conditionValueHint(condition: StepCondition, value: string, dependencies: Dependency[], entities: EntityListItem[]): string {
  const id = condition.entity_id ?? dependencies.find((d) => d.ref === condition.dep)?.entity_id;
  const entry = entities.find((e) => e.id === id)?.values.find((v) => v.value === value);
  return entry ? synonymsHint(entry.synonyms) : '';
}
