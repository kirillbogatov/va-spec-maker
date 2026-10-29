import type { EntityType } from './entityTypes';
import type { ValueItem } from './values';

export interface Project { id: number; name: string; description: string }
export interface ProjectListItem extends Project {
  scenario_count: number; created_at: string;
  intent_count: number; entity_count: number; prompt_count: number; ready_count: number;
}

export type UsedBy = { id: number; name: string; scenario_ids: number[] }[];
export interface EntityListItem extends Entity { value_count: number }
export interface EntityValue { value: string; synonyms: string[] }
export interface Entity {
  id: number; project_id: number; name: string; description: string;
  multiple_values: boolean;
  type: EntityType; range_min: string; range_max: string;
  values: EntityValue[]; used_by: UsedBy;
}

/** Сценарий, к которому подключён интент или промпт. */
export interface ScenarioLink { id: number; name: string }
export interface IntentListItem {
  id: number; name: string; enabled: boolean; phrase_count: number;
  /** Комментарий или первая фраза: краткое описание в списках выбора. */
  hint: string;
  /** Сценарии, к которым подключён интент. */
  scenarios: ScenarioLink[];
  /** Только в списке сценария: глобальный интент срабатывает в любом состоянии. */
  is_global?: boolean;
}
export interface IntentEntity { entity_id: number; required: boolean }
export interface Intent {
  id: number; project_id: number; name: string; enabled: boolean; comment: string; phrases: string[]; patterns: string[]; values: ValueItem[]; entities: IntentEntity[];
}

export interface DictionaryDependency { id: number; name: string; values: string[]; used_by: { id: number; name: string }[] }
/** used_by — сценарии, где ключевое слово стоит в условии строки или находится во фразах подключённого интента. */
export interface Keyword { id: number; project_id: number; name: string; synonyms: string[]; used_by: { id: number; name: string }[] }

export interface PromptListItem {
  id: number; name: string; has_answer: boolean; step_count: number; scenarios: ScenarioLink[];
  /** Первый непустой ответ: краткое описание в списках выбора. */
  hint: string;
}
export interface Prompt {
  id: number; project_id: number; name: string; full_answers: string[];
}

/** Ссылка из записи истории на объект, к которому можно перейти. */
export interface HistoryRef { type: 'intent' | 'prompt' | 'state' | 'part' | 'dependency' | 'error'; name: string; id?: number; part?: string }
/** Запись истории сценария: день (ГГГГ-ММ-ДД) и текст, в котором {0}, {1}… — места для ссылок. */
export interface HistoryEntry { id: number; day: string; text: string; refs: HistoryRef[] }
/** Строка журнала изменений, который ведут вручную. */
export interface ChangelogRow { task: string; author: string; description: string }

export interface ScenarioListItem { id: number; name: string; step_count: number }
export type DependencyType = 'string' | 'enum' | 'bool';
/** Параметр или проверка, от которой зависит запуск сценария. entity_id задан: имя берётся из сущности. */
export interface Dependency {
  ref: string; entity_id: number | null; name: string; type: DependencyType; options: string[];
}
/** Значение зависимости сценария (dep) или значение сущности проекта (entity_id, dep пуст). */
export type ConditionOp = '=' | '!=' | '<' | '>';
/** Условие по ключевому слову (keyword_id): «=» — ключевое слово есть в запросе, «!=» — его нет; значение пустое. */
export interface StepCondition { dep: string; value: string; entity_id?: number; keyword_id?: number; op?: ConditionOp }
/**
 * Строка Transition table (kind = transition), Errors (kind = error) или переход глобального интента
 * из любого состояния (kind = global, state пуст). У ошибки без интента — «по любому интенту».
 */
export interface Step {
  key?: string;
  /** Название правила (у ошибок и глобальных переходов). */
  name?: string;
  kind: 'transition' | 'error' | 'global';
  state: string;
  intent_id: number | null;
  request_params: string;
  condition: string;
  conditions: StepCondition[];
  /** Как объединяются условия: все сразу (по умолчанию) или хотя бы одно. */
  cond_mode?: 'all' | 'any';
  prompt_id: number | null;
  system_action: string;
  next_states: string;
}
/** Сущность сценария; follow-up prompt — уточняющий вопрос, если значение не распознано. */
export interface ScenarioEntity { key?: string; entity_id: number | null; followup_prompt: string; required: boolean; is_array: boolean }
/**
 * Состояние схемы. x и y — устаревшая раскладка (схема раскладывается автоматически);
 * остальное — то, что происходит при входе в состояние: ответ ассистента и действие системы.
 */
export interface StateInfo { x: number; y: number; description?: string; prompt_id?: number | null; system_action?: string }
/** Состояния сценария по имени (в том числе без переходов). */
export type Layout = Record<string, StateInfo>;
/** Вкладка сценария — отдельный подсценарий: свои состояния и переходы, в экспорте — отдельный раздел со своим заголовком. */
export interface ScenarioPart { key?: string; name: string; description: string; steps: Step[]; layout: Layout }
export interface Scenario {
  id: number; project_id: number; name: string; description: string;
  entities: ScenarioEntity[]; dependencies: Dependency[]; parts: ScenarioPart[];
}
