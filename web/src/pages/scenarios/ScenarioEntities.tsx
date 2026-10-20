import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section, SectionAction } from '@/components/Section';
import type { EntityListItem, ScenarioEntity } from '@/lib/types';
import { cn, GHOST } from '@/lib/utils';

interface Props {
  value: ScenarioEntity[];
  entities: EntityListItem[];
  onChange: (value: ScenarioEntity[]) => void;
}

export function ScenarioEntities({ value, entities, onChange }: Props) {
  const patch = (i: number, p: Partial<ScenarioEntity>) => onChange(value.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const options = entities.map((e) => ({ value: String(e.id), label: e.name }));

  return (
    <Section
      title="Сущности"
      action={
        <SectionAction onClick={() => onChange([...value, { key: crypto.randomUUID(), entity_id: null, followup_prompt: '', required: false, is_array: false }])}>
          Добавить сущность
        </SectionAction>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-72">Сущность</TableHead>
            <TableHead className="w-40">Обязательно</TableHead>
            <TableHead className="w-64">Массив (несколько значений в интенте)</TableHead>
            <TableHead>Уточняющий вопрос</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.map((e, i) => (
            <TableRow key={e.key ?? i}>
              <TableCell>
                <Select
                  items={options}
                  value={e.entity_id === null ? null : String(e.entity_id)}
                  onValueChange={(v) => patch(i, { entity_id: v == null ? null : Number(v) })}
                >
                  <SelectTrigger className={cn(GHOST, 'w-64')}><SelectValue placeholder="Выберите сущность" /></SelectTrigger>
                  <SelectContent>
                    {options
                      .filter((o) => o.value === String(e.entity_id) || !value.some((x) => String(x.entity_id) === o.value))
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="px-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={e.required} onCheckedChange={(required) => patch(i, { required })} />
                  {e.required ? 'Да' : 'Нет'}
                </label>
              </TableCell>
              <TableCell className="px-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={e.is_array} onCheckedChange={(is_array) => patch(i, { is_array })} aria-label="Массив" />
                  {e.is_array ? 'Да' : 'Нет'}
                </label>
              </TableCell>
              <TableCell>
                <Input
                  className={GHOST}
                  placeholder="Например: Для какого сиденья включить обогрев?"
                  aria-label="Уточняющий вопрос"
                  value={e.followup_prompt}
                  onChange={(ev) => patch(i, { followup_prompt: ev.target.value })}
                />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" aria-label="Убрать сущность" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {value.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="px-3 text-sm text-muted-foreground">Сущностей нет</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Section>
  );
}
