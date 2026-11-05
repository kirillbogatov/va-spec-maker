import { useState } from 'react';
import { DictionaryTransfer } from '@/components/DictionaryTransfer';
import { Plus, X } from 'lucide-react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { ADD_ROW, REMOVE_BTN } from '@/components/DeleteChoiceDialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { api } from '@/lib/api';
import type { Prompt } from '@/lib/types';

type AnswerField = 'full_answers' | 'short_answers';

/** Список вариантов ответа одного вида (полный или короткий). */
function AnswersCard({ title, field, d, patch, empty, note }: {
  title: string;
  field: AnswerField;
  d: Pick<Prompt, AnswerField>;
  patch: (p: Partial<Pick<Prompt, AnswerField>>) => void;
  empty: string;
  note?: string;
}) {
  const items = d[field];
  const [draft, setDraft] = useState('');
  const add = () => {
    if (draft.trim()) patch({ [field]: [...items, draft.trim()] });
    setDraft('');
  };
  return (
    <DictCard title={title}>
      <div className="flex flex-col gap-1.5">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {items.length > 0 && (
          <div className="divide-y divide-input rounded-md border border-input bg-background">
            {items.map((a, i) => (
              <div key={i} className="group flex items-stretch focus-within:bg-muted/50">
                <Textarea
                  rows={1}
                  className="min-h-9 w-full min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-2.5 py-2 font-mono text-[12.5px] leading-5 shadow-none focus-visible:ring-0 max-md:min-h-11 md:text-[12.5px] dark:bg-transparent"
                  aria-label={`${title}, вариант ${i + 1}`}
                  value={a}
                  onChange={(e) => patch({ [field]: items.map((x, j) => (j === i ? e.target.value : x)) })}
                  onBlur={() => !a.trim() && patch({ [field]: items.filter((_, j) => j !== i) })}
                />
                <button
                  type="button"
                  aria-label={`Удалить вариант ${i + 1}`}
                  className={`${REMOVE_BTN} my-auto mr-1 size-7 max-md:size-9 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100`}
                  onClick={() => patch({ [field]: items.filter((_, j) => j !== i) })}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <Plus className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className={`${ADD_ROW} pl-8 font-mono text-[12.5px] placeholder:font-sans placeholder:text-sm md:text-[12.5px]`}
            aria-label={`${title}: добавить вариант`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        {items.length > 1 && <p className="text-[13px] text-muted-foreground">Ассистент выберет один из вариантов.</p>}
        {note && items.length > 0 && <p className="text-[13px] text-muted-foreground">{note}</p>}
      </div>
    </DictCard>
  );
}

/** Словарь промптов проекта: все промпты, включая не подключённые ни к одному сценарию. */
export function PromptsPage({ templates = false }: { templates?: boolean }) {
  const resource = templates ? api.responseTemplates : api.prompts;
  const listKey = templates ? "response-templates" : "prompts";
  const detailKey = templates ? "response-template" : "prompt";
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: [listKey, projectId], queryFn: () => resource.list(projectId) });
  const loaded = useQueries({
    queries: list.map((p) => ({ queryKey: [detailKey, p.id], queryFn: () => resource.get(p.id), gcTime: 0 })),
  });
  const scenariosOf = new Map(list.map((p) => [p.id, p.scenarios]));
  const items = loaded.flatMap((q) => (q.data ? [{ ...q.data, used_by: [], scenarios: scenariosOf.get(q.data.id) ?? [] }] : []));
  const loading = loaded.some((q) => q.isPending);
  // Список слева строится из карточек ['prompt', id]: их тоже обновляем после сохранения
  const refresh = () => {
    qc.invalidateQueries({ queryKey: [listKey] });
    qc.invalidateQueries({ queryKey: [detailKey] });
  };
  const create = useMutation({ mutationFn: (name: string) => resource.createInProject(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => resource.remove(id), onSuccess: refresh });

  return (
    <DictionaryMaster
      kind="prompt"
      listActions={templates ? undefined : <DictionaryTransfer kind="prompts" />}
      mono
      base={templates ? "/templates/responses" : "/lists/prompts"}
      hideUsage={templates}
      items={items}
      loading={loading}
      groupOf={(i) => (i.scenarios.length ? 'Подключены к сценариям' : null)}
      fallbackGroup={templates ? "Шаблоны ответов" : "Не используются"}
      meta={(i) => (i.full_answers.some((a) => a.trim()) ? null : { text: 'пусто', warn: true })}
      usedIn={(i) => i.scenarios}
      subtitle={(i) => i.full_answers.find((a) => a.trim()) ?? ''}
      body={(d, patch) => (
        <div className="space-y-4">
          <AnswersCard
            title="Полный ответ"
            field="full_answers"
            d={d}
            patch={patch}
            empty="Ответа пока нет. Добавьте текст, который произнесёт ассистент."
          />
          <AnswersCard
            title="Короткий ответ"
            field="short_answers"
            d={d}
            patch={patch}
            empty="Если короткий ответ не задан, используется полный ответ."
            note="Если короткий ответ не задан, используется полный ответ."
          />
        </div>
      )}
      emptyText={templates ? "Шаблонов ответов пока нет" : "Промптов пока нет"}
      createTitle="Добавить"
      createDialogTitle={templates ? "Добавить шаблон ответа" : "Добавить промпт"}
      createPrefix={templates ? prefixes.scenarioTemplate : prefixes.prompt}
      deleteTitle={(d) => `Удалить ${templates ? "шаблон ответа" : "промпт"} «${d.name}»?`}
      deleteDescription={(d) =>
        templates ? "Созданные из шаблона промпты сохранятся." : d.scenarios.length
          ? `Промпт подключён к сценариям: ${d.scenarios.map((s) => s.name).join(', ')}. Их строки и состояния останутся без промпта.`
          : 'Строки сценариев, использующие этот промпт, останутся без промпта.'
      }
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        await resource.save(d.id, { name: d.name, full_answers: d.full_answers, short_answers: d.short_answers });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
