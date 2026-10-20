export interface Project { id: number; name: string; description: string }
export interface ProjectListItem extends Project { scenario_count: number; created_at: string }

export type UsedBy = { id: number; name: string; scenario_id: number | null }[];
export interface EntityListItem extends Entity { value_count: number }
export interface EntityValue { value: string; synonyms: string[] }
export interface Entity {
  id: number; project_id: number; name: string; description: string;
  multiple_values: boolean;
  values: EntityValue[]; used_by: { id: number; name: string; scenario_id: number | null }[];
}

export interface IntentListItem { id: number; name: string; enabled: boolean; phrase_count: number; scenario_id: number | null }
export interface IntentEntity { entity_id: number; required: boolean }
export interface Intent {
  id: number; project_id: number; name: string; enabled: boolean; comment: string; phrases: string[]; entities: IntentEntity[];
}

export interface DictionaryDependency { id: number; name: string; values: string[]; used_by: { id: number; name: string }[] }

export interface PromptListItem {
  id: number; name: string; scenario_id: number | null; has_answer: boolean; step_count: number;
}
export interface Prompt {
  id: number; project_id: number; name: string; full_answers: string[]; short_answers: string[];
}

export interface ScenarioListItem { id: number; name: string; step_count: number }
export type DependencyType = 'string' | 'enum' | 'bool';
/** Параметр или проверка, от которой зависит запуск сценария. entity_id задан: имя берётся из сущности. */
export interface Dependency {
  ref: string; entity_id: number | null; name: string; type: DependencyType; options: string[];
}
/** Значение зависимости сценария (dep) или значение сущности проекта (entity_id, dep пуст). */
export type ConditionOp = '=' | '!=' | '<' | '>';
export interface StepCondition { dep: string; value: string; entity_id?: number; op?: ConditionOp }
/** Строка Transition table (kind = transition) или Errors (kind = error). */
export interface Step {
  key?: string;
  kind: 'transition' | 'error';
  state: string;
  intent_id: number | null;
  /** Переход срабатывает по любому интенту сценария; тогда intent_id пуст. */
  any_intent?: boolean;
  request_params: string;
  condition: string;
  conditions: StepCondition[];
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
