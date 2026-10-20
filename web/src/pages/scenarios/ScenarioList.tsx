import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateDialog } from '@/components/CreateDialog';
import { ListHeader, ListItem, listEmpty, useListFilter } from '@/components/MasterDetail';
import { usePath, useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

export function ScenarioList() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const path = usePath();
  const [creating, setCreating] = useState(false);
  const { data: items = [] } = useQuery({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId) });
  const { filtered, search, filtering } = useListFilter(items);
  const create = useMutation({
    mutationFn: (name: string) => api.scenarios.create(projectId, name),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['scenarios', projectId] });
      navigate(path(`/scenarios/${s.id}`));
    },
  });

  return (
    <>
      <ListHeader onCreate={() => setCreating(true)} />
      {search}
      <ul className="flex-1 overflow-y-auto py-2">
        {filtered.map((s) => (
          <li key={s.id}>
            <ListItem to={path(`/scenarios/${s.id}`)} count={s.step_count}>
              <span className="block truncate">{s.name}</span>
            </ListItem>
          </li>
        ))}
        {items.length === 0 && <li className={listEmpty}>Сценариев пока нет</li>}
        {items.length > 0 && filtered.length === 0 && filtering && <li className={listEmpty}>Ничего не найдено</li>}
      </ul>
      <CreateDialog open={creating} onOpenChange={setCreating} title="Новый сценарий" onCreate={(n) => create.mutate(n)} />
    </>
  );
}
