import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DictionaryTransfer } from '@/components/DictionaryTransfer';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { EntityTypeFields } from '@/components/EntityTypeFields';
import { Switch } from '@/components/ui/switch';
import { useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { useScenarioGroups } from '@/hooks/scenarioGroups';
import { api } from '@/lib/api';
import { entityTypeLabel, type EntityKind } from '@/lib/entityTypes';
import type { EntityListItem } from '@/lib/types';
import { EntityValues } from './EntityValues';

function EntityBody({ d, patch }: { d: EntityListItem; patch: (p: Partial<EntityListItem>) => void }) {
  const [pending, setPending] = useState<EntityKind | null>(null);
  const kind: EntityKind = { type: d.type, range_min: d.range_min, range_max: d.range_max };
  const hasData = d.values.length > 0 || !!d.range_min || !!d.range_max;
  const apply = (next: EntityKind) => patch({ ...next, ...(next.type === 'string' ? {} : { values: [] }) });
  // Правка границ данные не теряет; смена типа теряет значения или диапазон
  const change = (next: EntityKind) => (next.type !== d.type && hasData ? setPending(next) : apply(next));
  return (
    <>
      <DictCard title="Тип">
        <EntityTypeFields kind={kind} onChange={change} />
      </DictCard>
      {d.type === 'string' && <EntityValues values={d.values} onChange={(values) => patch({ values })} />}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4">
        <Switch className="mt-0.5" checked={d.multiple_values} onCheckedChange={(multiple_values) => patch({ multiple_values })} aria-label="Можно назвать несколько значений сразу" />
        <span>
          <span className="block text-sm font-semibold">Можно назвать несколько значений сразу</span>
          <span className="block text-[13px] text-muted-foreground">
            {d.multiple_values
              ? 'Включено: «включи свет на кухне и в спальне» передаст оба значения.'
              : 'Выключено: «включи свет на кухне и в спальне» передаст только одно значение.'}
          </span>
        </span>
      </label>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Сменить тип?"
        description="Значения и диапазон, не подходящие новому типу, будут удалены."
        confirmLabel="Сменить тип"
        onConfirm={() => {
          if (pending) apply(pending);
          setPending(null);
        }}
      />
    </>
  );
}

export function EntitiesPage() {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const { nameOf } = useScenarioGroups(projectId);
  const key = ['entities', projectId];
  const { data: items = [], isPending } = useQuery({ queryKey: key, queryFn: () => api.entities.list(projectId) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['intents', projectId] });
  };
  const create = useMutation({ mutationFn: ({ name, kind }: { name: string; kind?: EntityKind }) => api.entities.create(projectId, name, kind), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.entities.remove(id, true), onSuccess: refresh });

  return (
    <DictionaryMaster
      kind="entity"
      listActions={<DictionaryTransfer kind="entities" />}
      mono
      base="/entities"
      items={items}
      loading={isPending}
      meta={(i) => (i.type !== 'string' ? { text: entityTypeLabel(i.type) } : i.values.length ? null : { text: 'нет значений', warn: true })}
      usedIn={(i) => {
        const ids = [...new Set(i.used_by.flatMap((u) => u.scenario_ids))];
        return ids.flatMap((id) => {
          const name = nameOf(id);
          return name ? [{ id, name }] : [];
        });
      }}
      commentKey="description"
      body={(d, patch) => <EntityBody d={d} patch={patch} />}
      emptyText="Сущностей пока нет"
      createTitle="Новая сущность"
      createPrefix={prefixes.entity}
      createWithType
      deleteTitle={(d) => `Удалить сущность ${d.name}?`}
      deleteDescription={(d) =>
        d.used_by.length ? `Сущность используется в интентах: ${d.used_by.map((i) => i.name).join(', ')}. Из них сущность будет убрана.` : undefined
      }
      onCreate={(n, kind) => create.mutateAsync({ name: n, kind })}
      onSave={async (d) => {
        await api.entities.save(d.id, { name: d.name, description: d.description, multiple_values: d.multiple_values, type: d.type, range_min: d.range_min, range_max: d.range_max, values: d.values });
        qc.invalidateQueries({ queryKey: key });
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
