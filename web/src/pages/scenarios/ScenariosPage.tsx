import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateDialog } from '@/components/CreateDialog';
import { EmptyDetail, ListHeader, ListItem, MasterDetail, listEmpty, useListFilter } from '@/components/MasterDetail';
import { usePath, useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { api } from '@/lib/api';
import { ScenarioForm, type ScenarioTab } from './ScenarioForm';

function ScenarioEditor({ id, tab }: { id: number; tab: ScenarioTab }) {
  // gcTime: 0 — форма инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['scenario', id], queryFn: () => api.scenarios.get(id), gcTime: 0 });
  if (!data) return null;
  return <ScenarioForm key={id} scenario={data} tab={tab} />;
}

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/** Сценарии по схеме «мастер — деталь»: слева список сценариев, справа выбранный сценарий со вкладками. */
export function ScenariosPage() {
  const { id, tab } = useParams();
  const activeTab: ScenarioTab = tab === 'intents' || tab === 'prompts' || tab === 'logic' || tab === 'errors' || tab === 'history' || tab === 'preview' ? tab : 'general';
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = usePath();
  const [params, setParams] = useSearchParams();
  const [creating, setCreatingState] = useState(params.get('new') === '1');
  // ?new=1 приходит из команды «Создать сценарий» в поиске
  const setCreating = (o: boolean) => {
    setCreatingState(o);
    if (!o && params.has('new')) setParams({}, { replace: true });
  };
  const { data: items = [], isSuccess } = useQuery({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId) });
  const { filtered, search, filtering } = useListFilter(items, 'сценариях');
  const selected = items.find((s) => String(s.id) === id);
  const create = useMutation({
    mutationFn: (name: string) => api.scenarios.create(projectId, name),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['scenarios', projectId] });
      navigate(path(`/scenarios/${s.id}`));
    },
  });

  // На десктопе без выбора открываем первый сценарий, на мобильном остаёмся в списке
  const first = items[0];
  useEffect(() => {
    if (isSuccess && !selected && first && isDesktop()) navigate(path(`/scenarios/${first.id}`), { replace: true });
  }, [isSuccess, selected, first?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <MasterDetail
        flush
        selected={!!selected}
        onBack={() => navigate(path('/scenarios'))}
        list={
          <>
            <ListHeader onCreate={() => setCreating(true)} label="Новый сценарий" />
            {search}
            <ul className="flex-1 overflow-y-auto pb-2">
              {filtered.map((s) => (
                <li key={s.id}>
                  <ListItem to={path(`/scenarios/${s.id}`)}>
                    <span className="block truncate">{s.name}</span>
                  </ListItem>
                </li>
              ))}
              {isSuccess && items.length === 0 && <li className={listEmpty}>Сценариев пока нет</li>}
              {items.length > 0 && filtered.length === 0 && filtering && <li className={listEmpty}>Ничего не найдено</li>}
            </ul>
          </>
        }
      >
        {selected ? (
          <ScenarioEditor id={selected.id} tab={activeTab} />
        ) : !isSuccess ? null : items.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm text-center">
            <p className="text-balance text-base font-medium">Сценариев пока нет</p>
            <Button className="mt-4 h-10 md:h-9" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Новый сценарий
            </Button>
          </div>
        ) : (
          <EmptyDetail text="Выберите сценарий слева" />
        )}
      </MasterDetail>
      <CreateDialog open={creating} onOpenChange={setCreating} title="Новый сценарий" prefix={prefixes.scenario} existingNames={items.map((s) => s.name)} onCreate={(n) => create.mutate(n)} />
    </>
  );
}
