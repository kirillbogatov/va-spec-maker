import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { Switch } from '@/components/ui/switch';
import { useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import { api } from '@/lib/api';
import { MODE_EMPTY, MODE_TITLE, modeShows, useIntentMode } from '@/lib/intentMode';
import { valuesPatch } from '@/lib/values';
import { EntitiesCell } from './EntitiesCell';
import { PhrasesCell } from './PhrasesCell';

/** Словарь интентов проекта: все интенты, включая не подключённые ни к одному сценарию. */
export function IntentsPage() {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const mode = useIntentMode(projectId);
  const shownValues = (i: { values: { text: string; kind: 'phrase' | 'pattern' }[] }) => i.values.filter((v) => modeShows(mode, v.kind));
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });
  const loaded = useQueries({
    queries: list.map((i) => ({ queryKey: ['intent', i.id], queryFn: () => api.intents.get(i.id), gcTime: 0 })),
  });
  const scenariosOf = new Map(list.map((i) => [i.id, i.scenarios]));
  const items = loaded.flatMap((q) => (q.data ? [{ ...q.data, used_by: [], scenarios: scenariosOf.get(q.data.id) ?? [] }] : []));
  const loading = loaded.some((q) => q.isPending);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['intents'] });
    qc.invalidateQueries({ queryKey: ['entities'] });
  };
  const create = useMutation({ mutationFn: (name: string) => api.intents.createInProject(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.intents.remove(id), onSuccess: refresh });

  return (
    <DictionaryMaster
      kind="intent"
      mono
      base="/lists/intents"
      items={items}
      loading={loading}
      groupOf={(i) => (i.scenarios.length ? 'Подключены к сценариям' : null)}
      fallbackGroup="Не используются"
      meta={(i) => (shownValues(i).length ? null : { text: MODE_EMPTY[mode], warn: true })}
      usedIn={(i) => i.scenarios}
      commentKey="comment"
      subtitle={(i) => i.comment?.trim() || shownValues(i).find((x) => x.text.trim())?.text || ''}
      headerExtra={(d, patch) => (
        <label className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground md:min-h-8">
          Включён
          <Switch checked={d.enabled} onCheckedChange={(enabled) => patch({ enabled })} aria-label="Интент включён" />
        </label>
      )}
      body={(d, patch) => {
        const owners = new Map<string, string>();
        for (const e of d.entities) {
          const ent = entities.find((x) => x.id === e.entity_id);
          for (const w of ent?.values.flatMap((v) => [v.value, ...v.synonyms]) ?? []) {
            const key = w.trim().toLowerCase();
            const names = owners.get(key)?.split(', ') ?? [];
            if (!names.includes(ent!.name)) owners.set(key, [...names, ent!.name].join(', '));
          }
        }
        const words = [...owners.keys()];
        const entityNames = d.entities.flatMap((e) => entities.find((x) => x.id === e.entity_id)?.name ?? []);
        return (
          <>
            <DictCard title={MODE_TITLE[mode]} count={d.values.filter((v) => modeShows(mode, v.kind)).length}>
              <PhrasesCell
                mode={mode}
                value={d.values}
                highlight={words}
                entityNames={entityNames}
                owners={owners}
                onChange={(items) => patch(valuesPatch(items))}
              />
            </DictCard>
            <DictCard title="Сущности в интенте" count={d.entities.length}>
              <EntitiesCell value={d.entities} entities={entities} onChange={(e) => patch({ entities: e })} />
            </DictCard>
          </>
        );
      }}
      emptyText="Интентов пока нет"
      createTitle="Новый интент"
      createPrefix={prefixes.intent}
      deleteTitle={(d) => `Удалить интент «${d.name}»?`}
      deleteDescription={(d) =>
        d.scenarios.length
          ? `Интент подключён к сценариям: ${d.scenarios.map((s) => s.name).join(', ')}. Их шаги останутся без интента, глобальные переходы будут удалены.`
          : 'Шаги сценариев, использующие этот интент, останутся без интента.'
      }
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        const { id: _id, project_id: _pid, used_by: _u, scenarios: _s, ...body } = d;
        await api.intents.save(d.id, body);
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
