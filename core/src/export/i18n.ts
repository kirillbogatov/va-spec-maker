export type SpecLang = 'ru' | 'en';

export const parseLang = (v: unknown): SpecLang => (v === 'en' ? 'en' : 'ru');

/** Фиксированные тексты спецификации; всё, что вводит пользователь, не переводится. */
export interface SpecStrings {
  intents: string;
  entities: string;
  dependencies: string;
  prompts: string;
  transitions: string;
  preconditions: string;
  anyPreconditions: string;
  required: string;
  yes: string;
  no: string;
  anyIntent: string;
  anyOf: string;
  conceptPresent: string;
  conceptAbsent: string;
  entityTypes: Record<string, string>;
  from: string;
  to: string;
  intentsHead: string[];
  keywordsHead: string;
  examplePhrasesHead: string;
  entitiesHead: string[];
  promptsHead: string[];
  dependenciesHead: string[];
  transitionHead: string[];
  changelog: string;
  changelogHead: string[];
  changelogProjectHead: string[];
}

export const STRINGS: Record<SpecLang, SpecStrings> = {
  ru: {
    intents: 'Интенты',
    entities: 'Сущности',
    dependencies: 'Внешние зависимости',
    prompts: 'Промпты',
    transitions: 'Переходы между состояниями',
    preconditions: 'Предусловия',
    anyPreconditions: 'Любое условие (ИЛИ)',
    required: 'обязательно',
    yes: 'да',
    no: 'нет',
    anyIntent: 'Любой интент',
    anyOf: 'Любое из:',
    conceptPresent: 'В запросе есть ключевое слово',
    conceptAbsent: 'В запросе нет ключевого слова',
    entityTypes: { string: 'Строка', number: 'Число', time: 'Время', date: 'Дата', boolean: 'Логический' },
    from: 'от',
    to: 'до',
    intentsHead: ['Интент', 'Фразы для обучения', 'Паттерны', 'Сущности'],
    keywordsHead: 'Ключевые слова',
    examplePhrasesHead: 'Фразы для обучения',
    entitiesHead: ['Сущность', 'Тип', 'Значения', 'Несколько значений'],
    promptsHead: ['Промпт', 'Ответ ассистента'],
    dependenciesHead: ['Зависимость', 'Значения', 'Описание'],
    transitionHead: ['Из состояния', 'В состояние', 'Запрос пользователя', 'Условия', 'Действие системы', 'Ответ ассистента'],
    changelog: 'Журнал изменений',
    changelogHead: ['Дата', 'Задача', 'Автор', 'Описание'],
    changelogProjectHead: ['Дата', 'Сценарий', 'Задача', 'Автор', 'Описание'],
  },
  en: {
    intents: 'Intents',
    entities: 'Entities',
    dependencies: 'External dependencies',
    prompts: 'Prompts',
    transitions: 'State transitions',
    preconditions: 'Preconditions',
    anyPreconditions: 'Any condition (OR)',
    required: 'required',
    yes: 'yes',
    no: 'no',
    anyIntent: 'Any intent',
    anyOf: 'Any of:',
    conceptPresent: 'Request has keyword',
    conceptAbsent: 'Request has no keyword',
    entityTypes: { string: 'String', number: 'Number', time: 'Time', date: 'Date', boolean: 'Boolean' },
    from: 'from',
    to: 'to',
    intentsHead: ['Intent', 'Training phrases', 'Patterns', 'Entities'],
    keywordsHead: 'Keywords',
    examplePhrasesHead: 'Example phrases',
    entitiesHead: ['Entity', 'Type', 'Values', 'Multiple values'],
    promptsHead: ['Prompt', 'Assistant response'],
    dependenciesHead: ['Dependency', 'Values', 'Description'],
    transitionHead: ['From state', 'To state', 'User request', 'Conditions', 'System action', 'Assistant response'],
    changelog: 'Change log',
    changelogHead: ['Date', 'Task', 'Author', 'Description'],
    changelogProjectHead: ['Date', 'Scenario', 'Task', 'Author', 'Description'],
  },
};
