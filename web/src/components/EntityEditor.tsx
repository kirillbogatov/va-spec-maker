import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EntityBody } from '@/pages/entities/EntitiesPage';
import { api } from '@/lib/api';
import { DEFAULT_KIND, rangeError } from '@/lib/entityTypes';
import { useProjectId } from '@/hooks/project';
import { usePrefixes } from '@/lib/prefixes';
import type { Entity, EntityListItem } from '@/lib/types';
import { DictCard } from './DictionaryMaster';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

/** Полный редактор сущности без ухода со страницы интента. */
export function EntityEditor({ entity, entities, onSaved, onClose }: {
  entity: EntityListItem | null; entities: EntityListItem[]; onSaved: (entity: Entity) => void; onClose: () => void;
}) {
  const projectId = useProjectId();
  const prefix = usePrefixes(projectId).entity;
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EntityListItem>(() => entity ? structuredClone(entity) : {
    ...DEFAULT_KIND, id: -1, project_id: projectId, name: prefix, description: '', multiple_values: false, values: [], used_by: [], value_count: 0,
  });
  const latest = useRef(draft);
  const patch = (next: Partial<EntityListItem>) => { latest.current = { ...latest.current, ...next }; setDraft(latest.current); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // При повторе после ошибки сохранения продолжаем работу с уже созданной записью.
  const createdId = useRef<number | null>(null);
  const duplicate = entities.some((e) => e.id !== entity?.id && e.id !== createdId.current && e.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
  const invalid = !draft.name.trim() || (!entity && draft.name.trim() === prefix.trim()) || duplicate || !!rangeError(draft);
  const save = async () => {
    if (invalid || busy) return;
    setBusy(true); setError('');
    try {
      const current = latest.current;
      const id = entity?.id ?? createdId.current ?? (await api.entities.create(projectId, current.name.trim(), current)).id;
      createdId.current = id;
      const saved = await api.entities.save(id, { name: current.name.trim(), description: current.description,
        type: current.type, range_min: current.range_min, range_max: current.range_max, multiple_values: current.multiple_values,
        values: current.values.filter((v) => v.value.trim()).map((v) => ({ ...v, value: v.value.trim() })),
      });
      await Promise.all([qc.invalidateQueries({ queryKey: ['entities'] }), qc.invalidateQueries({ queryKey: ['intents'] }), qc.invalidateQueries({ queryKey: ['intent'] })]);
      onSaved(saved); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить сущность'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-5 sm:max-w-3xl">
      <DialogHeader className="shrink-0 pb-4 pr-8"><DialogTitle>{entity ? `Сущность ${entity.name}` : 'Добавить сущность'}</DialogTitle></DialogHeader>
      <fieldset disabled={busy} className="min-h-0 space-y-6 overflow-y-auto px-1 pb-1">
        <label className="grid gap-2 text-sm font-medium">Название<Input autoFocus aria-label="Название сущности" value={draft.name} aria-invalid={duplicate} onChange={(e) => patch({ name: e.target.value })} /></label>
        {duplicate && <p role="alert" className="text-sm text-destructive">Элемент с таким названием уже существует</p>}
        <DictCard title="Описание"><Textarea aria-label="Описание сущности" value={draft.description} onChange={(e) => patch({ description: e.target.value })} /></DictCard>
        <EntityBody d={draft} patch={patch} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </fieldset>
      <DialogFooter className="shrink-0 pt-4">
        <Button variant="outline" disabled={busy} onClick={onClose}>Отмена</Button>
        <Button disabled={invalid || busy} onClick={() => void save()}>{busy ? 'Сохранение…' : entity ? 'Сохранить' : 'Создать'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
