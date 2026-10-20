import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EntityListItem, IntentEntity } from '@/lib/types';
import { cn, GHOST } from '@/lib/utils';

interface Props {
  value: IntentEntity[];
  entities: EntityListItem[];
  onChange: (value: IntentEntity[]) => void;
}

/** Сущности вариации: чипы с отметкой «обязательная» (клик по *) и выбор следующей из справочника. */
export function EntitiesCell({ value, entities, onChange }: Props) {
  const name = (id: number) => entities.find((e) => e.id === id)?.name ?? `#${id}`;
  const options = entities.filter((e) => !value.some((v) => v.entity_id === e.id)).map((e) => ({ value: String(e.id), label: e.name }));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((e) => (
            <Badge key={e.entity_id} variant="secondary" className={cn('h-6 gap-1.5 px-2 font-normal', e.required && 'ring-1 ring-destructive/30')}>
              {name(e.entity_id)}
              <button
                type="button"
                title={e.required ? 'Обязательная — нажмите, чтобы сделать необязательной' : 'Необязательная — нажмите, чтобы сделать обязательной'}
                aria-label={`${name(e.entity_id)}: ${e.required ? 'обязательная' : 'необязательная'}`}
                aria-pressed={e.required}
                className={cn('text-sm leading-none', e.required ? 'font-bold text-destructive' : 'text-muted-foreground/60')}
                onClick={() => onChange(value.map((v) => (v === e ? { ...v, required: !v.required } : v)))}
              >
                *
              </button>
              <button type="button" aria-label={`Убрать ${name(e.entity_id)}`} onClick={() => onChange(value.filter((v) => v !== e))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <Select items={options} value={null} onValueChange={(v) => v != null && onChange([...value, { entity_id: Number(v), required: false }])}>
          <SelectTrigger className={cn(GHOST, 'h-8 w-full border-b-border/60 text-muted-foreground')}>
            <SelectValue placeholder="Добавить сущность" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
