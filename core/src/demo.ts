import type { App } from './app';

async function call<T = any>(app: App, method: string, url: string, body?: unknown): Promise<T> {
  const r = await app.handle({ method, url, body });
  if (r.status >= 400) throw new Error(`demo seed ${method} ${url}: ${JSON.stringify(r.body)}`);
  return r.body as T;
}

type Step = Record<string, unknown>;
const base = { request_params: '', condition: '', conditions: [], prompt_id: null, system_action: '' };
type Cond = { dep: string; op: string; value: string } | { entity_id: number; op: string; value: string };
const step = (state: string, next: string, intent_id: number | null, conditions: Cond[] = []): Step => ({
  kind: 'transition', state, intent_id, next_states: next, ...base, conditions,
});
const error = (name: string, state: string, next: string, condition: string, prompt_id: number, system_action = '', conditions: Cond[] = []): Step => ({
  kind: 'error', name, state, intent_id: null, next_states: next, ...base, condition, conditions, prompt_id, system_action,
});
const dep = (ref: string, name: string, type: 'string' | 'enum' | 'bool', options: string[] = []) => ({ ref, entity_id: null, name, type, options });
const entityDep = (ref: string, entity_id: number) => ({ ref, entity_id, name: '', type: 'string', options: [] });
const node = (x: number, y: number, description: string, prompt_id: number | null = null, system_action = '') =>
  ({ x, y, description, prompt_id, system_action });

export const DEMO_NAME = 'Демо: умный дом';

