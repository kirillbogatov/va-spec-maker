import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddBar } from '@/components/AddBar';
import { ResizableColumns } from '@/components/ResizableColumns';
import { SortHeader, useColumnSort } from '@/components/ColumnSort';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { dictionaryDependencyHint } from '@/lib/optionHints';
import type { ValueRename } from '@/lib/dependencyEdits';
import type { Dependency, DictionaryDependency, EntityListItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Card, ROW } from './Card';
import { DependencyEditor, type DependencyDraft } from './DependencyEditor';

interface Props {
  dependencies: Dependency[];
  entities: EntityListItem[];
  onChange: (update: (deps: Dependency[]) => Dependency[]) => void;
  onDictionarySaved: (record: DictionaryDependency, previousName: string, renames: ValueRename[]) => void;
}
const COLS = 'md:[grid-template-columns:var(--resizable-columns)]';

export function DependenciesTable({ dependencies, entities, onChange, onDictionarySaved }: Props) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const sort = useColumnSort();
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{ ref: string | null; record: DictionaryDependency | null; initial: { name: string; description: string; values: string[] } } | null>(null);
  const { data: dictionary = [] } = useQuery({ queryKey: ['dependency-dictionary', projectId], queryFn: () => api.dependencyDictionary.list(projectId) });
  const recordOf = (d: Dependency) => dictionary.find((r) => r.id === d.dictionary_id || (d.entity_id === null && r.name === d.name));
  const nameOf = (d: Dependency) => recordOf(d)?.name ?? (d.entity_id !== null ? entities.find((e) => e.id === d.entity_id)?.name : d.name) ?? '';
  const descriptionOf = (d: Dependency) => recordOf(d)?.description ?? d.description ?? '';
  const valuesOf = (d: Dependency) => recordOf(d)?.values ?? (d.type === 'bool' ? ['true', 'false'] : d.options);
  const sorted = sort.rows(dependencies, (d, column) => column === 'values' ? valuesOf(d).join(' ') : column === 'description' ? descriptionOf(d) : nameOf(d));
  const connect = (record: DictionaryDependency) => onChange((deps) => [...deps, {
    ref: crypto.randomUUID(), entity_id: null, name: record.name, description: record.description ?? '', dictionary_id: record.id, editable: false,
    type: record.values.length ? 'enum' : 'string', options: record.values,
  }]);
  const open = async (d: Dependency) => {
    if (loading) return;
    setLoading(true);
    try {
      const id = d.dictionary_id ?? recordOf(d)?.id;
      const record = id != null ? await api.dependencyDictionary.get(id) : null;
      setEditor({ ref: d.ref, record, initial: { name: record?.name ?? nameOf(d), description: record?.description ?? descriptionOf(d), values: record?.values ?? valuesOf(d) } });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось загрузить зависимость'); }
    finally { setLoading(false); }
  };
  const save = async (draft: DependencyDraft) => {
    if (!editor) return;
    // Stage renames so swapping two values cannot cascade into a different value.
    const staged = draft.value_renames.map((r) => ({ ...r, temporary: `__rename_${crypto.randomUUID()}__` }));
    const value_renames = [...staged.map((r) => ({ from: r.from, to: r.temporary })), ...staged.map((r) => ({ from: r.temporary, to: r.to }))];
    const record = editor.record
      ? await api.dependencyDictionary.save(editor.record.id, { ...draft, value_renames })
      : await api.dependencyDictionary.create(projectId, draft.name, { description: draft.description, values: draft.values });
    if (editor.record) onDictionarySaved(record, editor.record.name, draft.value_renames);
    else if (editor.ref) onChange((deps) => deps.map((d) => d.ref === editor.ref ? { ...d, entity_id: null, dictionary_id: record.id, editable: false, name: record.name, description: record.description ?? '', type: record.values.length ? 'enum' : 'string', options: record.values } : d));
    else connect(record);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['dependency-dictionary', projectId] }),
      qc.invalidateQueries({ queryKey: ['scenario'] }),
      qc.invalidateQueries({ queryKey: ['scenarios', projectId] }),
    ]);
  };
  const free = dictionary.filter((r) => !dependencies.some((d) => d.dictionary_id === r.id || d.name === r.name));
  return <>
    <ResizableColumns storageKey="scenario-dependencies" columns={['name', 'values', 'description']} initial="minmax(0,220px) minmax(0,1fr) minmax(0,1fr) 32px" trailing="32px">
      <Card flush title="Внешние зависимости" action={<AddBar createLabel="Зависимость" creating={loading} onCreate={() => setEditor({ ref: null, record: null, initial: { name: '', description: '', values: [] } })}
        options={free.map((r) => ({ value: String(r.id), label: r.name, hint: dictionaryDependencyHint(r) }))} connectPlaceholder="Добавить существующую" connectLabel="Добавить существующую зависимость" onConnect={(id) => { const record = free.find((r) => r.id === id); if (record) connect(record); }} />}>
        <div className={cn(ROW, COLS, 'flex flex-wrap items-center border-t-0 py-1 text-xs font-medium text-muted-foreground md:grid')}>
          <SortHeader column="name" sort={sort}>Зависимость</SortHeader><SortHeader column="values" sort={sort}>Значения</SortHeader><SortHeader column="description" sort={sort}>Описание</SortHeader><span />
        </div>
        {sorted.map((d) => <div key={d.ref} role="button" tabIndex={0} aria-label={`Редактировать зависимость ${nameOf(d) || 'без названия'}`} aria-disabled={loading || undefined}
          onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) void open(d); }}
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void open(d); } }}
          className={cn(ROW, COLS, 'cursor-pointer outline-none hover:bg-muted/60 focus-visible:bg-muted/60')}>
          <span className="min-w-0 break-words text-sm">{nameOf(d) || 'Без названия'}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">{valuesOf(d).length ? valuesOf(d).map((value) => <span key={value} className="rounded-md bg-secondary px-2 py-1 text-[13px] text-secondary-foreground">{value}</span>) : <span className="text-sm text-muted-foreground">Нет значений</span>}</div>
          <p className={cn('min-w-0 whitespace-pre-wrap break-words text-sm', !descriptionOf(d).trim() && 'text-muted-foreground')}>{descriptionOf(d) || 'Нет описания'}</p>
          <Button variant="ghost" size="icon" className="max-md:size-10 max-md:justify-self-end" aria-label="Удалить зависимость" onClick={() => onChange((deps) => deps.filter((x) => x.ref !== d.ref))}><X className="size-4" /></Button>
        </div>)}
        {!dependencies.length && <p className="border-t px-4 py-4 text-sm text-muted-foreground">Внешних зависимостей нет</p>}
      </Card>
    </ResizableColumns>
    {editor && <DependencyEditor initial={editor.initial} existing={editor.record} onClose={() => setEditor(null)} onSave={save} />}
  </>;
}
