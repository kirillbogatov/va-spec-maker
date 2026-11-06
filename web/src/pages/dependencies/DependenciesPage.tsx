import { Textarea } from '@/components/ui/textarea';
import { useRef, useState } from 'react';
import { DictionaryValues } from '@/components/DictionaryValues';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictionaryTransfer } from '@/components/DictionaryTransfer';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { Input } from '@/components/ui/input';
import { useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { api } from '@/lib/api';
import { splitTags } from '@/lib/parse';

type ValueRename = { id: string; from: string; to: string };

/** Значение редактируется по клику; изменения применяются после подтверждения. */
function EditableValue({ value, values, onRename }: { value: string; values: string[]; onRename: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const next = draft.trim();
  const error = !next ? 'Введите значение' : next !== value && values.includes(next) ? 'Такое значение уже есть' : '';
  const commit = () => {
    if (error) return;
    setEditing(false);
    if (next !== value) onRename(next);
  };
  return editing ? (
    <div className="min-w-0 flex-1">
      <Input
        autoFocus
        aria-label={`Значение ${value}`}
        aria-invalid={!!error}
        className="h-10 md:h-9"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
        }}
      />
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  ) : (
    <button
      type="button"
      aria-label={`Редактировать значение ${value}`}
      title="Нажмите, чтобы изменить значение"
      className="min-h-10 min-w-0 flex-1 rounded text-left text-sm break-words hover:text-primary focus-visible:outline-2 focus-visible:outline-ring md:min-h-9"
      onClick={() => { setDraft(value); setEditing(true); }}
    >{value}</button>
  );
}

/** Возможные значения зависимости: список с полем добавления. */
function ValuesList({ value, onChange, onRename }: { value: string[]; onChange: (v: string[]) => void; onRename: (from: string, to: string) => void }) {
  return <DictionaryValues title="Возможные значения" label="Новое значение" empty="Значений пока нет."
    value={value} onChange={onChange} parse={splitTags}
    renderValue={(item) => <EditableValue value={item} values={value} onRename={(next) => onRename(item, next)} />}
    removeLabel={(item) => `Удалить значение ${item}`} />;
}

export function DependenciesPage() {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  // Автосохранение сериализует запросы; уже применённые переименования повторно не отправляем.
  const appliedRenames = useRef(new Set<string>());
  const key = ['dependency-dictionary', projectId];
  const { data: items = [], isPending } = useQuery({ queryKey: key, queryFn: () => api.dependencyDictionary.list(projectId) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: (name: string) => api.dependencyDictionary.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.dependencyDictionary.remove(id), onSuccess: refresh });

  return (
    <DictionaryMaster
      kind="dependency"
      subtitle={(item) => item.description}
      listActions={<DictionaryTransfer kind="dependencies" />}
      base="/dependencies"
      items={items as (typeof items[number] & { valueRenames?: ValueRename[] })[]}
      loading={isPending}
      meta={(i) => (i.values.length ? null : { text: 'нет значений', warn: true })}
      usedIn={(i) => i.used_by.map((s) => ({ id: s.id, name: s.name }))}
      body={(d, patch) => (
        <>
        <DictCard title="Описание"><Textarea rows={1} className="resize-y rounded-md bg-background" aria-label="Описание зависимости" value={d.description} onChange={(event) => patch({ description: event.target.value })} /></DictCard>
          <ValuesList
            value={d.values}
            onChange={(values) => patch({ values })}
            onRename={(from, to) => patch({
              values: d.values.map((v) => v === from ? to : v),
              valueRenames: [...(d.valueRenames ?? []), { id: crypto.randomUUID(), from, to }],
            })}
          />
        </>
      )}
      emptyText="Зависимостей пока нет"
      createTitle="Новая зависимость"
      createDialogTitle="Добавить зависимость"
      createPrefix={prefixes.dependency}
      deleteTitle={(d) => `Удалить зависимость ${d.name}?`}
      deleteDescription={(d) =>
        d.used_by.length ? `Используется в сценариях: ${d.used_by.map((s) => s.name).join(', ')}. В них зависимость останется.` : undefined
      }
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        const renames = (d.valueRenames ?? []).filter((r) => !appliedRenames.current.has(r.id));
        await api.dependencyDictionary.save(d.id, {
          name: d.name, description: d.description ?? '', values: d.values,
          value_renames: renames.map(({ from, to }) => ({ from, to })),
        });
        renames.forEach((r) => appliedRenames.current.add(r.id));
        await Promise.all([
          refresh(),
          qc.invalidateQueries({ queryKey: ['scenario'] }),
          qc.invalidateQueries({ queryKey: ['scenarios', projectId] }),
        ]);
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
