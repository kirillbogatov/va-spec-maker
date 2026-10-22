import { Plus, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TypeToken } from '@/components/TypeToken';
import type { EntityListItem, IntentEntity } from '@/lib/types';

interface Props {
  value: IntentEntity[];
  entities: EntityListItem[];
  onChange: (value: IntentEntity[]) => void;
}

/** Сущности интента: жетон сущности, переключатель «обязательна / необязательна» и выбор следующей из справочника. */
export function EntitiesCell({ value, entities, onChange }: Props) {
  const name = (id: number) => entities.find((e) => e.id === id)?.name ?? `#${id}`;
  const options = entities.filter((e) => !value.some((v) => v.entity_id === e.id)).map((e) => ({ value: String(e.id), label: e.name }));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {value.map((e) => (
            <li key={e.entity_id} className="group flex min-h-10 items-center gap-2 md:min-h-8">
              <button
                type="button"
                title={e.required ? 'Обязательная сущность. Нажмите, чтобы сделать необязательной' : 'Нажмите, чтобы сделать обязательной'}
                aria-label={`${name(e.entity_id)}: ${e.required ? 'обязательна' : 'необязательна'}`}
                aria-pressed={e.required}
                className="rounded-[5px] focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => onChange(value.map((v) => (v === e ? { ...v, required: !v.required } : v)))}
              >
                <TypeToken kind="entity" required={e.required} title={e.required ? 'Обязательная сущность. Нажмите, чтобы сделать необязательной' : 'Нажмите, чтобы сделать обязательной'}>
                  {name(e.entity_id)}
                </TypeToken>
              </button>
              <button
                type="button"
                aria-label={`Убрать ${name(e.entity_id)}`}
                className="inline-flex size-8 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onChange(value.filter((v) => v !== e))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 && (
        <Select items={options} value={null} onValueChange={(v) => v != null && onChange([...value, { entity_id: Number(v), required: false }])}>
          <SelectTrigger className="h-10 w-auto gap-1.5 border-transparent bg-transparent px-2 text-[13px] text-brand shadow-none hover:bg-muted md:h-8 dark:bg-transparent [&_svg:last-child]:hidden">
            <Plus className="size-3.5" />
            <SelectValue placeholder="Добавить сущность" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span className="font-mono text-[13px]">{o.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
