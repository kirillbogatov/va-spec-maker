import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { ExportMenu } from '@/components/ExportMenu';
import { Section } from '@/components/Section';
import { cn, GHOST } from '@/lib/utils';
import { usePath, useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import type { Dependency, Layout, Scenario, ScenarioPart, Step } from '@/lib/types';
import { DependenciesTable } from './DependenciesTable';
import { reconcile } from './dependencies';
import { ScenarioEntities } from './ScenarioEntities';
import { ScenarioIntents } from './ScenarioIntents';
import { ScenarioPrompts } from './ScenarioPrompts';
import { analyzeSteps } from '@/lib/states';
import { StepsTable } from './StepsTable';
import { buildChecks, ScenarioChecks } from './ScenarioChecks';
import { ScenarioPreview } from './ScenarioPreview';
import { canonicalOrder, normalizeEntry, splitLegacySteps } from '@/lib/fsm';
import { StateEditor } from './state-editor/StateEditor';
import { PartPanel, PartTabs } from './PartTabs';

export type ScenarioTab = 'general' | 'intents' | 'prompts' | 'logic' | 'errors' | 'preview';

const TABS: { id: ScenarioTab; label: string }[] = [
  { id: 'general', label: 'Общая информация' },
  { id: 'intents', label: 'Интенты' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'logic', label: 'Сценарная логика' },
  { id: 'errors', label: 'Обработка ошибок' },
  { id: 'preview', label: 'Предпросмотр' },
];

type Draft = Pick<Scenario, 'name' | 'description' | 'entities' | 'dependencies' | 'parts'>;

/** Черновик из сохранённого сценария; входное состояние всегда получает имя VA_ACTIVATION. */
function initialDraft(scenario: Scenario): Draft {
  return {
    name: scenario.name,
    description: scenario.description,
    entities: scenario.entities.map((e) => ({ ...e, key: crypto.randomUUID() })),
    dependencies: scenario.dependencies,
    parts: scenario.parts.map((p) => ({
      ...p,
      key: crypto.randomUUID(),
      ...normalizeEntry(splitLegacySteps(p.steps.map((s) => ({ ...s, key: crypto.randomUUID() }))), p.layout ?? {}),
    })),
  };
}

export function ScenarioForm({ scenario, tab }: { scenario: Scenario; tab: ScenarioTab }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = usePath();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(scenario));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Имя хранится вместе с ключом: после удаления вкладки диалог ещё закрывается и не должен потерять заголовок
  const [confirmPart, setConfirmPart] = useState<{ key: string; name: string } | null>(null);
  const [activeKey, setActiveKey] = useState(() => draft.parts[0].key!);
  const [showPart, setShowPart] = useState(false);
  const { data: ownIntents = [] } = useQuery({ queryKey: ['intents', 'scenario', scenario.id], queryFn: () => api.intents.listByScenario(scenario.id) });
  const { data: allIntents = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });
  const { data: ownPrompts = [] } = useQuery({ queryKey: ['prompts', 'scenario', scenario.id], queryFn: () => api.prompts.listByScenario(scenario.id) });
  const { data: allPrompts = [] } = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId) });
  // В шагах выбираются интенты и промпты этого сценария; ссылки на чужие (до привязки) остаются видимыми
  const withUsed = <T extends { id: number }>(own: T[], all: T[], used: (number | null)[]) => [
    ...own,
    ...all.filter((x) => used.includes(x.id) && !own.some((o) => o.id === x.id)),
  ];
  const part = draft.parts.find((p) => p.key === activeKey) ?? draft.parts[0];
  const allSteps = draft.parts.flatMap((p) => p.steps);
  const intents = withUsed(ownIntents, allIntents, allSteps.map((s) => s.intent_id));
  const prompts = withUsed(ownPrompts, allPrompts, [
    ...allSteps.map((s) => s.prompt_id),
    ...draft.parts.flatMap((p) => Object.values(p.layout).map((s) => s.prompt_id ?? null)),
  ]);

  const intentName = (id: number | null) => intents.find((i) => i.id === id)?.name ?? null;
  const analyses = useMemo(
    () => draft.parts.map((p) => analyzeSteps(p.steps, intentName, p.layout)),
    [draft.parts, intents],
  );
  const analysis = analyses[draft.parts.indexOf(part)];
  const transitions = useMemo(() => part.steps.filter((s) => s.kind === 'transition'), [part.steps]);
  const fsm = useMemo(
    () => analyzeSteps(transitions, intentName, part.layout),
    [transitions, part.layout, intents],
  );
  const checks = useMemo(
    () => buildChecks({
      description: draft.description,
      parts: draft.parts.map((p, i) => ({ name: p.name, steps: p.steps, analysis: analyses[i] })),
      intents: ownIntents,
      prompts: ownPrompts,
    }),
    [draft.description, draft.parts, analyses, ownIntents, ownPrompts],
  );
  const counts: Partial<Record<ScenarioTab, number>> = {
    intents: ownIntents.length,
    prompts: ownPrompts.length,
    logic: allSteps.filter((s) => s.kind === 'transition').length,
    errors: allSteps.filter((s) => s.kind === 'error').length,
  };
  const hasIssueErrors = (kind: Step['kind']) =>
    draft.parts.some((p, i) => p.steps.some((s) => s.kind === kind && analyses[i].issues.get(s.key!)?.some((x) => x.level === 'error')));
  const logicHasErrors = hasIssueErrors('transition');
  const errorsHaveErrors = hasIssueErrors('error');

  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.scenarios.save(scenario.id, {
      ...d,
      parts: d.parts.map((p) => ({ ...p, steps: canonicalOrder(p.steps) })),
      entities: d.entities.filter((e) => e.entity_id !== null),
    });
    qc.invalidateQueries({ queryKey: ['scenarios', projectId] });
  });

  const setDependencies = (update: (deps: Dependency[]) => Dependency[]) =>
    setDraft((d) => {
      const dependencies = update(d.dependencies);
      return { ...d, dependencies, parts: d.parts.map((p) => ({ ...p, steps: reconcile(dependencies, p.steps) })) };
    });

  const updatePart = (key: string, update: (p: ScenarioPart) => ScenarioPart) =>
    setDraft((d) => ({ ...d, parts: d.parts.map((p) => (p.key === key ? update(p) : p)) }));

  const stepsOf = (kind: Step['kind']) => part.steps.filter((s) => s.kind === kind);
  const setErrors = (rows: Step[]) => updatePart(part.key!, (p) => ({ ...p, steps: [...p.steps.filter((s) => s.kind === 'transition'), ...rows] }));
  const setTransitions = (rows: Step[], layout?: Layout) =>
    updatePart(part.key!, (p) => ({ ...p, layout: layout ?? p.layout, steps: [...rows, ...p.steps.filter((s) => s.kind === 'error')] }));

  const addPart = () => {
    const key = crypto.randomUUID();
    setDraft((d) => {
      let n = d.parts.length + 1;
      while (d.parts.some((p) => p.name === `Вкладка ${n}`)) n++;
      return { ...d, parts: [...d.parts, { key, name: `Вкладка ${n}`, description: '', steps: [], layout: {} }] };
    });
    setActiveKey(key);
    setShowPart(true);
  };
  const removePart = (key: string) => {
    const i = draft.parts.findIndex((p) => p.key === key);
    const rest = draft.parts.filter((p) => p.key !== key);
    if (!rest.length) return;
    setDraft((d) => ({ ...d, parts: rest }));
    setActiveKey(rest[Math.min(i, rest.length - 1)].key!);
    setShowPart(false);
  };

  const remove = useMutation({
    mutationFn: () => api.scenarios.remove(scenario.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scenarios', projectId] });
      navigate(path('/scenarios'));
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Section>
        <div className="flex items-start gap-4">
          <Input className={cn(GHOST, 'h-10 min-w-0 flex-1 text-lg font-semibold')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Название сценария" placeholder="Название сценария" />
          <div className="flex shrink-0 items-center gap-4">
            <SaveIndicator state={status} />
            <ScenarioChecks scenarioId={scenario.id} checks={checks} />
            <ExportMenu scenarioId={scenario.id} />
            <Button variant="ghost" size="icon" aria-label="Удалить сценарий" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </Section>
      <div
        role="tablist"
        aria-label="Разделы сценария"
        className="flex gap-1 border-b"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const i = TABS.findIndex((t) => t.id === tab);
          const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
          navigate(path(`/scenarios/${scenario.id}/${next.id}`));
          requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
        }}
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            to={path(`/scenarios/${scenario.id}/${t.id}`)}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className={cn(
              '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {counts[t.id] !== undefined && (
              <span className="rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground">{counts[t.id]}</span>
            )}
            {t.id === 'logic' && logicHasErrors && <span className="size-2 rounded-full bg-destructive" title="Есть ошибки в таблицах" />}
            {t.id === 'errors' && errorsHaveErrors && <span className="size-2 rounded-full bg-destructive" title="Есть ошибки в таблице" />}
          </Link>
        ))}
      </div>
      {tab === 'general' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <Section title="Описание">
            <Textarea rows={1} className={cn(GHOST, 'min-h-8')} placeholder="Добавьте описание" aria-label="Описание сценария" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Section>
      <ScenarioEntities value={draft.entities} entities={entities} onChange={(es) => setDraft((d) => ({ ...d, entities: es }))} />
      <DependenciesTable dependencies={draft.dependencies} entities={entities} onChange={setDependencies} />
        </div>
      )}
      {tab === 'intents' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ScenarioIntents scenarioId={scenario.id} />
        </div>
      )}
      {tab === 'prompts' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ScenarioPrompts scenarioId={scenario.id} />
        </div>
      )}
      {tab === 'logic' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <StateEditor
            key={part.key}
            tabs={
              <PartTabs
                parts={draft.parts}
                activeKey={part.key!}
                onSelect={(key) => { setActiveKey(key); setShowPart(true); }}
                onAdd={addPart}
              />
            }
            steps={transitions}
            layout={part.layout}
            analysis={fsm}
            intents={intents}
            prompts={prompts}
            dependencies={draft.dependencies}
            entities={entities}
            onChange={({ steps, layout }) => setTransitions(steps, layout)}
            showPart={showPart}
            onSelectElement={() => setShowPart(false)}
            partPanel={
              <PartPanel
                part={part}
                canRemove={draft.parts.length > 1}
                onChange={(patch) => updatePart(part.key!, (p) => ({ ...p, ...patch }))}
                onRemove={() => setConfirmPart({ key: part.key!, name: part.name })}
                onClose={() => setShowPart(false)}
              />
            }
          />
        </div>
      )}
      {tab === 'errors' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <PartTabs parts={draft.parts} activeKey={part.key!} onSelect={setActiveKey} />
          <StepsTable
            key={`errors-${part.key}`}
            kind="error"
            title="Ошибки"
            steps={stepsOf('error')}
            intents={intents}
            prompts={prompts}
            dependencies={draft.dependencies}
            entities={entities}
            allStates={analysis.states}
            issues={analysis.issues}
            layout={part.layout}
            onChange={setErrors}
          />
        </div>
      )}
      {tab === 'preview' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ScenarioPreview scenarioId={scenario.id} version={status} />
        </div>
      )}
      <ConfirmDialog
        open={confirmPart !== null}
        onOpenChange={(o) => !o && setConfirmPart(null)}
        title={`Удалить вкладку «${confirmPart?.name ?? ''}»?`}
        description="Её состояния и переходы будут удалены. Интенты и промпты сценария останутся."
        onConfirm={() => { if (confirmPart) removePart(confirmPart.key); setConfirmPart(null); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Удалить сценарий «${scenario.name}»?`}
        description="Интенты и промпты этого сценария будут удалены вместе с ним."
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
