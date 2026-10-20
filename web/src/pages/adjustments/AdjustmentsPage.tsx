import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictionaryTable } from '@/components/DictionaryTable';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

export function AdjustmentsPage() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const key = ['adjustments', projectId];
  const { data: items = [] } = useQuery({ queryKey: key, queryFn: () => api.adjustments.list(projectId) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['intents', projectId] });
  };
  const create = useMutation({ mutationFn: (name: string) => api.adjustments.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.adjustments.remove(id, true), onSuccess: refresh });

  return (
    <DictionaryTable
      title="Относительные регулировки"
      items={items}
      emptyText="Регулировок пока нет"
      createTitle="Новая регулировка"
      deleteTitle={(d) => `Удалить регулировку «${d.name}»?`}
      deleteDescription={(d) =>
        d.used_by.length
          ? `Значение используется в интентах: ${d.used_by.map((i) => i.name).join(', ')}. Из них оно будет убрано вместе с примерами запросов.`
          : undefined
      }
      onCreate={(n) => create.mutate(n)}
      onSave={async (d) => {
        await api.adjustments.save(d.id, { name: d.name, description: d.description });
        qc.invalidateQueries({ queryKey: key });
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
