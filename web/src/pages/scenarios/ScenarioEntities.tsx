import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SearchSelect } from '@/components/SearchSelect';
import { Switch } from '@/components/ui/switch';
import { CreateDialog } from '@/components/CreateDialog';
import { TypeToken } from '@/components/TypeToken';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { usePrefixes } from '@/lib/prefixes';
import type { EntityListItem, ScenarioEntity } from '@/lib/types';
import { cn, GHOST } from '@/lib/utils';
import { AddButton, Card, HEAD, ROW } from './Card';

interface Props {
  value: ScenarioEntity[];
  entities: EntityListItem[];
  onChange: (value: ScenarioEntity[]) => void;
}

const COLS = 'md:grid-cols-[minmax(0,190px)_100px_130px_minmax(0,1fr)_32px]';

const NEW = '__new__';

export function ScenarioEntities({ value, entities, onChange }: Props) {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  // Индекс строки, для которой создаётся новая сущность
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const patch = (i: number, p: Partial<ScenarioEntity>) => onChange(value.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const options = entities.map((e) => ({ value: String(e.id), label: e.name }));

  return (
    <>
    <Card
      flush
      title="Сущности сценария"
      action={
        <AddButton onClick={() => onChange([...value, { key: crypto.randomUUID(), entity_id: null, followup_prompt: '', required: false, is_array: false }])}>
          Добавить
        </AddButton>
      }
    >
      <div className={cn(ROW, HEAD, COLS)}>
        <span>Сущность</span>
        <span>Обязательна</span>
        <span>Несколько значений</span>
        <span>Уточняющий вопрос</span>
        <span />
      </div>
      {value.map((e, i) => (
        <div key={e.key ?? i} className={cn(ROW, COLS)}>
          <SearchSelect
            options={[...options.filter((o) => o.value === String(e.entity_id) || !value.some((x) => String(x.entity_id) === o.value)), { value: NEW, label: '+ Новая сущность…' }]}
            value={e.entity_id === null ? null : String(e.entity_id)}
            onChange={(v) => (v === NEW ? setCreatingFor(i) : patch(i, { entity_id: v == null ? null : Number(v) }))}
            label="Сущность"
            className={cn(GHOST, 'w-full max-md:h-10 md:-ml-2.5 md:w-[calc(100%+0.625rem)]')}
            renderValue={(o) => (o == null ? <span className="text-muted-foreground">Выберите сущность</span> : <TypeToken kind="entity">{o.label}</TypeToken>)}
          />
          <label className="flex min-h-8 items-center gap-2 px-2.5 text-sm max-md:min-h-10">
            <Switch checked={e.required} onCheckedChange={(required) => patch(i, { required })} />
            <span className="md:sr-only">Обязательна</span>
          </label>
          <label className="flex min-h-8 items-center gap-2 px-2.5 text-sm max-md:min-h-10">
            <Switch checked={e.is_array} onCheckedChange={(is_array) => patch(i, { is_array })} />
            <span className="md:sr-only">Несколько значений</span>
          </label>
          <Textarea
            rows={1}
            className={cn(GHOST, 'min-h-8 resize-none rounded-md py-1 text-sm max-md:min-h-10 md:text-sm')}
            placeholder="Например: Для какого сиденья включить обогрев?"
            aria-label="Уточняющий вопрос"
            value={e.followup_prompt}
            onChange={(ev) => patch(i, { followup_prompt: ev.target.value })}
          />
          <Button variant="ghost" size="icon" className="max-md:size-10 max-md:justify-self-end" aria-label="Убрать сущность" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {value.length === 0 && <p className="border-t px-4 py-4 text-sm text-muted-foreground">Сущностей нет. Добавьте параметры, которые ассистент должен узнать у пользователя.</p>}
    </Card>
    <CreateDialog
      open={creatingFor !== null}
      onOpenChange={(o) => !o && setCreatingFor(null)}
      title="Новая сущность"
      prefix={prefixes.entity}
      withType
      existingNames={entities.map((e) => e.name)}
      onCreate={(name, kind) => {
        // CreateDialog сам закрывается после onCreate и ждёт синхронный обработчик
        const row = creatingFor;
        setCreatingFor(null);
        api.entities
          .create(projectId, name, kind)
          .then((created) => {
            qc.invalidateQueries({ queryKey: ['entities'] });
            if (row !== null) patch(row, { entity_id: created.id });
          })
          .catch((e: Error) => toast.error(e.message));
      }}
    />
    </>
  );
}
