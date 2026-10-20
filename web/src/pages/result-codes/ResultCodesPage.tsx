import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictionaryTable } from '@/components/DictionaryTable';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

export function ResultCodesPage() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const key = ['result-codes', projectId];
  const { data: items = [] } = useQuery({ queryKey: key, queryFn: () => api.resultCodes.list(projectId) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: (name: string) => api.resultCodes.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.resultCodes.remove(id), onSuccess: refresh });

  return (
    <DictionaryTable
      title="Result codes"
      items={items}
      nameHeader="Код"
      emptyText="Кодов пока нет"
      createTitle="Новый result code"
      createPrefix="RESULT_"
      deleteTitle={(d) => `Удалить result code «${d.name}»?`}
      deleteDescription={(d) => (d.used_by.length ? 'В промптах значение останется как текст.' : undefined)}
      onCreate={(n) => create.mutate(n)}
      onSave={async (d) => {
        await api.resultCodes.save(d.id, { name: d.name, description: d.description });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
