import { Link } from 'react-router-dom';
import { Check, TriangleAlert } from 'lucide-react';
import { usePath } from '@/hooks/project';
import { cn } from '@/lib/utils';
import { intentValueCount, MODE_EMPTY, type IntentMode } from '@/lib/intentMode';
import { preconditionCoverage } from '@/lib/preconditionCoverage';
import type { Analysis } from '@/lib/states';
import type { Dependency, Entity, IntentListItem, PromptListItem, ScenarioPart } from '@/lib/types';
import type { ScenarioTab } from './ScenarioForm';

export type CheckArea = 'description' | 'intents' | 'prompts' | 'dependencies' | 'logic';
export interface Check { level: 'error' | 'warn' | 'info'; text: string; tab: ScenarioTab; area: CheckArea }

/** Проверка готовности сценария перед экспортом. Замечания по вкладкам помечаются именем вкладки, если их несколько. */
export function buildChecks(p: {
  intentMode?: IntentMode; description: string; dependencies?: { name: string; empty: boolean }[]; parts: (Pick<ScenarioPart, 'name' | 'steps' | 'preconditions' | 'precondition' | 'precond_mode'> & { analysis: Analysis })[]; conditionDependencies?: Dependency[]; entities?: Entity[]; intents: IntentListItem[]; prompts: PromptListItem[];
}): Check[] {
  const out: Check[] = [];
  if (!p.description.trim()) out.push({ level: 'warn', text: 'Не заполнено описание сценария', tab: 'general', area: 'description' });
  if (p.intents.length === 0) out.push({ level: 'warn', text: 'У сценария нет интентов', tab: 'intents', area: 'intents' });
  for (const i of p.intents) {
    if (i.enabled && intentValueCount(i, p.intentMode ?? 'phrases') === 0) out.push({ level: 'error', text: `Интент «${i.name}» включён, но в нём ${MODE_EMPTY[p.intentMode ?? 'phrases']}`, tab: 'intents', area: 'intents' });
  }
  for (const d of p.dependencies ?? []) {
    if (d.empty) out.push({ level: 'warn', text: `Зависимость «${d.name}» без значений`, tab: 'general', area: 'dependencies' });
  }
  for (const pr of p.prompts) {
    if (!pr.has_answer) out.push({ level: 'warn', text: `Промпт «${pr.name}»: не заполнен полный ответ`, tab: 'prompts', area: 'prompts' });
    if (pr.step_count === 0) out.push({ level: 'info', text: `Промпт «${pr.name}» нигде не используется в таблицах`, tab: 'prompts', area: 'prompts' });
  }
  const hasWildcard = p.parts.some((part) => part.steps.some((s) => s.match_any_intent));
  const hasGlobalWildcard = p.parts.some((part) => part.steps.some((s) => s.kind === 'global' && s.match_any_intent));
  const usedIntents = new Set(p.parts.flatMap((x) => x.steps.map((s) => s.intent_id)));
  for (const i of p.intents) {
    if (!hasWildcard && !usedIntents.has(i.id)) out.push({ level: 'info', text: `Интент «${i.name}» не используется в сценарной логике`, tab: 'logic', area: 'logic' });
  }
  const globalUsed = new Set(p.parts.flatMap((x) => x.steps.filter((s) => s.kind === 'global').map((s) => s.intent_id)));
  for (const i of p.intents) {
    if (i.is_global && !hasGlobalWildcard && !globalUsed.has(i.id)) out.push({ level: 'info', text: `У глобального интента «${i.name}» нет глобальных переходов`, tab: 'logic', area: 'logic' });
  }
  for (const part of p.parts) {
    const at = (level: Check['level'], text: string) =>
      out.push({ level, text: p.parts.length > 1 ? `[${part.name}] ${text}` : text, tab: 'logic', area: 'logic' });
    const { analysis } = part;
    const globals = part.steps.filter((s) => s.kind === 'global');
    if (globals.some((s) => s.intent_id === null && !s.match_any_intent)) at('error', 'Есть глобальный переход без интента');
    if (globals.some((s) => !s.next_states.trim())) at('warn', 'У глобального перехода не указано следующее состояние');
    if (!part.steps.some((s) => s.kind === 'transition')) at('error', 'В таблице переходов нет ни одной строки');
    for (const u of analysis.unreachable) at('warn', `Состояние «${u}» недостижимо: на него никто не ссылается`);
    const rows = [...analysis.issues.values()].flat();
    const empty = rows.filter((r) => r.text === 'Не заполнено состояние').length;
    if (empty) at('error', `Строк без состояния: ${empty}`);
    for (const name of analysis.stateIssues.keys()) at('warn', `У состояния «${name}» не выбран ответ ассистента`);
    const clashes = rows.filter((r) => r.text.startsWith('Те же условия')).length;
    if (clashes) at('error', `Переходов с повторяющимися условиями: ${clashes}`);
    const shadowing = rows.filter((r) => r.text.startsWith('Переход без условий стоит не последним')).length;
    if (shadowing) at('warn', `Переходов без условий, перекрывающих следующие: ${shadowing}`);
  }
  for (const issue of preconditionCoverage(p.parts, p.conditionDependencies ?? [], p.entities ?? [])) {
    const part = p.parts[issue.partIndex];
    out.push({ level: 'warn', text: p.parts.length > 1 ? `[${part.name}] ${issue.text}` : issue.text, tab: 'logic', area: 'logic' });
  }
  const order = { error: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export interface Criterion { area: CheckArea; ok: boolean; text: string; problems: Check[]; tab: ScenarioTab }

/** Критерии готовности для панели: критерий выполнен, если по его области нет замечаний уровня error/warn. */
export function buildCriteria(checks: Check[], counts: { intentMode?: IntentMode; intents: number; prompts: number; dependencies: number }): Criterion[] {
  const of = (area: CheckArea) => checks.filter((c) => c.area === area && c.level !== 'info');
  const make = (area: CheckArea, tab: ScenarioTab, ok: string): Criterion => {
    const problems = of(area);
    return { area, ok: problems.length === 0, text: ok, problems, tab };
  };
  return [
    make('description', 'general', 'Описание заполнено'),
    make('intents', 'intents', `Интенты со значениями: ${counts.intents}`),
    make('prompts', 'prompts', `Промпты с ответами: ${counts.prompts}`),
    make('dependencies', 'general', counts.dependencies ? 'Зависимости со значениями' : 'Зависимости не заданы'),
    make('logic', 'logic', 'Сценарная логика без ошибок'),
  ];
}


/** Пилюля статуса в шапке сценария; при замечаниях ведёт на первую вкладку с ними. */
export function ReadinessPill({ scenarioId, criteria }: { scenarioId: number; criteria: Criterion[] }) {
  const path = usePath();
  const failed = criteria.filter((c) => !c.ok);
  const ready = failed.length === 0;
  const title = ready
    ? 'Все проверки пройдены'
    : failed.flatMap((c) => c.problems.slice(0, 2).map((p) => p.text)).slice(0, 6).join('\n');
  return (
    <Link
      to={path(`/scenarios/${scenarioId}/${ready ? 'general' : failed[0].tab}`)}
      title={title}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        ready ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning',
      )}
    >
      {ready ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
      {ready ? <>Готов<span className="max-sm:hidden"> к экспорту</span></> : 'Не готов'}
    </Link>
  );
}
