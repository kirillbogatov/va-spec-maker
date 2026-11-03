import type { ScenarioPart } from '@/lib/types';
import { uniqueName } from '@/lib/utils';

/** Справочники общие, содержимое и ключи вкладки независимы от оригинала. */
export function duplicatePart(source: ScenarioPart, parts: ScenarioPart[]): ScenarioPart {
  const copy = structuredClone(source);
  return {
    ...copy,
    key: crypto.randomUUID(),
    name: uniqueName(`${source.name.trim() || 'Вкладка'} — копия`, parts.map((p) => p.name)),
    steps: copy.steps.map((step) => ({ ...step, key: crypto.randomUUID() })),
  };
}
