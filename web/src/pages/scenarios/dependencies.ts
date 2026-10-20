import type { Dependency, EntityListItem, Step, StepCondition } from '@/lib/types';

export const TYPE_LABEL: Record<Dependency['type'], string> = {
  string: 'Строка',
  enum: 'Вариант из списка',
  bool: 'Булево значение',
};

/** Допустимые значения для условия: список вариантов или true/false; null — свободный ввод строки. */
export function valueChoices(d: Dependency): string[] | null {
  if (d.type === 'bool') return ['true', 'false'];
  if (d.type === 'enum') return d.options.length ? d.options : null;
  return null;
}

export const depLabel = (d: Dependency, entities: EntityListItem[]) =>
  (d.entity_id !== null ? entities.find((e) => e.id === d.entity_id)?.name : d.name) || '(без названия)';

/** Убирает условия удалённых зависимостей и значения, которые перестали быть допустимыми. */
export function reconcile(deps: Dependency[], steps: Step[]): Step[] {
  const byRef = new Map(deps.map((d) => [d.ref, d]));
  return steps.map((s) => {
    const conditions = s.conditions
      .filter((c) => c.entity_id !== undefined || byRef.has(c.dep))
      .map((c) => {
        if (c.entity_id !== undefined) return c;
        const choices = valueChoices(byRef.get(c.dep)!);
        if (!choices) return c;
        // Для значений из списка сравнения «<» и «>» не имеют смысла.
        const op = c.op === '<' || c.op === '>' ? '=' : c.op;
        const value = choices.includes(c.value) ? c.value : '';
        return op === c.op && value === c.value ? c : { ...c, op, value };
      });
    const same = conditions.length === s.conditions.length && conditions.every((c, i) => c === s.conditions[i]);
    return same ? s : { ...s, conditions };
  });
}

/** Допустимые значения сущности; пустой список — свободный ввод. */
export const entityChoices = (e: EntityListItem | undefined): string[] | null => (e && e.values.length ? e.values.map((v) => v.value) : null);

/** Подпись условия: «зависимость ⟨оператор⟩ значение» или «сущность ⟨оператор⟩ значение». */
export function conditionLabel(c: StepCondition, deps: Dependency[], entities: EntityListItem[]): string {
  const name = c.entity_id !== undefined
    ? entities.find((e) => e.id === c.entity_id)?.name ?? `сущность #${c.entity_id}`
    : (() => { const d = deps.find((x) => x.ref === c.dep); return d ? depLabel(d, entities) : c.dep; })();
  return `${name}${c.op ?? '='}${c.value}`;
}
