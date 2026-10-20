import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictionaryTable } from '@/components/DictionaryTable';
import { TagInput } from '@/components/TagInput';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

export function DependenciesPage() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const key = ['dependency-dictionary', projectId];
  const { data: items = [] } = useQuery({ queryKey: key, queryFn: () => api.dependencyDictionary.list(projectId) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: (name: string) => api.dependencyDictionary.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.dependencyDictionary.remove(id), onSuccess: refresh });

  return (
    <DictionaryTable
      title="Зависимости"
      items={items}
      withDescription={false}
      columns={[
        {
          header: 'Возможные значения',
          cell: (d, patch) => <TagInput value={d.values} onChange={(values) => patch({ values })} placeholder="Значение и Enter" />,
        },
      ]}
      emptyText="Зависимостей пока нет"
      createTitle="Новая зависимость"
      deleteTitle={(d) => `Удалить зависимость ${d.name}?`}
      deleteDescription={(d) =>
        d.used_by.length ? `Используется в сценариях: ${d.used_by.map((s) => s.name).join(', ')}. В них зависимость останется.` : undefined
      }
      onCreate={(n) => create.mutate(n)}
      onSave={async (d) => {
        await api.dependencyDictionary.save(d.id, { name: d.name, values: d.values });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
