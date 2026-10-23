export type SpecLang = 'ru' | 'en';

export const parseLang = (v: unknown): SpecLang => (v === 'en' ? 'en' : 'ru');

/** Фиксированные тексты спецификации; всё, что вводит пользователь, не переводится. */
export interface SpecStrings {
  specFrom: (date: string) => string;
  intents: string;
  entities: string;
  prompts: string;
  transitions: string;
  errors: string;
  required: string;
  yes: string;
  no: string;
  anyScenarioIntent: string;
  anyOf: string;
  entityTypes: Record<string, string>;
  from: string;
  to: string;
  intentsHead: string[];
  entitiesHead: string[];
  promptsHead: string[];
  dependenciesHead: string[];
  transitionHead: string[];
  globalHead: string[];
}

export const STRINGS: Record<SpecLang, SpecStrings> = {
  ru: {
    specFrom: (d) => `Спецификация от ${d}`,
    intents: 'Интенты',
    entities: 'Сущности',
    prompts: 'Промпты',
    transitions: 'Переходы между состояниями',
    errors: 'Ошибки',
    required: 'обязательно',
    yes: 'да',
    no: 'нет',
    anyScenarioIntent: 'Любой интент сценария',
    anyOf: 'Любое из:',
    entityTypes: { string: 'Строка', number: 'Число', time: 'Время', date: 'Дата', boolean: 'Логический' },
    from: 'от',
    to: 'до',
    intentsHead: ['Интент', 'Фразы для обучения', 'Сущности'],
    entitiesHead: ['Сущность', 'Тип', 'Значения', 'Несколько значений', 'Уточняющий вопрос'],
    promptsHead: ['Промпт', 'Ответ ассистента'],
    dependenciesHead: ['Сценарий', 'Зависимость', 'Тип', 'Значения'],
    transitionHead: ['Из состояния', 'В состояние', 'Запрос пользователя', 'Условия', 'Действие системы', 'Ответ ассистента'],
    globalHead: ['В состояние', 'Запрос пользователя', 'Условия', 'Действие системы', 'Ответ ассистента'],
  },
  en: {
    specFrom: (d) => `Specification dated ${d}`,
    intents: 'Intents',
    entities: 'Entities',
    prompts: 'Prompts',
    transitions: 'State transitions',
    errors: 'Errors',
    required: 'required',
    yes: 'yes',
    no: 'no',
    anyScenarioIntent: 'Any scenario intent',
    anyOf: 'Any of:',
    entityTypes: { string: 'String', number: 'Number', time: 'Time', date: 'Date', boolean: 'Boolean' },
    from: 'from',
    to: 'to',
    intentsHead: ['Intent', 'Training phrases', 'Entities'],
    entitiesHead: ['Entity', 'Type', 'Values', 'Multiple values', 'Follow-up question'],
    promptsHead: ['Prompt', 'Assistant response'],
    dependenciesHead: ['Scenario', 'Dependency', 'Type', 'Values'],
    transitionHead: ['From state', 'To state', 'User request', 'Conditions', 'System action', 'Assistant response'],
    globalHead: ['To state', 'User request', 'Conditions', 'System action', 'Assistant response'],
  },
};