/** Демо-проект «умный дом»: три сценария с сущностями разных типов, общими интентом и промптом, схемами состояний и ошибками. */
export async function seedDemo(app: App): Promise<number> {
  const { id: pid } = await call(app, 'POST', '/api/projects', {
    name: DEMO_NAME,
    description: 'Пример проекта: управление светом, температурой и будильником голосом.',
  });
  const entity = async (
    name: string,
    description: string,
    values: [string, string[]][],
    kind: { type?: string; range_min?: string; range_max?: string } = {},
  ) => {
    const { id } = await call(app, 'POST', `/api/projects/${pid}/entities`, { name, ...kind });
    await call(app, 'PUT', `/api/entities/${id}`, {
      name, description, multiple_values: false, ...kind, values: values.map(([value, synonyms]) => ({ value, synonyms })),
    });
    return id as number;
  };
  const room = await entity('ROOM', 'Комната', [
    ['kitchen', ['кухня', 'на кухне']], ['bedroom', ['спальня', 'в спальне']], ['hall', ['коридор', 'в коридоре']],
  ]);
  const mode = await entity('TEMP_MODE', 'Режим отопления', [
    ['warmer', ['теплее', 'потеплее', 'прибавь']], ['colder', ['холоднее', 'попрохладнее', 'убавь']],
  ]);

  const temp = await entity('TEMP_VALUE', 'Целевая температура', [], { type: 'number', range_min: '15', range_max: '30' });
  const time = await entity('TIME', 'Время', [], { type: 'time', range_min: '05:00', range_max: '23:00' });
  await call(app, 'POST', `/api/projects/${pid}/keywords/import`, {
    text: [
      'ON: включи, включить, запусти, зажги',
      'OFF: выключи, выключить, отключи, выруби, погаси',
      'LIGHT: свет, освещение, лампа',
      'SET: поставь, установи, заведи, задай',
      'WARMER: теплее, потеплее, прибавь',
      'COLDER: холоднее, прохладнее, попрохладнее, убавь',
      'TEMPERATURE: температура, градус',
      'ALARM: будильник, разбуди, буди',
      'CANCEL: отмени, отмена, отменить, стоп, хватит, забудь',
      'ROOM: комната, кухня, спальня, коридор',
      'NUMBER: десять, двадцать, тридцать, шесть, семь',
      'DAYTIME: утро, вечер, день, ночь',
    ].join('\n') + '\n',
  });
  const alarmDate = await entity('ALARM_DATE', 'Дата будильника', [], { type: 'date' });
  const alarmRepeat = await entity('ALARM_REPEAT', 'Повторять будильник', [], { type: 'boolean' });

  // Справочник зависимостей: сценарии подставляют отсюда название и варианты значений.
  for (const [name, values] of [
    ['Режим дома', ['home', 'away', 'night']],
    ['Лампа подключена', ['true', 'false']],
    ['Есть активный будильник', ['true', 'false']],
  ] as [string, string[]][]) {
    const { id } = await call(app, 'POST', `/api/projects/${pid}/dependency-dictionary`, { name });
    await call(app, 'PUT', `/api/dependency-dictionary/${id}`, { name, values });
  }

  // Объекты проекта, которые подключаются сразу к нескольким сценариям.
  const stop = (await call(app, 'POST', `/api/projects/${pid}/intents`, { name: 'STOP' })).id as number;
  await call(app, 'PUT', `/api/intents/${stop}`, {
    name: 'STOP', enabled: true, comment: 'Глобальный интент: срабатывает в любом состоянии сценария.',
    phrases: ['стоп', 'отмена', 'хватит', 'забудь'], entities: [],
  });
  const offline = (await call(app, 'POST', `/api/projects/${pid}/prompts`, { name: 'PRM_ERR_DEVICE' })).id as number;
  await call(app, 'PUT', `/api/prompts/${offline}`, {
    name: 'PRM_ERR_DEVICE', full_answers: ['Устройство не отвечает. Проверьте питание и попробуйте ещё раз.'],
  });
  const useShared = async (sid: number) => {
    await call(app, 'PUT', `/api/scenarios/${sid}/intents/${stop}`, { is_global: true });
    await call(app, 'PUT', `/api/scenarios/${sid}/prompts/${offline}`, {});
  };
  const cancelStep = (): Step => ({ kind: 'global', name: 'Отмена', state: '', intent_id: stop, next_states: 'START', ...base });

  const scenario = async (name: string) => (await call(app, 'POST', `/api/projects/${pid}/scenarios`, { name })).id as number;
  const intent = async (sid: number, name: string, phrases: string[], entities: { entity_id: number; required: boolean }[] = []) => {
    const { id } = await call(app, 'POST', `/api/scenarios/${sid}/intents`, { name });
    await call(app, 'PUT', `/api/intents/${id}`, { name, enabled: true, comment: '', phrases, entities });
    return id as number;
  };
  const prompt = async (sid: number, name: string, full: string[]) => {
    const { id } = await call(app, 'POST', `/api/scenarios/${sid}/prompts`, { name });
    await call(app, 'PUT', `/api/prompts/${id}`, { name, full_answers: full });
    return id as number;
  };
  const fill = async (sid: number, patch: Step) => {
    const sc = await call(app, 'GET', `/api/scenarios/${sid}`);
    await call(app, 'PUT', `/api/scenarios/${sid}`, { ...sc, ...patch });
  };

  // 1. Свет
  const light = await scenario('Управление светом');
  const on = await intent(light, 'LIGHT_ON', ['включи свет', 'зажги свет в комнате', 'включи свет на кухне'], [{ entity_id: room, required: true }]);
  const off = await intent(light, 'LIGHT_OFF', ['выключи свет', 'погаси свет в спальне', 'выруби свет'], [{ entity_id: room, required: false }]);
  const roomAnswer = await intent(light, 'ROOM_ANSWER', ['на кухне', 'в спальне', 'в коридоре'], [{ entity_id: room, required: true }]);
  const askRoom = await prompt(light, 'PRM_ASK_ROOM', ['В какой комнате включить свет?']);
  const lightOn = await prompt(light, 'PRM_LIGHT_ON', ['Свет включён.']);
  const lightOff = await prompt(light, 'PRM_LIGHT_OFF', ['Свет выключен.']);
  const noRoom = await prompt(light, 'PRM_ERR_UNKNOWN_ROOM', ['Не знаю такой комнаты. Назовите кухню, спальню или коридор.']);
  await useShared(light);
  await fill(light, {
    description: 'Пользователь просит включить или выключить свет; если комната не названа, ассистент уточняет.',
    entities: [{ entity_id: room, followup_prompt: 'В какой комнате?', required: true, is_array: false }],
    // Зависимости: данные «снаружи» диалога, от которых зависят переходы.
    dependencies: [dep('home_mode', 'Режим дома', 'enum', ['home', 'away', 'night']), dep('lamp_online', 'Лампа подключена', 'bool'), entityDep('room_dep', room)],
    parts: [{
      name: 'Управление светом', description: '',
      steps: [
        // Ночью свет в спальне не включаем автоматически — сначала уточняем.
        step('START', 'ASK_ROOM', on, [{ dep: 'home_mode', op: '!=', value: 'night' }]),
        step('START', 'ASK_ROOM', on, [{ dep: 'home_mode', op: '=', value: 'night' }, { entity_id: room, op: '=', value: 'bedroom' }]),
        step('START', 'LIGHT_OFF', off),
        step('ASK_ROOM', 'LIGHT_ON', roomAnswer),
        error('Комната не распознана', 'ASK_ROOM', 'ASK_ROOM', 'Комната не распознана', noRoom),
        cancelStep(),
        error('Лампа недоступна', 'LIGHT_ON', 'START', 'Устройство не отвечает', offline, 'Записать сбой устройства в журнал', [{ dep: 'lamp_online', op: '=', value: 'false' }]),
      ],
      layout: {
        START: node(0, 0, 'Вход в сценарий'),
        ASK_ROOM: node(280, 0, 'Уточнение комнаты', askRoom),
        LIGHT_ON: node(560, 0, 'Свет включён', lightOn, 'Включить свет в выбранной комнате'),
        LIGHT_OFF: node(280, 160, 'Свет выключен', lightOff, 'Выключить свет в выбранной комнате'),
      },
    }],
  });

  // 2. Температура
  const climate = await scenario('Температура');
  const setTemp = await intent(climate, 'SET_TEMPERATURE', ['поставь двадцать два градуса', 'установи температуру 24', 'нужно двадцать градусов'], [{ entity_id: room, required: false }]);
  const shift = await intent(climate, 'CHANGE_TEMPERATURE', ['сделай теплее', 'здесь холодно, прибавь', 'сделай попрохладнее'], [{ entity_id: mode, required: true }]);
  const tempAnswer = await intent(climate, 'TEMP_ANSWER', ['двадцать два', 'на двадцать четыре', 'двадцать'], [{ entity_id: temp, required: true }]);
  const askTemp = await prompt(climate, 'PRM_ASK_TEMP', ['Какую температуру установить?']);
  const tempSet = await prompt(climate, 'PRM_TEMP_SET', ['Температура установлена.']);
  const tempShift = await prompt(climate, 'PRM_TEMP_SHIFT', ['Изменила температуру на два градуса.']);
  const badTemp = await prompt(climate, 'PRM_ERR_TEMP_RANGE', ['Могу выставить от пятнадцати до тридцати градусов.']);
  const awayMsg = await prompt(climate, 'PRM_ERR_AWAY', ['Дома никого нет, температуру не меняю.']);
  await useShared(climate);
  await fill(climate, {
    description: 'Пользователь задаёт температуру в комнате или просит сделать теплее/холоднее.',
    dependencies: [dep('home_mode', 'Режим дома', 'enum', ['home', 'away', 'night']), entityDep('temp_dep', temp)],
    entities: [
      { entity_id: mode, followup_prompt: 'Теплее или холоднее?', required: false, is_array: false },
      { entity_id: temp, followup_prompt: 'Какую температуру установить?', required: false, is_array: false },
    ],
    parts: [{
      name: 'Температура', description: '',
      steps: [
        step('START', 'ASK_TEMP', setTemp),
        step('START', 'TEMP_SHIFT', shift),
        step('ASK_TEMP', 'TEMP_SET', tempAnswer),
        error('Температура ниже 15', 'ASK_TEMP', 'ASK_TEMP', 'Значение вне диапазона 15–30 градусов', badTemp, '', [{ entity_id: temp, op: '<', value: '15' }]),
        error('Температура выше 30', 'ASK_TEMP', 'ASK_TEMP', 'Значение вне диапазона 15–30 градусов', badTemp, '', [{ entity_id: temp, op: '>', value: '30' }]),
        // Если дома никого нет, температуру не меняем.
        error('Никого нет дома', 'START', 'START', 'Никого нет дома', awayMsg, '', [{ dep: 'home_mode', op: '=', value: 'away' }]),
        error('Термостат не отвечает при установке', 'TEMP_SET', 'START', 'Термостат не отвечает', offline, 'Повторить запрос к термостату через 10 секунд'),
        error('Термостат не отвечает при изменении', 'TEMP_SHIFT', 'START', 'Термостат не отвечает', offline),
        cancelStep(),
      ],
      layout: {
        START: node(0, 0, 'Вход в сценарий'),
        ASK_TEMP: node(280, 0, 'Уточнение температуры', askTemp),
        TEMP_SET: node(560, 0, 'Температура установлена', tempSet, 'Отправить целевую температуру на термостат'),
        TEMP_SHIFT: node(280, 160, 'Температура изменена', tempShift, 'Изменить целевую температуру на 2 градуса'),
      },
    }],
  });

  // 3. Будильник
  const alarm = await scenario('Будильник');
  const setAlarm = await intent(alarm, 'ALARM_SET', ['разбуди меня в семь утра', 'поставь будильник на 6:30', 'заведи будильник']);
  const cancelAlarm = await intent(alarm, 'ALARM_CANCEL', ['отмени будильник', 'выключи будильник', 'не буди меня']);
  const timeAnswer = await intent(alarm, 'TIME_ANSWER', ['на шесть тридцать', 'в десять вечера', 'в семь'], [{ entity_id: time, required: true }]);
  const askTime = await prompt(alarm, 'PRM_ASK_TIME', ['На какое время поставить будильник?']);
  const alarmSet = await prompt(alarm, 'PRM_ALARM_SET', ['Будильник поставлен.']);
  const alarmOff = await prompt(alarm, 'PRM_ALARM_CANCEL', ['Будильник отменён.']);
  const badTime = await prompt(alarm, 'PRM_ERR_TIME', ['Не поняла время. Скажите, например, «в семь тридцать».']);
  await useShared(alarm);
  const noAlarm = await prompt(alarm, 'PRM_ERR_NO_ALARM', ['У вас нет активных будильников.']);
  await fill(alarm, {
    description: 'Пользователь ставит или отменяет будильник; время уточняется, если не названо.',
    entities: [
      { entity_id: time, followup_prompt: 'На какое время?', required: true, is_array: false },
      { entity_id: alarmDate, followup_prompt: 'На какую дату?', required: false, is_array: false },
      { entity_id: alarmRepeat, followup_prompt: 'Повторять каждый день?', required: false, is_array: false },
    ],
    dependencies: [dep('has_alarm', 'Есть активный будильник', 'bool')],
    parts: [{
      name: 'Будильник', description: '',
      steps: [
        step('START', 'ASK_TIME', setAlarm),
        step('START', 'ALARM_CANCELLED', cancelAlarm, [{ dep: 'has_alarm', op: '=', value: 'true' }]),
        step('ASK_TIME', 'ALARM_SET', timeAnswer),
        error('Время не распознано', 'ASK_TIME', 'ASK_TIME', 'Время не распознано', badTime),
        error('Нет будильников', 'START', 'START', 'Нет активных будильников', noAlarm, '', [{ dep: 'has_alarm', op: '=', value: 'false' }]),
        cancelStep(),
      ],
      layout: {
        START: node(0, 0, 'Вход в сценарий'),
        ASK_TIME: node(280, 0, 'Уточнение времени', askTime),
        ALARM_SET: node(560, 0, 'Будильник поставлен', alarmSet, 'Создать будильник на указанное время'),
        ALARM_CANCELLED: node(280, 160, 'Будильник отменён', alarmOff, 'Удалить ближайший будильник'),
      },
    }],
  });
  // Наполнение демо — не правки пользователя: история сценариев начинается с чистого листа
  for (const sid of [light, climate, alarm]) await call(app, 'DELETE', `/api/scenarios/${sid}/history`);
  return pid;
}
