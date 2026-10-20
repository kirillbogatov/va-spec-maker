import { Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Section, SectionAction } from '@/components/Section';
import { TagInput } from '@/components/TagInput';
import { cn, GHOST } from '@/lib/utils';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import type { Dependency, EntityListItem } from '@/lib/types';

interface Props {
  dependencies: Dependency[];
  entities: EntityListItem[];
  /** Принимает функцию-обновление, чтобы асинхронная подстановка значений сущности не затирала свежие правки. */
  onChange: (update: (deps: Dependency[]) => Dependency[]) => void;
}

const CUSTOM = 'custom';
const DICT = 'dict:';

export function DependenciesTable({ dependencies, entities, onChange }: Props) {
  const projectId = useProjectId();
  const { data: dictionary = [] } = useQuery({ queryKey: ['dependency-dictionary', projectId], queryFn: () => api.dependencyDictionary.list(projectId) });
  const entityOptions = [
    { value: CUSTOM, label: '— своё условие —' },
    ...entities.map((e) => ({ value: String(e.id), label: e.name })),
    ...dictionary.map((d) => ({ value: `${DICT}${d.id}`, label: `${d.name} (справочник)` })),
  ];

  /** Выбранный пункт списка: сущность, запись справочника (по имени) или своё условие. */
  const selected = (d: Dependency) => {
    if (d.entity_id !== null) return String(d.entity_id);
    const dict = d.name && dictionary.find((x) => x.name === d.name);
    return dict ? `${DICT}${dict.id}` : CUSTOM;
  };

  const patch = (ref: string, p: Partial<Dependency>) =>
    onChange((deps) => deps.map((d) => (d.ref === ref ? { ...d, ...p } : d)));
  const add = () =>
    onChange((deps) => [...deps, { ref: crypto.randomUUID(), entity_id: null, name: '', type: 'enum', options: [] }]);

  /** Выбрав сущность, подставляем её значения как варианты списка. */
  const pickEntity = async (ref: string, v: string | null) => {
    if (!v) return;
    if (v === CUSTOM) return patch(ref, { entity_id: null, name: '' });
    if (v.startsWith(DICT)) {
      const d = dictionary.find((x) => x.id === Number(v.slice(DICT.length)));
      if (d) patch(ref, { entity_id: null, name: d.name, type: d.values.length ? 'enum' : 'string', options: d.values });
      return;
    }
    const id = Number(v);
    patch(ref, { entity_id: id, name: '', type: 'enum', options: [] });
    const full = await api.entities.get(id);
    patch(ref, { options: full.values.map((x) => x.value) });
  };

  return (
    <Section
      title="Зависимости"
      action={<SectionAction onClick={add}>Добавить зависимость</SectionAction>}
    >
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-72">Зависимость</TableHead>
                        <TableHead>Значения</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {dependencies.map((d) => (
            <TableRow key={d.ref} className="[&>td]:align-top">
              <TableCell>
                <div className="space-y-1">
                  <Select items={entityOptions} value={selected(d)} onValueChange={(v) => pickEntity(d.ref, v)}>
                    <SelectTrigger className={cn(GHOST, 'w-full')} aria-label="Сущность"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {entityOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selected(d) === CUSTOM && (
                    <Input className={GHOST} value={d.name} onChange={(e) => patch(d.ref, { name: e.target.value })} aria-label="Название условия" placeholder="Например: двигатель запущен" />
                  )}
                </div>
              </TableCell>
              <TableCell>
                {d.type === 'bool' ? (
                  <p className="pt-2 text-sm text-muted-foreground">true / false</p>
                ) : (
                  <TagInput value={d.options} onChange={(options) => patch(d.ref, { options, type: 'enum' })} placeholder="Вариант и Enter" />
                )}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" aria-label="Удалить зависимость" onClick={() => onChange((deps) => deps.filter((x) => x.ref !== d.ref))}>
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {dependencies.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-sm text-muted-foreground">Зависимостей пока нет</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Section>
  );
}
