import type {
  ChangelogRow, DictionaryDependency, Entity, HistoryEntry, EntityListItem, EntityValue, Intent, IntentListItem, Keyword, Project, ProjectListItem, Prompt, PromptListItem, Scenario, ScenarioListItem,
} from './types';
import type { EntityKind } from './entityTypes';
import type { IntentMode } from './intentMode';
import type { SpecLang } from './specLang';

import { request } from './backend';
import { downloadResponse } from './download';
import { markScenarioEdited } from './scenarioEdits';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await request(method, url, body);
  if (r.status >= 400) {
    const j = (r.body ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiError(r.status, j.error ?? 'error', j.message ?? 'Ошибка', j.details);
  }
  if (method !== 'GET') {
    const sid = url.match(/^\/api\/scenarios\/(\d+)(?:\/|$)/)?.[1];
    if (sid && !(method === 'DELETE' && url === `/api/scenarios/${sid}`)) markScenarioEdited(Number(sid));
  }
  return (r.status === 204 ? undefined : r.body) as T;
}

export const api = {
  projects: {
    list: () => req<ProjectListItem[]>('GET', '/api/projects'),
    create: (name: string, description = '') => req<{ id: number; name: string }>('POST', '/api/projects', { name, description }),
    rename: (id: number, body: { name: string; description: string }) => req<Project>('PATCH', `/api/projects/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/projects/${id}`),
    duplicate: (id: number) => req<{ id: number; name: string }>('POST', `/api/projects/${id}/duplicate`),
    dump: (id: number) => req<unknown>('GET', `/api/projects/${id}/dump`),
    import: (dump: unknown) => req<{ id: number; name: string }>('POST', '/api/projects/import', dump),
  },
  entities: {
    list: (pid: number) => req<EntityListItem[]>('GET', `/api/projects/${pid}/entities`),
    get: (id: number) => req<Entity>('GET', `/api/entities/${id}`),
    create: (pid: number, name: string, kind?: EntityKind) =>
      req<{ id: number; name: string }>('POST', `/api/projects/${pid}/entities`, { name, ...kind }),
    save: (
      id: number,
      body: { name: string; description: string; multiple_values: boolean; values: EntityValue[] } & EntityKind,
    ) =>
      req<Entity>('PUT', `/api/entities/${id}`, body),
    remove: (id: number, force = false) => req<void>('DELETE', `/api/entities/${id}${force ? '?force=1' : ''}`),
  },
  intents: {
    list: (pid: number) => req<IntentListItem[]>('GET', `/api/projects/${pid}/intents`),
    listByScenario: (sid: number) => req<IntentListItem[]>('GET', `/api/scenarios/${sid}/intents`),
    get: (id: number) => req<Intent>('GET', `/api/intents/${id}`),
    createInProject: (pid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/projects/${pid}/intents`, { name }),
    create: (sid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/scenarios/${sid}/intents`, { name }),
    save: (id: number, body: Omit<Intent, 'id' | 'project_id'>) => req<Intent>('PUT', `/api/intents/${id}`, body),
    connect: (sid: number, iid: number, is_global?: boolean) =>
      req<{ id: number; is_global: boolean }>('PUT', `/api/scenarios/${sid}/intents/${iid}`, is_global === undefined ? {} : { is_global }),
    disconnect: (sid: number, iid: number) => req<void>('DELETE', `/api/scenarios/${sid}/intents/${iid}`),
    remove: (id: number) => req<void>('DELETE', `/api/intents/${id}`),
  },
  dependencyDictionary: {
    list: (pid: number) => req<DictionaryDependency[]>('GET', `/api/projects/${pid}/dependency-dictionary`),
    get: (id: number) => req<DictionaryDependency>('GET', `/api/dependency-dictionary/${id}`),
    create: (pid: number, name: string) =>
      req<DictionaryDependency>('POST', `/api/projects/${pid}/dependency-dictionary`, { name }),
    save: (id: number, body: { name: string; description: string; values: string[] }) =>
      req<DictionaryDependency>('PUT', `/api/dependency-dictionary/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/dependency-dictionary/${id}`),
  },
  keywords: {
    list: (pid: number) => req<Keyword[]>('GET', `/api/projects/${pid}/keywords`),
    create: (pid: number, name: string) => req<Keyword>('POST', `/api/projects/${pid}/keywords`, { name }),
    save: (id: number, body: { name: string; synonyms: string[] }) => req<Keyword>('PUT', `/api/keywords/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/keywords/${id}`),
    import: (pid: number, text: string) => req<{ added: number; updated: number; skipped: number }>('POST', `/api/projects/${pid}/keywords/import`, { text }),
    exportTxt: async (pid: number) => downloadResponse(await request('GET', `/api/projects/${pid}/keywords/export`), 'keywords.txt'),
  },
  prompts: {
    list: (pid: number) => req<PromptListItem[]>('GET', `/api/projects/${pid}/prompts`),
    listByScenario: (sid: number) => req<PromptListItem[]>('GET', `/api/scenarios/${sid}/prompts`),
    get: (id: number) => req<Prompt>('GET', `/api/prompts/${id}`),
    createInProject: (pid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/projects/${pid}/prompts`, { name }),
    create: (sid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/scenarios/${sid}/prompts`, { name }),
    save: (id: number, body: Omit<Prompt, 'id' | 'project_id'>) => req<Prompt>('PUT', `/api/prompts/${id}`, body),
    connect: (sid: number, pid: number) => req<{ id: number }>('PUT', `/api/scenarios/${sid}/prompts/${pid}`, {}),
    disconnect: (sid: number, pid: number) => req<void>('DELETE', `/api/scenarios/${sid}/prompts/${pid}`),
    remove: (id: number) => req<void>('DELETE', `/api/prompts/${id}`),
  },
  scenarios: {
    list: (pid: number) => req<ScenarioListItem[]>('GET', `/api/projects/${pid}/scenarios`),
    get: (id: number) => req<Scenario>('GET', `/api/scenarios/${id}`),
    create: (pid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/projects/${pid}/scenarios`, { name }),
    save: (id: number, body: Omit<Scenario, 'id' | 'project_id'>) => req<Scenario>('PUT', `/api/scenarios/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/scenarios/${id}`),
    history: (id: number) => req<HistoryEntry[]>('GET', `/api/scenarios/${id}/history`),
    changelog: (id: number) => req<ChangelogRow[]>('GET', `/api/scenarios/${id}/changelog`),
    saveChangelog: (id: number, rows: ChangelogRow[]) => req<ChangelogRow[]>('PUT', `/api/scenarios/${id}/changelog`, { rows }),
  },
  exportFile: async (url: string, fallback: string) => downloadResponse(await request('GET', url), fallback),
  preview: (scenarioId: number, lang: SpecLang, intentMode: IntentMode) => req<string>('GET', `/api/scenarios/${scenarioId}/preview?lang=${lang}&intentMode=${intentMode}`),
};
