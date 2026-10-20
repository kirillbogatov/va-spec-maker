import type {
  Adjustment, AdjustmentListItem, DictionaryDependency, Entity, EntityListItem, EntityValue, Intent, IntentListItem, Project, Prompt, PromptListItem, ResultCode, ResultCodeListItem, Scenario, ScenarioListItem,
} from './types';

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
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new ApiError(res.status, j.error ?? 'error', j.message ?? res.statusText, j.details);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  projects: {
    list: () => req<Project[]>('GET', '/api/projects'),
  },
  entities: {
    list: (pid: number) => req<EntityListItem[]>('GET', `/api/projects/${pid}/entities`),
    get: (id: number) => req<Entity>('GET', `/api/entities/${id}`),
    create: (pid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/projects/${pid}/entities`, { name }),
    save: (
      id: number,
      body: { name: string; description: string; multiple_values: boolean; values: EntityValue[] },
    ) =>
      req<Entity>('PUT', `/api/entities/${id}`, body),
    remove: (id: number, force = false) => req<void>('DELETE', `/api/entities/${id}${force ? '?force=1' : ''}`),
  },
  intents: {
    list: (pid: number) => req<IntentListItem[]>('GET', `/api/projects/${pid}/intents`),
    listByScenario: (sid: number) => req<IntentListItem[]>('GET', `/api/scenarios/${sid}/intents`),
    get: (id: number) => req<Intent>('GET', `/api/intents/${id}`),
    create: (sid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/scenarios/${sid}/intents`, { name }),
    save: (id: number, body: Omit<Intent, 'id' | 'project_id'>) => req<Intent>('PUT', `/api/intents/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/intents/${id}`),
  },
  adjustments: {
    list: (pid: number) => req<AdjustmentListItem[]>('GET', `/api/projects/${pid}/relative-adjustments`),
    get: (id: number) => req<Adjustment>('GET', `/api/relative-adjustments/${id}`),
    create: (pid: number, name: string) =>
      req<{ id: number; name: string }>('POST', `/api/projects/${pid}/relative-adjustments`, { name }),
    save: (id: number, body: { name: string; description: string }) =>
      req<Adjustment>('PUT', `/api/relative-adjustments/${id}`, body),
    remove: (id: number, force = false) => req<void>('DELETE', `/api/relative-adjustments/${id}${force ? '?force=1' : ''}`),
  },
  resultCodes: {
    list: (pid: number) => req<ResultCodeListItem[]>('GET', `/api/projects/${pid}/result-codes`),
    get: (id: number) => req<ResultCode>('GET', `/api/result-codes/${id}`),
    create: (pid: number, name: string) =>
      req<{ id: number; name: string }>('POST', `/api/projects/${pid}/result-codes`, { name }),
    save: (id: number, body: { name: string; description: string }) =>
      req<ResultCode>('PUT', `/api/result-codes/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/result-codes/${id}`),
  },
  dependencyDictionary: {
    list: (pid: number) => req<DictionaryDependency[]>('GET', `/api/projects/${pid}/dependency-dictionary`),
    get: (id: number) => req<DictionaryDependency>('GET', `/api/dependency-dictionary/${id}`),
    create: (pid: number, name: string) =>
      req<DictionaryDependency>('POST', `/api/projects/${pid}/dependency-dictionary`, { name }),
    save: (id: number, body: { name: string; values: string[] }) =>
      req<DictionaryDependency>('PUT', `/api/dependency-dictionary/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/dependency-dictionary/${id}`),
  },
  prompts: {
    list: (pid: number) => req<PromptListItem[]>('GET', `/api/projects/${pid}/prompts`),
    listByScenario: (sid: number) => req<PromptListItem[]>('GET', `/api/scenarios/${sid}/prompts`),
    get: (id: number) => req<Prompt>('GET', `/api/prompts/${id}`),
    create: (sid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/scenarios/${sid}/prompts`, { name }),
    save: (id: number, body: Omit<Prompt, 'id' | 'project_id'>) => req<Prompt>('PUT', `/api/prompts/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/prompts/${id}`),
  },
  scenarios: {
    list: (pid: number) => req<ScenarioListItem[]>('GET', `/api/projects/${pid}/scenarios`),
    get: (id: number) => req<Scenario>('GET', `/api/scenarios/${id}`),
    create: (pid: number, name: string) => req<{ id: number; name: string }>('POST', `/api/projects/${pid}/scenarios`, { name }),
    save: (id: number, body: Omit<Scenario, 'id' | 'project_id'>) => req<Scenario>('PUT', `/api/scenarios/${id}`, body),
    remove: (id: number) => req<void>('DELETE', `/api/scenarios/${id}`),
  },
  exportUrl: (scenarioId: number, format: 'md' | 'docx') => `/api/scenarios/${scenarioId}/export?format=${format}`,
  projectExportUrl: (projectId: number, format: 'md' | 'docx') => `/api/projects/${projectId}/export?format=${format}`,
  backupUrl: '/api/backup',
  preview: async (scenarioId: number): Promise<string> => {
    const res = await fetch(`/api/scenarios/${scenarioId}/preview`);
    if (!res.ok) throw new ApiError(res.status, 'error', res.statusText);
    return res.text();
  },
};
