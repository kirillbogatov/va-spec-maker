import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { Input } from '@/components/ui/input';
import { useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { api } from '@/lib/api';
import { splitTags } from '@/lib/parse';

/** Возможные значения зависимости: список с полем добавления. */
function ValuesList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const items = splitTags(text);
    if (items.length) onChange([...value, ...items]);
    setText('');
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          className="h-10 md:h-9"
          aria-label="Новое значение"
          placeholder="Новое значение"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 md:h-9"
        >
          <Plus className="size-3.5" /> Добавить
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Значений пока нет.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border">
          {value.map((v, i) => (
            <li key={`${v}-${i}`} className="group flex min-h-10 items-center gap-2 px-3 py-1 hover:bg-muted md:min-h-9">
              <span className="min-w-0 flex-1 break-words text-sm">{v}</span>
              <button
                type="button"
                aria-label={`Удалить значение ${v}`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DependenciesPage() {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const key = ['dependency-dictionary', projectId];
  const { data: items = [], isPending } = useQuery({ queryKey: key, queryFn: () => api.dependencyDictionary.list(projectId) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: (name: string) => api.dependencyDictionary.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.dependencyDictionary.remove(id), onSuccess: refresh });

  return (
    <DictionaryMaster
      kind="dependency"
      base="/dependencies"
      items={items}
      loading={isPending}
      meta={(i) => (i.values.length ? null : { text: 'нет значений', warn: true })}
      usedIn={(i) => i.used_by.map((s) => ({ id: s.id, name: s.name }))}
      body={(d, patch) => (
        <DictCard title="Возможные значения" count={d.values.length}>
          <ValuesList value={d.values} onChange={(values) => patch({ values })} />
        </DictCard>
      )}
      emptyText="Зависимостей пока нет"
      createTitle="Новая зависимость"
      createPrefix={prefixes.dependency}
      deleteTitle={(d) => `Удалить зависимость ${d.name}?`}
      deleteDescription={(d) =>
        d.used_by.length ? `Используется в сценариях: ${d.used_by.map((s) => s.name).join(', ')}. В них зависимость останется.` : undefined
      }
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        await api.dependencyDictionary.save(d.id, { name: d.name, values: d.values });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
