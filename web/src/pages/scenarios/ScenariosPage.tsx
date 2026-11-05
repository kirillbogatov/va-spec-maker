import { ImportScenarioDialog } from './ImportScenarioDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Upload, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateScenarioDialog } from './CreateScenarioDialog';
import { EmptyDetail, ListHeader, ListItem, MasterDetail, listEmpty, useListFilter } from '@/components/MasterDetail';
import { usePath, useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { api, ApiError } from '@/lib/api';
import type { Scenario } from '@/lib/types';
import { ScenarioForm, type ScenarioTab } from './ScenarioForm';

function ScenarioEditor({ id, tab }: { id: number; tab: ScenarioTab }) {
  // gcTime: 0 — форма инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data, error, refetch, isFetching } = useQuery({ queryKey: ['scenario', id], queryFn: () => api.scenarios.get(id), gcTime: 0 });
  if (!data) return error ? (
    <div className="space-y-3 p-4">
      <p role="alert">{error instanceof ApiError && error.status === 404 ? 'Сценарий не найден. Выберите другой сценарий из списка.' : 'Не удалось загрузить сценарий. Попробуйте ещё раз.'}</p>
      <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Загрузка…' : 'Повторить загрузку'}</Button>
    </div>
  ) : <p role="status" className="p-4 text-sm text-muted-foreground">Загрузка сценария…</p>;
  return <ScenarioForm key={id} scenario={data} tab={tab} deleted={error instanceof ApiError && error.status === 404} />;
}

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/** Сценарии по схеме «мастер — деталь»: слева список сценариев, справа выбранный сценарий со вкладками. */
export function ScenariosPage({ templates = false }: { templates?: boolean }) {
  const base = templates ? '/templates/scenarios' : '/scenarios';
  const listKey = templates ? 'scenario-templates' : 'scenarios';
  const { id, tab } = useParams();
  const activeTab: ScenarioTab = tab === 'intents' || tab === 'prompts' || tab === 'logic' || tab === 'preview' || tab === 'history' ? tab : 'general';
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = usePath();
  const [params, setParams] = useSearchParams();
  const [importing, setImporting] = useState(false);
  const [creating, setCreatingState] = useState(params.get('new') === '1');
  // ?new=1 приходит из команды «Создать сценарий» в поиске
  const setCreating = (o: boolean) => {
    setCreatingState(o);
    if (!o && params.has('new')) setParams({}, { replace: true });
  };
  const { data: items = [], isSuccess, isError, isPending, isFetching, refetch } = useQuery({ queryKey: [listKey, projectId], queryFn: () => templates ? api.scenarioTemplates.list(projectId) : api.scenarios.list(projectId) });
  const { data: sources = [] } = useQuery({ queryKey: [templates ? 'scenarios' : 'scenario-templates', projectId], queryFn: () => templates ? api.scenarios.list(projectId) : api.scenarioTemplates.list(projectId) });
  const { filtered, search, filtering } = useListFilter(items, 'сценариях');
  // Удаление в соседней вкладке не должно размонтировать редактор с черновиком.
  const selected = items.find((s) => String(s.id) === id) ?? qc.getQueryData<Scenario>(['scenario', Number(id)]);
  const create = useMutation({
    mutationFn: ({ name, sourceId }: { name: string; sourceId?: number }) => templates ? api.scenarioTemplates.create(projectId, name, sourceId) : api.scenarios.create(projectId, name, sourceId),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: [listKey, projectId] });
      navigate(path(`${base}/${s.id}`));
    },
  });

  // На десктопе без выбора открываем первый сценарий, на мобильном остаёмся в списке
  const first = items[0];
  useEffect(() => {
    if (isSuccess && !id && !selected && first && isDesktop()) navigate(path(`${base}/${first.id}`), { replace: true });
  }, [isSuccess, selected, first?.id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <MasterDetail
        flush
        selected={!!selected || !!id}
        onBack={() => navigate(path(base))}
        list={
          <>
            <ListHeader onCreate={() => setCreating(true)} label={templates ? "Новый шаблон сценария" : "Новый сценарий"} extra={templates ? undefined :
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-10 md:size-8" aria-label="Действия со сценариями" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                <DropdownMenuContent align="start"><DropdownMenuItem onClick={() => setImporting(true)}><Upload className="size-4" /> Импорт сценария</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            } />
            {search}
            <ul className="flex-1 overflow-y-auto pb-2">
              {isPending && <li role="status" className={listEmpty}>Загрузка сценариев…</li>}
              {isError && <li className={listEmpty}>
                <p role="alert">Не удалось загрузить список сценариев.</p>
                <Button variant="outline" className="mt-2" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Загрузка…' : 'Повторить загрузку'}</Button>
              </li>}
              {filtered.map((s) => (
                <li key={s.id}>
                  <ListItem to={path(`${base}/${s.id}`)}>
                    <span className="block truncate">{s.name}</span>
                    {s.description?.trim() && <span className="block truncate text-xs font-normal text-muted-foreground">{s.description.trim().replace(/\s+/g, ' ')}</span>}
                  </ListItem>
                </li>
              ))}
              {isSuccess && items.length === 0 && <li className={listEmpty}>{templates ? "Шаблонов сценариев пока нет" : "Сценариев пока нет"}</li>}
              {items.length > 0 && filtered.length === 0 && filtering && <li className={listEmpty}>Ничего не найдено</li>}
            </ul>
          </>
        }
      >
        {selected || id ? (
          <ScenarioEditor id={selected?.id ?? Number(id)} tab={activeTab} />
        ) : !isSuccess ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">{isError ? 'Список сценариев недоступен. Повторите загрузку в панели списка.' : 'Загрузка сценариев…'}</p>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm text-center">
            <p className="text-balance text-base font-medium">{templates ? "Шаблонов сценариев пока нет" : "Сценариев пока нет"}</p>
            <Button size="action" className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {templates ? "Новый шаблон сценария" : "Новый сценарий"}
            </Button>
          </div>
        ) : (
          <EmptyDetail text="Выберите сценарий слева" />
        )}
      </MasterDetail>
      <ImportScenarioDialog open={importing} onOpenChange={setImporting} projectId={projectId} onDone={(sid) => {
        qc.invalidateQueries();
        navigate(path(`${base}/${sid}`));
      }} />
      <CreateScenarioDialog open={creating} onOpenChange={setCreating} templates={templates} prefix={templates ? prefixes.scenarioTemplate : prefixes.scenario}
        existingNames={items.map(s => s.name)}
        sources={(templates ? [...sources, ...items] : sources).map(s => ({ value: String(s.id), label: s.name, hint: s.description }))}
        onCreate={(name, sourceId) => create.mutateAsync({ name, sourceId })} />
    </>
  );
}
