import { applyDependencyRecord, type ValueRename } from '@/lib/dependencyEdits';
import type { DictionaryDependency } from '@/lib/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, X } from 'lucide-react';
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
import { api, ApiError } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { toast } from 'sonner';
import type { Dependency, Layout, Scenario, ScenarioPart, Step } from '@/lib/types';
import { DependenciesTable } from './DependenciesTable';
import { reconcile } from './dependencies';
import { ScenarioChangelog } from './ScenarioChangelog';
import { ScenarioIntents } from './ScenarioIntents';
import { ScenarioPrompts } from './ScenarioPrompts';
import { analyzeSteps } from '@/lib/states';
import { Card } from './Card';
import { ScenarioPreview } from './ScenarioPreview';
import { canonicalOrder, normalizeEntry, splitLegacySteps } from '@/lib/fsm';
import { StateEditor } from './state-editor/StateEditor';
import { PartPanel, PartTabs } from './PartTabs';
import { duplicatePart } from './duplicatePart';
import { CreateScenarioDialog } from './CreateScenarioDialog';
import { waitForSaves } from '@/lib/saveStore';
import { usePrefixes } from '@/lib/prefixes';

export type ScenarioTab = 'general' | 'intents' | 'prompts' | 'logic' | 'history' | 'preview';

