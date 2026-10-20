import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictionaryTable } from '@/components/DictionaryTable';
import { Switch } from '@/components/ui/switch';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { EntityValues } from './EntityValues';

export function EntitiesPage() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const key = ['entities', projectId];
  const { data: items = [] } = useQuery({ queryKey: key, queryFn: () => api.entities.list(projectId) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['intents', projectId] });
  };
  const create = useMutation({ mutationFn: (name: string) => api.entities.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.entities.remove(id, true), onSuccess: refresh });

  return (
    <DictionaryTable
      title="Сущности"
      items={items}
      columns={[
        {
          header: 'Несколько значений',
          className: 'w-44',
          cell: (d, patch) => (
            <label className="flex items-center gap-2 px-1.5 text-sm">
              <Switch checked={d.multiple_values} onCheckedChange={(multiple_values) => patch({ multiple_values })} aria-label="Несколько значений" />
              {d.multiple_values ? 'да' : 'нет'}
            </label>
          ),
        },
        {
          header: 'Значения',
          className: 'w-28',
          cell: (d) => <span className="px-1.5 text-sm text-muted-foreground">{d.values.length}</span>,
        },
      ]}
      expand={{
        render: (d, patch) => <EntityValues values={d.values} onChange={(values) => patch({ values })} />,
      }}
      emptyText="Сущностей пока нет"
      createTitle="Новая сущность"
      deleteTitle={(d) => `Удалить сущность ${d.name}?`}
      deleteDescription={(d) =>
        d.used_by.length ? `Сущность используется в интентах: ${d.used_by.map((i) => i.name).join(', ')}. Из них сущность будет убрана.` : undefined
      }
      onCreate={(n) => create.mutate(n)}
      onSave={async (d) => {
        await api.entities.save(d.id, { name: d.name, description: d.description, multiple_values: d.multiple_values, values: d.values });
        qc.invalidateQueries({ queryKey: key });
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
