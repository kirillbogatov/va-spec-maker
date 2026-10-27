import { Plus, X } from 'lucide-react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictionaryTransfer } from '@/components/DictionaryTransfer';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { Textarea } from '@/components/ui/textarea';
import { useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { api } from '@/lib/api';

/** Словарь промптов проекта: все промпты, включая не подключённые ни к одному сценарию. */
export function PromptsPage() {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId) });
  const loaded = useQueries({
    queries: list.map((p) => ({ queryKey: ['prompt', p.id], queryFn: () => api.prompts.get(p.id), gcTime: 0 })),
  });
  const scenariosOf = new Map(list.map((p) => [p.id, p.scenarios]));
  const items = loaded.flatMap((q) => (q.data ? [{ ...q.data, used_by: [], scenarios: scenariosOf.get(q.data.id) ?? [] }] : []));
  const loading = loaded.some((q) => q.isPending);
  const refresh = () => qc.invalidateQueries({ queryKey: ['prompts'] });
  const create = useMutation({ mutationFn: (name: string) => api.prompts.createInProject(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.prompts.remove(id), onSuccess: refresh });

  return (
    <DictionaryMaster
      kind="prompt"
      listActions={<DictionaryTransfer kind="prompts" />}
      mono
      base="/lists/prompts"
      items={items}
      loading={loading}
      groupOf={(i) => (i.scenarios.length ? 'Подключены к сценариям' : null)}
      fallbackGroup="Не используются"
      meta={(i) => (i.full_answers.some((a) => a.trim()) ? null : { text: 'пусто', warn: true })}
      usedIn={(i) => i.scenarios}
      subtitle={(i) => i.full_answers.find((a) => a.trim()) ?? ''}
      body={(d, patch) => (
        <DictCard
          title="Ответ ассистента"
          count={d.full_answers.length}
          action={
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-brand hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:h-8"
              onClick={() => patch({ full_answers: [...d.full_answers, ''] })}
            >
              <Plus className="size-3.5" /> Добавить вариант
            </button>
          }
        >
          <div className="space-y-3">
            {d.full_answers.length === 0 && (
              <p className="text-sm text-muted-foreground">Ответа пока нет. Добавьте текст, который произнесёт ассистент.</p>
            )}
            {d.full_answers.map((a, i) => (
              <div key={i} className="group relative">
                {d.full_answers.length > 1 && <span className="mb-1 block text-[13px] text-muted-foreground">Вариант {i + 1}</span>}
                <Textarea
                  rows={2}
                  className="min-h-16 resize-none rounded-md px-3 py-2 pr-10 text-[15px] leading-6 md:text-[15px]"
                  aria-label={`Ответ ассистента, вариант ${i + 1}`}
                  placeholder="Устанавливаю температуру на Х градусов"
                  value={a}
                  onChange={(e) => patch({ full_answers: d.full_answers.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button
                  type="button"
                  aria-label={`Удалить вариант ${i + 1}`}
                  className={`absolute right-1 inline-flex size-8 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 ${d.full_answers.length > 1 ? 'top-6' : 'top-1'}`}
                  onClick={() => patch({ full_answers: d.full_answers.filter((_, j) => j !== i) })}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {d.full_answers.length > 1 && <p className="text-[13px] text-muted-foreground">Ассистент выберет один из вариантов.</p>}
          </div>
        </DictCard>
      )}
      emptyText="Промптов пока нет"
      createTitle="Новый промпт"
      createPrefix={prefixes.prompt}
      deleteTitle={(d) => `Удалить промпт «${d.name}»?`}
      deleteDescription={(d) =>
        d.scenarios.length
          ? `Промпт подключён к сценариям: ${d.scenarios.map((s) => s.name).join(', ')}. Их строки и состояния останутся без промпта.`
          : 'Строки сценариев, использующие этот промпт, останутся без промпта.'
      }
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        await api.prompts.save(d.id, { name: d.name, full_answers: d.full_answers });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
