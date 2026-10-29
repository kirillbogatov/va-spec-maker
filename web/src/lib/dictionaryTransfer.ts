import { api } from './api';
import {
  dependenciesToCsv, entitiesToCsv, intentsToCsv, parseDependenciesCsv, parseEntitiesCsv, parseIntentsCsv, parsePromptsCsv, promptsToCsv,
} from './dictionaryCsv';
import { downloadBlob } from './download';
import { valuesPatch, mergeValues } from './values';

export type DictKind = 'intents' | 'entities' | 'prompts' | 'dependencies';

export interface ImportResult { added: number; updated: number; skipped: number; warnings: string[] }

export const FILE_NAME: Record<DictKind, string> = { intents: 'intents.csv', entities: 'entities.csv', prompts: 'prompts.csv', dependencies: 'dependencies.csv' };

const key = (name: string) => name.trim().toLowerCase();

/** Содержимое справочника проекта в CSV (через те же запросы, что и страницы). */
export async function exportDictionary(kind: DictKind, pid: number): Promise<string> {
  if (kind === 'dependencies') return dependenciesToCsv(await api.dependencyDictionary.list(pid));
  if (kind === 'prompts') {
    const list = await api.prompts.list(pid);
    const items = await Promise.all(list.map((p) => api.prompts.get(p.id)));
    return promptsToCsv(items.map((p) => ({ name: p.name, answers: p.full_answers })));
  }
  if (kind === 'entities') return entitiesToCsv(await api.entities.list(pid));
  const [list, entities] = await Promise.all([api.intents.list(pid), api.entities.list(pid)]);
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const items = await Promise.all(list.map((i) => api.intents.get(i.id)));
  return intentsToCsv(items.map((i) => ({
    name: i.name, enabled: i.enabled, comment: i.comment, phrases: i.phrases, patterns: i.patterns,
    entities: i.entities.flatMap((e) => (names.has(e.entity_id) ? [{ name: names.get(e.entity_id)!, required: e.required }] : [])),
  })));
}

export async function downloadDictionary(kind: DictKind, pid: number): Promise<void> {
  downloadBlob(new Blob([await exportDictionary(kind, pid)], { type: 'text/csv;charset=utf-8' }), FILE_NAME[kind]);
}

/** Импорт CSV: объекты находятся по названию (без учёта регистра) — существующие заменяются содержимым файла, новые создаются. */
export async function importDictionary(kind: DictKind, pid: number, text: string): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, warnings: [] };
  // upsert: название → id существующего объекта
  const run = async <T extends { name: string }>(rows: T[], existing: Map<string, number>, create: (name: string, row: T) => Promise<number>, save: (id: number, row: T) => Promise<unknown>) => {
    for (const row of rows) {
      if (!row.name) { result.skipped++; continue; }
      try {
        let id = existing.get(key(row.name));
        const isNew = id === undefined;
        if (isNew) id = await create(row.name, row);
        await save(id!, row);
        existing.set(key(row.name), id!);
        result[isNew ? 'added' : 'updated']++;
      } catch (e) {
        result.skipped++;
        result.warnings.push(`«${row.name}»: ${(e as Error).message}`);
      }
    }
  };
  if (kind === 'dependencies') {
    const existing = new Map((await api.dependencyDictionary.list(pid)).map((d) => [key(d.name), d.id]));
    await run(parseDependenciesCsv(text), existing, async (name) => (await api.dependencyDictionary.create(pid, name)).id, (id, r) => api.dependencyDictionary.save(id, { name: r.name, description: r.description, values: r.values }));
  } else if (kind === 'prompts') {
    const existing = new Map((await api.prompts.list(pid)).map((p) => [key(p.name), p.id]));
    await run(parsePromptsCsv(text), existing, async (name) => (await api.prompts.createInProject(pid, name)).id, (id, r) => api.prompts.save(id, { name: r.name, full_answers: r.answers }));
  } else if (kind === 'entities') {
    const existing = new Map((await api.entities.list(pid)).map((e) => [key(e.name), e.id]));
    await run(
      parseEntitiesCsv(text), existing,
      async (name, r) => (await api.entities.create(pid, name, { type: r.type, range_min: r.range_min, range_max: r.range_max })).id,
      (id, r) => api.entities.save(id, { name: r.name, description: r.description, multiple_values: r.multiple_values, type: r.type, range_min: r.range_min, range_max: r.range_max, values: r.values }),
    );
  } else {
    const [list, entities] = await Promise.all([api.intents.list(pid), api.entities.list(pid)]);
    const entityIds = new Map(entities.map((e) => [key(e.name), e.id]));
    const existing = new Map(list.map((i) => [key(i.name), i.id]));
    await run(
      parseIntentsCsv(text), existing,
      async (name) => (await api.intents.createInProject(pid, name)).id,
      (id, r) => {
        const linked = r.entities.flatMap((e) => {
          const entity_id = entityIds.get(key(e.name));
          if (entity_id === undefined) result.warnings.push(`«${r.name}»: сущность ${e.name} не найдена, пропущена`);
          return entity_id === undefined ? [] : [{ entity_id, required: e.required }];
        });
        return api.intents.save(id, { name: r.name, enabled: r.enabled, comment: r.comment, ...valuesPatch(mergeValues(r.phrases, r.patterns)), entities: linked });
      },
    );
  }
  return result;
}

export const summary = (r: ImportResult) => `Добавлено: ${r.added}, обновлено: ${r.updated}${r.skipped ? `, пропущено: ${r.skipped}` : ''}`;
