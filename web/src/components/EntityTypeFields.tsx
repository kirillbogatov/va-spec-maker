import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ENTITY_TYPE_OPTIONS, hasRange, rangeError, type EntityKind, type EntityType } from '@/lib/entityTypes';

const INPUT_TYPE = { number: 'number', time: 'time', date: 'date' } as const;

interface Props {
  kind: EntityKind;
  onChange: (kind: EntityKind) => void;
}

/** Тип сущности и, для числа, времени и даты, диапазон «от — до». */
export function EntityTypeFields({ kind, onChange }: Props) {
  const error = rangeError(kind);
  const label = ENTITY_TYPE_OPTIONS.find((o) => o.value === kind.type)?.label;
  const inputType = INPUT_TYPE[kind.type as keyof typeof INPUT_TYPE];
  return (
    <div className="space-y-2">
      <Select
        items={ENTITY_TYPE_OPTIONS}
        value={kind.type}
        onValueChange={(v) => v && onChange({ type: v as EntityType, range_min: '', range_max: '' })}
      >
        <SelectTrigger className="w-full max-md:h-10" aria-label="Тип сущности">
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ENTITY_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasRange(kind.type) && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[13px] text-muted-foreground">
            От
            <Input
              type={inputType}
              step={kind.type === 'number' ? 'any' : undefined}
              value={kind.range_min}
              onChange={(e) => onChange({ ...kind, range_min: e.target.value })}
              aria-label="Начало диапазона"
              aria-invalid={!!error}
            />
          </label>
          <label className="space-y-1 text-[13px] text-muted-foreground">
            До
            <Input
              type={inputType}
              step={kind.type === 'number' ? 'any' : undefined}
              value={kind.range_max}
              onChange={(e) => onChange({ ...kind, range_max: e.target.value })}
              aria-label="Конец диапазона"
              aria-invalid={!!error}
            />
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {kind.type === 'boolean' && <p className="text-[13px] text-muted-foreground">Принимает значения true или false.</p>}
    </div>
  );
}
