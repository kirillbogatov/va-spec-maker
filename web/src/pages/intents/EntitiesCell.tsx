import { entityHint } from '@/lib/optionHints';
import { entityTypeLabel, rangeSummary } from '@/lib/entityTypes';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { DictCard } from '@/components/DictionaryMaster';
import { EntityEditor } from '@/components/EntityEditor';
import { SearchSelect } from '@/components/SearchSelect';
import { ResizableColumns } from '@/components/ResizableColumns';
import { SortHeader, useColumnSort } from '@/components/ColumnSort';
import { Button, buttonVariants } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TypeToken } from '@/components/TypeToken';
import type { EntityListItem, IntentEntity } from '@/lib/types';

interface Props {
  title?: string;
  value: IntentEntity[];
  entities: EntityListItem[];
  onChange: (value: IntentEntity[]) => void;
}

const ROW = 'grid grid-cols-[var(--resizable-columns)] items-center gap-x-3 px-4';

function valuesOf(entity: EntityListItem | undefined): string[] {
  if (!entity) return [];
  if (entity.type === 'string') return entity.values.map((v) => v.value);
  if (entity.type === 'boolean') return ['true', 'false'];
  return [[entityTypeLabel(entity.type), rangeSummary(entity)].filter(Boolean).join(', ')];
}

/** Сущности интента: справочные значения и отдельный переключатель обязательности. */
export function EntitiesCell({ title = 'Сущности в интенте', value, entities, onChange }: Props) {
  const [editor, setEditor] = useState<{ entity: EntityListItem | null } | null>(null);
  const sort = useColumnSort();
  const entityOf = (id: number) => entities.find((e) => e.id === id);
  const name = (id: number) => entityOf(id)?.name ?? `#${id}`;
  const options = entities.filter((e) => !value.some((v) => v.entity_id === e.id)).map((e) => ({ value: String(e.id), label: e.name, hint: entityHint(e) }));
  const sorted = sort.rows(value, (e, column) => column === 'required' ? e.required : column === 'values' ? valuesOf(entityOf(e.entity_id)).join(', ') : name(e.entity_id));

  return <>
    <DictCard title={title} action={
      <SearchSelect label="Добавить сущность" placeholder="Добавить" value={null}
        options={options} createLabel="Новая сущность…" onCreate={() => setEditor({ entity: null })}
        className={buttonVariants({ variant: 'outline', size: 'action', className: 'w-auto' })}
        icon={<Plus className="size-3.5" />} showChevron={false} mutedPlaceholder={false}
        onChange={(id) => {
          if (id !== null) onChange([{ entity_id: Number(id), required: false }, ...value]);
        }} />
    }>
      {value.length === 0 ? <p className="text-sm text-muted-foreground">Сущности не добавлены.</p> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <ResizableColumns storageKey="dictionary-intent-entities" columns={['entity', 'values', 'required']}
            initial="minmax(0,220px) minmax(0,1fr) minmax(0,150px) 32px" trailing="32px" className="min-w-[640px]">
            <div role="table" aria-label="Сущности в интенте">
              <div role="row" className={`${ROW} py-1 text-xs font-medium text-muted-foreground`}>
                <SortHeader column="entity" sort={sort}>Сущность</SortHeader>
                <SortHeader column="values" sort={sort}>Значения</SortHeader>
                <SortHeader column="required" sort={sort}>Обязательность</SortHeader>
                <span role="columnheader" aria-label="Действия" />
              </div>
              <div role="rowgroup" className="divide-y divide-border border-t">
                {sorted.map((e) => {
                  const entity = entityOf(e.entity_id);
                  const values = valuesOf(entity);
                  return <div role="row" key={e.entity_id} className={`${ROW} group py-2.5`}>
                    <div role="cell" className="min-w-0">
                      <button type="button" aria-label={`Редактировать сущность ${name(e.entity_id)}`} title="Нажмите, чтобы изменить сущность"
                        className="max-w-full rounded-md text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={!entity} onClick={() => entity && setEditor({ entity })}>
                        <TypeToken kind="entity" className="max-w-full [&>span]:break-all">{name(e.entity_id)}</TypeToken>
                      </button>
                    </div>
                    <div role="cell" className="flex min-w-0 flex-wrap gap-1.5">
                      {values.length ? values.map((v, i) => <span key={`${v}-${i}`}
                        title={entity?.type === 'string' ? entity.values[i]?.synonyms.join(', ') || undefined : undefined}
                        className="max-w-full break-words rounded-md bg-secondary px-2 py-1 text-[13px] text-secondary-foreground [overflow-wrap:anywhere]">{v}</span>)
                        : <span className="text-sm text-muted-foreground">{entity ? 'Нет значений' : 'Сущность недоступна'}</span>}
                    </div>
                    <div role="cell" className="min-w-0">
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm md:min-h-8">
                        <Switch checked={e.required} aria-label={`Обязательность ${name(e.entity_id)}`}
                          onCheckedChange={(required) => onChange(value.map((item) => item.entity_id === e.entity_id ? { ...item, required } : item))} />
                        <span>{e.required ? 'Да' : 'Нет'}</span>
                      </label>
                    </div>
                    <div role="cell">
                      <Button variant="ghost" size="icon" aria-label={`Убрать ${name(e.entity_id)}`}
                        className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
                        onClick={() => onChange(value.filter((item) => item.entity_id !== e.entity_id))}><X className="size-3.5" /></Button>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </ResizableColumns>
        </div>
      )}
    </DictCard>
    {editor && <EntityEditor entity={editor.entity} entities={entities} onClose={() => setEditor(null)}
      onSaved={(saved) => { if (!editor.entity) onChange([{ entity_id: saved.id, required: false }, ...value]); }} />}

  </>;
}
