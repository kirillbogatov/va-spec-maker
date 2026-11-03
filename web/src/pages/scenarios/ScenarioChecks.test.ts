import { describe, expect, it } from 'vitest';
import { analyzeSteps } from '@/lib/states';
import type { IntentListItem, PromptListItem, Step } from '@/lib/types';
import { buildChecks } from './ScenarioChecks';

const step = (state: string, next: string, intent_id: number | null = 1): Step => ({
  key: `${state}>${next}`, kind: 'transition', state, intent_id, request_params: '', condition: '', conditions: [], prompt_id: null, system_action: '', next_states: next,
});
const intent = (o: Partial<IntentListItem> = {}): IntentListItem => ({ id: 1, name: 'INT_A', enabled: true, phrase_count: 2, hint: '', scenarios: [], ...o });
const prompt = (o: Partial<PromptListItem> = {}): PromptListItem => ({ id: 1, name: 'PRM_A', has_answer: true, step_count: 1, scenarios: [], hint: '', ...o });
const part = (steps: Step[], layout = {}) => ({ name: 'Основная', steps, analysis: analyzeSteps(steps, () => null, layout) });

describe('buildChecks', () => {
  it('пустой сценарий: ошибка про таблицу переходов раньше предупреждений', () => {
    const checks = buildChecks({ description: '', parts: [part([])], intents: [], prompts: [] });
    expect(checks[0]).toMatchObject({ level: 'error', text: 'В таблице переходов нет ни одной строки' });
    expect(checks.map((c) => c.text)).toContain('Не заполнено описание сценария');
    expect(checks.map((c) => c.text)).toContain('У сценария нет интентов');
  });

  it('включённый интент без фраз — ошибка вкладки «Интенты»', () => {
    const c = buildChecks({ description: 'x', parts: [part([step('ST_A', 'ST_B')])], intents: [intent({ phrase_count: 0 })], prompts: [] });
    expect(c).toContainEqual(expect.objectContaining({ level: 'error', tab: 'intents', text: 'Интент «INT_A» включён, но в нём нет фраз' }));
  });

  it('зависимость без значений и промпты без ответа', () => {
    const c = buildChecks({
      description: 'x', dependencies: [{ name: 'DEP', empty: true }], parts: [part([step('ST_A', 'ST_B')])],
      intents: [intent()], prompts: [prompt({ has_answer: false, step_count: 0 })],
    });
    const texts = c.map((x) => x.text);
    expect(texts).toContain('Зависимость «DEP» без значений');
    expect(texts).toContain('Промпт «PRM_A»: не заполнен полный ответ');
    expect(texts).toContain('Промпт «PRM_A» нигде не используется в таблицах');
  });

  it('при нескольких вкладках замечания логики помечены названием вкладки', () => {
    const c = buildChecks({ description: 'x', parts: [part([]), { ...part([]), name: 'Вторая' }], intents: [intent()], prompts: [] });
    expect(c.map((x) => x.text)).toContain('[Вторая] В таблице переходов нет ни одной строки');
  });
});

describe('готовность интентов и конечных состояний', () => {
  it('учитывает примеры в выбранном режиме', () => {
    const check = (phrase_count: number, pattern_count: number) => buildChecks({
      description: 'x', intentMode: 'patterns', parts: [part([])],
      intents: [intent({ phrase_count, pattern_count })], prompts: [],
    }).filter((c) => c.area === 'intents');
    expect(check(0, 2)).toEqual([]);
    expect(check(2, 0)).toContainEqual(expect.objectContaining({ level: 'error' }));
    expect(check(0, 0)).toContainEqual(expect.objectContaining({ level: 'error' }));
  });
  it('разрешает состояния без исходящих переходов', () => {
    const p = part([step('ST_A', 'ST_B')], {
      ST_A: { x: 0, y: 0, prompt_id: 1 }, ST_B: { x: 0, y: 0, prompt_id: 1 },
    });
    const checks = buildChecks({ description: 'x', parts: [p], intents: [intent()], prompts: [prompt()] });
    expect([...p.analysis.issues.values()].flat().some((i) => i.text.includes('нет исходящих'))).toBe(false);
    expect(checks.filter((c) => c.level !== 'info')).toEqual([]);
  });
});
