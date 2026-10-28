import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { ExportMenu } from '@/components/ExportMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn, GHOST } from '@/lib/utils';
import { usePath, useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import type { Dependency, Layout, Scenario, ScenarioPart, Step } from '@/lib/types';
import { DependenciesTable } from './DependenciesTable';
import { reconcile } from './dependencies';
import { ScenarioHistory } from './ScenarioHistory';
import { ScenarioIntents } from './ScenarioIntents';
import { ScenarioPrompts } from './ScenarioPrompts';
import { GlobalTransitions } from './GlobalTransitions';
import { analyzeSteps } from '@/lib/states';
import { StepsTable } from './StepsTable';
import { Card } from './Card';
import { ScenarioPreview } from './ScenarioPreview';
import { canonicalOrder, normalizeEntry, splitLegacySteps } from '@/lib/fsm';
import { StateEditor } from './state-editor/StateEditor';
import { PartPanel, PartTabs } from './PartTabs';

export type ScenarioTab = 'general' | 'intents' | 'prompts' | 'logic' | 'errors' | 'history' | 'preview';

const TABS: { id: ScenarioTab; label: string }[] = [
  { id: 'general', label: 'Общая информация' },
  { id: 'intents', label: 'Интенты' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'logic', label: 'Логика' },
  { id: 'errors', label: 'Ошибки' },
  { id: 'history', label: 'История изменений' },
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
  // Ссылки из истории: ?part=<вкладка>&state=<состояние> открывают нужную вкладку схемы и выделяют состояние
  const [params] = useSearchParams();
  const partParam = params.get('part');
  const stateParam = params.get('state');
  const [activeKey, setActiveKey] = useState(() => (draft.parts.find((p) => p.name === partParam) ?? draft.parts[0]).key!);
  useEffect(() => {
    const found = draft.parts.find((p) => p.name === partParam);
    if (found) setActiveKey(found.key!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partParam, stateParam]);
  const [showPart, setShowPart] = useState(false);
  const { data: ownIntents = [] } = useQuery({ queryKey: ['intents', 'scenario', scenario.id], queryFn: () => api.intents.listByScenario(scenario.id) });
  const { data: allIntents = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });
  const { data: ownPrompts = [] } = useQuery({ queryKey: ['prompts', 'scenario', scenario.id], queryFn: () => api.prompts.listByScenario(scenario.id) });
  const { data: allPrompts = [] } = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId) });
  // В шагах выбираются интенты и промпты, подключённые к сценарию; сохранение само подключает ссылки, поэтому чужие здесь возможны только до первого сохранения
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
  const globalIntents = intents.filter((i) => i.is_global);
  const globalSteps = part.steps.filter((s) => s.kind === 'global');
  const knownStates = useMemo(
    () => [...new Set([...fsm.states, ...Object.keys(part.layout), ...fsm.edges.map((e) => e.to)])],
    [fsm, part.layout],
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
    qc.invalidateQueries({ queryKey: ['history', scenario.id] });
  });

  const setDependencies = (update: (deps: Dependency[]) => Dependency[]) =>
    setDraft((d) => {
      const dependencies = update(d.dependencies);
      return { ...d, dependencies, parts: d.parts.map((p) => ({ ...p, steps: reconcile(dependencies, p.steps) })) };
    });

  const updatePart = (key: string, update: (p: ScenarioPart) => ScenarioPart) =>
    setDraft((d) => ({ ...d, parts: d.parts.map((p) => (p.key === key ? update(p) : p)) }));

  const stepsOf = (kind: Step['kind']) => part.steps.filter((s) => s.kind === kind);
  // Каждый вид строк правится отдельно и не должен терять остальные
  const setKind = (kind: Step['kind'], rows: Step[]) =>
    updatePart(part.key!, (p) => ({ ...p, steps: [...p.steps.filter((s) => s.kind !== kind), ...rows] }));
  const setErrors = (rows: Step[]) => setKind('error', rows);
  const setGlobals = (rows: Step[]) => setKind('global', rows);
  const setTransitions = (rows: Step[], layout?: Layout) =>
    updatePart(part.key!, (p) => ({ ...p, layout: layout ?? p.layout, steps: [...rows, ...p.steps.filter((s) => s.kind !== 'transition')] }));

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

  // Активная вкладка всегда видна в полосе вкладок (на узких экранах она прокручивается)
  useEffect(() => {
    document.getElementById(`tab-${tab}`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  // Колонка содержимого: на вкладках без схемы ограничена по ширине
  const column = 'min-h-0 flex-1 overflow-y-auto';
  const inner = 'px-4 py-4 md:px-8 md:py-5';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b bg-page px-4 pt-3 md:px-8 md:pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Input
            className={cn(GHOST, '-ml-2 h-11 w-full min-w-0 flex-1 max-sm:flex-none rounded-md px-2 text-[26px] font-semibold leading-tight tracking-tight sm:basis-64 md:text-[26px]')}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-label="Название сценария"
            placeholder="Название сценария"
          />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:gap-3">
            <SaveIndicator state={status} />
            <ExportMenu scenarioId={scenario.id} />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Действия со сценарием" className="max-md:size-10" />}>
                <Ellipsis className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> Удалить сценарий
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div
            role="tablist"
            aria-label="Разделы сценария"
            className="-mb-px flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const i = TABS.findIndex((t) => t.id === tab);
              if (i < 0) return;
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
                  'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:px-3.5',
                  tab === t.id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.id === 'general' ? <><span className="sm:hidden">Общее</span><span className="max-sm:hidden">{t.label}</span></> : t.label}
                {counts[t.id] !== undefined && (
                  <span className="rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{counts[t.id]}</span>
                )}
                {t.id === 'logic' && logicHasErrors && <span className="size-2 rounded-full bg-destructive" title="Есть ошибки в таблицах" />}
                {t.id === 'errors' && errorsHaveErrors && <span className="size-2 rounded-full bg-destructive" title="Есть ошибки в таблице" />}
              </Link>
            ))}
          </div>
        </div>
      </header>
      {tab === 'general' && (
        <div className={column}>
          <div className={cn(inner, 'grid min-w-0 gap-4')}>
            <Card title="Описание">
              <Textarea rows={1} className={cn(GHOST, 'min-h-0 resize-none rounded-md')} placeholder="Добавьте описание" aria-label="Описание сценария" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Card>
            <DependenciesTable dependencies={draft.dependencies} entities={entities} onChange={setDependencies} />
          </div>
        </div>
      )}
      {tab === 'intents' && (
        <div className={column}>
          <div className={inner}>
            <ScenarioIntents scenarioId={scenario.id} />
          </div>
        </div>
      )}
      {tab === 'prompts' && (
        <div className={column}>
          <div className={inner}>
            <ScenarioPrompts scenarioId={scenario.id} />
          </div>
        </div>
      )}
      {tab === 'logic' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-8">
          <StateEditor
            key={part.key}
            focusState={stateParam}
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
          {(globalIntents.length > 0 || globalSteps.length > 0) && (
            <GlobalTransitions
              steps={globalSteps}
              intents={globalIntents}
              dependencies={draft.dependencies}
              entities={entities}
              states={knownStates}
              onChange={setGlobals}
            />
          )}
        </div>
      )}
      {tab === 'errors' && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-8">
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
      {tab === 'history' && (
        <div className={column}>
          <div className={inner}>
            <ScenarioHistory scenarioId={scenario.id} />
          </div>
        </div>
      )}
      {tab === 'preview' && (
        <div className={column}>
          <div className="px-4 py-4 md:px-8 md:py-5">
            <ScenarioPreview scenarioId={scenario.id} version={status} />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmPart !== null}
        onOpenChange={(o) => !o && setConfirmPart(null)}
        title={`Удалить вкладку «${confirmPart?.name ?? ''}»?`}
        description="Её состояния и переходы будут удалены. Интенты и промпты останутся подключёнными к сценарию."
        onConfirm={() => { if (confirmPart) removePart(confirmPart.key); setConfirmPart(null); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Удалить сценарий «${scenario.name}»?`}
        description="Интенты и промпты останутся в словаре проекта."
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