const TABS: { id: ScenarioTab; label: string }[] = [
  { id: 'general', label: 'Общая информация' },
  { id: 'intents', label: 'Интенты' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'logic', label: 'Логика' },
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

export function ScenarioForm({ scenario, tab, deleted = false }: { scenario: Scenario; tab: ScenarioTab; deleted?: boolean }) {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = usePath();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(scenario));
  const baseline = useRef(scenario);
  const savedDraft = useRef(draft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [resetKey, setResetKey] = useState(0);
  const [conflict, setConflict] = useState<{ current: Scenario | null } | null>(null);
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    if (deleted) setConflict({ current: null });
  }, [deleted]);
  // Фоновое обновление обновляет чистую форму, но никогда не заменяет черновик.
  useEffect(() => {
    if (draftRef.current !== savedDraft.current || conflict) return;
    if (JSON.stringify(scenario) === JSON.stringify(baseline.current)) return;
    baseline.current = scenario;
    const next = initialDraft(scenario);
    savedDraft.current = next;
    setDraft(next);
    setResetKey((key) => key + 1);
  }, [scenario]);
  const base = scenario.is_template ? '/templates/scenarios' : '/scenarios';
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const { data: templateItems = [] } = useQuery({ queryKey: ['scenario-templates', projectId], queryFn: () => api.scenarioTemplates.list(projectId) });
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
  const [schemeWide, setSchemeWide] = useState(false);
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
  const transitions = useMemo(() => part.steps.filter((s) => s.kind === 'transition'), [part.steps]);
  const fsm = useMemo(
    () => analyzeSteps(transitions, intentName, part.layout),
    [transitions, part.layout, intents],
  );
  const hasIssueErrors = (kind: Step['kind']) =>
    draft.parts.some((p, i) => p.steps.some((s) => s.kind === kind && analyses[i].issues.get(s.key!)?.some((x) => x.level === 'error')));
  const logicHasErrors = hasIssueErrors('transition');

  const saveDraft = async (d: Draft) => {
    if (!d.name.trim()) return;
    try {
      const saved = await api.scenarios.save(scenario.id, {
        ...d,
        parts: d.parts.map((p) => ({ ...p, steps: canonicalOrder(p.steps) })),
        entities: d.entities.filter((e) => e.entity_id !== null),
      }, baseline.current);
      baseline.current = saved;
      savedDraft.current = d;
      // Сервер назначает связь со справочником и право редактирования. Не затираем правки, сделанные во время запроса.
      if (draftRef.current === d && JSON.stringify(d.dependencies) !== JSON.stringify(saved.dependencies)) {
        const next = { ...d, dependencies: saved.dependencies };
        savedDraft.current = next;
        draftRef.current = next;
        setDraft(next);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'edit_conflict') {
        setConflict(e.details as { current: Scenario | null });
      }
      throw e;
    }
    qc.invalidateQueries({ queryKey: [scenario.is_template ? 'scenario-templates' : 'scenarios', projectId] });
    qc.invalidateQueries({ queryKey: ['scenario', scenario.id] });
    qc.invalidateQueries({ queryKey: ['dependency-dictionary', projectId] });
  };
  const status = useAutosave(draft, saveDraft, { enabled: !conflict && !resolving && !deleted, resetKey });

  const resolveConflict = async (keepDraft: boolean) => {
    if (!conflict?.current) return;
    setResolving(true);
    try {
      if (keepDraft) {
        // Если сохранённая версия снова поменялась, проверка вернёт новый конфликт.
        baseline.current = conflict.current;
        await saveDraft(draftRef.current);
      } else {
        const current = await api.scenarios.get(scenario.id);
        baseline.current = current;
        const next = initialDraft(current);
        savedDraft.current = next;
        setDraft(next);
      }
      setConflict(null);
      if (!keepDraft || draftRef.current === savedDraft.current) setResetKey((key) => key + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResolving(false);
    }
  };

  const onDictionarySaved = (record: DictionaryDependency, previousName: string, renames: ValueRename[]) => {
    const clean = draftRef.current === savedDraft.current;
    baseline.current = applyDependencyRecord(baseline.current, record, previousName, renames);
    const next = applyDependencyRecord(draftRef.current, record, previousName, renames);
    savedDraft.current = clean ? next : applyDependencyRecord(savedDraft.current, record, previousName, renames);
    draftRef.current = next;
    setDraft(next);
    if (clean) setResetKey((key) => key + 1);
  };

  const setDependencies = (update: (deps: Dependency[]) => Dependency[]) =>
    setDraft((d) => {
      const dependencies = update(d.dependencies);
      return { ...d, dependencies, parts: d.parts.map((p) => ({ ...p, steps: reconcile(dependencies, p.steps), preconditions: reconcile(dependencies, [{ conditions: p.preconditions ?? [] }])[0].conditions })) };
    });

  const updatePart = (key: string, update: (p: ScenarioPart) => ScenarioPart) =>
    setDraft((d) => ({ ...d, parts: d.parts.map((p) => (p.key === key ? update(p) : p)) }));

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
  const copyPart = () => {
    const copy = duplicatePart(part, draft.parts);
    setDraft((d) => ({ ...d, parts: d.parts.flatMap((p) => p.key === part.key ? [p, copy] : [p]) }));
    setActiveKey(copy.key!);
    setShowPart(true);
    toast.success(`Создана вкладка «${copy.name}»`);
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
      qc.invalidateQueries({ queryKey: [scenario.is_template ? 'scenario-templates' : 'scenarios', projectId] });
      navigate(path(base));
    },
  });

  // Активная вкладка всегда видна в полосе вкладок (на узких экранах она прокручивается)
  useEffect(() => {
    document.getElementById(`tab-${tab}`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  // Колонка содержимого: на вкладках без схемы ограничена по ширине
  const column = 'min-h-0 flex-1 overflow-y-auto';
  const inner = 'mx-auto w-full max-w-[max(70rem,70%)] min-w-0 px-4 py-4 md:px-8 md:py-5';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CreateScenarioDialog open={savingTemplate} onOpenChange={setSavingTemplate} templates prefix={prefixes.scenarioTemplate}
        initialName={templateName} initialSource={scenario.id}
        existingNames={templateItems.map(s => s.name)} sources={[{ value: String(scenario.id), label: draft.name }]}
        onCreate={async (name, sourceId) => {
          await waitForSaves();
          if (conflict || deleted) throw new Error('Сначала разрешите конфликт сохранения сценария.');
          const created = await api.scenarioTemplates.create(projectId, name, sourceId);
          qc.invalidateQueries();
          toast.success('Шаблон сценария создан');
          navigate(path(`/templates/scenarios/${created.id}`));
        }} />
      {conflict && (
        <div role="alert" className="shrink-0 border-b bg-muted px-4 py-3 md:px-8">
          <p className="font-medium">{conflict.current ? 'Сценарий изменён в другой вкладке' : 'Сценарий удалён в другой вкладке'}</p>
          <p className="mt-1 text-sm">Автосохранение приостановлено. Ваш черновик остаётся в редакторе.</p>
          {conflict.current && <p className="mt-1 text-sm break-words">Сохранённая версия: «{conflict.current.name}». {conflict.current.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {conflict.current && <>
              <Button variant="outline" disabled={resolving} onClick={() => void resolveConflict(false)}>Загрузить сохранённую версию</Button>
              <Button disabled={resolving} onClick={() => void resolveConflict(true)}>Сохранить мой черновик поверх</Button>
            </>}
            <Button variant="outline" onClick={() => downloadBlob(new Blob([JSON.stringify({ ...baseline.current, ...draft }, null, 2)], { type: 'application/json' }), `${draft.name || 'scenario'} — черновик.json`)}>Скачать черновик</Button>
          </div>
        </div>
      )}
      <header className="shrink-0 border-b bg-nav px-4 pt-3 md:px-8 md:pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Input
            className={cn(GHOST, '-ml-2 h-10 w-full min-w-0 flex-1 max-sm:flex-none rounded-md px-2 text-xl font-semibold leading-tight tracking-tight sm:basis-64 md:h-9 md:text-xl')}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-label="Название сценария"
          />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:gap-3">
            <SaveIndicator state={status} />
            <ExportMenu scenarioId={scenario.id} />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Действия со сценарием" className="max-md:size-10" />}>
                <Ellipsis className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!scenario.is_template && <DropdownMenuItem onClick={() => { setTemplateName(`${prefixes.scenarioTemplate}${draft.name}`); setSavingTemplate(true); }}>Сохранить как шаблон</DropdownMenuItem>}
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <X className="size-4" /> Удалить сценарий
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div
            role="tablist"
            aria-label="Разделы сценария"
            className="-mb-px flex min-w-0 flex-1 flex-wrap gap-x-1 gap-y-0.5"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const i = TABS.findIndex((t) => t.id === tab);
              if (i < 0) return;
              const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
              navigate(path(`${base}/${scenario.id}/${next.id}`));
              requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
            }}
          >
            {TABS.map((t) => (
              <Link
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                to={path(`${base}/${scenario.id}/${t.id}`)}
                aria-selected={tab === t.id}
                tabIndex={tab === t.id ? 0 : -1}
                className={cn(
                  'flex min-h-10 max-w-full items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:px-3.5',
                  tab === t.id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.id === 'general' ? <><span className="sm:hidden">Общее</span><span className="max-sm:hidden">{t.label}</span></> : t.label}
                {t.id === 'logic' && logicHasErrors && <span className="size-2 rounded-full bg-destructive" title="Есть ошибки в таблицах" />}
              </Link>
            ))}
          </div>
        </div>
      </header>
      {tab === 'general' && (
        <div className={column}>
          <div className={cn(inner, 'grid min-w-0 gap-4')}>
            <Card title="Описание">
              <Textarea id={`scenario-description-${scenario.id}`} rows={1} className="resize-y rounded-md bg-background" aria-label="Описание сценария" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Card>
            <DependenciesTable dependencies={draft.dependencies} entities={entities} onChange={setDependencies} onDictionarySaved={onDictionarySaved} />
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
            wide={schemeWide}
            onWideChange={setSchemeWide}
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
            exportMeta={{ title: draft.name, parts: draft.parts }}
            partPanel={
              <PartPanel
                part={part}
                dependencies={draft.dependencies}
                entities={entities}
                canRemove={draft.parts.length > 1}
                onDuplicate={copyPart}
                onChange={(patch) => updatePart(part.key!, (p) => ({ ...p, ...patch }))}
                onRemove={() => setConfirmPart({ key: part.key!, name: part.name })}
              />
            }
          />
        </div>
      )}
      {tab === 'history' && (
        <div className={column}>
          <div className={cn(inner, 'grid min-w-0 gap-4')}>
            <ScenarioChangelog scenarioId={scenario.id} />
          </div>
        </div>
      )}
      {tab === 'preview' && (
        <div className={column}>
          <div className={inner}>
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
