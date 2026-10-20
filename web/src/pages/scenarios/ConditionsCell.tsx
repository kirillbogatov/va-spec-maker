import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConditionOp, Dependency, EntityListItem, StepCondition } from '@/lib/types';
import { depLabel, entityChoices, valueChoices } from './dependencies';

interface Props {
  conditions: StepCondition[];
  freeText: string;
  dependencies: Dependency[];
  entities: EntityListItem[];
  onChange: (p: { conditions?: StepCondition[]; condition?: string }) => void;
}

const ALL_OPS: ConditionOp[] = ['=', '!=', '<', '>'];
const LIST_OPS: ConditionOp[] = ['=', '!='];

const subjectKey = (c: StepCondition) => (c.entity_id !== undefined ? `ent:${c.entity_id}` : `dep:${c.dep}`);
const fromKey = (key: string): Pick<StepCondition, 'dep' | 'entity_id'> =>
  key.startsWith('ent:') ? { dep: '', entity_id: Number(key.slice(4)) } : { dep: key.slice(4) };

/** Ячейка Condition: пары «зависимость или сущность — значение» (все должны выполняться) и произвольный текст. */
export function ConditionsCell({ conditions, freeText, dependencies, entities, onChange }: Props) {
  const [showText, setShowText] = useState(false);
  // Свои условия хранятся одной строкой: каждое условие — отдельная строка текста.
  const texts = freeText === '' ? (showText ? [''] : []) : freeText.split('\n');
  const setTexts = (next: string[]) => onChange({ condition: next.join('\n') });
  const subjects = [
    ...dependencies.map((d) => ({ value: `dep:${d.ref}`, label: depLabel(d, entities), group: 'Зависимости' })),
    ...entities.map((e) => ({ value: `ent:${e.id}`, label: e.name, group: 'Значение сущности' })),
  ];
  const groups = [...new Set(subjects.map((o) => o.group))];
  const patch = (i: number, p: Partial<StepCondition>) =>
    onChange({ conditions: conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });

  return (
    <div className="space-y-2">
      {conditions.map((c, i) => {
        const dep = dependencies.find((d) => d.ref === c.dep);
        const choices = c.entity_id !== undefined ? entityChoices(entities.find((e) => e.id === c.entity_id)) : dep ? valueChoices(dep) : null;
        // Для значений из списка осмысленны только «=» и «!=»; для свободного ввода — все четыре.
        const opItems = (choices ? LIST_OPS : ALL_OPS).map((o) => ({ value: o, label: o }));
        const valueItems = (choices ?? []).map((v) => ({ value: v, label: v }));
        return (
          <div key={i} className="flex items-center gap-1 rounded-md bg-muted p-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1 [&>*]:min-w-0 [&>*]:flex-1">
              <Select items={subjects} value={subjectKey(c)} onValueChange={(v) => v && onChange({ conditions: conditions.map((x, j) => (j === i ? { ...fromKey(v), op: '=', value: '' } : x)) })}>
                <SelectTrigger className="w-full" aria-label="Зависимость или сущность"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectGroup key={g}>
                      <SelectLabel>{g}</SelectLabel>
                      {subjects.filter((o) => o.group === g).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Select items={opItems} value={c.op ?? '='} onValueChange={(v) => v && patch(i, { op: v as ConditionOp })}>
                <SelectTrigger className="w-full max-w-16 shrink-0" aria-label="Оператор"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {opItems.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {choices ? (
                <Select items={valueItems} value={c.value} onValueChange={(v) => patch(i, { value: v ?? '' })}>
                  <SelectTrigger className="w-full" aria-label="Значение"><SelectValue placeholder="Значение" /></SelectTrigger>
                  <SelectContent>
                    {valueItems.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={c.value} onChange={(e) => patch(i, { value: e.target.value })} aria-label="Значение" placeholder="Значение" />
              )}
            </div>
            <Button variant="ghost" size="icon" aria-label={`Удалить условие ${i + 1}`} onClick={() => onChange({ conditions: conditions.filter((_, j) => j !== i) })}>
              <X className="size-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={subjects.length === 0}
          onClick={() => onChange({ conditions: [...conditions, dependencies.length ? { dep: dependencies[0].ref, op: '=', value: '' } : { dep: '', entity_id: entities[0].id, op: '=', value: '' }] })}
        >
          <Plus className="size-4" /> Условие
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setShowText(true); setTexts([...texts, '']); }}>
          <Plus className="size-4" /> Своё условие
        </Button>
        {conditions.length + texts.length > 1 && <span className="basis-full text-xs text-muted-foreground">Должны выполняться все условия</span>}
        {subjects.length === 0 && <span className="text-xs text-muted-foreground">Сначала добавьте зависимости или сущности</span>}
      </div>
      {texts.map((t, i) => (
        <div key={i} className="flex items-center gap-1 rounded-md bg-muted p-1.5">
          <Input className="min-w-0 flex-1" placeholder="Своё условие (текст)" value={t} onChange={(e) => setTexts(texts.map((x, j) => (j === i ? e.target.value.replace(/\r?\n/g, ' ') : x)))} aria-label={`Своё условие ${i + 1}`} />
          <Button variant="ghost" size="icon" aria-label={`Удалить своё условие ${i + 1}`} onClick={() => { setTexts(texts.filter((_, j) => j !== i)); if (texts.length === 1) setShowText(false); }}>
            <X className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
