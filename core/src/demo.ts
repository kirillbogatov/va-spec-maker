import type { App } from './app';

async function call<T = any>(app: App, method: string, url: string, body?: unknown): Promise<T> {
  const r = await app.handle({ method, url, body });
  if (r.status >= 400) throw new Error(`demo seed ${method} ${url}: ${JSON.stringify(r.body)}`);
  return r.body as T;
}

const step = (state: string, next: string, intent_id: number | null) => ({
  kind: 'transition', state, intent_id, any_intent: intent_id === null, request_params: '', condition: '', conditions: [],
  prompt_id: null, system_action: '', next_states: next,
});

/** Демо-проект «умный дом»: один сценарий, сущность, интент, два промпта и схема состояний. */
export async function seedDemo(app: App): Promise<number> {
  const { id: pid } = await call(app, 'POST', '/api/projects', {
    name: 'Демо: умный дом',
    description: 'Пример проекта: управление светом голосом.',
  });
  const { id: room } = await call(app, 'POST', `/api/projects/${pid}/entities`, { name: 'ROOM' });
  await call(app, 'PUT', `/api/entities/${room}`, {
    name: 'ROOM', description: 'Комната', multiple_values: false,
    values: [
      { value: 'kitchen', synonyms: ['кухня', 'на кухне'] },
      { value: 'bedroom', synonyms: ['спальня', 'в спальне'] },
    ],
  });
  const { id: sid } = await call(app, 'POST', `/api/projects/${pid}/scenarios`, { name: 'Управление светом' });
  const { id: on } = await call(app, 'POST', `/api/scenarios/${sid}/intents`, { name: 'LIGHT_ON' });
  await call(app, 'PUT', `/api/intents/${on}`, {
    name: 'LIGHT_ON', enabled: true, comment: '',
    phrases: ['включи свет', 'зажги свет в комнате', 'включи свет на кухне'],
    entities: [{ entity_id: room, required: true }],
  });
  const { id: ask } = await call(app, 'POST', `/api/scenarios/${sid}/prompts`, { name: 'PRM_ASK_ROOM' });
  await call(app, 'PUT', `/api/prompts/${ask}`, { name: 'PRM_ASK_ROOM', full_answers: ['В какой комнате включить свет?'], short_answers: ['В какой?'] });
  const { id: done } = await call(app, 'POST', `/api/scenarios/${sid}/prompts`, { name: 'PRM_DONE' });
  await call(app, 'PUT', `/api/prompts/${done}`, { name: 'PRM_DONE', full_answers: ['Свет включён.'], short_answers: ['Готово.'] });

  const sc = await call(app, 'GET', `/api/scenarios/${sid}`);
  await call(app, 'PUT', `/api/scenarios/${sid}`, {
    ...sc,
    description: 'Пользователь просит включить свет; если комната не названа, ассистент уточняет.',
    entities: [{ entity_id: room, followup_prompt: 'В какой комнате?', required: true, is_array: false }],
    parts: [{
      name: 'Управление светом', description: '',
      steps: [step('START', 'ASK_ROOM', on), step('ASK_ROOM', 'DONE', null)],
      layout: {
        START: { x: 0, y: 0, description: 'Вход в сценарий', prompt_id: null, system_action: '' },
        ASK_ROOM: { x: 280, y: 0, description: 'Уточнение комнаты', prompt_id: ask, system_action: '' },
        DONE: { x: 560, y: 0, description: 'Свет включён', prompt_id: done, system_action: 'Включить свет в выбранной комнате' },
      },
    }],
  });
  return pid;
}
